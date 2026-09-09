import { randomUUID } from 'node:crypto';
import { demonTowerAction, demonTowerDate, demonTowerFloor, demonTowerWorldView, initialDemonTowerWorld } from './demon-tower.rules';

describe('demon tower API boundaries', () => {
  it('accepts explicit enrollment and canonicalizes only the request identity', () => {
    const requestId = randomUUID().toUpperCase();
    expect(demonTowerAction({ requestId, expectedVersion: 0, kind: 'enroll', payload: {} })).toEqual({ requestId: requestId.toLowerCase(), expectedVersion: 0, kind: 'enroll', payload: {} });
  });
  it('rejects forged identity, score, unsafe versions, unsupported commands and unbounded input', () => {
    const base = { requestId: randomUUID(), expectedVersion: 1, kind: 'train', payload: {} };
    for (const raw of [null, [], { ...base, userId: randomUUID() }, { ...base, score: 100 }, { ...base, requestId: 'arbitrary' }, { ...base, expectedVersion: -1 }, { ...base, expectedVersion: 2_147_483_647 }, { ...base, expectedVersion: 1.5 }, { ...base, kind: 'purchase' }, { ...base, payload: [] }, { ...base, payload: { text: 'a'.repeat(101) } }, { ...base, payload: { nested: { a: { b: { c: 1 } } } } }, { ...base, payload: { points: NaN } }, { ...base, kind: 'enroll', payload: { seed: 'client-seed' } }]) {
      expect(() => demonTowerAction(raw)).toThrow();
    }
  });
  it('accepts only real past-or-current calendar dates and changes day at Shanghai midnight', () => {
    const before = new Date('2099-09-08T15:59:59.999Z');
    const after = new Date('2099-09-08T16:00:00.000Z');
    expect(demonTowerDate(undefined, before)).toBe('2099-09-08');
    expect(demonTowerDate(undefined, after)).toBe('2099-09-09');
    for (const raw of ['2099-02-29', '2099-09-31', '2099-9-8', '2099-09-10', null, ['2099-09-08']]) expect(() => demonTowerDate(raw as string, after)).toThrow();
  });
  it('projects nine deterministic floors without persistence or private state', () => {
    const rows = initialDemonTowerWorld();
    expect(rows).toHaveLength(9);
    expect(demonTowerWorldView([])).toEqual(demonTowerWorldView(rows));
    expect(demonTowerWorldView(rows)).toMatchObject({ version: 1, currentFloor: 1, unlockedFloor: 1, phase: 'boss', completedFloors: [] });
    expect(() => demonTowerWorldView(rows.slice(0, 8))).toThrow();
    for (const raw of [0, 10, NaN, '2.0', '-1', ['2'], null]) expect(() => demonTowerFloor(raw)).toThrow();
    expect(demonTowerFloor('9')).toBe(9);
  });
  it('fails closed on non-contiguous unlocks, pre-kill construction and inconsistent completion markers', () => {
    for (const corrupt of [
      (rows: ReturnType<typeof initialDemonTowerWorld>) => { rows[2].unlockedAt = new Date(0); },
      (rows: ReturnType<typeof initialDemonTowerWorld>) => { rows[0].passageProgress = 1; },
      (rows: ReturnType<typeof initialDemonTowerWorld>) => { rows[0].bossHp = 0; },
      (rows: ReturnType<typeof initialDemonTowerWorld>) => { rows[0].completedAt = new Date(0); },
      (rows: ReturnType<typeof initialDemonTowerWorld>) => { rows[0].bossHp = 0; rows[0].defeatedAt = new Date(0); rows[0].passageProgress = rows[0].passageRequired; rows[0].completedAt = new Date(0); },
    ]) {
      const rows = initialDemonTowerWorld(); corrupt(rows); expect(() => demonTowerWorldView(rows)).toThrow('Demon tower world invariant failed');
    }
  });
  it('projects each ordered boss/passage stage and stops at the completed ninth floor without a tenth floor', () => {
    const rows = initialDemonTowerWorld();
    for (let floor = 1; floor <= 9; floor++) {
      const row = rows[floor - 1];
      expect(demonTowerWorldView(rows)).toMatchObject({ currentFloor: floor, unlockedFloor: floor, phase: 'boss', completedFloors: Array.from({ length: floor - 1 }, (_, index) => index + 1) });
      row.bossHp = 0; row.defeatedAt = new Date(0);
      expect(demonTowerWorldView(rows)).toMatchObject({ currentFloor: floor, phase: 'passage' });
      row.passageProgress = row.passageRequired; row.completedAt = new Date(0);
      if (floor < 9) rows[floor].unlockedAt = new Date(0);
    }
    expect(demonTowerWorldView(rows)).toMatchObject({ currentFloor: 9, unlockedFloor: 9, phase: 'complete', completedFloors: [1, 2, 3, 4, 5, 6, 7, 8, 9] });
  });
});
