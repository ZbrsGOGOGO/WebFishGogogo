import { describe, expect, it } from 'vitest';

import {
  TOWER_DEFENSE_PATH,
  TOWER_DEFENSE_TICK_MS,
  TOWER_DEFENSE_WAVES,
  TOWER_FOCUSED_ORDER_INDEX,
  TOWER_INTERMISSION_CREDIT_BONUS,
  TOWER_INVENTORY_CAPACITY,
  TOWER_PLANT_INCOME_INTERVAL,
  TOWER_SHOP_REFRESH_COST,
  TOWER_SHOP_SIZE,
  TOWER_ROUND_CONFIGS,
  buildTower,
  buyTowerShopOffer,
  createTowerDefenseState,
  deployInventoryTower,
  focusedTowerPartCost,
  getTowerRoundSummary,
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
  setTowerShopFocus,
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
    archetype: 'basic',
    armor: 0,
    singleTargetDamageCap: null,
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
  expect(state.shop[TOWER_FOCUSED_ORDER_INDEX].source).toBe('focused');
  if (!state.shop[TOWER_FOCUSED_ORDER_INDEX].soldOut) {
    expect(state.shop[TOWER_FOCUSED_ORDER_INDEX].type).toBe(state.shopFocus);
  }
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
    expect(TOWER_DEFENSE_WAVES).toBe(2);
    expect(state.hero).toMatchObject({ x: 7, y: 6, level: 1, attack: 3 });
    expect(state.shop).toHaveLength(5);
    expect(state.shop.slice(0, 3).every((offer) =>
      offer.type === 'single' && offer.source === 'guaranteed')).toBe(true);
    expect(state.shop[TOWER_FOCUSED_ORDER_INDEX]).toMatchObject({
      type: 'single',
      source: 'focused',
      cost: focusedTowerPartCost('single'),
    });
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

  it('keeps a purchased focused offer sold out and only restocks after paid refresh', () => {
    const initial = createTowerDefenseState(2027);
    const unchangedFocus = setTowerShopFocus(initial, 'single');
    expect(unchangedFocus.state.shop[TOWER_FOCUSED_ORDER_INDEX].id)
      .toBe(initial.shop[TOWER_FOCUSED_ORDER_INDEX].id);
    expect(unchangedFocus.state.nextOfferId).toBe(initial.nextOfferId);

    const selected = setTowerShopFocus(initial, 'slow');
    const focused = selected.state.shop[TOWER_FOCUSED_ORDER_INDEX];

    expect(selected.ok).toBe(true);
    expect(selected.state.credits).toBe(initial.credits);
    expect(selected.state.rngSeed).toBe(initial.rngSeed);
    expect(selected.state.shop.slice(0, TOWER_FOCUSED_ORDER_INDEX))
      .toEqual(initial.shop.slice(0, TOWER_FOCUSED_ORDER_INDEX));
    expect(selected.state.shopFocus).toBe('slow');
    expect(focused).toMatchObject({
      type: 'slow',
      source: 'focused',
      cost: focusedTowerPartCost('slow'),
    });
    const seedBeforePurchase = selected.state.rngSeed;
    const bought = buyTowerShopOffer(selected.state, focused.id);
    expect(bought.ok).toBe(true);
    expect(bought.state.credits).toBe(initial.credits - focused.cost);
    expect(bought.state.rngSeed).toBe(seedBeforePurchase);
    expect(bought.state.shop[TOWER_FOCUSED_ORDER_INDEX]).toMatchObject({
      type: 'slow',
      source: 'focused',
      cost: focusedTowerPartCost('slow'),
    });
    expect(bought.state.shop[TOWER_FOCUSED_ORDER_INDEX]).toMatchObject({ id: focused.id, soldOut: true });
    expect(bought.state.nextOfferId).toBe(selected.state.nextOfferId);
    const staleRetry = buyTowerShopOffer(bought.state, focused.id);
    expect(staleRetry).toMatchObject({ ok: false, code: 'shop_offer_missing' });
    expect(staleRetry.state.credits).toBe(bought.state.credits);
    expect(staleRetry.state.rngSeed).toBe(bought.state.rngSeed);

    const refreshed = refreshTowerDefenseShop(bought.state);
    expect(refreshed.state.shop.slice(0, TOWER_FOCUSED_ORDER_INDEX)
      .every((offer) => offer.source === 'random')).toBe(true);
    expect(refreshed.state.shop[TOWER_FOCUSED_ORDER_INDEX]).toMatchObject({
      type: 'slow', source: 'focused',
    });
  });

  it('preserves premium focused-order investment through merge and sale', () => {
    let state = setTowerShopFocus(createTowerDefenseState(13), 'slow').state;
    for (let count = 0; count < 3; count += 1) {
      if (state.shop[TOWER_FOCUSED_ORDER_INDEX].soldOut) state = refreshTowerDefenseShop(state).state;
      const focused = state.shop[TOWER_FOCUSED_ORDER_INDEX];
      state = buyTowerShopOffer(state, focused.id).state;
    }

    const merged = state.inventory[0];
    expect(merged).toMatchObject({
      type: 'slow',
      tier: 2,
      invested: focusedTowerPartCost('slow') * 3,
    });
    const beforeSale = state.credits;
    const sold = sellInventoryTower(state, merged.id);
    expect(sold.state.credits - beforeSale)
      .toBe(Math.floor(focusedTowerPartCost('slow') * 3 * 0.6));
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
  it('keeps the first round low pressure and raises the mixed second round to five times total HP', () => {
    const first = getTowerRoundSummary(1);
    const second = getTowerRoundSummary(2);

    expect(first).toMatchObject({ enemyCount: 6, totalHp: 72, hasMidboss: false });
    expect(second).toMatchObject({
      enemyCount: 24,
      totalHp: 360,
      countMultiplier: 4,
      totalHpMultiplier: 5,
      hasMidboss: true,
    });
    expect(second.archetypes).toEqual(['swarm', 'fast', 'basic', 'elite', 'midboss']);
    const midbossIndex = TOWER_ROUND_CONFIGS[1].spawns
      .findIndex((spawn) => spawn.archetype === 'midboss');
    expect(midbossIndex).toBeGreaterThan(0);
    expect(midbossIndex).toBeLessThan(second.enemyCount - 1);
    expect(TOWER_ROUND_CONFIGS[1].spawns.find((spawn) => spawn.archetype === 'swarm'))
      .toMatchObject({ singleTargetDamageCap: 2, coreDamage: 3 });

    const firstSpawned = stepTowerDefense(startTowerDefense(createTowerDefenseState(5)));
    expect(firstSpawned.nextSpawnAt).toBe(1 + TOWER_ROUND_CONFIGS[0].spawnIntervalTicks);
  });

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
      towers: [tower('shred', 4), tower('single', 7)],
    });
    expect(shredded.enemies.find((entry) => entry.id === 'one')).toMatchObject({
      hp: 93,
      shredStacks: 1,
    });
    expect(shredded.effects.map((effect) => effect.source)).toEqual(['shred', 'single']);
  });

  it('makes elite armor reduce ordinary hits while shred vulnerability counters it', () => {
    const armored = enemy({ armor: 2, archetype: 'elite', hp: 20, maxHp: 20 });
    const ordinary = stepTowerDefense(runningState({
      hero: { ...createTowerDefenseState().hero, autoCooldown: 99 },
      enemies: [armored],
      towers: [tower('single', 4)],
    }));
    expect(ordinary.enemies[0]?.hp).toBe(17);

    const combined = stepTowerDefense(runningState({
      hero: { ...createTowerDefenseState().hero, autoCooldown: 99 },
      enemies: [armored],
      towers: [tower('shred', 4), tower('single', 7)],
    }));
    expect(combined.enemies[0]).toMatchObject({ hp: 15, shredStacks: 1 });
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

  it('enters intermission, prepares the mixed second round, wins, and can lose', () => {
    const cleared = stepTowerDefense(runningState({
      hero: { ...createTowerDefenseState().hero, attack: 200 },
      enemies: [enemy({ hp: 1, pathIndex: 10 })],
    }));
    const nextWave = startNextTowerDefenseWave(cleared);

    expect(cleared.status).toBe('intermission');
    expect(nextWave).toMatchObject({ status: 'running', wave: 2 });
    expect(nextWave.spawnQueue).toHaveLength(24);
    expect(nextWave.spawnQueue.some((spawn) => spawn.archetype === 'midboss')).toBe(true);

    const winning = runningState({
      wave: 2,
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
  it('does not let the guaranteed tier-two tower idle through both rounds', () => {
    let state = upgradeTowerDefensePlant(createTowerDefenseState(31)).state;
    const guaranteedIds = state.shop.slice(0, 3).map((offer) => offer.id);
    for (const offerId of guaranteedIds) state = buyTowerShopOffer(state, offerId).state;
    state = deployInventoryTower(state, state.inventory[0].id, 4).state;
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
    expect(state.defeated).toBeLessThan(30);
  });

  it('does not let a lone tier-three stapler perfect-clear without using skills', () => {
    let state = upgradeTowerDefensePlant(createTowerDefenseState(31)).state;
    const guaranteedIds = state.shop.slice(0, 3).map((offer) => offer.id);
    for (const offerId of guaranteedIds) state = buyTowerShopOffer(state, offerId).state;
    state = deployInventoryTower(state, state.inventory[0].id, 4).state;
    state = startTowerDefense(state);

    let runningTicks = 0;
    while (state.status === 'running') {
      state = stepTowerDefense(state);
      runningTicks += 1;
    }
    expect(state.status).toBe('intermission');
    expect(state.credits).toBe(110 + TOWER_INTERMISSION_CREDIT_BONUS);
    state = setTowerShopFocus(state, 'single').state;
    for (let count = 0; count < 6; count += 1) {
      if (state.shop[TOWER_FOCUSED_ORDER_INDEX].soldOut) state = refreshTowerDefenseShop(state).state;
      const focused = state.shop[TOWER_FOCUSED_ORDER_INDEX];
      const bought = buyTowerShopOffer(state, focused.id);
      expect(bought.ok).toBe(true);
      state = bought.state;
    }
    state = mergeDeployedTower(state, 4).state;
    state = startNextTowerDefenseWave(state);
    while (state.status === 'running') {
      state = stepTowerDefense(state);
      runningTicks += 1;
    }

    expect(state.status).toBe('won');
    expect(state.coreHp).toBe(4);
    expect(state.defeated).toBeLessThan(30);
    expect(runningTicks * TOWER_DEFENSE_TICK_MS).toBeGreaterThanOrEqual(60_000);
  });

  it.each([0, 31, 77, 314_159, 0xffff_ffff])(
    'charges every restock and no longer lets the old three-tier-two idle template perfect-clear (seed %s)',
    (seed) => {
      let state = upgradeTowerDefensePlant(createTowerDefenseState(seed)).state;
      const heroStart = { x: state.hero.x, y: state.hero.y };
      const guaranteedIds = state.shop.slice(0, 3).map((offer) => offer.id);
      for (const offerId of guaranteedIds) state = buyTowerShopOffer(state, offerId).state;
      state = deployInventoryTower(state, state.inventory[0].id, 4).state;
      state = startTowerDefense(state);

      let runningTicks = 0;
      while (state.status === 'running') {
        state = stepTowerDefense(state);
        runningTicks += 1;
      }
      expect(state.status).toBe('intermission');
      expect(state.credits).toBe(110 + TOWER_INTERMISSION_CREDIT_BONUS);

      state = setTowerShopFocus(state, 'slow').state;
      for (let count = 0; count < 3; count += 1) {
        if (state.shop[TOWER_FOCUSED_ORDER_INDEX].soldOut) {
          const refreshed = refreshTowerDefenseShop(state);
          expect(refreshed.ok).toBe(true); state = refreshed.state;
        }
        const focused = state.shop[TOWER_FOCUSED_ORDER_INDEX];
        const bought = buyTowerShopOffer(state, focused.id);
        expect(bought.ok).toBe(true); state = bought.state;
      }
      const coffee = state.inventory.find((entry) => entry.type === 'slow' && entry.tier === 2);
      expect(coffee).toBeDefined();
      state = deployInventoryTower(state, coffee!.id, 2).state;

      state = setTowerShopFocus(state, 'push').state;
      for (let count = 0; count < 3; count += 1) {
        if (state.shop[TOWER_FOCUSED_ORDER_INDEX].soldOut) {
          const refreshed = refreshTowerDefenseShop(state);
          expect(refreshed.ok).toBe(true); state = refreshed.state;
        }
        const focused = state.shop[TOWER_FOCUSED_ORDER_INDEX];
        const bought = buyTowerShopOffer(state, focused.id);
        expect(bought.ok).toBe(true); state = bought.state;
      }
      const chair = state.inventory.find((entry) => entry.type === 'push' && entry.tier === 2);
      expect(chair).toBeDefined();
      state = deployInventoryTower(state, chair!.id, 6).state;
      expect(state.credits).toBe(1);

      state = startNextTowerDefenseWave(state);
      while (state.status === 'running') {
        state = stepTowerDefense(state);
        runningTicks += 1;
      }

      const durationMs = runningTicks * TOWER_DEFENSE_TICK_MS;
      expect(state.status).toBe('won');
      expect(state.coreHp).toBeGreaterThan(0);
      expect(state.coreHp).toBeLessThan(10);
      expect(state.defeated).toBeLessThan(30);
      expect(state.hero).toMatchObject(heroStart);
      expect(state.towers.map((entry) => [entry.type, entry.level, entry.slotIndex])).toEqual([
        ['single', 2, 4],
        ['slow', 2, 2],
        ['push', 2, 6],
      ]);
      expect(durationMs).toBeGreaterThanOrEqual(90_000);
      expect(durationMs).toBeLessThanOrEqual(180_000);
    },
  );

  it('preserves economy, capacity, and identity invariants across 100 seeded action runs', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      let state = createTowerDefenseState(seed);
      for (let turn = 0; turn < 240; turn += 1) {
        const choice = (Math.imul(seed + 1, 31) + turn * 17) % 12;
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
        } else if (choice === 10) {
          const types: TowerType[] = ['single', 'slow', 'splash', 'push', 'shred'];
          state = setTowerShopFocus(state, types[(seed + turn) % types.length]).state;
        } else if (state.status === 'running') {
          state = triggerFocusPulse(state);
          state = stepTowerDefense(state);
        }
        assertEconomyInvariants(state);
      }
    }
  });
});
