import {
  battleSkillPointsAvailable,
  battleSkillPointsEarned,
  battleSkillsForProfession,
  deriveBattleStats,
  normalizeBattleSkillLevels,
  OFFICE_BATTLE_SKILL_MAX_LEVEL,
} from './office-battle-rules';

describe('office battle growth rules', () => {
  it('grants one point on entry and one every two levels up to the full tree', () => {
    expect(battleSkillPointsEarned(1)).toBe(1);
    expect(battleSkillPointsEarned(5)).toBe(3);
    expect(battleSkillPointsEarned(60)).toBe(15);
    expect(battleSkillPointsAvailable(5, 'developer', { logic_overclock: 2 })).toBe(1);
  });

  it('keeps exactly three profession skills and rejects persisted foreign keys', () => {
    expect(battleSkillsForProfession('qa')).toHaveLength(3);
    expect(normalizeBattleSkillLevels('qa', {
      boundary_strike: 99,
      logic_overclock: 5,
    })).toEqual({
      boundary_strike: OFFICE_BATTLE_SKILL_MAX_LEVEL,
      regression_armor: 0,
      bug_trace: 0,
    });
  });

  it('applies skill bonuses to the server-authoritative fighter stats', () => {
    const base = deriveBattleStats({ profession: 'developer', level: 1, equipment: [] });
    const skilled = deriveBattleStats({
      profession: 'developer',
      level: 1,
      equipment: [],
      skillLevels: { logic_overclock: 2 },
    });
    expect(skilled.attack).toBe(base.attack + 6);
    expect(skilled.hp).toBe(base.hp);
  });
});
