import { DEMON_TOWER_APPEARANCE_OPTIONS, DEMON_TOWER_APPEARANCE_SLOTS, DEMON_TOWER_DEFAULT_APPEARANCE, DEMON_TOWER_SKILLS, DEMON_TOWER_WEAPONS, demonTowerExperienceRequirement, type DemonTowerAppearance } from '@stealth-reader/shared';
import { actDemonTower, createDemonTowerState, demonTowerCombatPower, demonTowerEffectiveAttributes, demonTowerExperienceToNext, demonTowerProfileView, type DemonTowerEngineState } from './demon-tower.engine';
import { demonTowerWorldView, initialDemonTowerWorld } from './demon-tower.rules';

const NOW = Date.UTC(2026, 8, 11, 8), DATE = '2026-09-11';
const context = { now: NOW, serviceDate: DATE, world: demonTowerWorldView(initialDemonTowerWorld(new Date(NOW))), expansionEnabled: true };
const fresh = () => createDemonTowerState(NOW, DATE, 'profile-synthetic-test-seed');
const appearance = (state: DemonTowerEngineState, value: unknown) => actDemonTower(state, { kind: 'set_appearance', payload: { appearance: value } }, context);

describe('Cosmetic appearance and advisory loadout power', () => {
  it('projects complete defaults for legacy saves without persisting or consuming RNG', () => {
    const state = fresh(), before = structuredClone(state), view = demonTowerProfileView(state, NOW, 1, 0, true);
    expect(view.appearance).toEqual(DEMON_TOWER_DEFAULT_APPEARANCE);
    expect(view.availableActions).toContain('set_appearance');
    expect(view.combatPower).toEqual({ total: 146, base: 146, temporary: 0, parts: { level: 6, attributes: 124, weapons: 16, skills: 0, innates: 0 } });
    expect(state).toEqual(before); expect(state.appearance).toBeUndefined();
    view.appearance!.hat = 'helmet'; expect(demonTowerProfileView(state, NOW, 1).appearance!.hat).toBe('none');
  });

  it('accepts every closed part option and changes no gameplay resource or loadout', () => {
    for (const slot of DEMON_TOWER_APPEARANCE_SLOTS) for (const option of DEMON_TOWER_APPEARANCE_OPTIONS[slot]) {
      const state = fresh(), next = { ...DEMON_TOWER_DEFAULT_APPEARANCE, [slot]: option.id } as DemonTowerAppearance;
      if (option.id === DEMON_TOWER_DEFAULT_APPEARANCE[slot]) { expect(() => appearance(state, next)).toThrow('APPEARANCE_UNCHANGED'); continue; }
      const before = structuredClone(state), result = appearance(state, next);
      expect(result.state.appearance).toEqual(next); expect(state).toEqual(before);
      for (const key of ['hp', 'stamina', 'attributes', 'experience', 'loadout', 'materials', 'rngCounter', 'lootPity'] as const) expect(result.state[key]).toEqual(state[key]);
      expect(result.officeCoinCost).toBeUndefined(); expect(result.officeCoinIntent).toBe(0); expect(result.worldEffect).toBeNull();
      expect(demonTowerCombatPower(result.state, NOW, true)).toEqual(demonTowerCombatPower(state, NOW, true));
    }
  });

  it('rejects missing/extra parts, URLs, markup, prototype keys, getters and arrays atomically', () => {
    const state = fresh(), before = structuredClone(state);
    const incomplete = { ...DEMON_TOWER_DEFAULT_APPEARANCE } as Partial<DemonTowerAppearance>; delete incomplete.held;
    const getter = { ...DEMON_TOWER_DEFAULT_APPEARANCE }; Object.defineProperty(getter, 'hat', { enumerable: true, get() { throw new Error('Must not invoke'); } });
    for (const value of [incomplete, { ...DEMON_TOWER_DEFAULT_APPEARANCE, url: 'https://example.test/x.svg' }, [], null, getter]) expect(() => appearance(state, value)).toThrow('INVALID_ACTION');
    for (const value of ['https://example.test/x.svg', '<svg onload="alert(1)">', '__proto__', 1]) expect(() => appearance(state, { ...DEMON_TOWER_DEFAULT_APPEARANCE, hat: value })).toThrow('INVALID_APPEARANCE');
    expect(state).toEqual(before);
  });

  it('rejects a cosmetic save during a frozen battle and matches availableActions', () => {
    let state = fresh();
    for (let index = 0; index < 10 && !state.battle; index++) state = actDemonTower(state, { kind: 'explore', payload: {} }, context).state;
    expect(state.battle).not.toBeNull(); const before = structuredClone(state);
    expect(() => appearance(state, { ...DEMON_TOWER_DEFAULT_APPEARANCE, hat: 'helmet' })).toThrow('BATTLE_IN_PROGRESS');
    expect(demonTowerProfileView(state, NOW, 1, 0, true).availableActions).not.toContain('set_appearance'); expect(state).toEqual(before);
  });

  it('counts only explicit equipped items, weighted dimensions and unlocked innates, not collection size', () => {
    const state = fresh(), old = demonTowerCombatPower(state, NOW, true);
    for (const item of DEMON_TOWER_WEAPONS) if (!state.weapons.some(owned => owned.id === item.id)) state.weapons.push({ id: item.id, quality: 9, spareCopies: 99, star: 5 });
    for (const item of DEMON_TOWER_SKILLS) if (!state.skills.some(owned => owned.id === item.id)) state.skills.push({ id: item.id, quality: 9, spareCopies: 99, star: 5 });
    expect(demonTowerCombatPower(state, NOW, true)).toEqual(old);
    const main = state.weapons.find(item => item.id === state.loadout.mainHand)!; main.quality = 2; main.star = 3;
    const immortal = DEMON_TOWER_SKILLS.find(item => item.rarity === '仙')!;
    state.loadout.activeSkills = [immortal.id]; state.loadout.passiveSkills = [];
    state.skills.find(item => item.id === immortal.id)!.quality = 4;
    const power = demonTowerCombatPower(state, NOW, true);
    expect(power.parts.weapons).toBe(old.parts.weapons + 4 + 16); expect(power.parts.skills).toBe(4 * 5 + 30);
    expect(power.parts.attributes).toBe(Object.values(demonTowerEffectiveAttributes(state, false)).reduce((sum, value) => sum + value, 0) * 2);
    expect(power.base).toBe(Object.values(power.parts).reduce((sum, value) => sum + value, 0));
    // Automatic weapon-bound skills must not appear a second time in this explicit-loadout score.
    state.loadout.activeSkills = []; expect(demonTowerCombatPower(state, NOW, true).parts.skills).toBe(0);
  });

  it('separates temporary bonus, expires idle scores at Beijing midnight and preserves existing battle snapshots', () => {
    let state = actDemonTower(fresh(), { kind: 'choose_innate', payload: { attribute: 'DEF' } }, context).state;
    state.economy!.balance = 100; state.materials.soul = 100;
    const base = demonTowerCombatPower(state, NOW, true);
    state = actDemonTower(state, { kind: 'shop_purchase', payload: { offerId: 'permanent_DEF', quantity: 1 } }, context).state;
    state = actDemonTower(state, { kind: 'shop_purchase', payload: { offerId: 'pill_DEF', quantity: 1 } }, context).state;
    expect(demonTowerCombatPower(state, NOW, true)).toMatchObject({ base: base.base + 2, temporary: 10, total: base.base + 12 });
    const midnight = Date.UTC(2026, 8, 11, 16);
    expect(demonTowerCombatPower(state, midnight, true).temporary).toBe(0);
    expect(demonTowerCombatPower(state, NOW, false).temporary).toBe(0);
    for (let index = 0; index < 10 && !state.battle; index++) state = actDemonTower(state, { kind: 'explore', payload: {} }, context).state;
    expect(state.battle).not.toBeNull(); const before = structuredClone(state);
    expect(demonTowerCombatPower(state, midnight, false).temporary).toBe(0);
    expect(demonTowerCombatPower(state, midnight, true).temporary).toBe(0);
    expect(demonTowerProfileView(state, midnight, 1, 0, true).battle!.player.attributes.DEF).toBe(state.battle!.player.attributes.DEF);
    expect(state).toEqual(before);
  });

  it('shares the exact existing experience curve at every supported level without raising the cap', () => {
    for (let level = 1; level <= 120; level++) {
      expect(demonTowerExperienceToNext(level)).toBe(level === 120 ? 0 : 30 + level * 10 + Math.floor(level * level / 25));
      expect(demonTowerExperienceRequirement(level)).toBe(demonTowerExperienceToNext(level));
    }
    for (const level of [0, -1, 1.2, 121, NaN, Infinity]) {
      expect(() => demonTowerExperienceRequirement(level)).toThrow(); expect(() => demonTowerExperienceToNext(level)).toThrow('INVALID_LEVEL');
    }
  });
});
