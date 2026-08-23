import {
  battleSkillPointsAvailable,
  battleSkillPointsEarned,
  battleSkillsForProfession,
  deriveBattleStats,
  normalizeBattleSkillLevels,
  OFFICE_BATTLE_SKILL_MAX_LEVEL,
} from './office-battle-rules';

describe('office battle growth rules', () => {
  it('tracks independent PVE and PVP point schedules up to the full trees', () => {
    expect(battleSkillPointsEarned(1, 'pve')).toBe(1);
    expect(battleSkillPointsEarned(5, 'pve')).toBe(2);
    expect(battleSkillPointsEarned(1, 'pvp')).toBe(0);
    expect(battleSkillPointsEarned(5, 'pvp')).toBe(1);
    expect(battleSkillPointsEarned(60, 'pve')).toBe(15);
    expect(battleSkillPointsEarned(60, 'pvp')).toBe(15);
    expect(battleSkillPointsAvailable(5, 'developer', { pve_batch_script: 1 }, 'pve')).toBe(1);
  });

  it('keeps three skills per mode and rejects persisted foreign keys', () => {
    expect(battleSkillsForProfession('qa')).toHaveLength(6);
    expect(battleSkillsForProfession('qa', 'pvp')).toHaveLength(3);
    expect(normalizeBattleSkillLevels('qa', {
      pvp_boundary_strike: 99,
      pvp_logic_overclock: 5,
    })).toEqual({
      pve_boundary_scan: 0,
      pve_bug_tracking: 0,
      pve_regression_armor: 0,
      pvp_boundary_strike: OFFICE_BATTLE_SKILL_MAX_LEVEL,
      pvp_regression_armor: 0,
      pvp_bug_tracking: 0,
    });
  });

  it('applies skill bonuses to the server-authoritative fighter stats', () => {
    const base = deriveBattleStats({ profession: 'developer', level: 1, equipment: [] });
    const skilled = deriveBattleStats({
      profession: 'developer',
      level: 1,
      equipment: [],
      skillLevels: { pve_batch_script: 2 },
    });
    expect(skilled.attack).toBe(base.attack + 6);
    expect(skilled.hp).toBe(base.hp);
  });
});
