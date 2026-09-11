import { demonTowerQualityLimit, type DemonTowerAction } from '@stealth-reader/shared';
import { actDemonTower, advanceDemonTowerState, createDemonTowerState, grantDemonTowerOfficeRelief, type DemonTowerEngineState } from './demon-tower.engine';
import { demonTowerWorldView, initialDemonTowerWorld } from './demon-tower.rules';

const NOW = Date.UTC(2026, 8, 11, 8), DATE = '2026-09-11';
const context = { now: NOW, serviceDate: DATE, world: demonTowerWorldView(initialDemonTowerWorld(new Date(NOW))), expansionEnabled: true };
const fresh = () => createDemonTowerState(NOW, DATE, 'office-relief-gift-synthetic-seed');
const act = (state: DemonTowerEngineState, action: DemonTowerAction) => actDemonTower(state, action, context).state;
const expanded = () => act(fresh(), { kind: 'choose_innate', payload: { attribute: 'STR' } });
const gift = (state: DemonTowerEngineState, item: Parameters<typeof grantDemonTowerOfficeRelief>[1], now = NOW, date = DATE) => grantDemonTowerOfficeRelief(state, item, now, date);
const main = (state: DemonTowerEngineState) => state.weapons.find(item => item.id === state.loadout.mainHand)!;

