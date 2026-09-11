import { createHmac } from 'node:crypto';
import { DEMON_TOWER_ATTRIBUTE_KEYS, DEMON_TOWER_PROVISIONS_RULES, DEMON_TOWER_SKILLS, DEMON_TOWER_WEAPONS, type DemonTowerAction } from '@stealth-reader/shared';
import { actDemonTower, advanceDemonTowerState, createDemonTowerState, demonTowerAutomaticAction, demonTowerProfileView, type DemonTowerEngineState } from './demon-tower.engine';
import { demonTowerWorldView, initialDemonTowerWorld } from './demon-tower.rules';

const NOW = Date.UTC(2026, 8, 11, 8), DATE = '2026-09-11';
const context = { now: NOW, serviceDate: DATE, world: demonTowerWorldView(initialDemonTowerWorld(new Date(NOW))), expansionEnabled: true };
const act = (state: DemonTowerEngineState, action: DemonTowerAction, extra: Partial<typeof context> = {}) => actDemonTower(state, action, { ...context, ...extra });
function fresh(seed = 'provisions-synthetic-test-seed'): DemonTowerEngineState {
  return act(createDemonTowerState(NOW, DATE, seed), { kind: 'choose_innate', payload: { attribute: 'STR' } }).state;
}
function leaveBattle(state: DemonTowerEngineState): DemonTowerEngineState { return state.battle ? act(state, { kind: 'flee', payload: {} }).state : state; }
function seededChest(min: number, max: number, source = 'chest'): DemonTowerEngineState {
  for (let index = 0; index < 2000; index++) {
    const state = fresh(`chest-branch-synthetic-seed-${index}`);
    const roll = createHmac('sha256', state.rngSeed).update(`provisions:${DATE}:${state.provisions!.historySequence}:${source}`).digest().readUInt32BE(0) / 0x1_0000_0000;
    if (roll >= min && roll < max) return state;
  }
  throw new Error('No seeded reward fixture');
}

