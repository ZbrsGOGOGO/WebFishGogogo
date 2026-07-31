import {
  farmExperienceForLevel,
  farmExpToNextLevel,
  farmLevelForExperience,
} from './farm-level.rules';

describe('farm level rules', () => {
  it('starts at level 1 and reaches level 2 at 50 EXP', () => {
    expect(farmLevelForExperience(0)).toBe(1);
    expect(farmExpToNextLevel(0)).toBe(50);
    expect(farmLevelForExperience(49)).toBe(1);
    expect(farmLevelForExperience(50)).toBe(2);
  });

  it('is monotonic across the complete level curve', () => {
    let previous = 0;
    for (let level = 1; level <= 100; level += 1) {
      const threshold = farmExperienceForLevel(level);
      expect(threshold).toBeGreaterThanOrEqual(previous);
      expect(farmLevelForExperience(threshold)).toBe(level);
      previous = threshold;
    }
  });

  it('returns null remaining EXP at max level', () => {
    expect(farmExpToNextLevel(farmExperienceForLevel(100))).toBeNull();
  });

  it('rejects invalid values', () => {
    expect(() => farmLevelForExperience(-1)).toThrow(RangeError);
    expect(() => farmExperienceForLevel(101)).toThrow(RangeError);
  });
});
