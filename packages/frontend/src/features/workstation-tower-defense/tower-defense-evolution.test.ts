import { describe, expect, it } from 'vitest';
import * as e from './tower-defense-logic';

// Isolated combat fixtures test one mechanic at a time. Full-run economy tests
// live separately in tower-defense-restock.test.ts and never grant free resources.
function enemy(id = 'target', overrides: Partial<e.TowerDefenseEnemy> = {}): e.TowerDefenseEnemy {
  return { id, name: '文书测试目标', pathIndex: 9, hp: 100, maxHp: 100, speedTicks: 99,
    slowTicks: 0, shredTicks: 0, shredStacks: 0, archetype: 'basic', armor: 0,
    singleTargetDamageCap: null, reward: 8, score: 100, coreDamage: 1, boss: false, ...overrides };
}
function tower(type: e.TowerType, level: 2 | 3, slotIndex = 4): e.TowerDefenseTower {
  return { id: `${type}-${slotIndex}`, type, level, slotIndex, cooldown: 0, invested: 54 };
}
function battle(towers: e.TowerDefenseTower[], enemies: e.TowerDefenseEnemy[]): e.TowerDefenseState {
  const base = e.createTowerDefenseState();
  return { ...base, status: 'running', wave: 2, spawnQueue: [], hero: { ...base.hero, autoCooldown: 999 }, towers, enemies };
}