describe('Real-wallet purchase intents and bound tower provisions', () => {
  it('projects zero inventory and unknown historical counts without mutating old saves', () => {
    const state = createDemonTowerState(NOW, DATE, 'legacy-provisions-fixture'), before = structuredClone(state);
    const view = demonTowerProfileView(state, NOW, 1, 0, true).provisions!;
    expect(view).toMatchObject({ version: 1, passes: 0, fragments: 0, ordinaryStarted: 0, passStarted: 0, trackingStartedAt: null, history: [] });
    expect(view.offers).toHaveLength(8); expect(view.chest).toMatchObject({ opened: 0, nextCost: 30 });
    expect(state).toEqual(before); expect(state.provisions).toBeUndefined();
    expect(demonTowerProfileView(state, NOW, 1, 0, false).provisions).toBeUndefined();
    const migrated = act(state, { kind: 'choose_innate', payload: { attribute: 'STR' } }).state;
    expect(migrated.provisions).toMatchObject({ createdAt: NOW, passes: 0, fragments: 0, ordinaryStarted: 0 });
    expect(migrated.economy!.balance).toBe(0); expect(migrated.materials).toEqual(before.materials);
    expect(Object.keys(migrated.provisions!)).not.toContain('balance');
  });

  it.each([
    { kind: 'office_purchase', payload: { offer: 'pass' } }, { kind: 'progressive_chest', payload: {} },
    { kind: 'fragment_select', payload: { skillId: 's1' } }, { kind: 'explore_with_pass', payload: {} },
  ] as DemonTowerAction[])('requires expansion and idle state for $kind', action => {
    const state = fresh(), before = structuredClone(state);
    expect(() => act(state, action, { expansionEnabled: false })).toThrow('EXPANSION_DISABLED'); expect(state).toEqual(before);
    let battling = state;
    for (let index = 0; index < 10 && !battling.battle; index++) battling = act(battling, { kind: 'explore', payload: {} }).state;
    expect(battling.battle).not.toBeNull();
    expect(() => act(battling, action)).toThrow('BATTLE_IN_PROGRESS');
    expect(demonTowerProfileView(battling, NOW, 1, 0, true).availableActions).not.toContain(action.kind);
  });

  it('rejects forged price, quantity, malformed attribute and unknown offer without mutation', () => {
    const state = fresh(), before = structuredClone(state);
    for (const payload of [{ offer: 'pass', price: 0 }, { offer: 'pass', quantity: 2 }, { offer: 'stamina', attribute: 'STR' }, { offer: 'permanent' }]) {
      expect(() => actDemonTower(state, { kind: 'office_purchase', payload }, context)).toThrow('INVALID_ACTION');
    }
    for (const payload of [{ offer: '__proto__' }, { offer: 'permanent', attribute: 'ALL' }]) expect(() => actDemonTower(state, { kind: 'office_purchase', payload }, context)).toThrow('INVALID_OFFICE_OFFER');
    expect(() => actDemonTower(state, { kind: 'progressive_chest', payload: { seed: 1 } }, context)).toThrow('INVALID_ACTION');
    expect(state).toEqual(before);
  });

  it('charges 60 for exactly 20 stamina, limits twice daily and never charges partial/overflow recovery', () => {
    let state = fresh(); const before = structuredClone(state);
    expect(() => act(state, { kind: 'office_purchase', payload: { offer: 'stamina' } })).toThrow('STAMINA_WOULD_OVERFLOW'); expect(state).toEqual(before);
    state.stamina = 81; expect(() => act(state, { kind: 'office_purchase', payload: { offer: 'stamina' } })).toThrow('STAMINA_WOULD_OVERFLOW');
    state.stamina = 60;
    for (const stamina of [80, 100]) {
      const result = act(state, { kind: 'office_purchase', payload: { offer: 'stamina' } }); state = result.state;
      expect(result).toMatchObject({ officeCoinCost: 60, officeCoinIntent: 0, worldEffect: null }); expect(state.stamina).toBe(stamina);
    }
    expect(state.provisions!.staminaBought).toBe(2); state.stamina = 20;
    expect(() => act(state, { kind: 'office_purchase', payload: { offer: 'stamina' } })).toThrow('PROVISIONS_LIMIT_REACHED');
    expect(state.provisions!.history.map(entry => entry.cost)).toEqual([60, 60]);
  });

  it('guarantees one current main-hand star weekly for 150, preserves quality and blocks star five', () => {
    let state = fresh(); const main = state.weapons.find(item => item.id === state.loadout.mainHand)!; main.quality = 2; main.favor = 7;
    const result = act(state, { kind: 'office_purchase', payload: { offer: 'star' } }); state = result.state;
    expect(result).toMatchObject({ officeCoinCost: 150, officeCoinIntent: 0, worldEffect: null });
    expect(state.weapons.find(item => item.id === main.id)).toMatchObject({ quality: 2, star: 2, favor: 0 });
    expect(() => act(state, { kind: 'office_purchase', payload: { offer: 'star' } })).toThrow('PROVISIONS_LIMIT_REACHED');
    const maxed = fresh(); maxed.weapons.find(item => item.id === maxed.loadout.mainHand)!.star = 5;
    const before = structuredClone(maxed); expect(() => act(maxed, { kind: 'office_purchase', payload: { offer: 'star' } })).toThrow('STAR_MAXED'); expect(maxed).toEqual(before);
  });

  it('shares the permanent +5 per-dimension lifetime quota across office coins, souls, boxes and attribute resets', () => {
    let state = fresh(); state.materials.soul = 1000;
    state = act(state, { kind: 'shop_purchase', payload: { offerId: 'permanent_STR', quantity: 4 } }).state;
    const result = act(state, { kind: 'office_purchase', payload: { offer: 'permanent', attribute: 'STR' } }); state = result.state;
    expect(result).toMatchObject({ officeCoinCost: 300, officeCoinIntent: 0, worldEffect: null });
    expect(state.economy!.permanent).toEqual({ STR: 5, SPD: 0, AGI: 0, DEF: 0, LUCK: 0 });
    expect(() => act(state, { kind: 'office_purchase', payload: { offer: 'permanent', attribute: 'STR' } })).toThrow('PROVISIONS_LIMIT_REACHED');
    expect(() => act(state, { kind: 'shop_purchase', payload: { offerId: 'permanent_STR', quantity: 1 } })).toThrow('SHOP_LIMIT_REACHED');
    state = act(state, { kind: 'allocate', payload: { attribute: 'STR', points: 1 } }).state;
    state = act(state, { kind: 'reset_attributes', payload: {} }).state; expect(state.economy!.permanent.STR).toBe(5);
    expect(demonTowerProfileView(state, NOW, 1, 0, true).provisions!.offers.find(offer => offer.attribute === 'STR')).toMatchObject({ purchased: 5, remaining: 0, available: false });
  });

  it('buys a 30-coin pass twice daily with inventory cap 99, uses it only manually and never auto-purchases', () => {
    let state = fresh();
    for (let index = 0; index < 2; index++) { const result = act(state, { kind: 'office_purchase', payload: { offer: 'pass' } }); expect(result.officeCoinCost).toBe(30); state = result.state; }
    expect(state.provisions!.passes).toBe(2);
    expect(() => act(state, { kind: 'office_purchase', payload: { offer: 'pass' } })).toThrow('PROVISIONS_LIMIT_REACHED');
    const policyBefore = structuredClone(state); expect(demonTowerAutomaticAction(state)).toEqual({ kind: 'explore', payload: {} }); expect(state).toEqual(policyBefore);
    state.stamina = 0;
    const before = structuredClone(state); expect(() => act(state, demonTowerAutomaticAction(state))).toThrow('NOT_ENOUGH_STAMINA'); expect(state).toEqual(before);
    for (let index = 0; index < 2; index++) {
      const result = act(state, { kind: 'explore_with_pass', payload: {} }); state = leaveBattle(result.state);
      expect(result.officeCoinCost).toBeUndefined(); expect(state.stamina).toBe(0); expect(state.provisions!.passStarted).toBe(index + 1);
    }
    expect(state.provisions!.ordinaryStarted).toBe(0); expect(state.provisions!.passes).toBe(0);
    expect(() => act(state, { kind: 'explore_with_pass', payload: {} })).toThrow('PASS_DAILY_LIMIT');
    const empty = fresh(); expect(() => act(empty, { kind: 'explore_with_pass', payload: {} })).toThrow('NOT_ENOUGH_EXPLORATION_PASSES');
    empty.provisions!.passes = 99; expect(() => act(empty, { kind: 'office_purchase', payload: { offer: 'pass' } })).toThrow('PASS_STORAGE_FULL');
  });

  it('counts successful ordinary starts through the same manual and automatic path without a ten-round cap', () => {
    let state = fresh();
    for (let index = 0; index < 11; index++) {
      state.stamina = 100; state.hp = 999;
      state = leaveBattle(act(state, index % 2 ? demonTowerAutomaticAction(state) : { kind: 'explore', payload: {} }).state);
      expect(state.provisions!.ordinaryStarted).toBe(index + 1); expect(state.stamina).toBe(95);
    }
    state.stamina = 0; const before = structuredClone(state);
    expect(() => act(state, { kind: 'explore', payload: {} })).toThrow('NOT_ENOUGH_STAMINA'); expect(state).toEqual(before);
    state.hp = 0; expect(() => act(state, { kind: 'explore_with_pass', payload: {} })).toThrow('REST_REQUIRED');
  });

  it('charges the fixed five-step chest ladder and preserves all old currency balances and pity channels', () => {
    let state = fresh(); state.level = 61;
    const old = { soul: state.materials.soul, balance: state.economy!.balance, expansion: structuredClone(state.expansion!), pity: structuredClone(state.lootPity), misses: structuredClone(state.growth!.misses) };
    for (const cost of [30, 55, 80, 105, 130]) {
      const result = act(state, { kind: 'progressive_chest', payload: {} }); state = result.state;
      expect(result).toMatchObject({ officeCoinCost: cost, officeCoinIntent: 0, worldEffect: null });
    }
    expect(() => act(state, { kind: 'progressive_chest', payload: {} })).toThrow('PROVISIONS_LIMIT_REACHED');
    expect(state.economy!.balance).toBe(old.balance); expect(state.materials.soul).toBe(old.soul);
    expect(state.expansion).toEqual(old.expansion); expect(state.lootPity).toEqual(old.pity); expect(state.growth!.misses).toEqual(old.misses);
    expect(demonTowerProfileView(state, NOW, 1, 0, true).provisions!.chest).toMatchObject({ opened: 5, nextCost: null, available: false });
  });

  it('uses all four deterministic reward branches and fixed weights unaffected by luck', () => {
    expect(DEMON_TOWER_PROVISIONS_RULES.chestWeights).toEqual({ materials: 40, fragments: 35, weapon: 20, permanent: 5 });
    for (const [min, max, expected] of [[0, 0.4, '材料'], [0.4, 0.75, '碎片'], [0.75, 0.95, '武器'], [0.95, 1, '永久']] as const) {
      const state = seededChest(min, max); state.level = 16;
      const lucky = structuredClone(state); lucky.attributes.LUCK = 100000;
      const result = act(state, { kind: 'progressive_chest', payload: {} }).state;
      expect(act(lucky, { kind: 'progressive_chest', payload: {} }).state.provisions!.history).toEqual(result.provisions!.history);
      if (expected === '材料') expect(result.materials.ore + result.materials.clue - state.materials.ore - state.materials.clue).toBe(3);
      if (expected === '碎片') expect(result.provisions!.fragments).toBe(1);
      if (expected === '武器') expect(result.provisions!.history[0].description).toContain('精·');
      if (expected === '永久') expect(Object.values(result.economy!.permanent).reduce((sum, value) => sum + value, 0)).toBe(1);
    }
  });

  it('uses strict new-weapon equip/drop levels and substitutes bound materials for empty pools or permanent caps', () => {
    const low = seededChest(0.75, 0.95), lowResult = act(low, { kind: 'progressive_chest', payload: {} }).state;
    expect(lowResult.weapons).toEqual(low.weapons); expect(lowResult.provisions!.history[0].description).toContain('当前等级无可用武器');
    for (const level of [16, 30, 31, 45, 46, 60, 61]) {
      const state = seededChest(0.75, 0.95); state.level = level;
      const result = act(state, { kind: 'progressive_chest', payload: {} }).state;
      for (const item of result.weapons.filter(item => !state.weapons.some(old => old.id === item.id))) {
        const definition = DEMON_TOWER_WEAPONS.find(def => def.id === item.id)!;
        expect(Math.max(definition.dropLevel, definition.requiredLevel)).toBeLessThanOrEqual(level);
      }
    }
    const maxed = seededChest(0.95, 1); for (const key of DEMON_TOWER_ATTRIBUTE_KEYS) maxed.economy!.permanent[key] = 5;
    const result = act(maxed, { kind: 'progressive_chest', payload: {} });
    expect(result.state.economy!.permanent).toEqual(maxed.economy!.permanent); expect(result.state.provisions!.history[0].description).toContain('永久属性已满');
    expect(result.officeCoinCost).toBe(30); expect(result.officeCoinIntent).toBe(0);
  });

  it('preflights every possible chest reward before RNG to prevent free reward probes at storage limits', () => {
    const fragment = seededChest(0.4, 0.75); fragment.provisions!.fragments = 1000000;
    const material = seededChest(0, 0.4); material.materials.ore = 1000000; material.materials.clue = 1000000;
    const weapon = seededChest(0.75, 0.95); weapon.level = 16;
    for (const definition of DEMON_TOWER_WEAPONS.filter(item => item.rarity === '精')) {
      const owned = weapon.weapons.find(item => item.id === definition.id);
      if (owned) { owned.quality = 3; owned.qualityExperience = 1000000; }
      else weapon.weapons.push({ id: definition.id, quality: 3, qualityExperience: 1000000, spareCopies: 0, star: 1, favor: 0 });
    }
    for (const state of [fragment, material, weapon]) {
      const before = structuredClone(state); expect(() => act(state, { kind: 'progressive_chest', payload: {} })).toThrow('RESOURCE_STORAGE_FULL'); expect(state).toEqual(before);
      expect(demonTowerProfileView(state, NOW, 1, 0, true).provisions!.chest).toMatchObject({ available: false, reason: 'RESOURCE_STORAGE_FULL' });
    }
    // Even a known fragment draw is rejected while any possible material reward would overflow.
    const selected = seededChest(0.4, 0.75); selected.materials.ore = 1000000; selected.materials.clue = 1000000;
    expect(() => act(selected, { kind: 'progressive_chest', payload: {} })).toThrow('RESOURCE_STORAGE_FULL');
    // One eligible duplicate at capacity suffices; unrelated high-level inventory does not.
    const eligible = seededChest(0.4, 0.75); eligible.level = 16;
    eligible.weapons[0].qualityExperience = 1000000;
    expect(() => act(eligible, { kind: 'progressive_chest', payload: {} })).toThrow('RESOURCE_STORAGE_FULL');
    const ineligible = seededChest(0.4, 0.75); ineligible.level = 16;
    ineligible.weapons.push({ id: 'w4', quality: 9, spareCopies: 0, qualityExperience: 1000000, star: 1 });
    expect(act(ineligible, { kind: 'progressive_chest', payload: {} }).state.provisions!.fragments).toBe(1);
  });

  it('selects unowned skills for exact rarity fragment costs only after both real level requirements', () => {
    for (const rarity of ['凡', '精', '灵', '仙'] as const) {
      const skill = DEMON_TOWER_SKILLS.find(item => item.rarity === rarity)!;
      const state = fresh(); state.skills = state.skills.filter(item => item.id !== skill.id); state.loadout.activeSkills = []; state.loadout.passiveSkills = [];
      state.provisions!.fragments = 100; state.expansion!.skillPages = 30; const pages = state.expansion!.skillPages;
      state.level = Math.max(skill.dropLevel, skill.requiredLevel);
      if (state.level > 1) expect(() => act({ ...state, level: state.level - 1 }, { kind: 'fragment_select', payload: { skillId: skill.id } })).toThrow('SKILL_LEVEL_REQUIRED');
      const result = act(state, { kind: 'fragment_select', payload: { skillId: skill.id } });
      expect(result.state.provisions!.fragments).toBe(100 - DEMON_TOWER_PROVISIONS_RULES.fragmentCosts[rarity]!);
      expect(result.state.skills.find(item => item.id === skill.id)).toMatchObject({ quality: 0, star: 1 });
      expect(result.state.skills.find(item => item.id === skill.id)!.levelExempt).toBeUndefined();
      expect(result.state.expansion!.skillPages).toBe(pages); expect(result.officeCoinCost).toBeUndefined();
      expect(() => act(result.state, { kind: 'fragment_select', payload: { skillId: skill.id } })).toThrow('SKILL_ALREADY_OWNED');
      state.provisions!.fragments = 0; expect(() => act(state, { kind: 'fragment_select', payload: { skillId: skill.id } })).toThrow('NOT_ENOUGH_SKILL_FRAGMENTS');
    }
  });

  it('projects Beijing daily and Monday weekly resets while preserving inventories, shared permanent quotas and old-save rollback drift', () => {
    const state = fresh(); Object.assign(state.provisions!, { passes: 5, fragments: 30, passStarted: 2, ordinaryStarted: 7, staminaBought: 2, passesBought: 2, chestsOpened: 5, starsBought: 1 });
    state.economy!.permanent.STR = 5; const before = structuredClone(state), tomorrow = Date.UTC(2026, 8, 11, 16);
    const view = demonTowerProfileView(state, tomorrow, 1, 0, true).provisions!;
    expect(view).toMatchObject({ serviceDate: '2026-09-12', passes: 5, fragments: 30, passStarted: 0, ordinaryStarted: 0 });
    expect(view.chest.nextCost).toBe(30); expect(view.offers.find(offer => offer.offer === 'star')!.remaining).toBe(0); expect(state).toEqual(before);
    const monday = advanceDemonTowerState(state, Date.UTC(2026, 8, 14, 0), '2026-09-14');
    expect(monday.provisions).toMatchObject({ starsBought: 0, passes: 5, fragments: 30, createdAt: NOW }); expect(monday.economy!.permanent.STR).toBe(5);
    const rollback = structuredClone(state); rollback.daily.serviceDate = '2026-09-12';
    expect(advanceDemonTowerState(rollback, tomorrow, '2026-09-12').provisions!.ordinaryStarted).toBe(0);
  });

  it('bounds history at 30 entries, exposes no RNG or wallet balance and rejects corrupt new saves', () => {
    let state = fresh();
    for (let day = 0; day < 7; day++) {
      const now = NOW + day * 86400000, serviceDate = new Date(now + 8 * 3600000).toISOString().slice(0, 10);
      for (let index = 0; index < 5; index++) state = act(state, { kind: 'progressive_chest', payload: {} }, { now, serviceDate }).state;
    }
    expect(state.provisions!.history).toHaveLength(30); expect(state.provisions!.historySequence).toBe(35);
    const view = demonTowerProfileView(state, NOW + 6 * 86400000, 1, 0, true).provisions!;
    expect(view.history[0].id).toBe('35'); expect(JSON.stringify(view)).not.toContain(state.rngSeed); expect(view).not.toHaveProperty('balance');
    for (const patch of [{ passes: 100 }, { fragments: -1 }, { passStarted: 3 }, { version: 2 }, { serviceDate: '2026-02-30' }, { history: [{ id: 'x' }] }]) {
      const corrupt = fresh(); Object.assign(corrupt.provisions!, patch); expect(() => advanceDemonTowerState(corrupt, NOW, DATE)).toThrow('INVALID_PROVISIONS_STATE');
    }
  });
});
