export const MAX_FARM_LEVEL = 100;

/** v1 农场曲线：升到 Lv.N 需要累计 25 * N * (N - 1) 农场 EXP。 */
export function farmExperienceForLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1 || level > MAX_FARM_LEVEL) {
    throw new RangeError('farm level must be an integer between 1 and 100');
  }
  return 25 * level * (level - 1);
}

export function farmLevelForExperience(experience: number): number {
  if (!Number.isSafeInteger(experience) || experience < 0) {
    throw new RangeError('farm experience must be a non-negative safe integer');
  }
  let low = 1;
  let high = MAX_FARM_LEVEL;
  while (low < high) {
    const candidate = Math.ceil((low + high) / 2);
    if (farmExperienceForLevel(candidate) <= experience) {
      low = candidate;
    } else {
      high = candidate - 1;
    }
  }
  return low;
}

export function farmExpToNextLevel(experience: number): number | null {
  const level = farmLevelForExperience(experience);
  return level === MAX_FARM_LEVEL
    ? null
    : farmExperienceForLevel(level + 1) - experience;
}
