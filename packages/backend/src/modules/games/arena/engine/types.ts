/** 支撑斗技场的五维基础属性。 */
export interface ArenaAttributes {
  /** 专注：决定先手；相同时由 seed 决定。 */
  focus: number;
  /** 灵感：换算为暴击率，最高 35%。 */
  inspiration: number;
  /** 心态：换算为防御，并在缺省时派生生命值。 */
  mindset: number;
  /** 摸鱼：换算为闪避率，最高 25%。 */
  slacking: number;
  /** 执行：换算为攻击。 */
  execution: number;
}

/** 可持久化、可重放的一方战斗快照。 */
export interface ArenaFighterSnapshot {
  id: string;
  displayName?: string;
  attributes: ArenaAttributes;
  /**
   * 可选的快照生命上限。省略时使用 BASE_HEALTH +
   * mindset * HEALTH_PER_MINDSET 派生。
   */
  maxHealth?: number;
}

export type ArenaSeed = string | number;
export type ArenaSide = 'attacker' | 'defender';

/** 单次纯战斗计算的完整输入。 */
export interface ArenaBattleInput {
  attacker: ArenaFighterSnapshot;
  defender: ArenaFighterSnapshot;
  seed: ArenaSeed;
  /** 缺省为 8；合法范围为 1–8。 */
  maxRounds?: number;
}

/** 从快照派生出的本场固定战斗数值。 */
export interface ArenaDerivedStats {
  maxHealth: number;
  attack: number;
  defense: number;
  initiative: number;
  criticalRate: number;
  dodgeRate: number;
}

/**
 * 一次行动的结构化日志。
 *
 * 日志保存所有随机掷值与公式中间量，既可供前端生成文字战报，也可用于审计。
 */
export interface ArenaBattleLogEntry {
  sequence: number;
  round: number;
  actorSide: ArenaSide;
  actorId: string;
  targetSide: ArenaSide;
  targetId: string;
  attack: number;
  defense: number;
  dodgeRate: number;
  dodgeRoll: number;
  dodged: boolean;
  criticalRate: number;
  criticalRoll: number;
  critical: boolean;
  variance: number;
  /** 攻击 × 波动 - 防御 × 0.4，尚未保底和取整。 */
  rawDamage: number;
  /** 保底、取整和暴击后，本应造成的伤害。 */
  calculatedDamage: number;
  /** 受目标剩余生命限制后实际造成的伤害。 */
  damage: number;
  targetHealthBefore: number;
  targetHealthAfter: number;
}

export interface ArenaFighterResult {
  side: ArenaSide;
  snapshot: ArenaFighterSnapshot;
  derived: ArenaDerivedStats;
  remainingHealth: number;
  remainingHealthRatio: number;
  totalDamageDealt: number;
}

export type ArenaBattleResolution =
  | 'knockout'
  | 'remaining_health_ratio'
  | 'total_damage'
  | 'seed';

/** 可直接持久化的确定性战斗结果。 */
export interface ArenaBattleResult {
  seed: ArenaSeed;
  /** seed 的稳定 32 位哈希，可用于跨进程核对。 */
  normalizedSeed: number;
  maxRounds: number;
  roundsPlayed: number;
  firstActorSide: ArenaSide;
  firstActorId: string;
  winnerSide: ArenaSide;
  winnerId: string;
  loserSide: ArenaSide;
  loserId: string;
  resolution: ArenaBattleResolution;
  /** 仅在最终依 seed 裁决时有值。 */
  tieBreakerRoll: number | null;
  attacker: ArenaFighterResult;
  defender: ArenaFighterResult;
  logs: ArenaBattleLogEntry[];
}
