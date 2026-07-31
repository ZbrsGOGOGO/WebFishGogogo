import {
  ATTRIBUTE_RATE_DIVISOR,
  BASE_HEALTH,
  CRITICAL_MULTIPLIER,
  CRITICAL_RATE_CAP,
  DAMAGE_VARIANCE_MAX,
  DAMAGE_VARIANCE_MIN,
  DEFENSE_COEFFICIENT,
  DODGE_RATE_CAP,
  HEALTH_PER_MINDSET,
  MAX_ARENA_ROUNDS,
  MAX_ATTRIBUTE_VALUE,
  MAX_HEALTH_VALUE,
} from './constants';
import { ArenaSeededRandom } from './seeded-rng';
import type {
  ArenaBattleInput,
  ArenaBattleLogEntry,
  ArenaBattleResolution,
  ArenaBattleResult,
  ArenaDerivedStats,
  ArenaFighterResult,
  ArenaFighterSnapshot,
  ArenaSide,
} from './types';

interface MutableFighterState {
  side: ArenaSide;
  snapshot: ArenaFighterSnapshot;
  derived: ArenaDerivedStats;
  health: number;
  totalDamageDealt: number;
}

/** 将角色快照映射为本场不可变的派生战斗数值。 */
export function deriveArenaStats(
  snapshot: ArenaFighterSnapshot,
): ArenaDerivedStats {
  validateSnapshot(snapshot);
  const { attributes } = snapshot;
  const maxHealth =
    snapshot.maxHealth === undefined
      ? Math.floor(BASE_HEALTH + attributes.mindset * HEALTH_PER_MINDSET)
      : Math.floor(snapshot.maxHealth);

  return {
    maxHealth,
    attack: Math.max(1, attributes.execution),
    defense: attributes.mindset,
    initiative: attributes.focus,
    criticalRate: clamp(
      attributes.inspiration / ATTRIBUTE_RATE_DIVISOR,
      0,
      CRITICAL_RATE_CAP,
    ),
    dodgeRate: clamp(
      attributes.slacking / ATTRIBUTE_RATE_DIVISOR,
      0,
      DODGE_RATE_CAP,
    ),
  };
}

/**
 * 结算一场斗技。
 *
 * 该函数不读取时钟、数据库或全局随机数，也不修改传入快照；同一输入必得同一结果。
 */
export function resolveArenaBattle(
  input: ArenaBattleInput,
): ArenaBattleResult {
  const maxRounds = normalizeMaxRounds(input.maxRounds);
  const random = new ArenaSeededRandom(input.seed);
  const attacker = createState('attacker', input.attacker);
  const defender = createState('defender', input.defender);

  // 始终消费一次先手掷值，令随机调用序列清晰且便于审计。
  const initiativeRoll = random.next();
  const first =
    attacker.derived.initiative > defender.derived.initiative
      ? attacker
      : attacker.derived.initiative < defender.derived.initiative
        ? defender
        : initiativeRoll < 0.5
          ? attacker
          : defender;
  const second = first === attacker ? defender : attacker;

  const logs: ArenaBattleLogEntry[] = [];
  let roundsPlayed = 0;

  for (let round = 1; round <= maxRounds; round += 1) {
    roundsPlayed = round;
    performAction(first, second, round, logs, random);
    if (second.health === 0) break;

    performAction(second, first, round, logs, random);
    if (first.health === 0) break;
  }

  const resolution = resolveWinner(attacker, defender, random);
  const winner =
    resolution.winnerSide === 'attacker' ? attacker : defender;
  const loser = winner === attacker ? defender : attacker;

  return {
    seed: input.seed,
    normalizedSeed: random.normalizedSeed,
    maxRounds,
    roundsPlayed,
    firstActorSide: first.side,
    firstActorId: first.snapshot.id,
    winnerSide: winner.side,
    winnerId: winner.snapshot.id,
    loserSide: loser.side,
    loserId: loser.snapshot.id,
    resolution: resolution.reason,
    tieBreakerRoll: resolution.tieBreakerRoll,
    attacker: toFighterResult(attacker),
    defender: toFighterResult(defender),
    logs,
  };
}

/** 语义别名，便于调用方以“模拟战斗”的口径使用纯引擎。 */
export const simulateArenaBattle = resolveArenaBattle;

function createState(
  side: ArenaSide,
  source: ArenaFighterSnapshot,
): MutableFighterState {
  const derived = deriveArenaStats(source);
  const snapshot: ArenaFighterSnapshot = {
    id: source.id,
    ...(source.displayName === undefined
      ? {}
      : { displayName: source.displayName }),
    attributes: { ...source.attributes },
    maxHealth: derived.maxHealth,
  };
  return {
    side,
    snapshot,
    derived,
    health: derived.maxHealth,
    totalDamageDealt: 0,
  };
}

