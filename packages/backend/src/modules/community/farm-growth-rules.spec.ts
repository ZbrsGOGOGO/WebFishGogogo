import {
  calculateFarmCycle,
  FARM_CROPS,
  FARM_SKILL_MAX_LEVEL,
  FARM_TOOL_MAX_LEVEL,
  farmLevelSnapshot,
  farmOfficeCoinLevelBonusPercent,
  farmOrderReward,
  farmPlotCount,
  nextFarmPlotUnlock,
  farmSkillPointsAvailable,
  farmToolUpgradeCost,
  normalizeFarmSkillLevels,
  normalizeFarmToolLevels,
} from './farm-growth-rules';

describe('farm growth rules', () => {
  it('uses an explicit 30-level experience curve', () => {
    expect(farmLevelSnapshot(0)).toEqual({ level: 1, experienceInLevel: 0, experienceToNextLevel: 40 });
    expect(farmLevelSnapshot(40)).toEqual({ level: 2, experienceInLevel: 0, experienceToNextLevel: 50 });
    expect(farmLevelSnapshot(Number.MAX_SAFE_INTEGER).level).toBe(30);
  });

  it('normalizes persisted tool and skill state and derives available points', () => {
    const tools = normalizeFarmToolLevels({ watering_can: 99, planter_box: -2 } as never);
    const skills = normalizeFarmSkillLevels({ quick_care: 2, green_thumb: 1 } as never);
    expect(tools).toEqual({ watering_can: FARM_TOOL_MAX_LEVEL, planter_box: 0, harvest_basket: 0 });
    expect(skills).toEqual({ quick_care: 2, green_thumb: 1, abundant_harvest: 0 });
    expect(farmSkillPointsAvailable(8, skills)).toBe(1);
    expect(normalizeFarmSkillLevels({ quick_care: 99 } as never).quick_care).toBe(FARM_SKILL_MAX_LEVEL);
  });

  it('makes tools and skills improve a crop without eliminating its timer', () => {
    const base = calculateFarmCycle(
      FARM_CROPS[0],
      normalizeFarmToolLevels(null),
      normalizeFarmSkillLevels(null),
    );
    const improved = calculateFarmCycle(
      FARM_CROPS[0],
      normalizeFarmToolLevels({ watering_can: 5, planter_box: 5, harvest_basket: 5 }),
      normalizeFarmSkillLevels({ quick_care: 5, green_thumb: 5, abundant_harvest: 5 }),
    );
    expect(improved.durationSeconds).toBeLessThan(base.durationSeconds);
    expect(improved.durationSeconds).toBeGreaterThanOrEqual(30);
    expect(improved.experience).toBeGreaterThan(base.experience);
    expect(improved.coins).toBeGreaterThan(base.coins);
    expect(farmToolUpgradeCost(0)).toBe(200);
    expect(farmToolUpgradeCost(FARM_TOOL_MAX_LEVEL)).toBe(0);
  });

  it('unlocks simple batch plots and applies a capped farm-level coin bonus', () => {
    expect([1, 3, 6, 10, 15, 22].map(farmPlotCount)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(nextFarmPlotUnlock(6)).toEqual({ level: 10, count: 4 });
    expect(farmOfficeCoinLevelBonusPercent(1)).toBe(0);
    expect(farmOfficeCoinLevelBonusPercent(10)).toBe(10);
    expect(farmOfficeCoinLevelBonusPercent(999)).toBe(30);
    expect(farmOrderReward(0, normalizeFarmToolLevels(null), normalizeFarmSkillLevels(null), 10)).toBe(110);
  });
});
