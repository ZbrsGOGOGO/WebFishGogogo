import { DEMON_TOWER_INNATES, DEMON_TOWER_SKILLS, DEMON_TOWER_WEAPONS, demonTowerItemDropPercent, demonTowerLootPool } from '@stealth-reader/shared';
import type { DemonTowerAction, DemonTowerAttribute, DemonTowerWeaponId, DemonTowerOwnedWeapon } from '@stealth-reader/shared';
import { actDemonTower, advanceDemonTowerState, createDemonTowerState, demonTowerAutomaticAction, demonTowerEffectiveAttributes, demonTowerMaxHp, demonTowerProfileView, demonTowerWeightedLoot, type DemonTowerEngineState } from './demon-tower.engine';
import { demonTowerWorldView, initialDemonTowerWorld } from './demon-tower.rules';

const NOW = Date.UTC(2026, 8, 9, 9), DATE = '2026-09-09';
const fresh = (seed = 'growth-synthetic-000001') => createDemonTowerState(NOW, DATE, seed);
const act = (state: DemonTowerEngineState, action: DemonTowerAction) => actDemonTower(state, action, { now: NOW, serviceDate: DATE, world: demonTowerWorldView(initialDemonTowerWorld(new Date(NOW))) });
function oldSave(input = fresh()): DemonTowerEngineState {
  const state = structuredClone(input); delete state.growth;
  for (const item of state.weapons) { delete item.star; delete item.favor; delete item.levelExempt; }
  for (const item of state.skills) delete item.levelExempt;
  if (state.battle) { delete state.battle.rulesVersion; delete state.battle.innates; delete state.battle.feignUsed; }
  return state;
}
function battle(main: DemonTowerWeaponId = 'w1', attribute?: DemonTowerAttribute, seed = 'growth-battle-fixture'): DemonTowerEngineState {
  let state = fresh(seed); state.level = 120;
  state.weapons = DEMON_TOWER_WEAPONS.map(item => ({ id: item.id, quality: 0, spareCopies: 0, star: 1, favor: 0 }));
  state.skills = DEMON_TOWER_SKILLS.map(item => ({ id: item.id, quality: 0, spareCopies: 0 }));
  state.loadout = { mainHand: main, artifact: null, activeSkills: ['s1', 's13', 's15'], passiveSkills: [] };
  if (attribute) state = act(state, { kind: 'choose_innate', payload: { attribute } }).state;
  state.hp = demonTowerMaxHp(state);
  for (let index = 0; index < 30 && !state.battle; index += 1) { state.stamina = 100; state = act(state, { kind: 'explore', payload: {} }).state; }
  if (!state.battle) throw new Error('Synthetic battle fixture failed');
  state.battle.player.attributes = { STR: 30, SPD: 200, AGI: 0, DEF: 0, LUCK: 10 };
  state.battle.enemies = [state.battle.enemies[0]];
  Object.assign(state.battle.enemies[0], { hp: 100000, maxHp: 100000, shield: 0, effects: [], mechanic: undefined, elite: false,
    attributes: { STR: 0, SPD: 0, AGI: 0, DEF: 0, LUCK: 0 } });
  state.battle.log = []; return state;
}
const attack = (state: DemonTowerEngineState) => act(state, { kind: 'attack', payload: { targetId: state.battle!.enemies[0].id } }).state;
function settlement(level: number, misses = { ling: 0, xian: 0 }): ReturnType<typeof act> {
  for (let seed = 0; seed < 100; seed += 1) {
    const state = fresh(`weighted-settlement-${seed}`); state.level = level; state.growth!.misses = { ...misses }; state.hp = demonTowerMaxHp(state);
    const result = act(state, { kind: 'explore', payload: {} }); if (!result.state.battle) return result;
  }
  throw new Error('Synthetic settlement fixture failed');
}

