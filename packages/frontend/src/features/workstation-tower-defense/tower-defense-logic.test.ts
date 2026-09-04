import { describe, expect, it } from 'vitest';

import {
  TOWER_DEFENSE_PATH,
  buildTower,
  createTowerDefenseState,
  moveTowerDefenseHero,
  pauseTowerDefense,
  sellTower,
  startNextTowerDefenseWave,
  startTowerDefense,
  stepTowerDefense,
  triggerFocusPulse,
  upgradeTower,
  upgradeTowerDefenseHero,
  type TowerDefenseEnemy,
  type TowerDefenseState,
} from './tower-defense-logic';

function enemy(overrides: Partial<TowerDefenseEnemy> = {}): TowerDefenseEnemy {
  return {
    id: 'enemy-test',
    name: '测试待办',
    pathIndex: 9,
    hp: 10,
    maxHp: 10,
    speedTicks: 99,
    slowTicks: 0,
    reward: 20,
    score: 100,
    coreDamage: 1,
    boss: false,
    ...overrides,
  };
}

function runningState(overrides: Partial<TowerDefenseState> = {}): TowerDefenseState {
  return {
    ...startTowerDefense(createTowerDefenseState()),
    spawnQueue: [],
    ...overrides,
  };
}

describe('workstation tower-defense logic', () => {
  it('creates a 3-wave game with exactly one hero and five first-wave enemies', () => {
    const state = createTowerDefenseState();

    expect(state.status).toBe('idle');
    expect(state.wave).toBe(1);
    expect(state.spawnQueue).toHaveLength(5);
    expect(state.hero).toMatchObject({ x: 1, y: 6, level: 1, attack: 3 });
    expect('heroes' in state).toBe(false);
  });

  it('moves the hero within bounds and blocks the fixed enemy path', () => {
    const state = startTowerDefense(createTowerDefenseState());
    const left = moveTowerDefenseHero(state, 'left');
    const atEdge = moveTowerDefenseHero(left, 'left');
    const besidePath = { ...state, hero: { ...state.hero, x: 5, y: 6 } };
    const blockedByPath = moveTowerDefenseHero(besidePath, 'up');

    expect(left.hero).toMatchObject({ x: 0, y: 6, direction: 'left' });
    expect(atEdge.hero).toMatchObject({ x: 0, y: 6, direction: 'left' });
    expect(blockedByPath.hero).toMatchObject({ x: 5, y: 6, direction: 'up' });
  });

  it('builds, upgrades, and sells a tower without allowing negative resources', () => {
    const state = startTowerDefense(createTowerDefenseState());
    const built = buildTower(state, 0, 'single');
    const upgraded = upgradeTower(built, 0);
    const sold = sellTower(upgraded, 0);

    expect(built.credits).toBe(120);
    expect(built.towers[0]).toMatchObject({ type: 'single', level: 1, invested: 60 });
    expect(upgraded.credits).toBe(60);
    expect(upgraded.towers[0]).toMatchObject({ level: 2, invested: 120 });
    expect(sold.towers).toHaveLength(0);
    expect(sold.credits).toBe(132);
    expect(buildTower({ ...state, credits: 0 }, 0, 'splash')).toBeDefined();
    expect(buildTower({ ...state, credits: 0 }, 0, 'splash').credits).toBe(0);
  });

  it('upgrades the only hero with local run resources', () => {
    const state = startTowerDefense(createTowerDefenseState());
    const upgraded = upgradeTowerDefenseHero(state);

    expect(upgraded.credits).toBe(100);
    expect(upgraded.hero).toMatchObject({ level: 2, attack: 5 });
  });

  it('automatically attacks a nearby leading enemy', () => {
    const state = runningState({
      hero: { ...createTowerDefenseState().hero, x: 7, y: 6 },
      enemies: [enemy({ hp: 9, maxHp: 9, pathIndex: 10 })],
    });
    const next = stepTowerDefense(state);

    expect(next.enemies[0]?.hp).toBe(6);
    expect(next.hero.autoCooldown).toBeGreaterThan(0);
  });

  it('uses Space-action logic as a ranged pulse with cooldown and kill rewards', () => {
    const state = runningState({
      hero: { ...createTowerDefenseState().hero, x: 7, y: 6 },
      enemies: [enemy({ hp: 4, maxHp: 4, pathIndex: 10 })],
    });
    const pulsed = triggerFocusPulse(state);

    expect(pulsed.enemies).toHaveLength(0);
    expect(pulsed.hero.pulseCooldown).toBe(20);
    expect(pulsed.credits).toBe(state.credits + 20);
    expect(pulsed.score).toBe(100);
    expect(triggerFocusPulse(pulsed)).toBe(pulsed);
  });

  it('makes the coffee machine slow a small area and the printer damage an area', () => {
    const base = runningState({
      hero: { ...createTowerDefenseState().hero, x: 0, y: 7, autoCooldown: 99 },
      credits: 500,
      enemies: [
        enemy({ id: 'one', pathIndex: 9, hp: 20, maxHp: 20 }),
        enemy({ id: 'two', pathIndex: 10, hp: 20, maxHp: 20 }),
      ],
    });
    const coffee = buildTower(base, 4, 'slow');
    const cooled = stepTowerDefense(coffee);
    const printer = buildTower({ ...base, towers: [], tick: 0 }, 4, 'splash');
    const printed = stepTowerDefense(printer);

    expect(cooled.enemies.every((item) => item.slowTicks > 0)).toBe(true);
    expect(cooled.enemies.every((item) => item.hp < item.maxHp)).toBe(true);
    expect(printed.enemies.every((item) => item.hp < item.maxHp)).toBe(true);
  });

  it('does not advance a paused game', () => {
    const running = runningState({ enemies: [enemy()] });
    const paused = pauseTowerDefense(running);

    expect(stepTowerDefense(paused)).toBe(paused);
  });

  it('enters intermission after clearing a wave and prepares seven enemies next', () => {
    const state = runningState({
      hero: { ...createTowerDefenseState().hero, x: 7, y: 6, attack: 20 },
      enemies: [enemy({ hp: 1, pathIndex: 10 })],
    });
    const cleared = stepTowerDefense(state);
    const nextWave = startNextTowerDefenseWave(cleared);

    expect(cleared.status).toBe('intermission');
    expect(nextWave.status).toBe('running');
    expect(nextWave.wave).toBe(2);
    expect(nextWave.spawnQueue).toHaveLength(7);
  });

  it('wins after the third wave and loses when the core reaches zero', () => {
    const winning = runningState({
      wave: 3,
      hero: { ...createTowerDefenseState().hero, x: 7, y: 6, attack: 20 },
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
