import { describe, expect, it } from 'vitest';

import {
  TOWER_DEFENSE_PATH,
  TOWER_DEFENSE_TICK_MS,
  TOWER_INVENTORY_CAPACITY,
  TOWER_PLANT_INCOME_INTERVAL,
  TOWER_SHOP_REFRESH_COST,
  TOWER_SHOP_SIZE,
  buildTower,
  buyTowerShopOffer,
  createTowerDefenseState,
  deployInventoryTower,
  mergeDeployedTower,
  moveTowerDefenseHero,
  pauseTowerDefense,
  plantIncomePerPayout,
  plantUpgradeCost,
  refreshTowerDefenseShop,
  resumeTowerDefense,
  sellDeployedTower,
  sellInventoryTower,
  sellTower,
  startNextTowerDefenseWave,
  startTowerDefense,
  stepTowerDefense,
  towerUpgradeCost,
  triggerFocusPulse,
  upgradeTower,
  upgradeTowerDefenseHero,
  upgradeTowerDefensePlant,
  type TowerDefenseEnemy,
  type TowerDefenseState,
  type TowerDefenseTower,
  type TowerInventoryItem,
  type TowerType,
} from './tower-defense-logic';

function enemy(overrides: Partial<TowerDefenseEnemy> = {}): TowerDefenseEnemy {
  return {
    id: 'enemy-test',
    name: '测试待办',
    pathIndex: 9,
    hp: 100,
    maxHp: 100,
    speedTicks: 99,
    slowTicks: 0,
    shredTicks: 0,
    shredStacks: 0,
    reward: 20,
    score: 100,
    coreDamage: 1,
    boss: false,
    ...overrides,
  };
}

function runningState(overrides: Partial<TowerDefenseState> = {}): TowerDefenseState {
  return {
    ...startTowerDefense(createTowerDefenseState(123)),
    spawnQueue: [],
    ...overrides,
  };
}

function item(
  id: string,
  type: TowerType,
  tier: 1 | 2 | 3,
  invested = 18 * (3 ** (tier - 1)),
): TowerInventoryItem {
  return { id, type, tier, invested };
}

function tower(
  type: TowerType,
  slotIndex: number,
  level: 2 | 3 = 2,
): TowerDefenseTower {
  return {
    id: `tower-${type}-${slotIndex}`,
    type,
    slotIndex,
    level,
    cooldown: 0,
    invested: 54 * (level === 3 ? 3 : 1),
  };
}

function assertEconomyInvariants(state: TowerDefenseState): void {
  expect(Number.isInteger(state.credits)).toBe(true);
  expect(state.credits).toBeGreaterThanOrEqual(0);
  expect(state.shop).toHaveLength(TOWER_SHOP_SIZE);
  expect(new Set(state.shop.map((offer) => offer.id)).size).toBe(TOWER_SHOP_SIZE);
  expect(state.inventory.length).toBeLessThanOrEqual(TOWER_INVENTORY_CAPACITY);
  expect(new Set(state.inventory.map((entry) => entry.id)).size).toBe(state.inventory.length);
  expect(state.inventory.every((entry) => [1, 2, 3].includes(entry.tier))).toBe(true);
  expect(new Set(state.towers.map((entry) => entry.slotIndex)).size).toBe(state.towers.length);
  expect(state.towers.every((entry) => entry.level === 2 || entry.level === 3)).toBe(true);
}