describe('Demon tower free growth, legacy saves and contracts', () => {
  it('keeps the exact 20/16 stable IDs and separates acquisition from equipment levels', () => {
    expect(DEMON_TOWER_WEAPONS).toHaveLength(20); expect(DEMON_TOWER_SKILLS).toHaveLength(16);
    expect(DEMON_TOWER_WEAPONS.filter(item => item.type === '重兵').map(item => [item.dropLevel, item.requiredLevel])).toEqual([[1, 16], [16, 31], [31, 46], [46, 61]]);
    expect(DEMON_TOWER_SKILLS.find(item => item.id === 's2')!.name).toBe('裂地斩');
    expect(DEMON_TOWER_SKILLS.find(item => item.id === 's9')!.name).toBe('疗伤真气');
    expect(DEMON_TOWER_SKILLS.find(item => item.id === 's13')!.name).toBe('续命丹心');
  });
  it('GET projection is pure and does not persist migration, choice, RNG or entitlement', () => {
    const state = oldSave(), original = structuredClone(state);
    const advanced = advanceDemonTowerState(state, NOW, DATE), view = demonTowerProfileView(advanced, NOW, 1);
    expect(state).toEqual(original); expect(advanced.growth).toBeUndefined();
    expect(view.growth?.chosenAttribute).toBeNull(); expect(view.availableActions).toContain('choose_innate');
    expect(view.weapons.every(item => item.levelExempt)).toBe(true);
    expect(JSON.stringify(view)).not.toContain(state.rngSeed);
  });
  it('upgrades only on an idle write and preserves all inventory, materials, points, RNG and pity', () => {
    const state = oldSave(); state.weapons[0].quality = 5; state.weapons[0].spareCopies = 93;
    state.lootPity = { stepsSinceGuarantee: 3, nextKind: 'skill' }; const original = structuredClone(state);
    const result = act(state, { kind: 'choose_innate', payload: { attribute: 'DEF' } }).state;
    expect(state).toEqual(original); expect(result.schemaVersion).toBe(1); expect(result.growth!.rulesVersion).toBe(2);
    expect(result.weapons[0]).toMatchObject({ quality: 5, spareCopies: 93, levelExempt: true, star: 1, favor: 0 });
    for (const key of ['materials', 'attributes', 'unspentPoints', 'rngSeed', 'rngCounter', 'lootPity', 'hp'] as const) expect(result[key]).toEqual(state[key]);
  });
  it('old in-flight battle keeps original heal-only rules and no mastery until after it ends', () => {
    const state = oldSave(battle()); state.battle!.player.hp = 50;
    const after = act(state, { kind: 'skill', payload: { skillId: 's1' } }).state;
    expect(after.growth).toBeUndefined(); expect(after.battle!.rulesVersion).toBeUndefined();
    expect(after.battle!.totalDamage).toBe(0); expect(after.weapons[0].star).toBeUndefined();
    const ended = act(after, { kind: 'flee', payload: {} }).state;
    expect(ended.growth).toBeUndefined();
    const next = act(ended, { kind: 'train', payload: {} }).state;
    expect(next.growth?.rulesVersion).toBe(2);
  });
  it('new starters and old owned weapons remain usable but a newly dropped high-grade weapon does not bypass equip level', () => {
    const starter = fresh(); expect(() => act(starter, { kind: 'equip', payload: { ...starter.loadout, mainHand: 'w5' } })).not.toThrow();
    const newer = fresh(); newer.level = 16; newer.weapons.push({ id: 'w2', quality: 0, spareCopies: 0, star: 1, favor: 0 });
    expect(() => act(newer, { kind: 'equip', payload: { ...newer.loadout, mainHand: 'w2' } })).toThrow('WEAPON_LEVEL_REQUIRED');
    const legacy = oldSave(newer); legacy.level = 12;
    expect(act(legacy, { kind: 'equip', payload: { ...legacy.loadout, mainHand: 'w2' } }).state.loadout.mainHand).toBe('w2');
    newer.level = 31; expect(act(newer, { kind: 'equip', payload: { ...newer.loadout, mainHand: 'w2' } }).state.loadout.mainHand).toBe('w2');
  });
  it.each(['STR', 'SPD', 'AGI', 'DEF', 'LUCK'] as const)('chooses %s explicitly once, derives bonuses without refunding them as free points', attribute => {
    const start = fresh(), base = demonTowerEffectiveAttributes(start);
    const selected = act(start, { kind: 'choose_innate', payload: { attribute } }).state;
    expect(selected.growth!.innates).toEqual([DEMON_TOWER_INNATES.find(item => item.attribute === attribute)!.id]);
    expect(demonTowerEffectiveAttributes(selected)[attribute]).toBe(base[attribute] + 8);
    expect(selected.attributes).toEqual(start.attributes); expect(selected.hp).toBe(start.hp);
    expect(() => act(selected, { kind: 'choose_innate', payload: { attribute } })).toThrow('INNATE_ALREADY_CHOSEN');
    const allocated = act(selected, { kind: 'allocate', payload: { attribute, points: 2 } }).state;
    const reset = act(allocated, { kind: 'reset_attributes', payload: {} }).state;
    expect(reset.unspentPoints).toBe(3); expect(reset.attributes).toEqual(start.attributes);
    expect(demonTowerEffectiveAttributes(reset)[attribute]).toBe(base[attribute] + 8);
  });
  it('catches up old high-level characters to eight unique permanent innates without spending currency', () => {
    const state = oldSave(); state.level = 106;
    const selected = act(state, { kind: 'choose_innate', payload: { attribute: 'LUCK' } }).state;
    expect(selected.growth!.innates).toHaveLength(8); expect(new Set(selected.growth!.innates).size).toBe(8);
    expect(selected.growth!.innates[0]).toBe('luck'); expect(selected.materials).toEqual(state.materials);
    expect(demonTowerProfileView(selected, NOW, 2).growth!.nextInnateLevel).toBeNull();
  });
  it('unlocks the next permanent innate at actual level 16, not at 15 or by spending free points', () => {
    let state = fresh(); state.level = 15; state.experience = 188;
    state = act(state, { kind: 'choose_innate', payload: { attribute: 'DEF' } }).state;
    expect(state.growth!.innates).toEqual(['defense']);
    state = act(state, { kind: 'train', payload: {} }).state;
    expect(state.level).toBe(16); expect(state.growth!.innates).toEqual(['defense', 'strength']);
    expect(demonTowerProfileView(state, NOW, 2).growth!.nextInnateLevel).toBe(31);
  });
  it('rejects an unsupported future rules version instead of silently running v2 against it', () => {
    const state = fresh(); (state.growth as unknown as { rulesVersion: number }).rulesVersion = 3;
    expect(() => advanceDemonTowerState(state, NOW, DATE)).toThrow('INVALID_GROWTH_STATE');
    const pending = battle(); (pending.battle as unknown as { rulesVersion: number }).rulesVersion = 3;
    expect(() => attack(pending)).toThrow('INVALID_GROWTH_STATE');
  });
});

