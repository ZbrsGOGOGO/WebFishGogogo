import { BadRequestException, ConflictException } from '@nestjs/common';
import { OFFICE_RELIEF_BOOKS, OFFICE_RELIEF_CROPS, OFFICE_RELIEF_MATERIALS, OFFICE_RELIEF_RULES, OFFICE_RELIEF_SKINS, OFFICE_RELIEF_TITLES, OFFICE_RELIEF_TOOLS, type OfficeReliefAction, type OfficeReliefState } from '@stealth-reader/shared';
import { FARM_CROPS } from '../farm-growth-rules';
import { accrueOfficeRelief, actOfficeRelief, drawOfficeRelief, newOfficeRelief, readOfficeRelief, validateOfficeRelief, type OfficeReliefRng } from './office-relief.rules';

const NOW = Date.parse('2026-09-11T10:00:00.000Z'), RULES = OFFICE_RELIEF_RULES;
let sequence = 0;
const id = () => `00000000-0000-4000-8000-${(++sequence).toString(16).padStart(12, '0')}`;
const ready = () => accrueOfficeRelief(newOfficeRelief(NOW), 1800);
function rolls(...values: number[]): OfficeReliefRng {
  return jest.fn((max: number) => { const next = values.shift(); if (next === undefined || next >= max) throw new Error(`Unexpected random request ${max}`); return next; });
}
const action = (state: OfficeReliefState, value: OfficeReliefAction, rng = rolls(5000, 0), requestId = id(), now = NOW) => actOfficeRelief(state, value, { rng, requestId, now });
const play = (state: OfficeReliefState, rng: OfficeReliefRng, requestId = id()) => action(state, { kind: 'play', tool: 'keyboard' }, rng, requestId);
function code(run: () => unknown, expected: string, exception = ConflictException): void {
  try { run(); throw new Error('Expected rejection'); } catch (error) { expect(error).toBeInstanceOf(exception); expect((error as ConflictException).getResponse()).toMatchObject({ code: `OFFICE_RELIEF_${expected}` }); }
}

describe('Office relief bounded active-time accrual', () => {
  it('projects an absent state without historical backfill, RNG or caller mutation', () => {
    const projected = readOfficeRelief(undefined, NOW);
    expect(projected).toEqual({ schemaVersion: 1, version: 1, chances: 0, remainderSeconds: 0, trackedSeconds: 0, tokenBalance: 0, totalPlays: 0,
      titles: [], skins: [], equippedSkin: null, pending: [], history: [], lastResult: null, startedAt: new Date(NOW).toISOString() });
    const before = structuredClone(projected), later = readOfficeRelief(projected, NOW + 30 * 86400000);
    expect(later).toEqual(before); expect(projected).toEqual(before); expect(later).not.toBe(projected);
    expect(Object.keys(projected)).not.toEqual(expect.arrayContaining(['officeCoinBalance', 'rng', 'seed', 'gameSeconds']));
  });
  it('converts only trusted accumulated seconds into chances without advancing action version', () => {
    const state = newOfficeRelief(NOW), first = accrueOfficeRelief(state, 1799);
    expect(first).toMatchObject({ chances: 0, remainderSeconds: 1799, trackedSeconds: 1799, version: 1 });
    const second = accrueOfficeRelief(first, 1);
    expect(second).toMatchObject({ chances: 1, remainderSeconds: 0, trackedSeconds: 1800, version: 1 });
    expect(state.trackedSeconds).toBe(0); expect(first.remainderSeconds).toBe(1799);
    expect(accrueOfficeRelief(newOfficeRelief(NOW), RULES.activeSecondsPerDay)).toMatchObject({ chances: 8, trackedSeconds: 14400 });
  });
  it('preserves seconds and chances across offline time/midnight, discards overflow at ten and resumes only after spending', () => {
    let state = accrueOfficeRelief(newOfficeRelief(NOW), 14400);
    state = accrueOfficeRelief(state, 7200);
    expect(state).toMatchObject({ chances: 10, remainderSeconds: 0, trackedSeconds: 18000 });
    expect(accrueOfficeRelief(state, 14400)).toEqual(state);
    const later = readOfficeRelief(state, NOW + 100 * 86400000); expect(later).toEqual(state);
    state = play(state, rolls(5000, 250)).state;
    expect(state).toMatchObject({ chances: 9, totalPlays: 1, trackedSeconds: 18000, tokenBalance: 0, version: 2 });
    state = accrueOfficeRelief(state, 1801);
    expect(state).toMatchObject({ chances: 10, remainderSeconds: 0, trackedSeconds: 19800, version: 2 });
    expect(validateOfficeRelief(state)).toEqual(state);
  });
  it.each([-1, 0.5, NaN, Infinity, 14401, Number.MAX_SAFE_INTEGER])('rejects untrusted accrual %s unchanged', seconds => {
    const state = ready(), before = structuredClone(state); code(() => accrueOfficeRelief(state, seconds), 'ACTION_INVALID', BadRequestException); expect(state).toEqual(before);
  });
  it.each([null, {}, [], { schemaVersion: 2 }])('does not wipe an invalid existing save %j', value => code(() => readOfficeRelief(value, NOW), 'STATE_INVALID'));
  it('validates closed inventories, conservation, timestamps, history and equipped ownership before mutation', () => {
    const state = ready();
    for (const patch of [
      { chances: 11 }, { remainderSeconds: 1800 }, { trackedSeconds: 1 }, { tokenBalance: -1 }, { tokenBalance: 1000000001 },
      { version: 0 }, { titles: ['forged'] }, { titles: ['office_relief_fish', 'office_relief_fish'] },
      { skins: ['javascript:alert(1)'] }, { equippedSkin: 'mint' }, { pending: [{}] }, { history: [{}] }, { lastResult: {} }, { startedAt: 'yesterday' },
    ]) code(() => readOfficeRelief({ ...state, ...patch }, NOW), 'STATE_INVALID');
    const getter = { ...state }; Object.defineProperty(getter, 'tokenBalance', { enumerable: true, get() { throw new Error('must not execute'); } });
    code(() => readOfficeRelief(getter, NOW), 'STATE_INVALID');
    code(() => readOfficeRelief(state, NOW - 1), 'TIME_INVALID', BadRequestException);
    code(() => newOfficeRelief(NaN), 'TIME_INVALID', BadRequestException);
  });
});