describe('workstation tower-defense economy', () => {
  it('creates a deterministic local run with a useful hero and guaranteed opening', () => {
    const state = createTowerDefenseState(44);
    const repeated = createTowerDefenseState(44);

    expect(state).toEqual(repeated);
    expect(state).toMatchObject({
      status: 'idle',
      wave: 1,
      credits: 110,
      plantLevel: 0,
      plantIncomeTick: 0,
    });
    expect(state.spawnQueue).toHaveLength(6);
    expect(state.hero).toMatchObject({ x: 7, y: 6, level: 1, attack: 3 });
    expect(state.shop).toHaveLength(5);
    expect(state.shop.slice(0, 3).every((offer) => offer.type === 'single')).toBe(true);
    expect(state.inventory).toEqual([]);
    expect('accountCredits' in state).toBe(false);
  });

  it('buys and upgrades the plant, paying out only on running ticks', () => {
    const initial = createTowerDefenseState();
    const planted = upgradeTowerDefensePlant(initial);

    expect(planted.ok).toBe(true);
    expect(planted.state.credits).toBe(110 - plantUpgradeCost(0));
    expect(planted.state.plantLevel).toBe(1);
    expect(plantIncomePerPayout(1)).toBe(4);

    let running = startTowerDefense(planted.state);
    for (let tick = 1; tick < TOWER_PLANT_INCOME_INTERVAL; tick += 1) {
      running = stepTowerDefense(running);
    }
    expect(running.credits).toBe(80);
    expect(running.plantIncomeTick).toBe(TOWER_PLANT_INCOME_INTERVAL - 1);
    running = stepTowerDefense(running);
    expect(running.credits).toBe(84);
    expect(running.plantIncomeTick).toBe(0);

    const paused = pauseTowerDefense(running);
    expect(stepTowerDefense(paused)).toBe(paused);
    const intermission = { ...running, status: 'intermission' as const };
    expect(stepTowerDefense(intermission)).toBe(intermission);
    expect(stepTowerDefense(initial)).toBe(initial);
  });

  it('guarantees plant plus three parts, then auto-merges the first deployable tower', () => {
    let state = upgradeTowerDefensePlant(createTowerDefenseState(9)).state;
    const guaranteedIds = state.shop.slice(0, 3).map((offer) => offer.id);
    for (const offerId of guaranteedIds) {
      const bought = buyTowerShopOffer(state, offerId);
      expect(bought.ok).toBe(true);
      state = bought.state;
      expect(state.shop).toHaveLength(TOWER_SHOP_SIZE);
    }

    expect(state.credits).toBe(26);
    expect(state.inventory).toEqual([
      expect.objectContaining({ type: 'single', tier: 2, invested: 54 }),
    ]);
    const deployed = deployInventoryTower(state, state.inventory[0].id, 4);
    expect(deployed.ok).toBe(true);
    expect(deployed.state.credits).toBe(26);
    expect(deployed.state.towers[0]).toMatchObject({ type: 'single', level: 2, invested: 54 });
  });

  it('refuses tier-one deployment with a useful reason and never deducts deployment credits', () => {
    const base = createTowerDefenseState();
    const state = { ...base, inventory: [item('loose', 'slow', 1, 20)] };
    const rejected = deployInventoryTower(state, 'loose', 0);

    expect(rejected).toMatchObject({ ok: false, code: 'tier_not_deployable' });
    expect(rejected.message).toContain('2 阶');
    expect(rejected.state.credits).toBe(state.credits);
    expect(rejected.state.inventory).toEqual(state.inventory);
  });

  it('does not charge or consume randomness when a full bag cannot receive a part', () => {
    const base = createTowerDefenseState(7);
    const inventory = Array.from({ length: TOWER_INVENTORY_CAPACITY }, (_, index) =>
      item(`full-${index}`, 'splash', 3, 100));
    const state = { ...base, inventory };
    const before = {
      credits: state.credits,
      shop: state.shop,
      rngSeed: state.rngSeed,
      nextItemId: state.nextItemId,
      nextOfferId: state.nextOfferId,
    };
    const result = buyTowerShopOffer(state, state.shop[0].id);

    expect(result).toMatchObject({ ok: false, code: 'inventory_full' });
    expect(result.state).toMatchObject(before);

    const mergeable = {
      ...state,
      inventory: [
        item('same-a', 'single', 1),
        item('same-b', 'single', 1),
        ...inventory.slice(0, 10),
      ],
    };
    const merged = buyTowerShopOffer(mergeable, mergeable.shop[0].id);
    expect(merged.ok).toBe(true);
    expect(merged.state.inventory).toHaveLength(11);
    expect(merged.state.inventory.some((entry) => entry.type === 'single' && entry.tier === 2)).toBe(true);
  });

  it('refreshes all five offers deterministically and never refreshes for free', () => {
    const one = createTowerDefenseState(2026);
    const two = createTowerDefenseState(2026);
    const refreshedOne = refreshTowerDefenseShop(one);
    const refreshedTwo = refreshTowerDefenseShop(two);

    expect(refreshedOne.ok).toBe(true);
    expect(refreshedOne.state.shop).toEqual(refreshedTwo.state.shop);
    expect(refreshedOne.state.credits).toBe(one.credits - TOWER_SHOP_REFRESH_COST);
    expect(refreshedOne.state.shop.every((offer) => !one.shop.some((old) => old.id === offer.id))).toBe(true);

    const poor = { ...one, credits: TOWER_SHOP_REFRESH_COST - 1 };
    const rejected = refreshTowerDefenseShop(poor);
    expect(rejected).toMatchObject({ ok: false, code: 'insufficient_credits' });
    expect(rejected.state.credits).toBe(poor.credits);
    expect(rejected.state.shop).toBe(poor.shop);
    expect(rejected.state.rngSeed).toBe(poor.rngSeed);
  });

  it('merges a deployed tower with two matching peers and rejects duplicate sales', () => {
    const base = createTowerDefenseState();
    const state: TowerDefenseState = {
      ...base,
      towers: [tower('single', 4)],
      inventory: [item('peer-a', 'single', 2, 54), item('peer-b', 'single', 2, 54)],
    };
    const credits = state.credits;
    const merged = mergeDeployedTower(state, 4);

    expect(merged.ok).toBe(true);
    expect(merged.state.credits).toBe(credits);
    expect(merged.state.inventory).toEqual([]);
    expect(merged.state.towers[0]).toMatchObject({ level: 3, invested: 162 });

    const sold = sellDeployedTower(merged.state, 4);
    expect(sold.ok).toBe(true);
    expect(sold.state.credits).toBe(credits + 97);
    const repeated = sellDeployedTower(sold.state, 4);
    expect(repeated).toMatchObject({ ok: false, code: 'tower_missing' });
    expect(repeated.state.credits).toBe(sold.state.credits);

    const inBag = sellInventoryTower(
      { ...base, inventory: [item('sell-once', 'slow', 1, 20)] },
      'sell-once',
    );
    expect(inBag.state.credits).toBe(base.credits + 12);
    expect(sellInventoryTower(inBag.state, 'sell-once').state.credits).toBe(inBag.state.credits);
  });

  it('keeps legacy exports without allowing direct purchase or paid tier upgrades', () => {
    const base = createTowerDefenseState();
    expect(buildTower(base, 0, 'single')).toBe(base);

    const withMergedItem = { ...base, inventory: [item('merged', 'single', 2, 54)] };
    const built = buildTower(withMergedItem, 0, 'single');
    expect(built.credits).toBe(base.credits);
    expect(built.towers[0]).toMatchObject({ level: 2 });
    expect(towerUpgradeCost(built.towers[0])).toBe(0);
    expect(upgradeTower(built, 0)).toBe(built);

    const materials = {
      ...built,
      inventory: [item('a', 'single', 2, 54), item('b', 'single', 2, 54)],
    };
    const upgraded = upgradeTower(materials, 0);
    expect(upgraded.credits).toBe(materials.credits);
    expect(upgraded.towers[0].level).toBe(3);
    expect(sellTower(upgraded, 0).towers).toEqual([]);
  });

  it('starts a fresh run without inventory, field, cooldown, or economy leftovers', () => {
    const dirty: TowerDefenseState = {
      ...createTowerDefenseState(1),
      credits: 999,
      plantLevel: 3,
      plantIncomeTick: 11,
      inventory: [item('old', 'shred', 3)],
      towers: [tower('push', 0, 3)],
      lastAction: { ok: true, code: 'ok', message: '旧反馈', tick: 42 },
      effects: [{
        id: 'old-effect', tick: 42, source: 'push', from: { x: 1, y: 1 },
        to: { x: 1, y: 2 }, targetEnemyIds: ['old'],
      }],
    };
    expect(dirty.credits).toBe(999);

    const restarted = createTowerDefenseState(2);
    expect(restarted).toMatchObject({ credits: 110, plantLevel: 0, plantIncomeTick: 0 });
    expect(restarted.inventory).toEqual([]);
    expect(restarted.towers).toEqual([]);
    expect(restarted.effects).toEqual([]);
    expect(restarted.lastAction).toBeNull();
  });
});