describe('five office tower evolution mechanics', () => {
  it.each([[2, 1, 5, 97], [3, 2, 8, 93]] as const)('tier %s stapler strips armor for the whole team with bounded duration', (level, points, ticks, hp) => {
    const initial = battle([tower('single', level)], [enemy('target', { armor: 2, archetype: 'elite' })]);
    let state = e.stepTowerDefense(initial);
    expect(state.enemies[0]).toMatchObject({ hp, armorBreakPoints: points, armorBreakTicks: ticks });
    expect(state.effects[0].technique).toBe('pierce');
    state = { ...state, towers: [] };
    for (let remaining = 0; remaining < ticks; remaining++) state = e.stepTowerDefense(state);
    expect(state.enemies[0]).toMatchObject({ armorBreakTicks: 0, armorBreakPoints: 0, armor: 2 });
    expect(initial.enemies[0].hp).toBe(100);
  });

  it('combines armor break with a following ally instead of only labeling a normal shot', () => {
    const state = e.stepTowerDefense(battle([tower('single', 2), tower('splash', 2, 6)], [enemy('target', { armor: 3 })]));
    expect(state.enemies[0].hp).toBe(95); // 2 stapler + 3 printer after break/penetration.
  });

  it.each([[2, 'freezeTicks', 1, 'freeze'], [3, 'rootTicks', 2, 'root']] as const)('tier %s coffee actually stops movement, then shared control resistance lets movement recover', (tier, field, ticks, technique) => {
    let state = e.stepTowerDefense(battle([tower('slow', tier)], [enemy('target', { speedTicks: 1 })]));
    expect(state.enemies[0].pathIndex).toBe(9);
    expect(state.enemies[0][field]).toBe(ticks);
    expect(state.enemies[0].controlImmunityTicks).toBe(11);
    expect(state.effects[0].technique).toBe(technique);
    for (let tick = 0; tick < 6; tick++) state = e.stepTowerDefense(state);
    expect(state.enemies[0].pathIndex).toBeGreaterThan(9);
    expect(state.enemies[0].controlImmunityTicks).toBe(5);
  });

  it('Boss hard-control lasts one tick and cannot be renewed by other control towers', () => {
    const state = e.stepTowerDefense(battle([tower('slow', 3), tower('push', 3, 6)], [enemy('boss', { boss: true, archetype: 'midboss', speedTicks: 1 })]));
    expect(state.enemies[0]).toMatchObject({ pathIndex: 9, rootTicks: 0, stunTicks: 0, controlImmunityTicks: 17 });
    const immune = e.stepTowerDefense(battle([tower('slow', 2)], [enemy('immune', { controlImmunityTicks: 8 })]));
    expect(immune.enemies[0].freezeTicks).toBe(0);
    expect(immune.effects[0].technique).toBeUndefined();
  });

  it('tier-two laser hits two tiles along one corridor but never turns a corner', () => {
    const state = e.stepTowerDefense(battle([tower('splash', 2, 2)], [
      enemy('primary', { pathIndex: 7, armor: 3 }), // x5 y4; vertical corridor
      enemy('same-line', { pathIndex: 5, armor: 3 }), // x5 y2
      enemy('around-corner', { pathIndex: 4, armor: 3 }), // x4 y2
    ]));
    expect(state.effects[0].targetEnemyIds).toEqual(['primary', 'same-line']);
    expect(state.enemies.find((entry) => entry.id === 'primary')?.hp).toBe(98);
    expect(state.enemies.find((entry) => entry.id === 'same-line')?.hp).toBe(98);
    expect(state.enemies.find((entry) => entry.id === 'around-corner')?.hp).toBe(100);
  });

  it('tier-three printer really ignores armor and swarm single-target caps for its area damage', () => {
    const state = e.stepTowerDefense(battle([tower('splash', 3)], [enemy('primary', { armor: 99, archetype: 'elite' }), enemy('swarm', { pathIndex: 8, armor: 99, singleTargetDamageCap: 2, archetype: 'swarm' })]));
    expect(state.enemies.map((entry) => entry.hp)).toEqual([94, 94]);
    expect(state.effects[0].technique).toBe('true-damage');
  });

  it('tier-two chair pushes and stuns a target instead of letting it move back on the same tick', () => {
    let state = e.stepTowerDefense(battle([tower('push', 2)], [enemy('target', { speedTicks: 1 })]));
    expect(state.enemies[0].pathIndex).toBe(8);
    expect(state.effects[0].technique).toBe('stun');
    expect(state.towers[0].cooldown).toBe(8);
    state = e.stepTowerDefense(state);
    expect(state.enemies[0].pathIndex).toBe(9);
  });

  it('boss chair gathers at most three enemies backwards, never teleports a fourth or drags a Boss', () => {
    const state = e.stepTowerDefense(battle([tower('push', 3)], [
      enemy('primary', { pathIndex: 10 }), enemy('middle', { pathIndex: 9 }),
      enemy('back', { pathIndex: 8 }), enemy('fourth', { pathIndex: 8 }),
    ]));
    expect(state.effects[0]).toMatchObject({ technique: 'taunt', targetEnemyIds: ['primary', 'middle', 'back'] });
    expect(state.enemies.map((entry) => entry.pathIndex)).toEqual([8, 8, 8, 8]);
    expect(state.enemies.find((entry) => entry.id === 'fourth')?.hp).toBe(100);
    expect(state.enemies.slice(0, 3).every((entry) => entry.stunTicks === 1)).toBe(true);
    const boss = e.stepTowerDefense(battle([tower('push', 3)], [enemy('boss', { pathIndex: 10, boss: true, archetype: 'midboss' })]));
    expect(boss.enemies[0].pathIndex).toBe(10);
  });

  it('industrial shredder deals true damage only to document/basic enemies', () => {
    const basic = e.stepTowerDefense(battle([tower('shred', 2)], [enemy('paper', { armor: 99 })]));
    const elite = e.stepTowerDefense(battle([tower('shred', 2)], [enemy('elite', { armor: 99, archetype: 'elite' })]));
    expect(basic.enemies[0].hp).toBe(98);
    expect(elite.enemies[0].hp).toBe(99);
  });

  it.each([[2, 17], [3, 29]] as const)('tier %s executes a non-Boss at its threshold but credits the kill only once', (tier, hp) => {
    let state = battle([tower('shred', tier), tower('single', 3, 6)], [enemy('meal', { hp })]);
    const coins = state.credits;
    state = e.stepTowerDefense(state);
    expect(state.enemies).toHaveLength(0);
    expect(state.effects[0].technique).toBe('execute');
    expect(state.defeated).toBe(1);
    expect(state.credits).toBe(coins + 8);
    const completed = state;
    state = e.triggerFocusPulse(e.stepTowerDefense(state));
    expect(state).toBe(completed);
    expect(state.defeated).toBe(1);
  });

  it('does not execute a Boss or a target above the threshold, and caps shred storm at three living targets', () => {
    const boss = e.stepTowerDefense(battle([tower('shred', 3)], [enemy('boss', { hp: 20, boss: true, archetype: 'midboss' })]));
    expect(boss.enemies[0].hp).toBe(16);
    expect(boss.defeated).toBe(0);
    const above = e.stepTowerDefense(battle([tower('shred', 2)], [enemy('above', { hp: 18 })]));
    expect(above.enemies[0].hp).toBe(16);
    const group = e.stepTowerDefense(battle([tower('shred', 3)], Array.from({ length: 4 }, (_, index) => enemy(`group-${index}`, { hp: 29 }))));
    expect(group.defeated).toBe(3);
    expect(group.credits).toBe(110 + 3 * 8);
    expect(group.enemies).toHaveLength(1);
    expect(group.enemies[0].hp).toBe(29);
  });

  it('never advances hard-control timers or credits while paused', () => {
    const active = e.stepTowerDefense(battle([tower('slow', 3)], [enemy()]));
    const paused = e.pauseTowerDefense(active);
    expect(e.stepTowerDefense(paused)).toBe(paused);
    expect(paused.enemies[0].rootTicks).toBe(active.enemies[0].rootTicks);
  });
});
