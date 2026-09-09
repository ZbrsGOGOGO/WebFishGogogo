import { DEMON_TOWER_CATALOG, DEMON_TOWER_FLOORS, DEMON_TOWER_SKILLS, DEMON_TOWER_WEAPONS, demonTowerUpgradeCost } from '@stealth-reader/shared';
import type { DemonTowerAction, DemonTowerAttribute, DemonTowerSkillId, DemonTowerWeaponId, DemonTowerWorldView } from '@stealth-reader/shared';
import {
  actDemonTower, advanceDemonTowerState, createDemonTowerState, demonTowerEffectiveAttributes,
  demonTowerExperienceToNext, demonTowerMaxHp, demonTowerPersonalUnlockedFloor, demonTowerProfileView,
  DemonTowerEngineError, DemonTowerEngineState,
} from './demon-tower.engine';

const NOW = Date.UTC(2026, 8, 8, 12);
const DATE = '2026-09-08';
function world(floor = 1, phase: DemonTowerWorldView['phase'] = 'boss'): DemonTowerWorldView {
  const definition = DEMON_TOWER_FLOORS[floor - 1];
  return { version: 1, unlockedFloor: floor, currentFloor: floor, phase,
    boss: { name: definition.bossName, hp: phase === 'boss' ? definition.bossMaxHp : 0, maxHp: definition.bossMaxHp },
    passage: { current: 0, required: definition.passageRequired }, completedFloors: Array.from({ length: floor - 1 }, (_, i) => i + 1), updatedAt: NOW };
}
const fresh = (seed = 'synthetic-demon-tower-seed-0001') => createDemonTowerState(NOW, DATE, seed);
function action(state: DemonTowerEngineState, value: DemonTowerAction, overrides: Partial<{ now: number; serviceDate: string; world: DemonTowerWorldView }> = {}) {
  return actDemonTower(state, value, { now: NOW, serviceDate: DATE, world: world(), ...overrides });
}
function equipped(mainHand: DemonTowerWeaponId = 'w1', artifact: DemonTowerWeaponId | null = null, seed = 'combat-synthetic-seed-0001'): DemonTowerEngineState {
  const state = fresh(seed);
  state.level = 60;
  state.attributes = { STR: 100, SPD: 100, AGI: 100, DEF: 100, LUCK: 100 };
  state.weapons = DEMON_TOWER_WEAPONS.map((item) => ({ id: item.id, quality: 0, spareCopies: 0 }));
  state.skills = DEMON_TOWER_SKILLS.map((item) => ({ id: item.id, quality: 0, spareCopies: 0 }));
  state.loadout = { mainHand, artifact, activeSkills: ['s2', 's1', 's3'], passiveSkills: [] };
  state.hp = demonTowerMaxHp(state);
  return state;
}
function combat(mainHand: DemonTowerWeaponId = 'w1', artifact: DemonTowerWeaponId | null = null, seed = 'combat-synthetic-seed-0001'): DemonTowerEngineState {
  let state = equipped(mainHand, artifact, seed);
  for (let i = 0; i < 12 && !state.battle; i += 1) {
    state.stamina = 100;
    state = action(state, { kind: 'explore', payload: {} }).state;
  }
  if (!state.battle) throw new Error('Synthetic seed did not create battle');
  state.battle.player.attributes = { STR: 100, SPD: 100, AGI: 100, DEF: 100, LUCK: 100 };
  state.battle.enemies = [state.battle.enemies[0]];
  const enemy = state.battle.enemies[0];
  enemy.hp = 10000; enemy.maxHp = 10000; enemy.elite = false; enemy.mechanic = undefined; enemy.effects = []; enemy.shield = 0;
  enemy.attributes = { STR: 80, SPD: 0, AGI: 0, DEF: 0, LUCK: 0 };
  state.battle.log = [];
  return state;
}
const attack = (state: DemonTowerEngineState) => action(state, { kind: 'attack', payload: { targetId: 'enemy-1' } }).state;
function cast(state: DemonTowerEngineState, id: DemonTowerSkillId): DemonTowerEngineState {
  state.loadout.activeSkills = [id];
  return action(state, { kind: 'skill', payload: { skillId: id, targetId: 'enemy-1' } }).state;
}
function expectCode(run: () => unknown, code: string): void {
  try { run(); throw new Error(`Expected ${code}`); }
  catch (error) { expect(error).toBeInstanceOf(DemonTowerEngineError); expect((error as DemonTowerEngineError).code).toBe(code); }
}

describe('DemonTower engine contracts and authority', () => {
  test('all nine floors, twenty weapons, sixteen skills are reachable before the level cap', () => {
    expect(DEMON_TOWER_FLOORS).toHaveLength(9);
    expect(DEMON_TOWER_WEAPONS).toHaveLength(20);
    expect(DEMON_TOWER_SKILLS).toHaveLength(16);
    expect(new Set(DEMON_TOWER_WEAPONS.map((item) => item.id)).size).toBe(20);
    expect(new Set(DEMON_TOWER_SKILLS.map((item) => item.id)).size).toBe(16);
    expect(DEMON_TOWER_FLOORS.map((floor) => floor.requiredLevel)).toEqual([1, 5, 12, 22, 36, 52, 72, 94, 110]);
    expect(demonTowerPersonalUnlockedFloor(120)).toBe(9);
    expect(DEMON_TOWER_CATALOG.rules.dailyOfficeCoinCap).toBe(200);
  });
  test('newcomers can immediately equip both slots and active skills without veteran gates', () => {
    const state = fresh();
    expect(state.weapons.map((weapon) => weapon.id)).toEqual(['w1', 'w5', 'w9', 'w13', 'w17']);
    expect(state.loadout).toEqual({ mainHand: 'w1', artifact: 'w17', activeSkills: ['s2', 's1', 's3'], passiveSkills: [] });
    const result = action(state, { kind: 'equip', payload: { ...state.loadout, activeSkills: ['s4', 's2', 's1'] } });
    expect(result.state.level).toBe(1);
    expect(result.state.loadout.activeSkills).toEqual(['s4', 's2', 's1']);
    expect(state.loadout.activeSkills).toEqual(['s2', 's1', 's3']);
  });
  test('identical private seed and action sequence are deterministic, other seeds differ', () => {
    const run = (seed: string) => action(fresh(seed), { kind: 'explore', payload: {} });
    expect(run('fixed-test-seed-000000')).toEqual(run('fixed-test-seed-000000'));
    expect(run('fixed-test-seed-000001').state.rngSeed).not.toBe(run('fixed-test-seed-000000').state.rngSeed);
  });
  test.each([
    null, [], {}, { kind: 'explore' }, { kind: 'explore', payload: {}, seed: 'client' },
    { kind: 'explore', payload: { officeCoins: 100 } }, { kind: 'explore', payload: [] },
    { kind: 'unknown', payload: {} }, { kind: 'allocate', payload: { attribute: 'STR', points: Infinity } },
    { kind: 'allocate', payload: { attribute: 'STR', points: -1 } },
    { kind: 'allocate', payload: { attribute: 'STR', points: 1.5 } },
    { kind: 'allocate', payload: { attribute: 'INT', points: 1 } },
  ])('rejects malformed or client-authoritative input without changing state: %j', (raw) => {
    const state = fresh(), before = JSON.stringify(state);
    expect(() => actDemonTower(state, raw, { now: NOW, serviceDate: DATE, world: world() })).toThrow(DemonTowerEngineError);
    expect(JSON.stringify(state)).toBe(before);
  });
  test('rejects inherited action objects and getters without invoking them', () => {
    let invoked = false;
    const raw = { kind: 'explore', get payload() { invoked = true; return {}; } };
    expectCode(() => actDemonTower(fresh(), raw, { now: NOW, serviceDate: DATE, world: world() }), 'INVALID_ACTION');
    expect(invoked).toBe(false);
    expectCode(() => actDemonTower(fresh(), Object.create({ kind: 'explore', payload: {} }), { now: NOW, serviceDate: DATE, world: world() }), 'INVALID_ACTION');
  });
  test('view never includes seed, private RNG counters, combat flags or mutable references', () => {
    const state = combat();
    const view = demonTowerProfileView(state, NOW, 4, 8);
    const serialized = JSON.stringify(view);
    for (const secret of ['rngSeed', 'rngCounter', 'lootPity', 'stepsSinceGuarantee', 'usedRevive', 'reviveArmed', 'untouchedTurns', 'playerDamageTaken', 'landedPlayerHits', state.rngSeed]) expect(serialized).not.toContain(secret);
    expect(view.version).toBe(4); expect(view.daily.officeCoinsEarned).toBe(8);
    view.weapons[0].quality = 9;
    view.battle!.enemies[0].hp = 0;
    expect(state.weapons[0].quality).toBe(0);
    expect(state.battle!.enemies[0].hp).toBe(10000);
  });
});