function performAction(
  actor: MutableFighterState,
  target: MutableFighterState,
  round: number,
  logs: ArenaBattleLogEntry[],
  random: ArenaSeededRandom,
): void {
  // 每次实际行动固定消费三个随机数，闪避也不会改变后续掷值位置。
  const dodgeRoll = random.next();
  const criticalRoll = random.next();
  const varianceRoll = random.next();
  const variance =
    DAMAGE_VARIANCE_MIN +
    varianceRoll * (DAMAGE_VARIANCE_MAX - DAMAGE_VARIANCE_MIN);
  const dodged = dodgeRoll < target.derived.dodgeRate;
  const critical = !dodged && criticalRoll < actor.derived.criticalRate;
  const rawDamage =
    actor.derived.attack * variance -
    target.derived.defense * DEFENSE_COEFFICIENT;
  const baseDamage = Math.max(1, Math.floor(rawDamage));
  const calculatedDamage = dodged
    ? 0
    : critical
      ? Math.max(1, Math.floor(baseDamage * CRITICAL_MULTIPLIER))
      : baseDamage;
  const healthBefore = target.health;
  const damage = Math.min(healthBefore, calculatedDamage);
  target.health = healthBefore - damage;
  actor.totalDamageDealt += damage;

  logs.push({
    sequence: logs.length + 1,
    round,
    actorSide: actor.side,
    actorId: actor.snapshot.id,
    targetSide: target.side,
    targetId: target.snapshot.id,
    attack: actor.derived.attack,
    defense: target.derived.defense,
    dodgeRate: target.derived.dodgeRate,
    dodgeRoll,
    dodged,
    criticalRate: actor.derived.criticalRate,
    criticalRoll,
    critical,
    variance,
    rawDamage,
    calculatedDamage,
    damage,
    targetHealthBefore: healthBefore,
    targetHealthAfter: target.health,
  });
}

function resolveWinner(
  attacker: MutableFighterState,
  defender: MutableFighterState,
  random: ArenaSeededRandom,
): {
  winnerSide: ArenaSide;
  reason: ArenaBattleResolution;
  tieBreakerRoll: number | null;
} {
  if (attacker.health === 0) {
    return {
      winnerSide: 'defender',
      reason: 'knockout',
      tieBreakerRoll: null,
    };
  }
  if (defender.health === 0) {
    return {
      winnerSide: 'attacker',
      reason: 'knockout',
      tieBreakerRoll: null,
    };
  }

  const ratioComparison = compareHealthRatios(attacker, defender);
  if (ratioComparison !== 0) {
    return {
      winnerSide: ratioComparison > 0 ? 'attacker' : 'defender',
      reason: 'remaining_health_ratio',
      tieBreakerRoll: null,
    };
  }

  if (attacker.totalDamageDealt !== defender.totalDamageDealt) {
    return {
      winnerSide:
        attacker.totalDamageDealt > defender.totalDamageDealt
          ? 'attacker'
          : 'defender',
      reason: 'total_damage',
      tieBreakerRoll: null,
    };
  }

  const tieBreakerRoll = random.next();
  return {
    winnerSide: tieBreakerRoll < 0.5 ? 'attacker' : 'defender',
    reason: 'seed',
    tieBreakerRoll,
  };
}

/** 使用整数交叉相乘比较生命比例，避免浮点相等误差。 */
function compareHealthRatios(
  attacker: MutableFighterState,
  defender: MutableFighterState,
): number {
  const attackerRatio =
    BigInt(attacker.health) * BigInt(defender.derived.maxHealth);
  const defenderRatio =
    BigInt(defender.health) * BigInt(attacker.derived.maxHealth);
  if (attackerRatio === defenderRatio) return 0;
  return attackerRatio > defenderRatio ? 1 : -1;
}

function toFighterResult(state: MutableFighterState): ArenaFighterResult {
  return {
    side: state.side,
    snapshot: state.snapshot,
    derived: state.derived,
    remainingHealth: state.health,
    remainingHealthRatio: state.health / state.derived.maxHealth,
    totalDamageDealt: state.totalDamageDealt,
  };
}

function normalizeMaxRounds(value: number | undefined): number {
  if (value === undefined) return MAX_ARENA_ROUNDS;
  if (!Number.isInteger(value) || value < 1 || value > MAX_ARENA_ROUNDS) {
    throw new RangeError(
      `maxRounds must be an integer between 1 and ${MAX_ARENA_ROUNDS}`,
    );
  }
  return value;
}

function validateSnapshot(snapshot: ArenaFighterSnapshot): void {
  if (
    typeof snapshot !== 'object' ||
    snapshot === null ||
    typeof snapshot.id !== 'string' ||
    snapshot.id.trim().length === 0
  ) {
    throw new TypeError('Arena fighter snapshot requires a non-empty id');
  }
  if (typeof snapshot.attributes !== 'object' || snapshot.attributes === null) {
    throw new TypeError('Arena fighter snapshot requires attributes');
  }

  for (const key of [
    'focus',
    'inspiration',
    'mindset',
    'slacking',
    'execution',
  ] as const) {
    const value = snapshot.attributes[key];
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > MAX_ATTRIBUTE_VALUE
    ) {
      throw new RangeError(
        `${key} must be a finite number between 0 and ${MAX_ATTRIBUTE_VALUE}`,
      );
    }
  }

  if (
    snapshot.maxHealth !== undefined &&
    (typeof snapshot.maxHealth !== 'number' ||
      !Number.isFinite(snapshot.maxHealth) ||
      snapshot.maxHealth < 1 ||
      snapshot.maxHealth > MAX_HEALTH_VALUE)
  ) {
    throw new RangeError(
      `maxHealth must be between 1 and ${MAX_HEALTH_VALUE}`,
    );
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
