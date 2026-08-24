import {
  activeCampaignChapter,
  campaignCatalog,
  campaignStageUnlocked,
  OFFICE_BATTLE_CAMPAIGN_STAGES,
} from './office-battle-campaign';

describe('office battle PVE campaign', () => {
  it('contains five chapters with three sequential stages each', () => {
    const catalog = campaignCatalog();
    expect(catalog.version).toBe('pve-campaign-1');
    expect(catalog.chapters).toHaveLength(5);
    expect(OFFICE_BATTLE_CAMPAIGN_STAGES).toHaveLength(15);
    expect(catalog.chapters.every((chapter) => chapter.stages.length === 3)).toBe(true);
    expect(catalog.chapters.every((chapter) => chapter.stages.at(-1)?.boss)).toBe(true);
  });

  it('unlocks stages and chapters only after the previous route is cleared', () => {
    const cleared = new Set<string>();
    expect(campaignStageUnlocked(1, cleared, 'probation-1')).toEqual({ unlocked: true, reason: null });
    expect(campaignStageUnlocked(60, cleared, 'probation-2')).toMatchObject({ unlocked: false });
    expect(campaignStageUnlocked(60, cleared, 'cross-team-1')).toMatchObject({ unlocked: false });

    cleared.add('probation-1');
    cleared.add('probation-2');
    cleared.add('probation-3');
    expect(campaignStageUnlocked(9, cleared, 'cross-team-1')).toEqual({ unlocked: false, reason: 'Lv.10 解锁' });
    expect(campaignStageUnlocked(10, cleared, 'cross-team-1')).toEqual({ unlocked: true, reason: null });
  });

  it('keeps the active chapter on the last playable route until the next level gate opens', () => {
    const cleared = new Set(['probation-1', 'probation-2', 'probation-3']);
    expect(activeCampaignChapter(3, cleared).id).toBe('probation');
    expect(activeCampaignChapter(10, cleared).id).toBe('cross-team');
  });
});

