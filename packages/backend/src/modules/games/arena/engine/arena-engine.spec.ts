import fc from 'fast-check';

import {
  CRITICAL_MULTIPLIER,
  CRITICAL_RATE_CAP,
  DAMAGE_VARIANCE_MAX,
  DAMAGE_VARIANCE_MIN,
  DEFENSE_COEFFICIENT,
  DODGE_RATE_CAP,
  MAX_ARENA_ROUNDS,
} from './constants';
import {
  deriveArenaStats,
  resolveArenaBattle,
  simulateArenaBattle,
} from './arena-engine';
import type {
  ArenaAttributes,
  ArenaBattleInput,
  ArenaBattleLogEntry,
  ArenaFighterSnapshot,
} from './types';

function attributes(
  overrides: Partial<ArenaAttributes> = {},
): ArenaAttributes {
  return {
    focus: 10,
    inspiration: 10,
    mindset: 10,
    slacking: 10,
    execution: 10,
    ...overrides,
  };
}

function fighter(
  id: string,
  overrides: Partial<ArenaAttributes> = {},
  maxHealth?: number,
): ArenaFighterSnapshot {
  return {
    id,
    attributes: attributes(overrides),
    ...(maxHealth === undefined ? {} : { maxHealth }),
  };
}

describe('arena battle engine', () => {
  it('derives attack/defense/initiative and caps critical/dodge rates', () => {
    const derived = deriveArenaStats(
      fighter(
        'worker',
        {
          focus: 17,
          inspiration: 1_000,
          mindset: 20,
          slacking: 1_000,
          execution: 31,
        },
      ),
    );

    expect(derived).toEqual({
      maxHealth: 200,
      attack: 31,
      defense: 20,
      initiative: 17,
      criticalRate: CRITICAL_RATE_CAP,
      dodgeRate: DODGE_RATE_CAP,
    });
  });

  it('uses an explicit snapshot maxHealth when present', () => {
    expect(deriveArenaStats(fighter('worker', {}, 321.9)).maxHealth).toBe(321);
  });

  it('is deterministic and does not mutate either input snapshot', () => {
    const input: ArenaBattleInput = {
      attacker: fighter(
        'attacker',
        { focus: 30, inspiration: 35, execution: 28 },
        260,
      ),
      defender: fighter(
        'defender',
        { mindset: 24, slacking: 25, execution: 22 },
        280,
      ),
      seed: 'battle:2026-07-24:user-1:user-2',
    };
    const before = structuredClone(input);

    const first = resolveArenaBattle(input);
    const second = resolveArenaBattle(input);

    expect(first).toEqual(second);
    expect(simulateArenaBattle(input)).toEqual(first);
    expect(input).toEqual(before);
  });

  it('uses focus for initiative regardless of seed', () => {
    for (const seed of [0, 1, 2, 999, 'initiative']) {
      expect(
        resolveArenaBattle({
          attacker: fighter('attacker', { focus: 100 }),
          defender: fighter('defender', { focus: 1 }),
          seed,
          maxRounds: 1,
        }).firstActorSide,
      ).toBe('attacker');

      expect(
        resolveArenaBattle({
          attacker: fighter('attacker', { focus: 1 }),
          defender: fighter('defender', { focus: 100 }),
          seed,
          maxRounds: 1,
        }).firstActorSide,
      ).toBe('defender');
    }
  });

  it('applies the documented damage, defense and variance formula', () => {
    const result = resolveArenaBattle({
      attacker: fighter(
        'attacker',
        { focus: 100, inspiration: 0, execution: 100 },
        1_000,
      ),
      defender: fighter(
        'defender',
        { focus: 0, mindset: 20, slacking: 0, execution: 1 },
        1_000,
      ),
      seed: 'formula',
      maxRounds: 1,
    });
    const log = result.logs[0];
    const expectedRaw =
      log.attack * log.variance - log.defense * DEFENSE_COEFFICIENT;
    const expectedDamage = Math.max(1, Math.floor(expectedRaw));

    expect(log.dodged).toBe(false);
    expect(log.critical).toBe(false);
    expect(log.variance).toBeGreaterThanOrEqual(DAMAGE_VARIANCE_MIN);
    expect(log.variance).toBeLessThanOrEqual(DAMAGE_VARIANCE_MAX);
    expect(log.rawDamage).toBeCloseTo(expectedRaw, 12);
    expect(log.calculatedDamage).toBe(expectedDamage);
    expect(log.damage).toBe(expectedDamage);
  });

  it('multiplies post-defense base damage by 1.5 on a critical hit', () => {
    const result = findBattleWithFirstLog(
      (log) => log.critical,
      (seed) => ({
        attacker: fighter(
          'attacker',
          { focus: 100, inspiration: 1_000, execution: 80 },
          1_000,
        ),
        defender: fighter(
          'defender',
          { focus: 0, mindset: 10, slacking: 0, execution: 1 },
          1_000,
        ),
        seed,
        maxRounds: 1,
      }),
    );
    const log = result.logs[0];
    const baseDamage = Math.max(1, Math.floor(log.rawDamage));

    expect(log.criticalRate).toBe(CRITICAL_RATE_CAP);
    expect(log.calculatedDamage).toBe(
      Math.max(1, Math.floor(baseDamage * CRITICAL_MULTIPLIER)),
    );
  });

  it('sets damage to zero when capped dodge succeeds', () => {
    const result = findBattleWithFirstLog(
      (log) => log.dodged,
      (seed) => ({
        attacker: fighter(
          'attacker',
          { focus: 100, inspiration: 1_000, execution: 100 },
          1_000,
        ),
        defender: fighter(
          'defender',
          { focus: 0, slacking: 1_000, execution: 1 },
          1_000,
        ),
        seed,
        maxRounds: 1,
      }),
    );
    const log = result.logs[0];

    expect(log.dodgeRate).toBe(DODGE_RATE_CAP);
    expect(log.critical).toBe(false);
    expect(log.calculatedDamage).toBe(0);
    expect(log.damage).toBe(0);
    expect(log.targetHealthAfter).toBe(log.targetHealthBefore);
  });

  it('stops at eight rounds and records at most two actions per round', () => {
    const result = resolveArenaBattle({
      attacker: fighter(
        'attacker',
        {
          focus: 20,
          inspiration: 0,
          mindset: 100,
          slacking: 0,
          execution: 1,
        },
        1_000,
      ),
      defender: fighter(
        'defender',
        {
          focus: 10,
          inspiration: 0,
          mindset: 100,
          slacking: 0,
          execution: 1,
        },
        1_000,
      ),
      seed: 'eight-rounds',
    });

    expect(result.maxRounds).toBe(MAX_ARENA_ROUNDS);
    expect(result.roundsPlayed).toBe(MAX_ARENA_ROUNDS);
    expect(result.logs).toHaveLength(MAX_ARENA_ROUNDS * 2);
    expect(Math.max(...result.logs.map((log) => log.round))).toBe(
      MAX_ARENA_ROUNDS,
    );
  });

  it('ends immediately after a knockout without giving the defeated side a turn', () => {
    const result = resolveArenaBattle({
      attacker: fighter(
        'attacker',
        { focus: 100, inspiration: 0, execution: 1_000 },
        100,
      ),
      defender: fighter(
        'defender',
        { focus: 0, mindset: 0, slacking: 0, execution: 1 },
        1,
      ),
      seed: 'knockout',
    });

    expect(result.resolution).toBe('knockout');
    expect(result.winnerSide).toBe('attacker');
    expect(result.roundsPlayed).toBe(1);
    expect(result.logs).toHaveLength(1);
    expect(result.defender.remainingHealth).toBe(0);
  });

  it('resolves a non-knockout first by remaining health ratio', () => {
    const defensive = {
      inspiration: 0,
      mindset: 100,
      slacking: 0,
      execution: 0,
    };
    const result = resolveArenaBattle({
      attacker: fighter('attacker', { ...defensive, focus: 20 }, 200),
      defender: fighter('defender', { ...defensive, focus: 10 }, 100),
      seed: 'ratio',
      maxRounds: 1,
    });

    expect(result.attacker.totalDamageDealt).toBe(1);
    expect(result.defender.totalDamageDealt).toBe(1);
    expect(result.attacker.remainingHealthRatio).toBeGreaterThan(
      result.defender.remainingHealthRatio,
    );
    expect(result.resolution).toBe('remaining_health_ratio');
    expect(result.winnerSide).toBe('attacker');
  });

  it('uses cumulative damage when remaining health ratios are equal', () => {
    const seed = 'damage-tie-break';
    const probe = resolveArenaBattle({
      attacker: fighter(
        'attacker',
        { focus: 20, inspiration: 0, mindset: 0, slacking: 0, execution: 1 },
        1_000,
      ),
      defender: fighter(
        'defender',
        { focus: 10, inspiration: 0, mindset: 0, slacking: 0, execution: 10 },
        1_000,
      ),
      seed,
      maxRounds: 1,
    });
    const attackerDamage = probe.attacker.totalDamageDealt;
    const defenderDamage = probe.defender.totalDamageDealt;
    expect(defenderDamage).toBeGreaterThan(attackerDamage);

    const result = resolveArenaBattle({
      attacker: fighter(
        'attacker',
        { focus: 20, inspiration: 0, mindset: 0, slacking: 0, execution: 1 },
        defenderDamage * 10,
      ),
      defender: fighter(
        'defender',
        { focus: 10, inspiration: 0, mindset: 0, slacking: 0, execution: 10 },
        attackerDamage * 10,
      ),
      seed,
      maxRounds: 1,
    });

    expect(result.attacker.remainingHealthRatio).toBe(
      result.defender.remainingHealthRatio,
    );
    expect(result.resolution).toBe('total_damage');
    expect(result.winnerSide).toBe('defender');
  });

  it('uses the seed as the final tie breaker and can select either side', () => {
    const winners = new Set<string>();
    for (let seed = 0; seed < 100; seed += 1) {
      const result = resolveArenaBattle({
        attacker: fighter(
          'attacker',
          {
            focus: 10,
            inspiration: 0,
            mindset: 100,
            slacking: 0,
            execution: 0,
          },
          100,
        ),
        defender: fighter(
          'defender',
          {
            focus: 10,
            inspiration: 0,
            mindset: 100,
            slacking: 0,
            execution: 0,
          },
          100,
        ),
        seed,
        maxRounds: 1,
      });

      expect(result.resolution).toBe('seed');
      expect(result.tieBreakerRoll).not.toBeNull();
      winners.add(result.winnerSide);
    }
    expect(winners).toEqual(new Set(['attacker', 'defender']));
  });

  it('rejects invalid rounds, snapshots, attributes, health and seeds', () => {
    const validInput: ArenaBattleInput = {
      attacker: fighter('attacker'),
      defender: fighter('defender'),
      seed: 1,
    };

    expect(() =>
      resolveArenaBattle({ ...validInput, maxRounds: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      resolveArenaBattle({ ...validInput, maxRounds: 9 }),
    ).toThrow(RangeError);
    expect(() =>
      resolveArenaBattle({
        ...validInput,
        attacker: fighter('attacker', { focus: -1 }),
      }),
    ).toThrow(RangeError);
    expect(() =>
      resolveArenaBattle({
        ...validInput,
        attacker: fighter('attacker', { inspiration: Number.NaN }),
      }),
    ).toThrow(RangeError);
    expect(() =>
      resolveArenaBattle({
        ...validInput,
        attacker: fighter('', {}),
      }),
    ).toThrow(TypeError);
    expect(() =>
      resolveArenaBattle({
        ...validInput,
        defender: fighter('defender', {}, 0),
      }),
    ).toThrow(RangeError);
    expect(() =>
      resolveArenaBattle({ ...validInput, seed: Number.POSITIVE_INFINITY }),
    ).toThrow(RangeError);
  });

  it('maintains battle invariants for generated valid snapshots', () => {
    const attributeArbitrary = fc.record({
      focus: fc.integer({ min: 0, max: 500 }),
      inspiration: fc.integer({ min: 0, max: 500 }),
      mindset: fc.integer({ min: 0, max: 500 }),
      slacking: fc.integer({ min: 0, max: 500 }),
      execution: fc.integer({ min: 0, max: 500 }),
    });

    fc.assert(
      fc.property(
        attributeArbitrary,
        attributeArbitrary,
        fc.integer({ min: 1, max: 2_000 }),
        fc.integer({ min: 1, max: 2_000 }),
        fc.integer(),
        fc.integer({ min: 1, max: MAX_ARENA_ROUNDS }),
        (
          attackerAttributes,
          defenderAttributes,
          attackerHealth,
          defenderHealth,
          seed,
          maxRounds,
        ) => {
          const input: ArenaBattleInput = {
            attacker: {
              id: 'attacker',
              attributes: attackerAttributes,
              maxHealth: attackerHealth,
            },
            defender: {
              id: 'defender',
              attributes: defenderAttributes,
              maxHealth: defenderHealth,
            },
            seed,
            maxRounds,
          };
          const result = resolveArenaBattle(input);

          expect(resolveArenaBattle(input)).toEqual(result);
          expect(result.roundsPlayed).toBeGreaterThanOrEqual(1);
          expect(result.roundsPlayed).toBeLessThanOrEqual(maxRounds);
          expect(result.logs.length).toBeGreaterThanOrEqual(1);
          expect(result.logs.length).toBeLessThanOrEqual(maxRounds * 2);
          expect(result.attacker.remainingHealth).toBeGreaterThanOrEqual(0);
          expect(result.attacker.remainingHealth).toBeLessThanOrEqual(
            result.attacker.derived.maxHealth,
          );
          expect(result.defender.remainingHealth).toBeGreaterThanOrEqual(0);
          expect(result.defender.remainingHealth).toBeLessThanOrEqual(
            result.defender.derived.maxHealth,
          );
          expect(result.attacker.derived.criticalRate).toBeLessThanOrEqual(
            CRITICAL_RATE_CAP,
          );
          expect(result.defender.derived.criticalRate).toBeLessThanOrEqual(
            CRITICAL_RATE_CAP,
          );
          expect(result.attacker.derived.dodgeRate).toBeLessThanOrEqual(
            DODGE_RATE_CAP,
          );
          expect(result.defender.derived.dodgeRate).toBeLessThanOrEqual(
            DODGE_RATE_CAP,
          );

          result.logs.forEach(assertValidLog);
          expect(
            sumDamageForActor(result.logs, 'attacker'),
          ).toBe(result.attacker.totalDamageDealt);
          expect(
            sumDamageForActor(result.logs, 'defender'),
          ).toBe(result.defender.totalDamageDealt);
          expect(result.winnerId).toBe(
            result.winnerSide === 'attacker' ? 'attacker' : 'defender',
          );
          expect(result.loserId).toBe(
            result.loserSide === 'attacker' ? 'attacker' : 'defender',
          );
          expect(result.winnerSide).not.toBe(result.loserSide);

          if (result.resolution === 'knockout') {
            const loser =
              result.loserSide === 'attacker'
                ? result.attacker
                : result.defender;
            expect(loser.remainingHealth).toBe(0);
          } else {
            expect(result.attacker.remainingHealth).toBeGreaterThan(0);
            expect(result.defender.remainingHealth).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 250 },
    );
  });
});

function findBattleWithFirstLog(
  predicate: (log: ArenaBattleLogEntry) => boolean,
  inputForSeed: (seed: number) => ArenaBattleInput,
) {
  for (let seed = 0; seed < 10_000; seed += 1) {
    const result = resolveArenaBattle(inputForSeed(seed));
    if (predicate(result.logs[0])) return result;
  }
  throw new Error('Unable to find a matching deterministic seed');
}

function assertValidLog(log: ArenaBattleLogEntry, index: number): void {
  expect(log.sequence).toBe(index + 1);
  expect(log.round).toBeGreaterThanOrEqual(1);
  expect(log.round).toBeLessThanOrEqual(MAX_ARENA_ROUNDS);
  expect(log.dodgeRoll).toBeGreaterThanOrEqual(0);
  expect(log.dodgeRoll).toBeLessThan(1);
  expect(log.criticalRoll).toBeGreaterThanOrEqual(0);
  expect(log.criticalRoll).toBeLessThan(1);
  expect(log.variance).toBeGreaterThanOrEqual(DAMAGE_VARIANCE_MIN);
  expect(log.variance).toBeLessThanOrEqual(DAMAGE_VARIANCE_MAX);
  expect(Number.isInteger(log.calculatedDamage)).toBe(true);
  expect(Number.isInteger(log.damage)).toBe(true);
  expect(log.damage).toBeGreaterThanOrEqual(0);
  expect(log.damage).toBeLessThanOrEqual(log.calculatedDamage);
  expect(log.targetHealthAfter).toBe(log.targetHealthBefore - log.damage);
  expect(log.rawDamage).toBeCloseTo(
    log.attack * log.variance - log.defense * DEFENSE_COEFFICIENT,
    10,
  );

  const baseDamage = Math.max(1, Math.floor(log.rawDamage));
  const expectedCalculated = log.dodged
    ? 0
    : log.critical
      ? Math.max(1, Math.floor(baseDamage * CRITICAL_MULTIPLIER))
      : baseDamage;
  expect(log.calculatedDamage).toBe(expectedCalculated);
}

function sumDamageForActor(
  logs: ArenaBattleLogEntry[],
  actorId: string,
): number {
  return logs
    .filter((log) => log.actorId === actorId)
    .reduce((total, log) => total + log.damage, 0);
}