describe('DemonTower free attribute reset', () => {
  const reset = (state: DemonTowerEngineState, now = NOW) => action(state, { kind: 'reset_attributes', payload: {} },
    { now, serviceDate: new Date(now + 8 * 3_600_000).toISOString().slice(0, 10), world: world(9) });
  const spend = (state: DemonTowerEngineState, attribute: DemonTowerAttribute = 'DEF', points = state.unspentPoints, now = NOW) =>
    action(state, { kind: 'allocate', payload: { attribute, points } },
      { now, serviceDate: new Date(now + 8 * 3_600_000).toISOString().slice(0, 10) }).state;
  test('first reset refunds only allocated free points and gives no resources, healing or random progress', () => {
    const state = spend(fresh(), 'DEF', 2); state.hp = 42;
    const before = structuredClone(state), result = reset(state);
    expect(result.state).toEqual({ ...before, attributes: fresh().attributes, unspentPoints: 3, lastAttributeResetAt: NOW });
    expect(result.officeCoinIntent).toBe(0); expect(result.worldEffect).toBeNull();
    expect(result.events.join('')).toContain('2');
    expect(state).toEqual(before);
    expect(demonTowerProfileView(result.state, NOW, 2).attributeReset).toEqual({ allocatedPoints: 0, eligibleAt: NOW + 86_400_000 });
    expect(JSON.stringify(demonTowerProfileView(result.state, NOW, 2))).not.toContain('lastAttributeResetAt');
  });
  test('unallocated points are a no-op and never consume the first free reset', () => {
    const state = fresh(), before = structuredClone(state);
    expectCode(() => reset(state), 'ATTRIBUTES_UNCHANGED');
    expect(state).toEqual(before);
    expect(demonTowerProfileView(state, NOW, 0).attributeReset).toEqual({ allocatedPoints: 0, eligibleAt: null });
    const done = reset(spend(state)).state;
    expectCode(() => reset(done), 'ATTRIBUTES_UNCHANGED');
    expect(done.lastAttributeResetAt).toBe(NOW);
  });
  test('rolling cooldown rejects midnight and 24h minus 1ms but permits exactly 24h', () => {
    const done = spend(reset(spend(fresh())).state, 'STR');
    for (const now of [Date.UTC(2026, 8, 8, 16), NOW + 86_400_000 - 1]) {
      const before = structuredClone(done);
      expectCode(() => reset(done, now), 'ATTRIBUTE_RESET_COOLDOWN');
      expect(done).toEqual(before);
    }
    const next = reset(done, NOW + 86_400_000).state;
    expect(next.unspentPoints).toBe(3);
    expect(next.lastAttributeResetAt).toBe(NOW + 86_400_000);
    expect(demonTowerProfileView(next, NOW + 86_400_000, 3).attributeReset.eligibleAt).toBe(NOW + 2 * 86_400_000);
  });
  test('old save without reset timestamp remains eligible for its first free reset', () => {
    const state = spend(fresh()); delete state.lastAttributeResetAt;
    expect(demonTowerProfileView(state, NOW, 3).attributeReset).toEqual({ allocatedPoints: 3, eligibleAt: null });
    expect(reset(state).state.lastAttributeResetAt).toBe(NOW);
  });
  test('reset clamps health to reduced defense ceiling without healing on subsequent allocation', () => {
    const state = spend(fresh()); state.hp = demonTowerMaxHp(state);
    const result = reset(state).state;
    expect(result.hp).toBe(125); expect(result.hp).toBeLessThan(state.hp);
    const restoredBuild = spend(result);
    expect(demonTowerMaxHp(restoredBuild)).toBe(137); expect(restoredBuild.hp).toBe(125);
    const defeated = spend(fresh()); defeated.hp = 0;
    expect(reset(defeated).state.hp).toBe(0);
  });
  test('real training preserves every inherent rotating attribute and earned point budget after reset', () => {
    let state = spend(fresh(), 'LUCK', 2), now = NOW;
    while (state.level < 12) {
      now += 1_080_000;
      state = action(state, { kind: 'train', payload: {} },
        { now, serviceDate: new Date(now + 8 * 3_600_000).toISOString().slice(0, 10), world: world(9) }).state;
      const earned = 3 + 2 * (state.level - 1);
      const spent = spend(state, 'STR', state.unspentPoints, now), done = reset(spent, now).state;
      const fixedCount = 2 * (done.level - 1);
      for (const [index, key] of (['STR', 'SPD', 'AGI', 'DEF', 'LUCK'] as const).entries()) {
        expect(done.attributes[key]).toBe(10 + Math.floor(fixedCount / 5) + (((index + 3) % 5) < fixedCount % 5 ? 1 : 0));
      }
      expect(done.unspentPoints).toBe(earned);
      expect(done.totalExperience).toBe(state.totalExperience);
      expect(done.level).toBe(state.level);
    }
    expect(state.level).toBeGreaterThanOrEqual(12);
  });
  test('weapons and their effective bonuses never become refundable free points', () => {
    const state = spend(fresh(), 'STR', 1);
    for (const mainHand of ['w1', 'w5', 'w9', 'w13', 'w17'] as const) {
      const switched = mainHand === state.loadout.mainHand ? state : action(state, { kind: 'equip', payload:
        { ...state.loadout, mainHand, artifact: mainHand === 'w17' ? null : 'w17' } }).state;
      const view = demonTowerProfileView(switched, NOW, 1);
      expect(view.attributeReset.allocatedPoints).toBe(1);
      const done = reset(switched).state;
      expect(done.unspentPoints).toBe(3); expect(done.attributes).toEqual(fresh().attributes);
      expect(done.loadout).toEqual(switched.loadout); expect(done.weapons).toEqual(switched.weapons);
    }
  });
  test.each([
    (state: DemonTowerEngineState) => { state.attributes.STR += 1; },
    (state: DemonTowerEngineState) => { state.attributes.SPD = 9; },
    (state: DemonTowerEngineState) => { state.attributes.DEF += 0.5; },
    (state: DemonTowerEngineState) => { state.unspentPoints = -1; },
    (state: DemonTowerEngineState) => { state.unspentPoints += 1; },
    (state: DemonTowerEngineState) => { state.lastAttributeResetAt = NOW + 1; },
  ])('corrupt point budget or reset history cannot mint new points (%#)', (corrupt) => {
    const state = spend(fresh()); corrupt(state); const before = structuredClone(state);
    expectCode(() => reset(state), 'INVALID_STATE'); expect(state).toEqual(before);
  });
  test('battle disallows reset and client supplied time, points or refund data are rejected', () => {
    expectCode(() => reset(combat()), 'BATTLE_IN_PROGRESS');
    for (const payload of [{ eligibleAt: 0 }, { points: 1000 }, { attribute: 'DEF' }, [], null]) {
      expectCode(() => actDemonTower(spend(fresh()), { kind: 'reset_attributes', payload },
        { now: NOW, serviceDate: DATE, world: world() }), 'INVALID_ACTION');
    }
    expect(demonTowerProfileView(combat(), NOW, 1).availableActions).not.toContain('reset_attributes');
    expect(demonTowerProfileView(spend(fresh()), NOW, 1).availableActions).toContain('reset_attributes');
  });
});

