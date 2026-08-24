import type { OfficeBattleProfession } from '../../../database/entities/office-battle-profile.entity';

export type OfficeBattleCampaignTier = 'simple' | 'balanced' | 'challenge';

export interface OfficeBattleFirstClearReward {
  battleExperience: number;
  workspaceCoins: number;
  parts: number;
}

export interface OfficeBattleCampaignStage {
  id: string;
  chapterId: string;
  index: number;
  tier: OfficeBattleCampaignTier;
  name: string;
  summary: string;
  opponentName: string;
  opponentProfession: OfficeBattleProfession;
  powerPercent: number;
  boss: boolean;
  firstClearReward: OfficeBattleFirstClearReward;
}

export interface OfficeBattleCampaignChapter {
  id: string;
  index: number;
  name: string;
  summary: string;
  unlockLevel: number;
  stages: readonly OfficeBattleCampaignStage[];
}

function stage(
  chapterId: string,
  index: number,
  tier: OfficeBattleCampaignTier,
  definition: Omit<OfficeBattleCampaignStage, 'id' | 'chapterId' | 'index' | 'tier'>,
): OfficeBattleCampaignStage {
  return { id: `${chapterId}-${index}`, chapterId, index, tier, ...definition };
}

export const OFFICE_BATTLE_CAMPAIGN: readonly OfficeBattleCampaignChapter[] = [
  {
    id: 'probation', index: 1, name: '第一章 · 试用期求生', unlockLevel: 1,
    summary: '从待办清理到试用期复盘，熟悉办公室乐斗的基础循环。',
    stages: [
      stage('probation', 1, 'simple', {
        name: '清空待办箱', summary: '处理堆积任务，完成第一场项目挑战。', opponentName: '待办整理员',
        opponentProfession: 'product', powerPercent: 92, boss: false,
        firstClearReward: { battleExperience: 20, workspaceCoins: 100, parts: 2 },
      }),
      stage('probation', 2, 'balanced', {
        name: '守住截止线', summary: '在临近下班前交付本周关键任务。', opponentName: '进度催办专员',
        opponentProfession: 'sales', powerPercent: 100, boss: false,
        firstClearReward: { battleExperience: 30, workspaceCoins: 160, parts: 3 },
      }),
      stage('probation', 3, 'challenge', {
        name: '试用期复盘会', summary: '击败本章 Boss，证明你能独立承担项目。', opponentName: '复盘会议主持人',
        opponentProfession: 'hr', powerPercent: 112, boss: true,
        firstClearReward: { battleExperience: 60, workspaceCoins: 300, parts: 8 },
      }),
    ],
  },
  {
    id: 'cross-team', index: 2, name: '第二章 · 跨组协作', unlockLevel: 10,
    summary: '面对需求变更、联调故障和跨部门评审。',
    stages: [
      stage('cross-team', 1, 'simple', {
        name: '需求对齐', summary: '把分散信息整理成所有人都能执行的方案。', opponentName: '需求变更代表',
        opponentProfession: 'product', powerPercent: 94, boss: false,
        firstClearReward: { battleExperience: 30, workspaceCoins: 140, parts: 3 },
      }),
      stage('cross-team', 2, 'balanced', {
        name: '联调排障', summary: '在多方接口之间找到真正的阻塞点。', opponentName: '联调排障小组',
        opponentProfession: 'qa', powerPercent: 102, boss: false,
        firstClearReward: { battleExperience: 45, workspaceCoins: 220, parts: 5 },
      }),
      stage('cross-team', 3, 'challenge', {
        name: '跨部门评审', summary: '击败本章 Boss，让方案顺利通过联合评审。', opponentName: '联合评审委员会',
        opponentProfession: 'hr', powerPercent: 114, boss: true,
        firstClearReward: { battleExperience: 90, workspaceCoins: 420, parts: 12 },
      }),
    ],
  },
  {
    id: 'quarter', index: 3, name: '第三章 · 季度冲刺', unlockLevel: 20,
    summary: '在资源有限的情况下，完成季度核心目标。',
    stages: [
      stage('quarter', 1, 'simple', {
        name: '资源排期', summary: '调整人员与时间，给关键目标留出空间。', opponentName: '资源协调专员',
        opponentProfession: 'hr', powerPercent: 96, boss: false,
        firstClearReward: { battleExperience: 40, workspaceCoins: 180, parts: 4 },
      }),
      stage('quarter', 2, 'balanced', {
        name: '核心交付', summary: '在连续变更中守住最重要的交付范围。', opponentName: '核心交付项目组',
        opponentProfession: 'developer', powerPercent: 104, boss: false,
        firstClearReward: { battleExperience: 60, workspaceCoins: 280, parts: 7 },
      }),
      stage('quarter', 3, 'challenge', {
        name: '季度答辩', summary: '击败本章 Boss，用结果完成季度答辩。', opponentName: '季度答辩评委团',
        opponentProfession: 'sales', powerPercent: 116, boss: true,
        firstClearReward: { battleExperience: 120, workspaceCoins: 520, parts: 16 },
      }),
    ],
  },
  {
    id: 'annual', index: 4, name: '第四章 · 年度攻坚', unlockLevel: 35,
    summary: '处理高压项目、重要客户和年度关键发布。',
    stages: [
      stage('annual', 1, 'simple', {
        name: '风险清单', summary: '提前识别会阻止年度目标的关键风险。', opponentName: '风险检查专员',
        opponentProfession: 'qa', powerPercent: 98, boss: false,
        firstClearReward: { battleExperience: 55, workspaceCoins: 240, parts: 6 },
      }),
      stage('annual', 2, 'balanced', {
        name: '关键客户日', summary: '在高压沟通中守住交付承诺。', opponentName: '关键客户项目组',
        opponentProfession: 'sales', powerPercent: 106, boss: false,
        firstClearReward: { battleExperience: 80, workspaceCoins: 360, parts: 9 },
      }),
      stage('annual', 3, 'challenge', {
        name: '年度发布夜', summary: '击败本章 Boss，完成年度最重要的一次上线。', opponentName: '年度发布指挥部',
        opponentProfession: 'developer', powerPercent: 118, boss: true,
        firstClearReward: { battleExperience: 150, workspaceCoins: 680, parts: 22 },
      }),
    ],
  },
  {
    id: 'organization', index: 5, name: '第五章 · 组织级挑战', unlockLevel: 50,
    summary: '从个人执行者成长为能影响整个组织的核心成员。',
    stages: [
      stage('organization', 1, 'simple', {
        name: '流程重构', summary: '拆掉旧流程中的重复工作和无效等待。', opponentName: '旧流程维护组',
        opponentProfession: 'product', powerPercent: 100, boss: false,
        firstClearReward: { battleExperience: 70, workspaceCoins: 320, parts: 8 },
      }),
      stage('organization', 2, 'balanced', {
        name: '组织协同', summary: '让多个团队围绕同一目标稳定协作。', opponentName: '组织协同办公室',
        opponentProfession: 'hr', powerPercent: 108, boss: false,
        firstClearReward: { battleExperience: 100, workspaceCoins: 480, parts: 12 },
      }),
      stage('organization', 3, 'challenge', {
        name: '年度战略会', summary: '击败最终 Boss，完成当前版本的 PVE 主线。', opponentName: '年度战略决策组',
        opponentProfession: 'product', powerPercent: 120, boss: true,
        firstClearReward: { battleExperience: 200, workspaceCoins: 900, parts: 30 },
      }),
    ],
  },
] as const;