describe('workstation tower-defense combat', () => {
  it('moves one hero within bounds, blocks the path, and upgrades with run credits', () => {
    const state = startTowerDefense(createTowerDefenseState());
    const left = moveTowerDefenseHero(state, 'left');
    const besidePath = { ...state, hero: { ...state.hero, x: 5, y: 6 } };
    const blockedByPath = moveTowerDefenseHero(besidePath, 'up');
    const upgraded = upgradeTowerDefenseHero(state);

    expect(left.hero).toMatchObject({ x: 6, y: 6, direction: 'left' });
    expect(blockedByPath.hero).toMatchObject({ x: 5, y: 6, direction: 'up' });
    expect(upgraded.credits).toBe(30);
    expect(upgraded.hero).toMatchObject({ level: 2, attack: 5 });
  });

  it('has a useful default auto attack and a visible pulse with cooldown and rewards', () => {
    const state = runningState({ enemies: [enemy({ hp: 9, maxHp: 9, pathIndex: 10 })] });
    const next = stepTowerDefense(state);

    expect(next.enemies[0]?.hp).toBe(6);
    expect(next.hero.autoCooldown).toBeGreaterThan(0);
    expect(next.effects[0]).toMatchObject({ source: 'hero', targetEnemyIds: ['enemy-test'] });

    const pulsed = triggerFocusPulse({
      ...state,
      enemies: [enemy({ hp: 4, maxHp: 4, pathIndex: 10 })],
    });
    expect(pulsed.enemies).toHaveLength(0);
    expect(pulsed.hero.pulseCooldown).toBe(20);
    expect(pulsed.credits).toBe(state.credits + 20);
    expect(pulsed.effects[0]).toMatchObject({ source: 'pulse', targetEnemyIds: ['enemy-test'] });
    expect(triggerFocusPulse(pulsed)).toBe(pulsed);
  });

  it('gives all five tower lines distinct effects and emits their attack traces', () => {
    const common = runningState({
      hero: { ...createTowerDefenseState().hero, x: 0, y: 7, autoCooldown: 99 },
      enemies: [
        enemy({ id: 'one', pathIndex: 10 }),
        enemy({ id: 'two', pathIndex: 9 }),
      ],
    });

    const stapled = stepTowerDefense({ ...common, towers: [tower('single', 4)] });
    expect(stapled.enemies.find((entry) => entry.id === 'one')?.hp).toBe(96);
    expect(stapled.effects.some((effect) => effect.source === 'single')).toBe(true);

    const slowed = stepTowerDefense({ ...common, towers: [tower('slow', 4)] });
    expect(slowed.enemies.every((entry) => entry.hp === 98 && entry.slowTicks > 0)).toBe(true);
    expect(slowed.effects.find((effect) => effect.source === 'slow')?.targetEnemyIds).toHaveLength(2);

    const splashed = stepTowerDefense({ ...common, towers: [tower('splash', 4)] });
    expect(splashed.enemies.every((entry) => entry.hp === 97)).toBe(true);
    expect(splashed.effects.some((effect) => effect.source === 'splash')).toBe(true);

    const pushed = stepTowerDefense({ ...common, towers: [tower('push', 4)] });
    expect(pushed.enemies.find((entry) => entry.id === 'one')).toMatchObject({ hp: 98, pathIndex: 9 });
    expect(pushed.effects.some((effect) => effect.source === 'push')).toBe(true);

    const shredded = stepTowerDefense({
      ...common,
      towers: [tower('shred', 4), tower('single', 5)],
    });
    expect(shredded.enemies.find((entry) => entry.id === 'one')).toMatchObject({
      hp: 93,
      shredStacks: 1,
    });
    expect(shredded.effects.map((effect) => effect.source)).toEqual(['shred', 'single']);
  });

  it('does not advance or produce money while paused, idle, or between waves', () => {
    const running = runningState({
      plantLevel: 3,
      plantIncomeTick: TOWER_PLANT_INCOME_INTERVAL - 1,
      enemies: [enemy()],
    });
    const paused = pauseTowerDefense(running);
    expect(stepTowerDefense(paused)).toBe(paused);

    const resumed = resumeTowerDefense(paused);
    const paid = stepTowerDefense(resumed);
    expect(paid.credits).toBe(running.credits + plantIncomePerPayout(3));

    const idle = { ...running, status: 'idle' as const };
    const intermission = { ...running, status: 'intermission' as const };
    expect(stepTowerDefense(idle)).toBe(idle);
    expect(stepTowerDefense(intermission)).toBe(intermission);
  });

  it('allows a deliberately empty opening to recover through the default hero', () => {
    let state = startTowerDefense({
      ...createTowerDefenseState(88),
      credits: 0,
      plantLevel: 0,
      inventory: [],
      towers: [],
    });
    let safety = 0;
    while (state.status === 'running' && safety < 500) {
      if (state.hero.pulseCooldown === 0) state = triggerFocusPulse(state);
      state = stepTowerDefense(state);
      safety += 1;
    }

    expect(state.status).toBe('intermission');
    expect(state.coreHp).toBeGreaterThan(0);
    expect(state.defeated).toBeGreaterThan(0);
    expect(state.credits).toBeGreaterThanOrEqual(plantUpgradeCost(0));
  });

  it('enters intermission, prepares eight second-wave enemies, wins, and can lose', () => {
    const cleared = stepTowerDefense(runningState({
      hero: { ...createTowerDefenseState().hero, attack: 200 },
      enemies: [enemy({ hp: 1, pathIndex: 10 })],
    }));
    const nextWave = startNextTowerDefenseWave(cleared);

    expect(cleared.status).toBe('intermission');
    expect(nextWave).toMatchObject({ status: 'running', wave: 2 });
    expect(nextWave.spawnQueue).toHaveLength(8);

    const winning = runningState({
      wave: 3,
      hero: { ...createTowerDefenseState().hero, attack: 200 },
      enemies: [enemy({ hp: 1, pathIndex: 10 })],
    });
    expect(stepTowerDefense(winning).status).toBe('won');

    const losing = runningState({
      tick: 0,
      coreHp: 1,
      hero: { ...createTowerDefenseState().hero, x: 0, y: 7, autoCooldown: 99 },
      enemies: [enemy({ pathIndex: TOWER_DEFENSE_PATH.length - 1, speedTicks: 1 })],
    });
    const lost = stepTowerDefense(losing);
    expect(lost.status).toBe('lost');
    expect(lost.coreHp).toBe(0);
  });
});