describe('DemonTower progression, time and inventory', () => {
  test('stamina restores from server time, retains partial intervals and never accrues beyond full', () => {
    const state = fresh(); state.stamina = 90;
    const at = NOW + DEMON_TOWER_CATALOG.rules.staminaRestoreMs * 2 + 100;
    const restored = advanceDemonTowerState(state, at, DATE);
    expect(restored.stamina).toBe(92);
    expect(restored.staminaAt).toBe(at - 100);
    const full = advanceDemonTowerState(restored, NOW + 86_400_000, '2026-09-09');
    expect(full.stamina).toBe(100);
    const trained = action(full, { kind: 'train', payload: {} }, { now: NOW + 86_400_000, serviceDate: '2026-09-09' }).state;
    expect(advanceDemonTowerState(trained, NOW + 86_400_000 + 1, '2026-09-09').stamina).toBe(94);
  });
  test('clock cannot move backwards; day rollover clears only daily counters', () => {
    const state = fresh(); state.daily.activity = 10; state.daily.bossAttempts = 3; state.daily.rewardClaimed = true;
    expectCode(() => advanceDemonTowerState(state, NOW - 1, DATE), 'INVALID_TIME');
    const next = advanceDemonTowerState(state, NOW + 86_400_000, '2026-09-09');
    expect(next.daily).toEqual({ serviceDate: '2026-09-09', activity: 0, bossAttempts: 0, rewardClaimed: false });
    expect(next.weapons).toEqual(state.weapons);
    expectCode(() => advanceDemonTowerState(next, NOW + 86_400_000 - 1, '2026-09-09'), 'INVALID_TIME');
    expectCode(() => advanceDemonTowerState(state, NOW, '2026-09-09'), 'INVALID_SERVICE_DATE');
  });
  test('Shanghai midnight, not browser date or UTC midnight, resets boss attempts', () => {
    const before = Date.UTC(2026, 8, 8, 15, 59, 59);
    const state = createDemonTowerState(before, DATE, 'midnight-synthetic-seed-01'); state.daily.bossAttempts = 3;
    const next = advanceDemonTowerState(state, before + 1000, '2026-09-09');
    expect(next.daily.bossAttempts).toBe(0);
    expectCode(() => advanceDemonTowerState(state, before + 1000, DATE), 'INVALID_SERVICE_DATE');
  });
  test('outside healing is real, passive recovery accelerates it, combat cannot wait-heal', () => {
    const plain = equipped(); plain.hp = 1;
    const passive = structuredClone(plain); passive.loadout.passiveSkills = ['s12'];
    expect(advanceDemonTowerState(plain, NOW + 300_000, DATE).hp).toBe(11);
    expect(advanceDemonTowerState(passive, NOW + 300_000, DATE).hp).toBe(14);
    const fighting = combat(); fighting.hp = 1; fighting.battle!.player.hp = 1;
    expect(advanceDemonTowerState(fighting, NOW + 300_000, DATE).hp).toBe(1);
  });
  test('rest spends only private stamina and safely revives a defeated character', () => {
    const state = fresh(); state.hp = 0;
    expectCode(() => action(state, { kind: 'explore', payload: {} }), 'REST_REQUIRED');
    const result = action(state, { kind: 'rest', payload: {} });
    expect(result.state.hp).toBe(Math.ceil(demonTowerMaxHp(state) / 2));
    expect(result.state.stamina).toBe(95); expect(result.officeCoinIntent).toBe(0);
    expect(result.worldEffect).toBeNull();
  });
  test('level increases guarantee attributes and free points; cap remains 120', () => {
    const state = fresh(); state.experience = demonTowerExperienceToNext(1) - 1;
    const result = action(state, { kind: 'train', payload: {} }).state;
    expect(result.level).toBeGreaterThan(1); expect(result.unspentPoints).toBeGreaterThan(3);
    expect(Object.values(result.attributes).reduce((a, b) => a + b)).toBeGreaterThan(50);
    state.level = 120; state.experience = 0;
    const capped = action(state, { kind: 'train', payload: {} }).state;
    expect(capped.level).toBe(120); expect(capped.experience).toBe(0);
  });
  test('free points cannot be double spent, zero/negative/distant floor access fails', () => {
    const state = action(fresh(), { kind: 'allocate', payload: { attribute: 'DEF', points: 3 } }).state;
    expect(state.attributes.DEF).toBe(13); expect(state.unspentPoints).toBe(0);
    expectCode(() => action(state, { kind: 'allocate', payload: { attribute: 'DEF', points: 1 } }), 'NOT_ENOUGH_ATTRIBUTE_POINTS');
    expectCode(() => action(state, { kind: 'select_floor', payload: { floor: 9 } }, { world: world(9) }), 'FLOOR_LOCKED');
    state.level = 120;
    expect(action(state, { kind: 'select_floor', payload: { floor: 9 } }, { world: world(9) }).state.selectedFloor).toBe(9);
  });
  test('later arrivals can train faster and enter already-unlocked floors without prior kills', () => {
    const a = action(fresh(), { kind: 'train', payload: {} }).state;
    const b = action(fresh(), { kind: 'train', payload: {} }, { world: world(9) }).state;
    expect(b.totalExperience).toBeGreaterThan(a.totalExperience);
    b.level = 12;
    expect(action(b, { kind: 'select_floor', payload: { floor: 3 } }, { world: world(9) }).state.selectedFloor).toBe(3);
  });
  test('duplicate upgrade is guaranteed, consumes exactly one copy and no hidden materials', () => {
    const state = fresh(); state.weapons[0].spareCopies = 3;
    const result = action(state, { kind: 'upgrade', payload: { itemType: 'weapon', itemId: 'w1' } }).state;
    expect(result.weapons[0]).toEqual({ id: 'w1', quality: 1, spareCopies: 2 });
    expect(result.materials).toEqual(state.materials);
    expect(demonTowerEffectiveAttributes(result).STR).toBeGreaterThan(demonTowerEffectiveAttributes(state).STR);
  });
  test('material upgrade is exact; quality cap and failure never discard spare items', () => {
    const state = fresh();
    const result = action(state, { kind: 'upgrade', payload: { itemType: 'weapon', itemId: 'w1' } }).state;
    expect(result.materials.ore).toBe(6); expect(result.materials.soul).toBe(3);
    state.weapons[0].quality = 5; state.weapons[0].spareCopies = 7;
    const before = JSON.stringify(state);
    expectCode(() => action(state, { kind: 'upgrade', payload: { itemType: 'weapon', itemId: 'w1' } }), 'QUALITY_MAXIMUM');
    expect(JSON.stringify(state)).toBe(before);
  });
  test('four eligible exploration results always trigger a missing-item guarantee, even after random drops', () => {
    let state = combat();
    state.weapons = [{ id: 'w1', quality: 0, spareCopies: 0 }];
    state.skills = ['s1', 's2', 's3'].map((id) => ({ id: id as DemonTowerSkillId, quality: 0, spareCopies: 0 }));
    const originalWeapons = state.weapons.length, originalSkills = state.skills.length;
    for (let i = 0; i < 8; i += 1) {
      if (!state.battle) {
        state.stamina = 100;
        for (let attempts = 0; attempts < 20 && !state.battle; attempts += 1) state = action(state, { kind: 'explore', payload: {} }).state;
      }
      state.battle!.enemies = [state.battle!.enemies[0]];
      state.battle!.enemies[0].hp = 1;
      state.battle!.enemies[0].attributes = { STR: 0, SPD: 0, AGI: 0, DEF: 0, LUCK: 0 };
      while (state.battle) state = attack(state);
    }
    expect(state.weapons.length).toBeGreaterThan(originalWeapons);
    expect(state.skills.length).toBeGreaterThan(originalSkills);
    expect(state.lootPity.stepsSinceGuarantee).toBeLessThan(4);
  });
  test('all thirty-six items have a finite free guarantee path independent of random duplicates', () => {
    let state = fresh('finite-free-collection-synthetic'); state.level = 60;
    state.attributes = { STR: 1000, SPD: 1000, AGI: 1000, DEF: 1000, LUCK: 10 };
    state.hp = demonTowerMaxHp(state);
    let eligibleResults = 0;
    const initialMissing = DEMON_TOWER_WEAPONS.length + DEMON_TOWER_SKILLS.length - state.weapons.length - state.skills.length;
    while (state.weapons.length + state.skills.length < 36 && eligibleResults < initialMissing * DEMON_TOWER_CATALOG.rules.lootGuaranteeEvery) {
      // Inventory guarantee unit fixture, not the resource-conserving campaign below.
      state.stamina = 100;
      state = action(state, { kind: 'explore', payload: {} }).state;
      while (state.battle) state = attack(state);
      expect(state.hp).toBeGreaterThan(0);
      eligibleResults += 1;
    }
    expect(state.weapons.map((item) => item.id).sort()).toEqual(DEMON_TOWER_WEAPONS.map((item) => item.id).sort());
    expect(state.skills.map((item) => item.id).sort()).toEqual(DEMON_TOWER_SKILLS.map((item) => item.id).sort());
    expect(eligibleResults).toBeLessThanOrEqual(initialMissing * DEMON_TOWER_CATALOG.rules.lootGuaranteeEvery);
  });
  test('luck artifact increases measured drops even after neutralizing its flat attribute bonus', () => {
    let plainDrops = 0, improvedDrops = 0, eligible = 0;
    const copies = (state: DemonTowerEngineState) => [...state.weapons, ...state.skills].reduce((sum, item) => sum + item.spareCopies, 0);
    for (let seed = 0; seed < 1000; seed += 1) {
      const plain = equipped('w1', null, `loot-probability-synthetic-${seed}`);
      const improved = structuredClone(plain); improved.loadout.artifact = 'w20'; improved.attributes.LUCK -= 38;
      expect(demonTowerEffectiveAttributes(improved).LUCK).toBe(demonTowerEffectiveAttributes(plain).LUCK);
      const low = action(plain, { kind: 'explore', payload: {} }).state;
      const high = action(improved, { kind: 'explore', payload: {} }).state;
      expect(Boolean(low.battle)).toBe(Boolean(high.battle));
      if (low.battle) continue;
      eligible += 1; plainDrops += copies(low); improvedDrops += copies(high);
      expect(copies(high)).toBeGreaterThanOrEqual(copies(low));
    }
    expect(eligible).toBeGreaterThan(200);
    expect(improvedDrops - plainDrops).toBeGreaterThan(10);
  });
  test('equipment enforces ownership, type, level, skill role, duplicates and slot bounds', () => {
    const state = fresh();
    for (const payload of [
      { ...state.loadout, mainHand: 'w17' }, { ...state.loadout, artifact: 'w1' },
      { ...state.loadout, mainHand: 'w2' }, { ...state.loadout, activeSkills: ['s1', 's1'] },
      { ...state.loadout, activeSkills: ['s1', 's2', 's3', 's4'] }, { ...state.loadout, passiveSkills: ['s1'] },
    ]) expect(() => action(state, { kind: 'equip', payload: payload as typeof state.loadout })).toThrow(DemonTowerEngineError);
  });
  test('all five starter schools can be main hand, including luck artifacts, without duplicate slots', () => {
    const state = fresh();
    for (const mainHand of DEMON_TOWER_CATALOG.starter.weapons) {
      const result = action(state, { kind: 'equip', payload: { ...state.loadout, mainHand, artifact: mainHand === 'w17' ? null : 'w17', activeSkills: ['s1'] } });
      expect(result.state.loadout.mainHand).toBe(mainHand);
    }
    expectCode(() => action(state, { kind: 'equip', payload: { ...state.loadout, mainHand: 'w17', artifact: 'w17' } }), 'DUPLICATE_EQUIPMENT');
  });
  test('no-op loadout/floor actions reject without changing resources, timestamps or private counters', () => {
    const state = fresh(); state.stamina = 50;
    const before = JSON.stringify(state), later = { now: NOW + 180000 };
    expectCode(() => action(state, { kind: 'equip', payload: state.loadout }, later), 'LOADOUT_UNCHANGED');
    // Equivalent JSON objects are identical game intentions regardless of property insertion order.
    const reordered = { passiveSkills: [...state.loadout.passiveSkills], activeSkills: [...state.loadout.activeSkills], artifact: state.loadout.artifact, mainHand: state.loadout.mainHand };
    expectCode(() => action(state, { kind: 'equip', payload: reordered }, later), 'LOADOUT_UNCHANGED');
    expectCode(() => action(state, { kind: 'select_floor', payload: { floor: 1 } }, later), 'FLOOR_UNCHANGED');
    expect(JSON.stringify(state)).toBe(before);
  });
  test('active skill priority is significant: reversing the same owned skills is a valid new loadout', () => {
    const state = fresh(), order = [...state.loadout.activeSkills].reverse();
    const result = action(state, { kind: 'equip', payload: { ...state.loadout, activeSkills: order } });
    expect(result.state.loadout.activeSkills).toEqual(order);
    expect(result.state.loadout.activeSkills).not.toEqual(state.loadout.activeSkills);
  });
  test('daily claim is a bounded asset intent once, not a direct wallet mutation', () => {
    const state = fresh(); state.daily.activity = 3;
    const result = action(state, { kind: 'claim_reward', payload: {} });
    expect(result.officeCoinIntent).toBe(30);
    expectCode(() => action(result.state, { kind: 'claim_reward', payload: {} }), 'DAILY_REWARD_CLAIMED');
    expect(JSON.stringify(result.state)).not.toContain('officeCoinBalance');
  });
});