describe('Demon tower weighted acquisition and eligible guarantees', () => {
  it.each(['weapon', 'skill'] as const)('draws 100,000 %s items through the actual two-stage algorithm within 0.3 percentage points', kind => {
    let randomState = 72347123;
    const roll = () => { randomState ^= randomState << 13; randomState ^= randomState >>> 17; randomState ^= randomState << 5; return (randomState >>> 0) / 0x1_0000_0000; };
    const counts = new Map<string, number>();
    for (let i = 0; i < 100000; i += 1) { const item = demonTowerWeightedLoot(kind, 120, '凡', roll(), roll()); counts.set(item.id, (counts.get(item.id) ?? 0) + 1); }
    for (const item of kind === 'weapon' ? DEMON_TOWER_WEAPONS : DEMON_TOWER_SKILLS) {
      expect(Math.abs((counts.get(item.id) ?? 0) / 1000 - demonTowerItemDropPercent(kind, item.id, 120))).toBeLessThan(0.3);
    }
  });
  it.each([1, 15, 16, 30, 31, 45, 46, 60, 61, 120])('never yields ineligible items at level %i; each conditional pool normalizes to 100%', level => {
    for (const kind of ['weapon', 'skill'] as const) {
      const items = kind === 'weapon' ? DEMON_TOWER_WEAPONS : DEMON_TOWER_SKILLS;
      expect(items.reduce((sum, item) => sum + demonTowerItemDropPercent(kind, item.id, level), 0)).toBeCloseTo(100, 8);
      for (let i = 0; i < 100; i += 1) expect(demonTowerWeightedLoot(kind, level, '凡', i / 100, (99 - i) / 100).dropLevel).toBeLessThanOrEqual(level);
    }
  });
  it('does not advance rarity misses before qualifying; collection pity survives the migration', () => {
    const result = settlement(1); expect(result.state.growth!.misses).toEqual({ ling: 0, xian: 0 });
    expect(demonTowerLootPool('skill', 16, '灵')).toHaveLength(0);
  });
  it('at Lv16 forces a valid weapon when the 21st guarantee cannot legally yield a spiritual skill', () => {
    const result = settlement(16, { ling: 20, xian: 0 });
    expect(result.events.some(event => event.includes('兑现灵以上'))).toBe(true);
    expect(result.state.growth!.misses.ling).toBe(0);
    expect(result.state.weapons.some(item => DEMON_TOWER_WEAPONS.find(def => def.id === item.id)!.rarity === '灵')).toBe(true);
    expect(result.state.skills.some(item => DEMON_TOWER_SKILLS.find(def => def.id === item.id)!.dropLevel > 16)).toBe(false);
  });
  it('51st immortal guarantee takes precedence over 21st spiritual and resets both after a real eligible award', () => {
    const result = settlement(31, { ling: 20, xian: 50 });
    expect(result.events.some(event => event.includes('兑现仙以上'))).toBe(true);
    expect(result.state.growth!.misses).toEqual({ ling: 0, xian: 0 });
    expect(result.state.weapons.some(item => DEMON_TOWER_WEAPONS.find(def => def.id === item.id)!.rarity === '仙')).toBe(true);
  });
});