describe('workstation tower-defense deterministic balance', () => {
  it('does not let the guaranteed tier-two tower idle through all three waves', () => {
    let state = upgradeTowerDefensePlant(createTowerDefenseState(31)).state;
    const guaranteedIds = state.shop.slice(0, 3).map((offer) => offer.id);
    for (const offerId of guaranteedIds) state = buyTowerShopOffer(state, offerId).state;
    state = deployInventoryTower(state, state.inventory[0].id, 0).state;
    state = startTowerDefense(state);

    let runningTicks = 0;
    while ((state.status === 'running' || state.status === 'intermission') && runningTicks < 1_000) {
      if (state.status === 'intermission') {
        state = startNextTowerDefenseWave(state);
      } else {
        state = stepTowerDefense(state);
        runningTicks += 1;
      }
    }

    expect(state.status).toBe('lost');
    expect(state.coreHp).toBe(0);
    expect(state.defeated).toBeLessThan(25);
  });

  it.each([false, true])(
    'lets a basic automated lineup clear three waves in 90–180 seconds (manual pulse: %s)',
    (useManualPulse) => {
      let state = upgradeTowerDefensePlant(createTowerDefenseState(31)).state;
      const guaranteedIds = state.shop.slice(0, 3).map((offer) => offer.id);
      for (const offerId of guaranteedIds) state = buyTowerShopOffer(state, offerId).state;
      state = deployInventoryTower(state, state.inventory[0].id, 4).state;
      state = startTowerDefense(state);

      let runningTicks = 0;
      let reachedTierThree = false;
      let paidRefreshes = 0;
      while ((state.status === 'running' || state.status === 'intermission') && runningTicks < 1_000) {
        if (state.status === 'intermission') {
          state = startNextTowerDefenseWave(state);
          continue;
        }

        const field = state.towers[0];
        const tierTwoPeers = field
          ? state.inventory.filter((entry) => entry.type === field.type && entry.tier === field.level)
          : [];
        if (field?.level === 2 && tierTwoPeers.length >= 2) {
          state = mergeDeployedTower(state, field.slotIndex).state;
          reachedTierThree = true;
        }

        let purchaseSafety = 0;
        while (state.credits >= 18 && state.towers[0]?.level === 2 && purchaseSafety < 8) {
          const offer = state.shop.find((entry) => entry.type === 'single');
          if (offer && state.credits >= offer.cost) {
            state = buyTowerShopOffer(state, offer.id).state;
          } else if (state.credits >= TOWER_SHOP_REFRESH_COST + 18) {
            state = refreshTowerDefenseShop(state).state;
            paidRefreshes += 1;
          } else {
            break;
          }
          purchaseSafety += 1;
        }

        if (useManualPulse && state.hero.pulseCooldown === 0) state = triggerFocusPulse(state);
        state = stepTowerDefense(state);
        runningTicks += 1;
      }

      const durationMs = runningTicks * TOWER_DEFENSE_TICK_MS;
      expect(state.status).toBe('won');
      expect(state.coreHp).toBeGreaterThan(0);
      expect(reachedTierThree).toBe(true);
      expect(state.towers[0]).toMatchObject({ type: 'single', level: 3, invested: 162 });
      expect(paidRefreshes).toBeGreaterThan(0);
      expect(durationMs).toBeGreaterThanOrEqual(90_000);
      expect(durationMs).toBeLessThanOrEqual(180_000);
    },
  );

  it('preserves economy, capacity, and identity invariants across 100 seeded action runs', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      let state = createTowerDefenseState(seed);
      for (let turn = 0; turn < 240; turn += 1) {
        const choice = (Math.imul(seed + 1, 31) + turn * 17) % 11;
        if (choice === 0) {
          state = upgradeTowerDefensePlant(state).state;
        } else if (choice === 1 || choice === 2) {
          const offer = state.shop[(seed + turn) % state.shop.length];
          state = buyTowerShopOffer(state, offer.id).state;
        } else if (choice === 3) {
          state = refreshTowerDefenseShop(state).state;
        } else if (choice === 4) {
          const deployable = state.inventory.find((entry) => entry.tier >= 2);
          const occupied = new Set(state.towers.map((entry) => entry.slotIndex));
          const slotIndex = Array.from({ length: 9 }, (_, index) => index)
            .find((index) => !occupied.has(index));
          if (deployable && slotIndex !== undefined) {
            state = deployInventoryTower(state, deployable.id, slotIndex).state;
          }
        } else if (choice === 5 && state.towers[0]) {
          state = mergeDeployedTower(state, state.towers[0].slotIndex).state;
        } else if (choice === 6 && state.inventory[0]) {
          state = sellInventoryTower(state, state.inventory[0].id).state;
        } else if (choice === 7 && state.towers[0]) {
          state = sellDeployedTower(state, state.towers[0].slotIndex).state;
        } else if (choice === 8) {
          if (state.status === 'idle') state = startTowerDefense(state);
          else if (state.status === 'intermission') state = startNextTowerDefenseWave(state);
          else state = stepTowerDefense(state);
        } else if (choice === 9) {
          state = state.status === 'paused' ? resumeTowerDefense(state) : pauseTowerDefense(state);
        } else if (state.status === 'running') {
          state = triggerFocusPulse(state);
          state = stepTowerDefense(state);
        }
        assertEconomyInvariants(state);
      }
    }
  });
});