describe('DemonTower combat effects', () => {
  test('oversized shield cannot heal HP or produce negative damage, and does not leak past expiry', () => {
    const state = combat('w15');
    state.battle!.player.hp = 10; state.hp = 10; state.battle!.player.shield = 500;
    const result = attack(state);
    expect(result.battle!.player.hp).toBe(10);
    expect(result.battle!.log.every((entry) => entry.amount === undefined || entry.amount >= 0)).toBe(true);
  });
  test('temporary shield absorption/expiry preserves the unused permanent shield', () => {
    const state = combat('w15');
    state.battle!.player.shield = 100;
    state.battle!.player.effects = [{ id: 'shield', magnitude: 20, turns: 1 }];
    state.battle!.enemies[0].attributes.STR = 0;
    const result = attack(state);
    expect(result.battle!.player.shield).toBeGreaterThanOrEqual(79);
    expect(result.battle!.player.shield).toBeLessThanOrEqual(80);
  });
  test('cooldown survives requests, prevents replay, decrements by actual combat turns only', () => {
    const state = combat(); const first = cast(state, 's2');
    expect(first.battle!.cooldowns.s2).toBe(2);
    expectCode(() => cast(first, 's2'), 'SKILL_NOT_READY');
    expect(advanceDemonTowerState(first, NOW + 86_400_000, '2026-09-09').battle!.cooldowns.s2).toBe(2);
    const second = attack(first), third = attack(second);
    expect(third.battle!.cooldowns.s2).toBe(0);
    expect(cast(third, 's2').battle!.cooldowns.s2).toBe(2);
  });
  test('quality scales actual skills and +3 reduces cooldown', () => {
    const base = combat(), upgraded = structuredClone(base);
    upgraded.skills.find((skill) => skill.id === 's2')!.quality = 3;
    const low = cast(base, 's2'), high = cast(upgraded, 's2');
    expect(high.battle!.totalDamage).toBeGreaterThan(low.battle!.totalDamage);
    expect(high.battle!.cooldowns.s2).toBe(1);
  });
  test.each(['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's10', 's13', 's14', 's15', 's16'] as DemonTowerSkillId[])('active skill %s executes and creates its expected actual state effect', (id) => {
    const state = combat(); state.hp = 100; state.battle!.player.hp = 100;
    const result = cast(state, id); const battle = result.battle!;
    expect(battle.turn).toBe(1);
    expect(battle.log.some((entry) => entry.text.includes(`施展${DEMON_TOWER_SKILLS.find((skill) => skill.id === id)!.name}`))).toBe(true);
    if (['s2', 's5', 's6', 's10', 's15', 's16'].includes(id)) expect(battle.totalDamage).toBeGreaterThan(0);
    if (id === 's1' || id === 's13') expect(battle.player.hp).toBeGreaterThan(100);
    if (id === 's3') expect(battle.player.shield).toBeGreaterThan(0);
    if (id === 's4') expect(battle.player.effects.some((effect) => effect.id === 'strength')).toBe(true);
    if (id === 's7') expect(battle.player.effects.some((effect) => effect.id === 'illusion')).toBe(true);
    if (id === 's14') expect(battle.player.effects.some((effect) => effect.id === 'all')).toBe(true);
    if (id === 's16') expect(battle.enemies[0].effects.some((effect) => effect.id === 'shred')).toBe(true);
  });
  test('DoT lasts exactly two turn ends, temporary buffs expire and cannot stack indefinitely', () => {
    const first = cast(combat(), 's6');
    expect(first.battle!.log.filter((entry) => entry.text.startsWith('毒伤'))).toHaveLength(1);
    const second = attack(first), third = attack(second);
    expect(third.battle!.log.filter((entry) => entry.text.startsWith('毒伤'))).toHaveLength(2);
    expect(third.battle!.enemies[0].effects.some((item) => item.id === 'poison')).toBe(false);
    const buffed = cast(combat(), 's4');
    expect(attack(attack(buffed)).battle!.player.effects.some((item) => item.id === 'strength')).toBe(false);
  });
  test('all passive skills execute in stats, healing or outside recovery', () => {
    const plain = equipped(); const passive = structuredClone(plain); passive.loadout.passiveSkills = ['s8', 's11'];
    expect(demonTowerEffectiveAttributes(passive).LUCK).toBe(demonTowerEffectiveAttributes(plain).LUCK + 8);
    expect(demonTowerEffectiveAttributes(passive).SPD).toBe(demonTowerEffectiveAttributes(plain).SPD + 8);
    const fighting = combat(); fighting.loadout.passiveSkills = ['s9']; fighting.hp = 100; fighting.battle!.player.hp = 100;
    expect(attack(fighting).battle!.log.some((entry) => entry.text.includes('疗伤真气恢复'))).toBe(true);
    const recovering = equipped(); recovering.loadout.passiveSkills = ['s12']; recovering.hp = 1;
    expect(advanceDemonTowerState(recovering, NOW + 60_000, DATE).hp).toBe(3);
  });
  test('once-per-battle revival arms once and triggers only on lethal damage', () => {
    let state = combat(); state.hp = 100; state.battle!.player.hp = 100;
    state = cast(state, 's13');
    expect(state.battle!.usedRevive).toBe(true);
    expectCode(() => cast(state, 's13'), 'SKILL_NOT_READY');
    state.battle!.player.hp = 1;
    state.battle!.enemies[0].attributes.STR = 10000;
    for (let i = 0; i < 5 && state.battle && state.battle.reviveArmed; i += 1) state = attack(state);
    expect(state.battle?.reviveArmed ?? false).toBe(false);
    expect((state.battle?.log ?? state.lastReport!.log).some((entry) => entry.text.includes('续命丹心触发'))).toBe(true);
  });
  test('all twenty weapon definitions have working dispatch and safe combat outcomes', () => {
    for (const definition of DEMON_TOWER_WEAPONS) {
      const state = definition.type === '法器' ? combat('w1', definition.id) : combat(definition.id);
      const result = attack(state);
      expect(result.battle!.turn).toBe(1);
      expect(result.battle!.player.hp).toBeGreaterThanOrEqual(0);
      expect(result.battle!.player.hp).toBeLessThanOrEqual(result.battle!.player.maxHp);
      expect(result.battle!.player.shield).toBeGreaterThanOrEqual(0);
      expect(result.battle!.log.every((entry) => entry.amount === undefined || Number.isSafeInteger(entry.amount) && entry.amount >= 0)).toBe(true);
    }
  });
  test('sweep, dual strikes, splash and summon apply real multi-target/multi-hit damage', () => {
    const sweep = combat('w10'); sweep.battle!.enemies.push({ ...structuredClone(sweep.battle!.enemies[0]), id: 'enemy-2' });
    expect(attack(sweep).battle!.enemies.every((enemy) => enemy.hp < 10000)).toBe(true);
    expect(attack(combat('w8')).battle!.log.filter((entry) => entry.kind === 'damage' && entry.actor === 'player')).toHaveLength(2);
    const splash = combat('w12'); splash.battle!.enemies.push({ ...structuredClone(splash.battle!.enemies[0]), id: 'enemy-2' });
    expect(attack(splash).battle!.log.some((entry) => entry.text.includes('龙吟溅射'))).toBe(true);
    const summon = attack(attack(combat('w1', 'w18')));
    expect(summon.battle!.log.some((entry) => entry.text.includes('召灵'))).toBe(true);
  });
  test('stat weapons, opening shield and training artifact are not description-only', () => {
    expect(demonTowerEffectiveAttributes(equipped('w8')).AGI).toBe(138);
    expect(demonTowerEffectiveAttributes(equipped('w1', 'w20')).LUCK).toBe(138);
    expect(combat('w15').battle!.player.shield).toBeGreaterThan(0);
    const base = action(equipped(), { kind: 'train', payload: {} }).state.totalExperience;
    const boosted = action(equipped('w1', 'w19'), { kind: 'train', payload: {} }).state.totalExperience;
    expect(boosted).toBeGreaterThan(base);
  });
  test('armor break and penetration increase measured damage, block reduces measured incoming damage', () => {
    const baseline = combat('w9'), breaker = combat('w1'), penetrator = combat('w11');
    for (const state of [baseline, breaker, penetrator]) state.battle!.enemies[0].attributes.DEF = 150;
    expect(attack(breaker).battle!.totalDamage).toBeGreaterThan(attack(baseline).battle!.totalDamage);
    expect(attack(penetrator).battle!.totalDamage).toBeGreaterThan(attack(baseline).battle!.totalDamage);
    const plain = combat('w9'), blocked = combat('w13');
    expect(attack(blocked).battle!.playerDamageTaken).toBeLessThan(attack(plain).battle!.playerDamageTaken);
  });
  test('initiative, first-strike critical and stored charge have distinct executed effects', () => {
    const plain = combat('w1'), spear = combat('w9');
    plain.battle!.enemies[0].attributes.SPD = 110;
    spear.battle!.enemies[0].attributes.SPD = 110;
    expect(attack(plain).battle!.log[0].actor).toBe('enemy');
    expect(attack(spear).battle!.log[0].actor).toBe('player');
    expect(attack(combat('w5')).battle!.log.some((entry) => entry.text.includes('鱼肠匕·暴击'))).toBe(true);
    const charged = combat('w3'); charged.battle!.untouchedTurns = 3;
    expect(attack(charged).battle!.log.some((entry) => entry.text.includes('蓄力完成'))).toBe(true);
  });
  test('lifesteal and reflected damage change actual HP without recursive reflection', () => {
    const vampire = combat('w4'); vampire.hp = 100; vampire.battle!.player.hp = 100;
    vampire.battle!.enemies[0].attributes.STR = 0;
    expect(attack(vampire).battle!.player.hp).toBeGreaterThan(100);
    const reflected = attack(combat('w14'));
    expect(reflected.battle!.log.filter((entry) => entry.text.startsWith('反震：'))).toHaveLength(1);
  });
  test('probabilistic stun, combo, dodge-counter and immunity each trigger under reproducible server seeds', () => {
    for (const [weaponId, expected] of [['w2', '受到震慑'], ['w6', '秋水连击'], ['w7', '残影反击'], ['w16', '绝对防御']] as const) {
      let triggered = false;
      for (let seed = 0; seed < 80 && !triggered; seed += 1) {
        const state = combat(weaponId, null, `weapon-effect-synthetic-${seed}`);
        if (weaponId === 'w7') state.battle!.player.attributes.AGI = 300;
        const result = attack(state);
        triggered = result.battle!.log.some((entry) => entry.text.includes(expected));
      }
      expect({ weaponId, triggered }).toEqual({ weaponId, triggered: true });
    }
  });
  test('confusion changes enemy accuracy and target evasion rather than merely displaying a label', () => {
    let normalDamage = 0, confusedDamage = 0;
    for (let seed = 0; seed < 300; seed += 1) {
      const normal = combat('w1', null, `confusion-seed-${seed}`), confused = combat('w1', 'w17', `confusion-seed-${seed}`);
      // Compare identical server battle snapshots except equipped effect; neutralize static bonuses.
      const normalResult = attack(normal), confusedResult = attack(confused);
      normalDamage += normalResult.battle!.playerDamageTaken;
      confusedDamage += confusedResult.battle!.playerDamageTaken;
    }
    expect(confusedDamage).toBeLessThan(normalDamage * 0.93);
  });
  test('long-lived ordinary combat is bounded to twelve turns and its log remains bounded', () => {
    let state = combat('w13'); state.battle!.player.shield = 100000;
    for (let i = 0; i < 12; i += 1) state = attack(state);
    expect(state.battle).toBeNull(); expect(state.lastReport!.outcome).toBe('timeout');
    expect(state.lastReport!.turns).toBe(12); expect(state.lastReport!.log.length).toBeLessThanOrEqual(100);
    expectCode(() => attack(state), 'NO_BATTLE');
  });
  test('cannot change gear, allocate stats or train inside combat; flee is reward-free', () => {
    const state = combat();
    expectCode(() => action(state, { kind: 'train', payload: {} }), 'BATTLE_IN_PROGRESS');
    expectCode(() => action(state, { kind: 'equip', payload: state.loadout }), 'BATTLE_IN_PROGRESS');
    const result = action(state, { kind: 'flee', payload: {} });
    expect(result.state.battle).toBeNull(); expect(result.officeCoinIntent).toBe(0);
    expect(result.state.lastReport!.outcome).toBe('fled');
  });
});