describe('Office relief exact integer distribution and transitions', () => {
  it.each([
    [0, 'coin'], [4999, 'coin'], [5000, 'loss'], [9899, 'loss'], [9900, 'title'], [9949, 'title'],
    [9950, 'tower_material'], [9969, 'tower_material'], [9970, 'farm_crop'], [9989, 'farm_crop'], [9990, 'tower_book'], [9999, 'tower_book'],
  ] as const)('maps outer boundary %s to %s', (outer, kind) => expect(drawOfficeRelief(rolls(outer, 0, 0)).kind).toBe(kind));
  it.each([
    [0, 100, 1000], [31, 100, 1000], [32, 1001, 2000], [57, 1001, 2000], [58, 2001, 3500],
    [77, 2001, 3500], [78, 3501, 5000], [91, 3501, 5000], [92, 5001, 10000], [99, 5001, 10000],
  ])('maps tier boundary %s to exclusive-neighbor integer range %s–%s', (tier, min, max) => {
    expect(drawOfficeRelief(rolls(0, tier, 0))).toEqual({ kind: 'coin', amount: min });
    expect(drawOfficeRelief(rolls(4999, tier, max - min))).toEqual({ kind: 'coin', amount: max });
  });
  it.each([-1, 10000, 0.2, NaN, Infinity])('refuses an invalid integer RNG draw %s without consuming chances', next => {
    const state = ready(), before = structuredClone(state); code(() => play(state, () => next), 'RANDOM_INVALID', BadRequestException); expect(state).toEqual(before);
  });
  it('does not invoke RNG or mutate anything on invalid actions, no chance or full currency', () => {
    const rng = jest.fn(() => 0), empty = newOfficeRelief(NOW);
    code(() => play(empty, rng), 'NO_CHANCES');
    const full = ready(); full.tokenBalance = RULES.tokenCap - RULES.maxCoinReward + 1;
    const before = structuredClone(full); code(() => play(full, rng), 'TOKENS_FULL'); expect(full).toEqual(before);
    for (const raw of [{ kind: 'play', tool: 'knife' }, { kind: 'play', tool: 'keyboard', price: 0 }, { kind: 'play' }, { kind: 'grant', amount: 10 }, { kind: 'buy', skinId: '__proto__' }]) {
      code(() => actOfficeRelief(ready(), raw, { rng, requestId: id(), now: NOW }), 'ACTION_INVALID', BadRequestException);
    }
    expect(rng).not.toHaveBeenCalled();
    full.tokenBalance = RULES.tokenCap - RULES.maxCoinReward;
    expect(play(full, rolls(0, 99, 4999)).state.tokenBalance).toBe(RULES.tokenCap);
  });
  it.each([0, 20, 1000])('caps an actual loss against module balance %s without touching any other wallet', tokenBalance => {
    const state = ready(); state.tokenBalance = tokenBalance;
    const result = play(state, rolls(5000, 250));
    expect(result.outcome).toMatchObject({ kind: 'loss', nominalAmount: 300, tokenDelta: tokenBalance ? -Math.min(tokenBalance, 300) : 0 });
    expect(result.state.tokenBalance).toBe(Math.max(0, tokenBalance - 300)); expect(state.tokenBalance).toBe(tokenBalance);
    expect(result.state).not.toHaveProperty('officeCoinBalance'); expect(result.outcome.message).toContain('办公币与主线资产不受影响');
  });
  it('awards all three nonexclusive titles, converting duplicates only into 500 bound tokens', () => {
    let state = accrueOfficeRelief(newOfficeRelief(NOW), 6 * 1800);
    for (let index = 0; index < 3; index++) {
      const first = play(state, rolls(9900, index)); state = first.state;
      expect(first.outcome).toMatchObject({ kind: 'title', itemId: OFFICE_RELIEF_TITLES[index].id, tokenDelta: 0 }); expect(first.outcome.message).toContain('并非全站唯一');
      const repeat = play(state, rolls(9949, index)); state = repeat.state;
      expect(repeat.outcome.tokenDelta).toBe(500); expect(repeat.outcome.message).toContain('重复称号');
    }
    expect(state.titles).toHaveLength(3); expect(state.tokenBalance).toBe(1500); expect(validateOfficeRelief(state)).toEqual(state);
  });
  it('creates exactly one bounded pending reward with the request ID and only real existing crop keys', () => {
    expect(OFFICE_RELIEF_CROPS.every(item => FARM_CROPS.some(crop => crop.key === item.id))).toBe(true);
    for (const [outer, pool, kind] of [[9950, OFFICE_RELIEF_MATERIALS, 'tower_material'], [9970, OFFICE_RELIEF_CROPS, 'farm_crop'], [9990, OFFICE_RELIEF_BOOKS, 'tower_book']] as const) {
      for (let index = 0; index < pool.length; index++) {
        const requestId = id(), result = play(ready(), rolls(outer, index), requestId), item = pool[index];
        expect(result.state.pending).toEqual([{ id: requestId, receivedAt: new Date(NOW).toISOString(), kind, itemId: item.id, quantity: item.quantity }]);
        expect(result.outcome).toMatchObject({ id: requestId, kind, dropId: requestId, itemId: item.id, tokenDelta: 0 });
        expect(validateOfficeRelief(result.state)).toEqual(result.state);
        expect(result.state).not.toHaveProperty('farmCoins'); expect(result.state).not.toHaveProperty('towerMaterials');
      }
    }
  });
  it('refuses every play at pending capacity before rolling and permits resumed play after an explicit claim', () => {
    let state = newOfficeRelief(NOW);
    for (let index = 0; index < RULES.pendingCap; index++) state = play(accrueOfficeRelief(state, 1800), rolls(9950, 0)).state;
    state = accrueOfficeRelief(state, 1800); const before = structuredClone(state), rng = jest.fn(() => 0);
    code(() => play(state, rng), 'PENDING_FULL'); expect(rng).not.toHaveBeenCalled(); expect(state).toEqual(before);
    const drop = state.pending[0], result = action(state, { kind: 'claim', dropId: drop.id });
    expect(result.claimedDrop).toEqual(drop); expect(result.state.pending).toHaveLength(98); expect(state.pending).toHaveLength(99);
    expect(result.outcome).toMatchObject({ kind: 'claim', tokenDelta: 0, dropId: drop.id });
    expect(play(result.state, rolls(5000, 0)).state.chances).toBe(0);
    code(() => action(result.state, { kind: 'claim', dropId: drop.id }), 'DROP_NOT_FOUND');
  });
  it('keeps all tools and all six paid cosmetics probability-neutral and rejects duplicate/free/unowned selections', () => {
    const state = ready(); state.tokenBalance = 100000;
    for (const skin of OFFICE_RELIEF_SKINS) {
      const bought = action(state, { kind: 'buy', skinId: skin.id });
      expect(bought.outcome).toMatchObject({ kind: 'purchase', tokenDelta: -skin.price, itemId: skin.id }); expect(bought.state.equippedSkin).toBeNull();
      code(() => action(bought.state, { kind: 'buy', skinId: skin.id }), 'SKIN_OWNED');
      const equipped = action(bought.state, { kind: 'equip', skinId: skin.id }); expect(equipped.outcome.tokenDelta).toBe(0);
      expect(equipped.state.equippedSkin).toBe(skin.id); code(() => action(equipped.state, { kind: 'equip', skinId: skin.id }), 'SKIN_UNCHANGED');
      expect(action(equipped.state, { kind: 'equip', skinId: null }).state.equippedSkin).toBeNull();
      for (const tool of OFFICE_RELIEF_TOOLS) {
        const roll = rolls(0, 32, 499), result = action(equipped.state, { kind: 'play', tool: tool.id }, roll);
        expect(result.outcome.tokenDelta).toBe(1500); expect(result.outcome.tool).toBe(tool.id);
        expect((roll as jest.Mock).mock.calls.map(call => call[0])).toEqual([10000, 100, 1000]);
      }
    }
    code(() => action(ready(), { kind: 'buy', skinId: 'mint' }), 'TOKENS_LOW');
    code(() => action(ready(), { kind: 'equip', skinId: 'mint' }), 'SKIN_NOT_OWNED');
    code(() => action(ready(), { kind: 'equip', skinId: null }), 'SKIN_UNCHANGED');
  });
  it('versions only actions, keeps immutable bounded history and rejects locally reused IDs and forged drops', () => {
    let state = newOfficeRelief(NOW); let firstId = '';
    for (let index = 0; index < 35; index++) {
      state = accrueOfficeRelief(state, 1800); const requestId = id(); firstId ||= requestId;
      state = play(state, rolls(5000, 0), requestId).state;
    }
    expect(state.version).toBe(36); expect(state.history).toHaveLength(30); expect(state.history[0].id).not.toBe(firstId);
    expect(state.lastResult).toEqual(state.history.at(-1)); expect(validateOfficeRelief(state)).toEqual(state);
    code(() => action(state, { kind: 'equip', skinId: null }, rolls(), state.history.at(-1)!.id), 'REQUEST_REUSED');
    const pending = play(ready(), rolls(9990, 1)).state;
    const wrongQuantity = structuredClone(pending); (wrongQuantity.pending[0] as { quantity: number }).quantity = 999;
    code(() => readOfficeRelief(wrongQuantity, NOW), 'STATE_INVALID');
    const wrongTime = structuredClone(pending); wrongTime.pending[0].receivedAt = new Date(NOW - 1).toISOString();
    code(() => readOfficeRelief(wrongTime, NOW), 'STATE_INVALID');
    const wrongLast = structuredClone(state); wrongLast.lastResult!.tokenDelta = 1;
    code(() => readOfficeRelief(wrongLast, NOW), 'STATE_INVALID');
  });

  it('validates 2,000,000 seeded live-rule draws independently of proposal simulation numbers', () => {
    let seed = 0x7b61d049;
    const rng: OfficeReliefRng = max => {
      const ceiling = Math.floor(0x1_0000_0000 / max) * max;
      for (;;) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; const value = seed >>> 0; if (value < ceiling) return value % max; }
    };
    const count = { coin: 0, loss: 0, title: 0, tower_material: 0, farm_crop: 0, tower_book: 0 };
    const tiers = [0, 0, 0, 0, 0]; let wins = 0, losses = 0, high = 0;
    const sample = 2_000_000;
    for (let index = 0; index < sample; index++) {
      const result = drawOfficeRelief(rng); count[result.kind]++;
      if (result.kind === 'coin') {
        wins += result.amount; if (result.amount > 5000) high++;
        const tier = RULES.coinTiers.findIndex(item => result.amount >= item.min && result.amount <= item.max); if (tier < 0) throw new Error('Out-of-range live reward'); tiers[tier]++;
      } else if (result.kind === 'loss') losses += result.amount;
    }
    for (const kind of Object.keys(count) as Array<keyof typeof count>) expect(Math.abs(count[kind] / sample - RULES.weights[kind] / RULES.weightTotal)).toBeLessThan(0.0015);
    for (let index = 0; index < tiers.length; index++) expect(Math.abs(tiers[index] / count.coin - RULES.coinTiers[index].weight / 100)).toBeLessThan(0.002);
    const theoreticalCoinMean = RULES.coinTiers.reduce((sum, tier) => sum + (tier.min + tier.max) / 2 * tier.weight / 100, 0);
    expect(Math.abs(wins / count.coin - theoreticalCoinMean)).toBeLessThan(20);
    expect(Math.abs(losses / count.loss - 175)).toBeLessThan(1); expect(high / count.coin).toBeLessThan(0.1);
    console.info('OFFICE_RELIEF_SEEDED_SIMULATION', JSON.stringify({ sample, count, tiers, coinMean: wins / count.coin, nominalLossMean: losses / count.loss,
      highGivenCoin: high / count.coin, highOverall: high / sample, nominalTokenEV: (wins - losses) / sample,
      note: 'Nominal EV excludes duplicate-title conversion; actual low-balance losses are capped. No office-coin income or conversion.' }));
  }, 30_000);
});