export const OFFICE_BATTLE_CAMPAIGN_STAGES = OFFICE_BATTLE_CAMPAIGN.flatMap(
  (chapter) => chapter.stages,
);

export function campaignStage(stageId: string): OfficeBattleCampaignStage | null {
  return OFFICE_BATTLE_CAMPAIGN_STAGES.find((stageItem) => stageItem.id === stageId) ?? null;
}

export function campaignChapter(chapterId: string): OfficeBattleCampaignChapter | null {
  return OFFICE_BATTLE_CAMPAIGN.find((chapter) => chapter.id === chapterId) ?? null;
}

export function campaignStageUnlocked(
  level: number,
  clearedStageIds: ReadonlySet<string>,
  stageId: string,
): { unlocked: boolean; reason: string | null } {
  const target = campaignStage(stageId);
  if (!target) return { unlocked: false, reason: '关卡不存在' };
  const chapter = campaignChapter(target.chapterId)!;
  if (level < chapter.unlockLevel) {
    return { unlocked: false, reason: `Lv.${chapter.unlockLevel} 解锁` };
  }
  const previousChapter = OFFICE_BATTLE_CAMPAIGN[chapter.index - 2];
  const previousBoss = previousChapter?.stages.at(-1);
  if (previousBoss && !clearedStageIds.has(previousBoss.id)) {
    return { unlocked: false, reason: `先通关${previousChapter.name}` };
  }
  const previousStage = chapter.stages[target.index - 2];
  if (previousStage && !clearedStageIds.has(previousStage.id)) {
    return { unlocked: false, reason: `先通关 ${previousStage.name}` };
  }
  return { unlocked: true, reason: null };
}

export function activeCampaignChapter(
  level: number,
  clearedStageIds: ReadonlySet<string>,
): OfficeBattleCampaignChapter {
  for (const chapter of OFFICE_BATTLE_CAMPAIGN) {
    const first = chapter.stages[0];
    const state = campaignStageUnlocked(level, clearedStageIds, first.id);
    if (!state.unlocked) return OFFICE_BATTLE_CAMPAIGN[Math.max(0, chapter.index - 2)];
    if (!clearedStageIds.has(chapter.stages.at(-1)!.id)) return chapter;
  }
  return OFFICE_BATTLE_CAMPAIGN.at(-1)!;
}

export function campaignCatalog() {
  return {
    version: 'pve-campaign-1',
    chapters: OFFICE_BATTLE_CAMPAIGN.map((chapter) => ({
      id: chapter.id,
      index: chapter.index,
      name: chapter.name,
      summary: chapter.summary,
      unlockLevel: chapter.unlockLevel,
      stages: chapter.stages.map((stageItem) => ({ ...stageItem })),
    })),
  };
}

