import {
  ArenaSeededRandom,
  createArenaSeededRandom,
  normalizeArenaSeed,
} from './seeded-rng';

describe('ArenaSeededRandom', () => {
  it('produces the same sequence for the same numeric or string seed', () => {
    for (const seed of [0, 42, -17.5, '', 'season-2026:user-1']) {
      const left = createArenaSeededRandom(seed);
      const right = createArenaSeededRandom(seed);

      expect(Array.from({ length: 20 }, () => left.next())).toEqual(
        Array.from({ length: 20 }, () => right.next()),
      );
    }
  });

  it('keeps generated values inside the [0, 1) interval', () => {
    const random = new ArenaSeededRandom('boundary-check');

    for (let index = 0; index < 10_000; index += 1) {
      const value = random.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('distinguishes seed type and normally yields different sequences', () => {
    expect(normalizeArenaSeed(42)).not.toBe(normalizeArenaSeed('42'));

    const first = new ArenaSeededRandom('first');
    const second = new ArenaSeededRandom('second');
    expect(Array.from({ length: 5 }, () => first.next())).not.toEqual(
      Array.from({ length: 5 }, () => second.next()),
    );
  });

  it('generates bounded integers and rejects invalid bounds', () => {
    const random = new ArenaSeededRandom(123);
    for (let index = 0; index < 1_000; index += 1) {
      const value = random.nextInt(7);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(7);
    }

    expect(() => random.nextInt(0)).toThrow(RangeError);
    expect(() => random.nextInt(1.5)).toThrow(RangeError);
  });

  it('rejects non-finite numeric seeds', () => {
    expect(() => new ArenaSeededRandom(Number.NaN)).toThrow(RangeError);
    expect(() => new ArenaSeededRandom(Number.POSITIVE_INFINITY)).toThrow(
      RangeError,
    );
  });
});
