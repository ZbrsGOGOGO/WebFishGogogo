/**
 * 统一职场等级曲线 v2。
 *
 * - 初始为 Lv.1、累计经验 0。
 * - 从 Lv.N 升到 Lv.N+1 需要额外 `80 + 20 * N` EXP。
 * - 等级上限为 60；累计经验保留，等级不会超过上限。
 *
 * 曲线保持为纯函数，未来调整时应新增版本，而不是原地改写历史战斗/奖励语义。
 */
export const PLAYER_LEVEL_RULE_VERSION = 'v2';
export const MIN_PLAYER_LEVEL = 1;
export const MAX_PLAYER_LEVEL = 60;

/** 到达指定等级所需的累计 EXP。 */
export function cumulativeExperienceForLevel(level: number): number {
  assertLevel(level);
  // sum(80 + 20N), N = 1 .. level - 1
  return 80 * (level - 1) + 10 * level * (level - 1);
}

/** 由累计 EXP 解析玩家等级。 */
export function levelForExperience(experience: number): number {
  const normalized = normalizeExperience(experience);

  let low = MIN_PLAYER_LEVEL;
  let high = MAX_PLAYER_LEVEL;
  while (low < high) {
    const candidate = Math.ceil((low + high) / 2);
    if (cumulativeExperienceForLevel(candidate) <= normalized) {
      low = candidate;
    } else {
      high = candidate - 1;
    }
  }
  return low;
}

/** 距离下一等级仍需的 EXP；满级时为 null。 */
export function experienceToNextLevel(experience: number): number | null {
  const normalized = normalizeExperience(experience);
  const level = levelForExperience(normalized);
  return level >= MAX_PLAYER_LEVEL
    ? null
    : cumulativeExperienceForLevel(level + 1) - normalized;
}

export interface PlayerLevelSnapshot {
  level: number;
  experience: number;
  expToNextLevel: number | null;
}

/** 生成 API 所需的完整等级快照。 */
export function getPlayerLevelSnapshot(
  experience: number,
): PlayerLevelSnapshot {
  const normalized = normalizeExperience(experience);
  return {
    level: levelForExperience(normalized),
    experience: normalized,
    expToNextLevel: experienceToNextLevel(normalized),
  };
}

function normalizeExperience(experience: number): number {
  if (!Number.isFinite(experience) || experience < 0) {
    throw new RangeError('experience must be a non-negative finite number');
  }
  return Math.floor(experience);
}

function assertLevel(level: number): void {
  if (
    !Number.isInteger(level) ||
    level < MIN_PLAYER_LEVEL ||
    level > MAX_PLAYER_LEVEL
  ) {
    throw new RangeError(
      `level must be an integer between ${MIN_PLAYER_LEVEL} and ${MAX_PLAYER_LEVEL}`,
    );
  }
}