describe('DemonTower telegraphed enemy mechanisms', () => {
  test('charge gives a visible safe preparation turn, then a stronger hit, and stun cancels preparation', () => {
    const state = combat(); state.battle!.enemies[0].mechanic = 'charge';
    const preparing = attack(state);
    expect(preparing.battle!.playerDamageTaken).toBe(0);
    expect(demonTowerProfileView(preparing, NOW, 1).battle!.enemies[0].effects.some((effect) => effect.name.includes('下次行动重击'))).toBe(true);
    const released = attack(preparing);
    expect(released.battle!.log.some((entry) => entry.text.includes('蓄力重击'))).toBe(true);
    expect(released.battle!.enemies[0].effects.some((effect) => effect.id === 'charge_ready')).toBe(false);
    const interrupted = structuredClone(preparing);
    interrupted.battle!.enemies[0].effects.push({ id: 'stun', magnitude: 1, turns: 1 });
    const stopped = attack(interrupted);
    expect(stopped.battle!.playerDamageTaken).toBe(0);
    expect(stopped.battle!.log.some((entry) => entry.text.includes('预备招式已被打断'))).toBe(true);
    expect(stopped.battle!.enemies[0].effects.some((effect) => effect.id === 'charge_ready')).toBe(false);
  });
  test('early iron wall absorbs a telegraphed heavy hit instead of healing through negative damage', () => {
    const baseline = combat(); baseline.battle!.floor = 5; baseline.battle!.enemies[0].mechanic = 'charge';
    const protectedState = structuredClone(baseline);
    const plain = attack(attack(baseline));
    const protectedResult = attack(cast(protectedState, 's3'));
    expect(protectedResult.battle!.playerDamageTaken).toBeLessThan(plain.battle!.playerDamageTaken);
    expect(protectedResult.battle!.player.hp).toBeLessThanOrEqual(protectedResult.battle!.player.maxHp);
  });
  test('poison is warned before it occurs, requires HP penetration, lasts two ends and is attributed to enemies', () => {
    let prepared: DemonTowerEngineState | undefined, poisoned: DemonTowerEngineState | undefined;
    for (let seed = 0; seed < 30 && !poisoned; seed += 1) {
      const state = combat('w1', null, `venom-synthetic-${seed}`);
      state.battle!.floor = 2; state.battle!.enemies[0].mechanic = 'venom'; state.battle!.player.attributes.AGI = 0;
      const first = attack(state), second = attack(first);
      if (second.battle!.player.effects.some((effect) => effect.id === 'poison')) { prepared = first; poisoned = second; }
    }
    expect(prepared).toBeDefined(); expect(poisoned).toBeDefined();
    expect(prepared!.battle!.player.effects.some((effect) => effect.id === 'poison')).toBe(false);
    expect(demonTowerProfileView(prepared!, NOW, 1).battle!.enemies[0].effects.some((effect) => effect.name.includes('下次攻击带毒'))).toBe(true);
    const guarded = structuredClone(prepared!); guarded.battle!.player.shield = 100000;
    expect(attack(guarded).battle!.player.effects.some((effect) => effect.id === 'poison')).toBe(false);
    const after = attack(poisoned!);
    const poisonLogs = after.battle!.log.filter((entry) => entry.text.startsWith('毒雾余毒'));
    expect(poisonLogs).toHaveLength(2); expect(poisonLogs.every((entry) => entry.actor === 'enemy' && entry.targetId === 'player')).toBe(true);
    expect(after.battle!.player.effects.some((effect) => effect.id === 'poison')).toBe(false);
    expect(after.battle!.bossDamage).toBe(0);
  });
  test('lethal enemy poison triggers an armed revival once and fleeing clears all poison state', () => {
    const state = cast(combat(), 's13');
    state.battle!.player.hp = 1; state.hp = 1;
    state.battle!.player.effects.push({ id: 'poison', magnitude: 100, turns: 2 });
    state.battle!.enemies[0].effects.push({ id: 'stun', magnitude: 1, turns: 1 });
    const revived = attack(state), logs = revived.battle!.log;
    expect(revived.battle!.player.hp).toBe(Math.ceil(revived.battle!.player.maxHp / 2));
    expect(revived.battle!.reviveArmed).toBe(false);
    expect(logs.findIndex((entry) => entry.text.startsWith('毒雾余毒'))).toBeLessThan(logs.findIndex((entry) => entry.text.includes('续命丹心触发')));
    const fled = action(revived, { kind: 'flee', payload: {} }).state;
    expect(fled.battle).toBeNull();
    const rested = advanceDemonTowerState(fled, NOW + 300000, DATE);
    expect(rested.hp).toBeGreaterThanOrEqual(fled.hp);
    expect(rested.lastReport!.outcome).toBe('fled');
  });
  test('guard gives up the fourth action, adds only a finite shield and never counts absorption as damage', () => {
    let state = combat(); state.battle!.enemies[0].mechanic = 'guard';
    state.battle!.enemies[0].shield = 10000;
    state = attack(state);
    expect(state.battle!.totalDamage).toBe(0);
    for (let turn = 2; turn <= 4; turn += 1) state = attack(state);
    const fourth = state.battle!.log.filter((entry) => entry.turn === 4 && entry.actor === 'enemy');
    expect(fourth.some((entry) => entry.text.includes('本次不攻击'))).toBe(true);
    expect(fourth.some((entry) => entry.kind === 'damage')).toBe(false);
    expect(state.battle!.enemies[0].shield).toBeLessThan(10000);
  });
  test.each([3, 6, 9])('floor %i boss shield is independent of global HP and basic free equipment still contributes', (floor) => {
    let positiveRuns = 0;
    for (let seed = 0; seed < 30; seed += 1) {
      const state = fresh(`minimal-guard-equipment-${floor}-${seed}`);
      state.level = DEMON_TOWER_FLOORS[floor - 1].requiredLevel;
      const natural = 10 + Math.floor((state.level - 1) * 2 / 5);
      state.attributes = { STR: natural, SPD: natural, AGI: natural, DEF: natural, LUCK: natural };
      state.loadout.activeSkills = []; state.hp = demonTowerMaxHp(state);
      const shared = world(floor);
      const ordinary = action(state, { kind: 'challenge_boss', payload: { floor } }, { world: shared });
      const huge = structuredClone(shared); huge.boss.hp *= 2; huge.boss.maxHp *= 2;
      const doubled = action(state, { kind: 'challenge_boss', payload: { floor } }, { world: huge });
      expect(ordinary.worldEffect!.amount).toBe(doubled.worldEffect!.amount);
      expect(ordinary.state.lastReport!.turns).toBeLessThanOrEqual(5);
      if (ordinary.worldEffect!.amount > 0) positiveRuns += 1;
    }
    expect(positiveRuns).toBeGreaterThanOrEqual(29);
  });
});