describe('Demon tower star proficiency, free combat and Boss safety', () => {
  it('counts one favor per multi-hit action, caps at five stars and retains +N/copies', () => {
    const state = battle('w8'); const owned = state.weapons.find(item => item.id === 'w8')!;
    owned.quality = 3; owned.spareCopies = 19; owned.favor = 14;
    const after = attack(state), upgraded = after.weapons.find(item => item.id === 'w8')!;
    expect(upgraded).toMatchObject({ quality: 3, spareCopies: 19, star: 2, favor: 0 });
    const capped = structuredClone(after); Object.assign(capped.weapons.find(item => item.id === 'w8')!, { star: 5, favor: 0 });
    expect(attack(capped).weapons.find(item => item.id === 'w8')).toMatchObject({ star: 5, favor: 0 });
  });
  it('requires exactly 150 normal attack actions to reach five stars, with a fresh battle fixture for each action', () => {
    let owned: DemonTowerOwnedWeapon = { id: 'w1', quality: 2, spareCopies: 8, star: 1, favor: 0 };
    for (let count = 1; count <= 150; count += 1) {
      const state = battle(); Object.assign(state.weapons[0], owned);
      const after = attack(state); owned = { ...owned, ...after.weapons[0] };
      if (count === 14) expect(owned).toMatchObject({ star: 1, favor: 14 });
      if (count === 15) expect(owned).toMatchObject({ star: 2, favor: 0 });
      if (count === 45) expect(owned).toMatchObject({ star: 3, favor: 0 });
      if (count === 90) expect(owned).toMatchObject({ star: 4, favor: 0 });
      if (count === 149) expect(owned).toMatchObject({ star: 4, favor: 59 });
    }
    expect(owned).toMatchObject({ star: 5, favor: 0, quality: 2, spareCopies: 8 });
  });
  it('heals then attacks in the same turn exactly once and uses the same cooldown and resource budget', () => {
    const state = battle(); state.battle!.player.hp = 50;
    const after = act(state, { kind: 'skill', payload: { skillId: 's1' } }).state;
    expect(after.battle!.turn).toBe(1); expect(after.battle!.totalDamage).toBeGreaterThan(0);
    expect(after.battle!.player.hp).toBeGreaterThan(50); expect(after.battle!.cooldowns.s1).toBe(3);
    expect(after.weapons[0].favor).toBe((state.weapons[0].favor ?? 0) + 1);
    expect(after.stamina).toBe(state.stamina); expect(after.materials).toEqual(state.materials);
  });
  it('applies exact star/master multipliers without changing RNG or damage on an old battle', () => {
    const one = battle(), five = structuredClone(one); five.weapons[0].star = 5;
    const first = attack(one), second = attack(five);
    expect(second.battle!.totalDamage).toBeGreaterThan(first.battle!.totalDamage * 1.35);
    expect(second.rngCounter).toBe(first.rngCounter);
    const oldOne = oldSave(one), oldFive = oldSave(five); oldFive.weapons[0].star = 5;
    expect(attack(oldFive).battle!.totalDamage).toBe(attack(oldOne).battle!.totalDamage);
  });
  it('feign-death triggers before armed revival, once each, including lethal poison', () => {
    const state = battle('w1', 'STR'); state.battle!.reviveArmed = true; state.battle!.player.hp = 1;
    state.battle!.player.effects = [{ id: 'poison', magnitude: 999999, turns: 2 }];
    state.battle!.enemies[0].effects = [{ id: 'stun', magnitude: 1, turns: 2 }];
    const first = attack(state);
    expect(first.battle!.player.hp).toBe(1); expect(first.battle!.feignUsed).toBe(true); expect(first.battle!.reviveArmed).toBe(true);
    first.battle!.enemies[0].effects = [{ id: 'stun', magnitude: 1, turns: 2 }];
    const second = attack(first); expect(second.battle!.player.hp).toBe(Math.ceil(second.battle!.player.maxHp / 2)); expect(second.battle!.reviveArmed).toBe(false);
  });
  it('a learned speed innate adds a finite extra hit; normal attack chains never recursively replay actions', () => {
    let seen = false;
    for (let seed = 0; seed < 60; seed += 1) {
      const state = battle('w6', 'SPD', `innate-speed-synthetic-${seed}`), after = attack(state);
      const hits = after.battle!.log.filter(event => event.text.includes('疾如雷电·追击'));
      expect(hits.length).toBeLessThanOrEqual(1); expect(after.battle!.turn).toBe(1);
      if (hits.length) seen = true;
    }
    expect(seen).toBe(true);
  });
  it('8% reversal affects ordinary targets but never consumes a shared Boss health pool', () => {
    let ordinaryProcs = 0;
    for (let seed = 0; seed < 120; seed += 1) {
      const plain = battle('w1', undefined, `fortune-synthetic-${seed}`), boss = structuredClone(plain);
      boss.battle!.enemies[0].boss = true; boss.battle!.kind = 'boss';
      const ordinary = act(plain, { kind: 'skill', payload: { skillId: 's15' } }).state;
      if (ordinary.battle!.log.some(event => event.text.includes('气运一击逆转'))) ordinaryProcs += 1;
      const bossResult = act(boss, { kind: 'skill', payload: { skillId: 's15' } }).state;
      expect(bossResult.battle!.enemies[0].hp).toBeGreaterThan(99000);
      expect(bossResult.battle!.log.some(event => event.text.includes('共享首领免疫压血'))).toBe(true);
    }
    expect(ordinaryProcs).toBeGreaterThan(0); expect(ordinaryProcs).toBeLessThan(30);
  });
  it('automation only selects the same legal free action, adds no power and does not mutate state before execution', () => {
    const state = battle('w1', 'LUCK'); state.battle!.player.hp = 50;
    const original = structuredClone(state), selected = demonTowerAutomaticAction(state);
    expect(state).toEqual(original); expect(selected.kind).toBe('skill');
    expect(act(state, selected)).toEqual(act(structuredClone(state), selected));
  });
});
