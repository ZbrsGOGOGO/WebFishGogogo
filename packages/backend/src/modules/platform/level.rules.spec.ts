import {
  cumulativeExperienceForLevel,
  experienceToNextLevel,
  getPlayerLevelSnapshot,
  levelForExperience,
  MAX_PLAYER_LEVEL,
} from './level.rules';

describe('player level rule v2', () => {
  it('uses the 80 + 20L current-level costs', () => {
    expect(cumulativeExperienceForLevel(1)).toBe(0);
    expect(cumulativeExperienceForLevel(2)).toBe(100);
    expect(cumulativeExperienceForLevel(3)).toBe(220);
    expect(cumulativeExperienceForLevel(4)).toBe(360);
  });

  it('resolves exact level boundaries deterministically', () => {
    expect(levelForExperience(0)).toBe(1);
    expect(levelForExperience(99)).toBe(1);
    expect(levelForExperience(100)).toBe(2);
    expect(levelForExperience(219)).toBe(2);
    expect(levelForExperience(220)).toBe(3);
  });

  it('returns the remaining experience for the overview API', () => {
    expect(getPlayerLevelSnapshot(10)).toEqual({
      level: 1,
      experience: 10,
      expToNextLevel: 90,
    });
    expect(experienceToNextLevel(100)).toBe(120);
  });

  it('caps level at 60 and reports no next threshold at max level', () => {
    const maxThreshold = cumulativeExperienceForLevel(MAX_PLAYER_LEVEL);
    expect(levelForExperience(maxThreshold + 1_000_000)).toBe(60);
    expect(experienceToNextLevel(maxThreshold)).toBeNull();
  });

  it('rejects invalid level and experience inputs', () => {
    expect(() => cumulativeExperienceForLevel(0)).toThrow(RangeError);
    expect(() => cumulativeExperienceForLevel(61)).toThrow(RangeError);
    expect(() => levelForExperience(-1)).toThrow(RangeError);
    expect(() => levelForExperience(Number.NaN)).toThrow(RangeError);
  });
});