describe('DemonTower shared boss and construction intents', () => {
  test('stale world-floor intentions never redirect a boss or construction action to a new floor', () => {
    const state = equipped(), before = JSON.stringify(state);
    expectCode(() => action(state, { kind: 'challenge_boss', payload: { floor: 1 } }, { world: world(2) }), 'WORLD_FLOOR_CHANGED');
    expectCode(() => action(state, { kind: 'donate', payload: { floor: 1, material: 'ore', amount: 1 } }, { world: world(2, 'passage') }), 'WORLD_FLOOR_CHANGED');
    expect(JSON.stringify(state)).toBe(before);
    const changedWithinFloor = world(2); changedWithinFloor.version = 999; changedWithinFloor.boss.hp = 1234;
    const allowed = action(state, { kind: 'challenge_boss', payload: { floor: 2 } }, { world: changedWithinFloor });
    expect(allowed.worldEffect!.floor).toBe(2); expect(allowed.worldEffect!.amount).toBeGreaterThan(0);
    expect(allowed.worldEffect!.amount).toBeLessThanOrEqual(1234);
  });
  test('floor intention is mandatory and rejects noninteger, out-of-bounds and client version fields', () => {
    const state = equipped(), before = JSON.stringify(state);
    for (const raw of [
      { kind: 'challenge_boss', payload: {} }, { kind: 'donate', payload: { material: 'ore', amount: 1 } },
      ...[0, 10, 1.5, '1', null].map((floor) => ({ kind: 'challenge_boss', payload: { floor } })),
      { kind: 'challenge_boss', payload: { floor: 1, worldVersion: 1 } },
    ]) expect(() => actDemonTower(state, raw, { now: NOW, serviceDate: DATE, world: world() })).toThrow(DemonTowerEngineError);
    expect(JSON.stringify(state)).toBe(before);
  });
  test('boss resolves at most five turns with daily quota and a bounded contribution, not world mutation', () => {
    const shared = world(), before = JSON.stringify(shared);
    const result = action(equipped(), { kind: 'challenge_boss', payload: { floor: 1 } }, { world: shared });
    expect(result.state.lastReport!.turns).toBeLessThanOrEqual(5);
    expect(result.state.daily.bossAttempts).toBe(1);
    expect(result.worldEffect?.kind).toBe('boss_damage');
    expect(result.worldEffect!.amount).toBeGreaterThan(0);
    expect(result.worldEffect!.amount).toBeLessThanOrEqual(shared.boss.hp);
    expect(JSON.stringify(shared)).toBe(before);
    result.state.daily.bossAttempts = 3;
    expectCode(() => action(result.state, { kind: 'challenge_boss', payload: { floor: 1 } }), 'BOSS_DAILY_LIMIT');
  });
  test('one remaining boss HP cannot yield overkill score; cleared boss and low levels fail', () => {
    const shared = world(); shared.boss.hp = 1;
    const result = action(equipped(), { kind: 'challenge_boss', payload: { floor: 1 } }, { world: shared });
    expect(result.worldEffect!.amount).toBe(1);
    expect(result.state.lastReport!.damage).toBe(1);
    expectCode(() => action(equipped(), { kind: 'challenge_boss', payload: { floor: 1 } }, { world: world(1, 'passage') }), 'BOSS_UNAVAILABLE');
    expectCode(() => action(fresh(), { kind: 'challenge_boss', payload: { floor: 9 } }, { world: world(9) }), 'FLOOR_LOCKED');
  });
  test('late newcomer can explore and catch up after all nine shared floors have been cleared', () => {
    const finished = world(9, 'complete'); finished.passage.current = finished.passage.required;
    const newcomer = fresh();
    expect(action(newcomer, { kind: 'explore', payload: {} }, { world: finished }).state.selectedFloor).toBe(1);
    const trained = action(newcomer, { kind: 'train', payload: {} }, { world: finished });
    expect(trained.state.totalExperience).toBeGreaterThan(37);
    expect(trained.officeCoinIntent).toBe(0);
    expectCode(() => action(newcomer, { kind: 'challenge_boss', payload: { floor: 9 } }, { world: finished }), 'BOSS_UNAVAILABLE');
    expectCode(() => action(newcomer, { kind: 'donate', payload: { floor: 9, material: 'ore', amount: 1 } }, { world: finished }), 'PASSAGE_UNAVAILABLE');
  });
  test('all cleared worlds remain explorable without a fabricated new season, boss or contribution', () => {
    const finished = world(9, 'complete'); finished.passage.current = finished.passage.required;
    let state = equipped(); state.level = 120;
    state = action(state, { kind: 'select_floor', payload: { floor: 9 } }, { world: finished }).state;
    const result = action(state, { kind: 'explore', payload: {} }, { world: finished });
    expect(result.state.selectedFloor).toBe(9); expect(result.worldEffect).toBeNull();
    expect(finished.phase).toBe('complete'); expect(finished.boss.hp).toBe(0);
  });
  test('construction consumes only needed material, is bounded and cannot farm XP or currency', () => {
    const shared = world(1, 'passage'); shared.passage.current = shared.passage.required - 3;
    const state = fresh(); state.materials.clue = 5;
    const result = action(state, { kind: 'donate', payload: { floor: 1, material: 'clue', amount: 1000 } }, { world: shared });
    expect(result.worldEffect).toEqual({ kind: 'construction', floor: 1, amount: 3 });
    expect(result.state.materials.clue).toBe(4);
    expect(result.officeCoinIntent).toBe(0); expect(result.state.totalExperience).toBe(0);
    expect(result.state.daily.activity).toBe(0);
  });
  test('boss eligibility and material validation precede any persisted state mutation', () => {
    const state = fresh(), before = JSON.stringify(state);
    expectCode(() => action(state, { kind: 'donate', payload: { floor: 1, material: 'clue', amount: 2 } }, { world: world(1, 'passage') }), 'NOT_ENOUGH_MATERIALS');
    state.stamina = 0;
    expectCode(() => action(state, { kind: 'challenge_boss', payload: { floor: 1 } }), 'NOT_ENOUGH_STAMINA');
    state.stamina = 100;
    expect(JSON.stringify(state)).toBe(before);
  });
});

