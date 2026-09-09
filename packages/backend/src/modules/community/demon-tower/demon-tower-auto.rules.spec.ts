import { randomUUID } from 'node:crypto';
import { demonTowerAutoId, demonTowerAutoStart, demonTowerAutoStepRequestId, demonTowerAutoStop } from './demon-tower-auto.rules';

describe('Automatic exploration strict inputs', () => {
  const valid = () => ({ requestId: randomUUID(), expectedVersion: 1, floor: 1, maxExplorations: 20 });
  it('requires exactly four own data fields and bounded integers', () => {
    expect(demonTowerAutoStart(valid())).toMatchObject({ expectedVersion: 1, floor: 1, maxExplorations: 20 });
    const accessor = Object.defineProperty(valid(), 'floor', { get: () => { throw new Error('must never call accessors'); } });
    for (const raw of [null, [], { ...valid(), maxExplorations: 21 }, { ...valid(), maxExplorations: 0 }, { ...valid(), floor: '1' }, { ...valid(), floor: 10 }, { ...valid(), expectedVersion: 0 }, { ...valid(), expectedVersion: 1.5 }, { ...valid(), userId: randomUUID() }, { ...valid(), score: 9999 }, { ...valid(), seed: 'forged' }, { ...valid(), requestId: 'bad' }, accessor, Object.assign(Object.create({ inherited: true }), valid())]) {
      expect(() => demonTowerAutoStart(raw)).toThrow(expect.objectContaining({ response: { code: 'DEMON_TOWER_AUTO_REQUEST_INVALID' } }));
    }
  });
  it('accepts only an empty stop body and canonical UUID identity', () => {
    expect(demonTowerAutoStop({})).toBeUndefined();
    for (const raw of [undefined, null, [], { userId: randomUUID() }, { expectedVersion: 1 }]) expect(() => demonTowerAutoStop(raw)).toThrow();
    const id = randomUUID(); expect(demonTowerAutoId(id.toUpperCase())).toBe(id);
  });
  it('assigns stable distinct internal command UUIDs without accepting client scores or randomness', () => {
    const a = randomUUID(), b = randomUUID(); const first = demonTowerAutoStepRequestId(a, 0);
    expect(demonTowerAutoId(first)).toBe(first); expect(demonTowerAutoStepRequestId(a, 0)).toBe(first);
    expect(demonTowerAutoStepRequestId(a, 1)).not.toBe(first); expect(demonTowerAutoStepRequestId(b, 0)).not.toBe(first);
  });
});
