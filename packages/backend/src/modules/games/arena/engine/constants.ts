/** 单场斗技允许的最大回合数。一个回合包含双方各至多一次行动。 */
export const MAX_ARENA_ROUNDS = 8;

/** 未显式提供生命值时的基础生命。 */
export const BASE_HEALTH = 100;

/** 每点心态提供的额外生命。 */
export const HEALTH_PER_MINDSET = 5;

/** 伤害随机系数范围。 */
export const DAMAGE_VARIANCE_MIN = 0.85;
export const DAMAGE_VARIANCE_MAX = 1.15;

/** 防御在伤害公式中的折算系数。 */
export const DEFENSE_COEFFICIENT = 0.4;

/** 暴击倍率。 */
export const CRITICAL_MULTIPLIER = 1.5;

/** 灵感和摸鱼属性分别换算为概率时的分母。 */
export const ATTRIBUTE_RATE_DIVISOR = 100;

/** 概率硬上限，防止无限暴击或无限闪避。 */
export const CRITICAL_RATE_CAP = 0.35;
export const DODGE_RATE_CAP = 0.25;

/** 输入防御边界，避免异常大数破坏整数生命值与累计伤害。 */
export const MAX_ATTRIBUTE_VALUE = 1_000_000;
export const MAX_HEALTH_VALUE = 1_000_000_000;