/** Balance model: one 10-minute visit/day, 8 seconds per deliberate action, no injected XP/loot/HP. */
function simulateCampaign(days: number, participants: number, builds: DemonTowerAttribute | 'MIXED' | readonly (DemonTowerAttribute | 'MIXED')[] = 'STR') {
  const players = Array.from({ length: participants }, (_, index) => fresh(`campaign-human-synthetic-${index}`));
  let shared = world();
  const opened: Record<number, number> = { 1: 0 };
  const milestones: Record<number, number> = { 1: 0 };
  const playerMilestones = players.map(() => ({} as Record<number, number>));
  const floorStats = Object.fromEntries(DEMON_TOWER_FLOORS.map((floor) => [floor.floor, { victories: 0, defeats: 0, timedOut: 0, bossAttempts: 0 }]));
  let completionDay: number | null = null;
  let victories = 0, defeats = 0, timedOut = 0, attacks = 0, ordinaryCoins = 0, bossDamage = 0;
  const stats: Array<{ day: number; minLevel: number; maxLevel: number; floor: number; phase: string; weapons: number; skills: number }> = [];
  for (let day = 0; day < days; day += 1) {
    const dayStart = NOW + day * 86_400_000, date = new Date(dayStart).toISOString().slice(0, 10);
    for (let person = 0; person < players.length; person += 1) {
      const school = typeof builds === 'string' ? builds : builds[person % builds.length];
      let state = advanceDemonTowerState(players[person], dayStart, date), at = dayStart, earned = 0;
      while (at < dayStart + 600_000) {
        let next: DemonTowerAction;
        if (state.battle) {
          const available = state.loadout.activeSkills.filter((id) => (state.battle!.cooldowns[id] ?? 0) === 0);
          const heal = state.battle.player.hp < state.battle.player.maxHp * 0.65 && available.includes('s1');
          const preferences: DemonTowerSkillId[] = school === 'SPD' ? ['s5'] : school === 'AGI' ? ['s6'] : school === 'LUCK' ? ['s15'] : school === 'DEF' ? [] : ['s16', 's10', 's2'];
          const id = heal ? 's1' : preferences.find((value) => available.includes(value));
          next = id ? { kind: 'skill', payload: { skillId: id } } : { kind: 'attack', payload: { targetId: state.battle.enemies.find((enemy) => enemy.hp > 0)!.id } };
        } else if (state.daily.activity >= 3 && !state.daily.rewardClaimed) next = { kind: 'claim_reward', payload: {} };
        else if (state.unspentPoints > 0) {
          const primary = school === 'MIXED' ? (['STR', 'SPD', 'AGI', 'DEF', 'LUCK'] as const)[state.level % 5] : school;
          const attribute = school !== 'MIXED' && primary !== 'DEF' && state.attributes[primary] > state.attributes.DEF * 2.3 ? 'DEF' : primary;
          next = { kind: 'allocate', payload: { attribute, points: state.unspentPoints } };
        } else {
          const weaponsBySchool: Record<DemonTowerAttribute | 'MIXED', DemonTowerWeaponId[]> = { STR: ['w4', 'w3', 'w2', 'w1'], SPD: ['w12', 'w11', 'w10', 'w9'], AGI: ['w8', 'w7', 'w6', 'w5'], DEF: ['w16', 'w15', 'w14', 'w13'], LUCK: ['w20', 'w18', 'w17'], MIXED: ['w4', 'w3', 'w2', 'w1'] };
          const main = weaponsBySchool[school].find((id) => state.weapons.some((item) => item.id === id) && DEMON_TOWER_WEAPONS.find((item) => item.id === id)!.requiredLevel <= state.level)!;
          const artifact = (['w20', 'w18', 'w17'] as DemonTowerWeaponId[]).find((id) => id !== main && state.weapons.some((item) => item.id === id) && DEMON_TOWER_WEAPONS.find((item) => item.id === id)!.requiredLevel <= state.level) ?? null;
          const skillsBySchool: Record<DemonTowerAttribute | 'MIXED', DemonTowerSkillId[]> = { STR: ['s1', 's16', 's10', 's2'], SPD: ['s1', 's5'], AGI: ['s1', 's6'], DEF: ['s1'], LUCK: ['s1', 's15'], MIXED: ['s1', 's16', 's10', 's2'] };
          const activeSkills = skillsBySchool[school].filter((id) => state.skills.some((item) => item.id === id) && DEMON_TOWER_SKILLS.find((item) => item.id === id)!.requiredLevel <= state.level).slice(0, 3);
          const passiveSkills = (['s9', 's8', 's11'] as DemonTowerSkillId[]).filter((id) => state.skills.some((item) => item.id === id) && DEMON_TOWER_SKILLS.find((item) => item.id === id)!.requiredLevel <= state.level).slice(0, 2);
          const loadout = { mainHand: main, artifact, activeSkills, passiveSkills };
          const owned = state.weapons.find((item) => item.id === main)!;
          const cost = demonTowerUpgradeCost('weapon', main, owned.quality, owned.spareCopies, state.level);
          const upgradeable = cost.available && Object.entries(cost.materials).every(([key, value]) => state.materials[key as keyof typeof state.materials] >= value);
          const floor = Math.min(shared.unlockedFloor, demonTowerPersonalUnlockedFloor(state.level));
          if (JSON.stringify(loadout) !== JSON.stringify(state.loadout)) next = { kind: 'equip', payload: loadout };
          else if (upgradeable) next = { kind: 'upgrade', payload: { itemType: 'weapon', itemId: main } };
          else if (state.selectedFloor !== floor) next = { kind: 'select_floor', payload: { floor } };
          else if (state.hp < demonTowerMaxHp(state) * 0.5 && state.stamina >= 5) next = { kind: 'rest', payload: {} };
          else if (shared.phase === 'passage' && floor === shared.currentFloor && (state.materials.ore > 0 || state.materials.clue > 0)) {
            next = { kind: 'donate', payload: { floor: shared.currentFloor, material: state.materials.clue > 0 ? 'clue' : 'ore', amount: state.materials.clue > 0 ? state.materials.clue : Math.min(1000, state.materials.ore) } };
          } else if (shared.phase === 'boss' && floor === shared.currentFloor && state.daily.bossAttempts < 3 && state.stamina >= 10 && state.hp > demonTowerMaxHp(state) * 0.65) next = { kind: 'challenge_boss', payload: { floor: shared.currentFloor } };
          else if (state.stamina >= 5 && state.hp > 0) next = { kind: 'explore', payload: {} };
          else break;
        }
        const oldReport = state.lastReport?.id;
        const result = action(state, next, { now: at, serviceDate: date, world: shared });
        state = result.state;
        if (next.kind === 'attack' || next.kind === 'skill') attacks += 1;
        if (state.lastReport && state.lastReport.id !== oldReport) {
          if (state.lastReport.outcome === 'victory') victories += 1;
          if (state.lastReport.outcome === 'defeat') defeats += 1;
          if (state.lastReport.outcome === 'timeout') timedOut += 1;
          if (state.lastReport.kind === 'explore') {
            const report = floorStats[state.lastReport.floor];
            if (state.lastReport.outcome === 'victory') report.victories += 1;
            if (state.lastReport.outcome === 'defeat') report.defeats += 1;
            if (state.lastReport.outcome === 'timeout') report.timedOut += 1;
          }
        }
        const grant = Math.min(200 - earned, result.officeCoinIntent); earned += grant; ordinaryCoins += grant;
        if (result.worldEffect?.kind === 'boss_damage') {
          floorStats[result.worldEffect.floor].bossAttempts += 1;
          shared.boss.hp -= result.worldEffect.amount; bossDamage += result.worldEffect.amount;
          if (shared.boss.hp === 0) shared.phase = 'passage';
        }
        if (result.worldEffect?.kind === 'construction') {
          shared.passage.current += result.worldEffect.amount;
          if (shared.passage.current >= shared.passage.required) {
            if (shared.currentFloor === 9) { shared.phase = 'complete'; completionDay ??= day + 1; }
            else { shared = world(shared.currentFloor + 1); opened[shared.currentFloor] = day + 1; }
          }
        }
        for (const level of [5, 12, 22, 36, 48, 52, 72, 94, 110, 120]) {
          if (person === 0 && state.level >= level && milestones[level] === undefined) milestones[level] = day + 1;
          if (state.level >= level && playerMilestones[person][level] === undefined) playerMilestones[person][level] = day + 1;
        }
        at += 8000;
      }
      players[person] = state;
    }
    if ([1, 7, 14, 30, 60, 100].includes(day + 1)) stats.push({ day: day + 1, minLevel: Math.min(...players.map((p) => p.level)), maxLevel: Math.max(...players.map((p) => p.level)),
      floor: shared.currentFloor, phase: shared.phase, weapons: players[0].weapons.length, skills: players[0].skills.length });
  }
  return { participants, school: builds, days, milestones, playerMilestones, opened, completionDay, floorStats, stats, victories, defeats, timedOut, attacks, ordinaryCoins, bossDamage,
    final: { floor: shared.currentFloor, phase: shared.phase, minLevel: Math.min(...players.map((p) => p.level)), maxLevel: Math.max(...players.map((p) => p.level)) } };
}