describe('Office relief trusted tower grants preserve old progression', () => {
  it.each(['ore', 'herb', 'clue'] as const)('grants exactly three %s with no wallet, experience, RNG, pity or unrelated save changes', item => {
    const state = expanded(), before = structuredClone(state), next = gift(state, item);
    expect(next.materials[item]).toBe(before.materials[item] + 3);
    const expected = structuredClone(before); expected.materials[item] += 3;
    expect(next).toEqual(expected); expect(state).toEqual(before); expect(next).not.toBe(state);
    expect(next).not.toHaveProperty('officeCoinCost'); expect(next).not.toHaveProperty('officeCoinIntent'); expect(next).not.toHaveProperty('worldEffect');
  });

  it('lazily creates only zero-based provisions to deliver exactly three new fragments and keeps old pages', () => {
    const state = fresh(), before = structuredClone(state), next = gift(state, 'skill_fragments');
    expect(next.provisions).toMatchObject({ version: 1, createdAt: NOW, serviceDate: DATE, passes: 0, fragments: 3,
      ordinaryStarted: 0, passStarted: 0, staminaBought: 0, passesBought: 0, starsBought: 0, chestsOpened: 0, history: [] });
    const { provisions: _provisions, ...rest } = next; expect(rest).toEqual(before); expect(state).toEqual(before);
    expect(next.expansion).toBeUndefined(); expect(next.economy).toBeUndefined();
    const existing = expanded(); existing.provisions!.fragments = 12; existing.expansion!.skillPages = 44;
    const prior = structuredClone(existing), granted = gift(existing, 'skill_fragments');
    const expected = structuredClone(prior); expected.provisions!.fragments = 15;
    expect(granted).toEqual(expected); expect(existing).toEqual(prior);
  });

  it('stores fifteen quality experience on the current main hand only without automatic quality, star or ordinary XP', () => {
    const state = expanded(); state.loadout.mainHand = 'w5'; main(state).qualityExperience = 7; main(state).star = 3; main(state).favor = 2;
    const before = structuredClone(state), next = gift(state, 'weapon_manual');
    const expected = structuredClone(before); main(expected).qualityExperience = 22;
    expect(next).toEqual(expected); expect(main(next)).toMatchObject({ quality: 0, star: 3, favor: 2, qualityExperience: 22 });
    expect(state).toEqual(before); expect(next.rngCounter).toBe(before.rngCounter);
  });

  it('preserves old spareCopies through grant and converts them exactly once only during normal expansion initialization', () => {
    let state = fresh(); main(state).spareCopies = 7; main(state).qualityExperience = 2;
    const before = structuredClone(state); state = gift(state, 'weapon_manual');
    expect(main(state)).toMatchObject({ spareCopies: 7, qualityExperience: 17, quality: 0, star: 1 });
    expect(state.expansion).toBeUndefined(); expect(main(before).spareCopies).toBe(7);
    state = act(state, { kind: 'choose_innate', payload: { attribute: 'STR' } });
    const earnedQuality = demonTowerQualityLimit('精', 1);
    expect(main(state)).toMatchObject({ spareCopies: 0, quality: earnedQuality, qualityExperience: 24 - earnedQuality, star: 1 });
    const after = structuredClone(main(state));
    state = act(state, { kind: 'allocate', payload: { attribute: 'STR', points: 1 } });
    expect(main(state)).toEqual(after);
  });

  it('preflights combined legacy duplicates plus new quality XP so later expansion cannot clip preserved assets', () => {
    const state = fresh(); main(state).spareCopies = 100; main(state).qualityExperience = 999980;
    const before = structuredClone(state);
    expect(() => gift(state, 'weapon_manual')).toThrow('OFFICE_RELIEF_REWARD_FULL'); expect(state).toEqual(before);
    main(state).qualityExperience = 999885;
    const exact = gift(state, 'weapon_manual'); expect(main(exact).qualityExperience! + main(exact).spareCopies).toBe(1000000);
    expect(main(exact).spareCopies).toBe(100);
  });

  it.each([-1, 1.5, 1000001])('rejects invalid legacy spare-copy count %s without granting a manual', spareCopies => {
    const state = fresh(); main(state).spareCopies = spareCopies;
    const before = structuredClone(state); expect(() => gift(state, 'weapon_manual')).toThrow('INVALID_STATE'); expect(state).toEqual(before);
  });

  it.each(['ore', 'herb', 'clue', 'skill_fragments', 'weapon_manual'] as const)('rejects a full %s reward unchanged, including exact successful capacity edges', item => {
    const state = expanded();
    if (item === 'skill_fragments') state.provisions!.fragments = 999998;
    else if (item === 'weapon_manual') main(state).qualityExperience = 999986;
    else state.materials[item] = 999998;
    const before = structuredClone(state); expect(() => gift(state, item)).toThrow('OFFICE_RELIEF_REWARD_FULL'); expect(state).toEqual(before);
    if (item === 'skill_fragments') state.provisions!.fragments = 999997;
    else if (item === 'weapon_manual') main(state).qualityExperience = 999985;
    else state.materials[item] = 999997;
    const next = gift(state, item);
    expect(item === 'skill_fragments' ? next.provisions!.fragments : item === 'weapon_manual' ? main(next).qualityExperience : next.materials[item]).toBe(1000000);
  });

  it('refuses grants during a frozen battle without changing its snapshot or consuming a pending reward', () => {
    let state = expanded();
    for (let index = 0; index < 15 && !state.battle; index++) state = act(state, { kind: 'explore', payload: {} });
    expect(state.battle).not.toBeNull(); const before = structuredClone(state);
    for (const item of ['ore', 'skill_fragments', 'weapon_manual'] as const) expect(() => gift(state, item)).toThrow('OFFICE_RELIEF_TOWER_BUSY');
    expect(state).toEqual(before);
  });

  it('refuses future-dated, malformed and unknown gifts instead of clearing old state', () => {
    const future = fresh(); future.lastActionAt = NOW + 1;
    const before = structuredClone(future); expect(() => gift(future, 'ore')).toThrow('INVALID_TIME'); expect(future).toEqual(before);
    expect(() => gift(fresh(), 'ore', NOW, '2026-09-12')).toThrow('INVALID_SERVICE_DATE');
    expect(() => gift(fresh(), 'ore', NaN)).toThrow('INVALID_TIME');
    const bad = expanded(); bad.provisions!.fragments = -1;
    expect(() => gift(bad, 'skill_fragments')).toThrow('INVALID_PROVISIONS_STATE');
    const badMaterial = fresh(); badMaterial.materials.ore = -1; expect(() => gift(badMaterial, 'ore')).toThrow('INVALID_STATE');
    const badManual = fresh(); main(badManual).qualityExperience = 1.5; expect(() => gift(badManual, 'weapon_manual')).toThrow('INVALID_STATE');
    const missing = fresh(); missing.weapons = missing.weapons.filter(item => item.id !== missing.loadout.mainHand);
    expect(() => gift(missing, 'weapon_manual')).toThrow();
    expect(() => gift(fresh(), 'coin' as 'ore')).toThrow('INVALID_ACTION');
  });

  it('uses existing natural day/timer projection but does not settle quality, erase inventories or backfill exploration', () => {
    const state = expanded(); state.hp = 40; state.stamina = 20;
    state.provisions!.fragments = 5; state.provisions!.ordinaryStarted = 4; state.provisions!.passes = 3;
    main(state).qualityExperience = 15; const before = structuredClone(state);
    const tomorrow = Date.UTC(2026, 8, 11, 16), date = '2026-09-12';
    const expected = advanceDemonTowerState(state, tomorrow, date); expected.materials.herb += 3; expected.lastActionAt = tomorrow;
    const next = gift(state, 'herb', tomorrow, date); expect(next).toEqual(expected); expect(state).toEqual(before);
    expect(next.provisions).toMatchObject({ fragments: 5, passes: 3, ordinaryStarted: 0 }); expect(main(next).qualityExperience).toBe(15);
  });
});