describe('DemonTower repeatable balance campaign', () => {
  test('six different core-player builds advance together, while casual solo allocation clears early floors', () => {
    const party = simulateCampaign(100, 6, ['STR', 'SPD', 'AGI', 'DEF', 'LUCK', 'MIXED']);
    expect(party.completionDay).not.toBeNull(); expect(party.completionDay!).toBeLessThanOrEqual(100);
    expect(party.playerMilestones.every((levels) => levels[110] <= 100)).toBe(true);
    const casual = simulateCampaign(14, 1, 'MIXED');
    expect(casual.opened[2]).toBeLessThanOrEqual(7); expect(casual.opened[3]).toBeLessThanOrEqual(12);
    expect(casual.milestones[12]).toBeLessThanOrEqual(4);
    expect(casual.floorStats[1].victories).toBeGreaterThan(0); expect(casual.floorStats[2].victories).toBeGreaterThan(0);
    if (process.env.DEMON_TOWER_BALANCE_REPORT === '1') console.info('DEMON_TOWER_CASUAL', JSON.stringify({ party, casual }));
  }, 30_000);
  test.each([1, 6])('%i players can make sustained free progress across 100 bounded daily sessions', (participants) => {
    const result = simulateCampaign(100, participants);
    expect(result.final.minLevel).toBeGreaterThan(12);
    expect(result.final.maxLevel).toBeLessThanOrEqual(120);
    expect(result.final.floor).toBeGreaterThan(1);
    expect(result.ordinaryCoins).toBeLessThanOrEqual(200 * participants * 100);
    expect(result.victories).toBeGreaterThan(0);
    expect(result.stats[0].maxLevel).toBeLessThanOrEqual(15);
    expect(result.milestones[110]).toBeGreaterThan(15);
    expect(result.milestones[110]).toBeLessThanOrEqual(100);
    if (process.env.DEMON_TOWER_BALANCE_REPORT === '1') console.info('DEMON_TOWER_BALANCE', JSON.stringify(result));
  }, 30_000);
  test.each(['SPD', 'AGI', 'DEF', 'LUCK', 'MIXED'] as const)('%s builds are not permanently locked by casual allocation across 100 daily sessions', (school) => {
    const result = simulateCampaign(100, 1, school);
    expect(result.final.minLevel).toBeGreaterThan(20);
    expect(result.final.floor).toBeGreaterThan(2);
    expect(result.victories).toBeGreaterThan(100);
    if (process.env.DEMON_TOWER_BALANCE_REPORT === '1') console.info('DEMON_TOWER_BALANCE', JSON.stringify(result));
  }, 30_000);
});

/** Controlled level/gear snapshots, distinct from the earned-resource campaign: isolate choices at 25% starting HP. */
function bossChoiceExperiment(floor: number, school: DemonTowerAttribute, defensive: boolean) {
  let survived = 0, damage = 0, remainingHp = 0, healingCasts = 0, shieldCasts = 0;
  const bySchool: Record<DemonTowerAttribute, DemonTowerWeaponId[]> = { STR: ['w4', 'w3', 'w2', 'w1'], SPD: ['w12', 'w11', 'w10', 'w9'], AGI: ['w8', 'w7', 'w6', 'w5'], DEF: ['w16', 'w15', 'w14', 'w13'], LUCK: ['w20', 'w18', 'w17'] };
  const damageSkills: Record<DemonTowerAttribute, DemonTowerSkillId[]> = { STR: ['s16', 's10', 's2'], SPD: ['s5'], AGI: ['s6'], DEF: [], LUCK: ['s15'] };
  for (let seed = 0; seed < 30; seed += 1) {
    const state = fresh(`boss-choice-${floor}-${school}-${seed}`);
    state.level = DEMON_TOWER_FLOORS[floor - 1].requiredLevel;
    for (let level = 1; level < state.level; level += 1) {
      const keys = ['STR', 'SPD', 'AGI', 'DEF', 'LUCK'] as const;
      state.attributes[keys[(level * 2) % 5]] += 1; state.attributes[keys[(level * 2 + 1) % 5]] += 1;
    }
    const points = 3 + (state.level - 1) * 2, focused = Math.floor(points * 0.7);
    state.attributes[school] += focused; state.attributes.DEF += points - focused; state.unspentPoints = 0;
    state.weapons = DEMON_TOWER_WEAPONS.filter((item) => item.requiredLevel <= state.level).map((item) => ({ id: item.id, quality: 0, spareCopies: 0 }));
    state.skills = DEMON_TOWER_SKILLS.filter((item) => item.requiredLevel <= state.level).map((item) => ({ id: item.id, quality: 0, spareCopies: 0 }));
    const mainHand = bySchool[school].find((id) => state.weapons.some((item) => item.id === id))!;
    const artifact = (['w20', 'w18', 'w17'] as DemonTowerWeaponId[]).find((id) => id !== mainHand && state.weapons.some((item) => item.id === id)) ?? null;
    state.loadout = { mainHand, artifact, activeSkills: defensive ? ['s3', 's1', 's13'] : damageSkills[school], passiveSkills: [] };
    state.hp = Math.floor(demonTowerMaxHp(state) * 0.25);
    const result = action(state, { kind: 'challenge_boss', payload: { floor } }, { world: world(floor) });
    if (result.state.hp > 0) survived += 1;
    damage += result.worldEffect!.amount; remainingHp += result.state.hp;
    healingCasts += result.state.lastReport!.log.filter((entry) => entry.text.includes('施展回春术') || entry.text.includes('施展续命丹心')).length;
    shieldCasts += result.state.lastReport!.log.filter((entry) => entry.text.includes('施展铁壁')).length;
    expect(result.state.lastReport!.turns).toBeLessThanOrEqual(5);
    expect(result.worldEffect!.amount).toBeGreaterThanOrEqual(0);
  }
  return { floor, school, defensive, samples: 30, survived, damage, remainingHp, healingCasts, shieldCasts };
}
describe('DemonTower low-health tactical experiments', () => {
  test.each([5, 6, 8])('floor %i supports change survival/HP and trade immediate damage under each mechanism', (floor) => {
    const results = (['STR', 'SPD', 'AGI', 'DEF', 'LUCK'] as const).map((school) => ({ offensive: bossChoiceExperiment(floor, school, false), defensive: bossChoiceExperiment(floor, school, true) }));
    for (const { offensive, defensive } of results) {
      expect(defensive.survived).toBeGreaterThanOrEqual(offensive.survived);
      expect(defensive.remainingHp).toBeGreaterThan(offensive.remainingHp);
      expect(defensive.healingCasts).toBeGreaterThan(0); expect(defensive.shieldCasts).toBeGreaterThan(0);
    }
    if (process.env.DEMON_TOWER_BALANCE_REPORT === '1') console.info('DEMON_TOWER_TACTICAL', JSON.stringify(results));
  });
});
