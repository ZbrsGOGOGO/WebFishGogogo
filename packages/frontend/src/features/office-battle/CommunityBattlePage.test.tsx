import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  communityBattleApi,
  type CommunityBattleBootstrap,
  type CommunityBattleEquipment,
} from '../../api/community';
import { CommunityBattlePage } from './CommunityBattlePage';

const equipment: CommunityBattleEquipment[] = [
  ['weapon', '专业·机械键盘'],
  ['head', '精工·双屏工作站'],
  ['body', '标准·轻便工装'],
  ['badge', '专业·研发工牌'],
  ['shoes', '标准·通勤跑鞋'],
  ['accessory', '精工·降噪耳机'],
].map(([slot, name], index) => ({
  id: `eq-${index}`,
  name,
  slot: slot as CommunityBattleEquipment['slot'],
  profession: 'developer',
  requiredLevel: 1,
  equipmentLevel: 1,
  rarity: index === 0 ? 'rare' : 'common',
  stats: { attack: 1 },
  score: 10,
  locked: false,
  equipped: true,
  enhancementLevel: 0,
  canSalvage: false,
}));

const bootstrap: CommunityBattleBootstrap = {
  serverTime: '2026-08-22T10:00:00.000Z',
  clientCompatibility: { status: 'current', minClientVersion: '1.0.0' },
  catalog: {
    engineVersion: 'engine-1',
    balanceVersion: 'balance-1',
    minClientVersion: '1.0.0',
    energy: { max: 120, costPerBattle: 10, recoveryMinutes: 10 },
    leveling: {
      maxLevel: 60,
      experienceRule: '升到下一级所需经验 = 80 + 20 × 当前等级。',
      pveSkillPointRule: 'Lv.1 获得 1 点，之后每 4 级增加 1 点。',
      pvpSkillPointRule: 'Lv.5 获得 1 点，之后每 4 级增加 1 点。',
      rarityUnlocks: [
        { level: 1, rarity: 'common', label: '标准' },
        { level: 10, rarity: 'uncommon', label: '精工' },
      ],
    },
    modes: {
      pve: {
        label: 'PVE 项目挑战', opponentLabel: 'NPC 项目组', skillTrack: 'pve', equipmentEnhancementPercent: 100, dailyRewardLimit: 14,
        winReward: { battleExperience: 30, workspaceCoins: 80, equipmentDrop: true },
        lossReward: { battleExperience: 15, workspaceCoins: 40, equipmentDrop: false },
        rules: ['三档项目难度', '完整计算装备强化'],
      },
      pvp: {
        label: 'PVP 好友对战', opponentLabel: '已满足条件的好友', skillTrack: 'pvp', equipmentEnhancementPercent: 60, dailyRewardLimit: 5, friendAgeHours: 24,
        winReward: { battleExperience: 25, workspaceCoins: 120, equipmentDrop: true },
        lossReward: { battleExperience: 12, workspaceCoins: 60, equipmentDrop: false },
        rules: ['双方使用防守阵容', '强化增量只计 60%'],
      },
    },
    pveCampaign: {
      version: 'pve-campaign-1',
      chapters: [{
        id: 'probation', index: 1, name: '第一章 · 试用期求生', summary: '熟悉项目挑战。', unlockLevel: 1,
        stages: [
          { id: 'probation-1', chapterId: 'probation', index: 1, tier: 'simple', name: '清空待办箱', summary: '完成第一场项目挑战。', opponentName: '待办整理员', opponentProfession: 'product', powerPercent: 92, boss: false, firstClearReward: { battleExperience: 20, workspaceCoins: 100, parts: 2 } },
          { id: 'probation-2', chapterId: 'probation', index: 2, tier: 'balanced', name: '守住截止线', summary: '守住关键交付。', opponentName: '进度催办专员', opponentProfession: 'sales', powerPercent: 100, boss: false, firstClearReward: { battleExperience: 30, workspaceCoins: 160, parts: 3 } },
          { id: 'probation-3', chapterId: 'probation', index: 3, tier: 'challenge', name: '试用期复盘会', summary: '击败本章 Boss。', opponentName: '复盘会议主持人', opponentProfession: 'hr', powerPercent: 112, boss: true, firstClearReward: { battleExperience: 60, workspaceCoins: 300, parts: 8 } },
        ],
      }],
    },
    inventoryLimit: 120,
    rarityRates: [
      { rarity: 'common', label: '标准', rate: 45 },
      { rarity: 'uncommon', label: '精工', rate: 33 },
      { rarity: 'rare', label: '专业', rate: 16 },
      { rarity: 'epic', label: '卓越', rate: 5 },
      { rarity: 'legendary', label: '代表作', rate: 1 },
    ],
    skills: {
      maxLevel: 5,
      pointRule: 'PVE 与 PVP 分别获得技能点。',
      coinCosts: [100, 300, 700, 1500, 3000],
      definitions: [
        { id: 'pve_batch_script', profession: 'developer', mode: 'pve', name: '批量脚本', unlockLevel: 1, description: 'PVE 每级攻击 +3。', bonusPerLevel: { attack: 3 } },
        { id: 'pvp_logic_overclock', profession: 'developer', mode: 'pvp', name: '逻辑超频', unlockLevel: 5, description: 'PVP 每级攻击 +3。', bonusPerLevel: { attack: 3 } },
      ],
    },
    enhancement: { maxLevel: 6, coinCosts: [100, 250, 500, 900, 1500, 2400], partCosts: [2, 4, 6, 8, 10, 12], successRate: 100 },
    capabilities: { enhancementEnabled: true, friendChallengesEnabled: true },
  },
  profile: {
    publicId: 'ZBRS-1', displayName: '正式账号', profession: 'developer', battleLevel: 3,
    totalBattleExperience: 40, experienceInLevel: 10, experienceToNextLevel: 50,
    wins: 2, losses: 1, power: 190, pvePower: 190, pvpPower: 165,
    stats: { hp: 100, attack: 20, defense: 12, speed: 10, luck: 8 },
    modeSnapshots: {
      pve: { power: 190, stats: { hp: 100, attack: 20, defense: 12, speed: 10, luck: 8 }, equipmentEnhancementPercent: 100 },
      pvp: { power: 165, stats: { hp: 96, attack: 17, defense: 11, speed: 10, luck: 8 }, equipmentEnhancementPercent: 60 },
    },
    energy: { current: 0, max: 120, serviceDate: '2026-08-22', resetsAt: '2026-08-22T10:10:00.000Z', nextRecoveryAt: '2026-08-22T10:10:00.000Z', recoveryMinutes: 10 },
    workspaceCoins: 800, parts: 2, skillLevels: { pve_batch_script: 1 },
    skillPointsEarned: 2, skillPointsAvailable: 1, skillPoints: { pve: { earned: 2, available: 1 }, pvp: { earned: 0, available: 0 } }, nextUnlock: { level: 5, name: '逻辑超频', kind: 'skill' },
    profileVersion: 1, loadoutVersion: 1,
    inventoryVersion: 1, defenseVersion: 1, accountState: 'active',
  },
  loadout: { equipment, version: 1 },
  defense: { equipmentIds: equipment.map((item) => item.id), challengeVisibility: 'friends', equipmentVisibility: 'friends', version: 1 },
  offers: [{
    offerId: 'offer-1', tier: 'simple', expiresAt: '2026-08-22T10:15:00.000Z',
    opponent: { publicId: 'NPC-1', displayName: '跨部门需求组', profession: 'product', battleLevel: 3, power: 178 },
    stage: { id: 'probation-1', chapterId: 'probation', chapterName: '第一章 · 试用期求生', index: 1, name: '清空待办箱', summary: '完成第一场项目挑战。', boss: false, firstClearReward: { battleExperience: 20, workspaceCoins: 100, parts: 2 }, cleared: false, unlocked: true, lockReason: null },
    powerDifferencePercent: -1,
    rewardPreview: { battleExperience: 30, workspaceExperience: 0, workspaceCoins: 64, dropEligible: true, firstClearBonus: { battleExperience: 20, workspaceCoins: 100, parts: 2 } },
  }],
  dailyActions: { rewardedBattlesUsed: 12, rewardedBattlesLimit: 12, rewardedFriendBattlesUsed: 0, rewardedFriendBattlesLimit: 3 },
  pveCampaign: {
    version: 'pve-campaign-1', activeChapterId: 'probation', clearedStages: 0, totalStages: 3,
    chapters: [{ id: 'probation', unlocked: true, completed: false, active: true, lockReason: null, stages: [
      { id: 'probation-1', cleared: false, unlocked: true, lockReason: null },
      { id: 'probation-2', cleared: false, unlocked: false, lockReason: '先通关 清空待办箱' },
      { id: 'probation-3', cleared: false, unlocked: false, lockReason: '先通关 守住截止线' },
    ] }],
  },
  pendingRewards: [],
  friendCandidates: [],
};

describe('CommunityBattlePage formal archive', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses service data, blocks a rewarded action at zero energy and never writes the guest save', async () => {
    vi.spyOn(communityBattleApi, 'getBootstrap').mockResolvedValue(bootstrap);
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');

    render(<CommunityBattlePage />);

    expect(await screen.findByRole('heading', { name: '办公室乐斗' })).toBeInTheDocument();
    expect(screen.getByText(/选对手、开打、拿奖励/)).toBeInTheDocument();
    expect(screen.queryByText('一眼看懂成长路线')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'PVE 副本' }));
    expect(screen.getByRole('button', { name: '挑战 · 10 体力' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '练习 · 无奖励' })).toBeEnabled();
    expect(storageWrite).not.toHaveBeenCalled();
  });

  it('shows the profession skill tree and persists a versioned upgrade', async () => {
    vi.spyOn(communityBattleApi, 'getBootstrap').mockResolvedValue(bootstrap);
    const upgrade = vi.spyOn(communityBattleApi, 'upgradeSkill').mockResolvedValue({
      profile: {
        ...bootstrap.profile!,
        profileVersion: 2,
        power: 190,
        skillLevels: { pve_batch_script: 2 },
        skillPointsAvailable: 0,
        skillPoints: { ...bootstrap.profile!.skillPoints, pve: { earned: 2, available: 0 } },
      },
      inventoryVersion: 1,
    });
    render(<CommunityBattlePage />);
    fireEvent.click(await screen.findByRole('tab', { name: '技能图鉴' }));
    expect(screen.getByText('批量脚本')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '1 点 + 300 办公币' }));
    expect(upgrade).toHaveBeenCalledWith('pve_batch_script', 1, expect.any(String));
    expect(await screen.findByText(/批量脚本已升到 Lv\.2/)).toBeInTheDocument();
  });

  it('keeps history navigation available while an outdated banned profile cannot act', async () => {
    vi.spyOn(communityBattleApi, 'getBootstrap').mockResolvedValue({
      ...bootstrap,
      clientCompatibility: { status: 'upgrade_required', minClientVersion: '2.0.0' },
      profile: { ...bootstrap.profile!, accountState: 'banned', restrictionReason: '安全复核中', energy: { ...bootstrap.profile!.energy, current: 5 } },
    });

    render(<CommunityBattlePage />);

    expect(await screen.findByText(/当前角色已被封禁/)).toBeInTheDocument();
    expect(screen.getByText(/当前网页版本过旧/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'PVE 副本' }));
    expect(screen.getByRole('button', { name: '挑战 · 10 体力' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '练习 · 无奖励' })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole('tab', { name: '记录' })).toBeEnabled());
  });

  it('shows PVE, PVP and profession-specific power leaderboards', async () => {
    vi.spyOn(communityBattleApi, 'getBootstrap').mockResolvedValue(bootstrap);
    const ranking = vi.spyOn(communityBattleApi, 'getLeaderboard').mockResolvedValue({
      mode: 'pve',
      profession: 'all',
      formulaVersion: 'office-power-v2',
      updatedAt: '2026-08-22T10:00:00.000Z',
      items: [{
        rank: 1,
        publicId: 'rank-1',
        displayName: '键盘侠客',
        profession: 'developer',
        battleLevel: 12,
        power: 888,
        wins: 30,
        losses: 4,
      }],
    });

    render(<CommunityBattlePage />);
    fireEvent.click(await screen.findByRole('tab', { name: '排行' }));

    expect(await screen.findByText('键盘侠客')).toBeInTheDocument();
    expect(ranking).toHaveBeenCalledWith('pve', 'all');
    fireEvent.change(screen.getByRole('combobox', { name: '职业分榜' }), {
      target: { value: 'developer' },
    });
    await waitFor(() => expect(ranking).toHaveBeenCalledWith('pve', 'developer'));
  });

  it('separates shared level growth from the PVE and PVP skill codexes', async () => {
    vi.spyOn(communityBattleApi, 'getBootstrap').mockResolvedValue(bootstrap);
    render(<CommunityBattlePage />);

    expect(await screen.findByText('PVE 与 PVP 的区别')).toBeInTheDocument();
    expect(screen.getByText('全强化 · PVE 技能')).toBeInTheDocument();
    expect(screen.getByText('强化增量 60% · PVP 技能')).toBeInTheDocument();
    expect(screen.getByText('强化增量计入 100%')).toBeInTheDocument();
    expect(screen.getByText('强化增量计入 60%')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '成长' }));
    expect(screen.getByText('等级与技能点规则')).toBeInTheDocument();
    expect(screen.getByText('等级解锁图鉴')).toBeInTheDocument();
    expect(screen.getByText('共享等级')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '技能图鉴' }));
    expect(screen.getByText('批量脚本')).toBeInTheDocument();
    expect(screen.queryByText('逻辑超频')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'PVP 技能' }));
    expect(screen.getByText('逻辑超频')).toBeInTheDocument();
    expect(screen.queryByText('批量脚本')).not.toBeInTheDocument();
  });

  it('shows a sequential PVE chapter route with first-clear rewards', async () => {
    vi.spyOn(communityBattleApi, 'getBootstrap').mockResolvedValue(bootstrap);
    render(<CommunityBattlePage />);

    fireEvent.click(await screen.findByRole('tab', { name: 'PVE 副本' }));
    expect(screen.getByText('PVE 项目主线')).toBeInTheDocument();
    expect(screen.getAllByText('试用期求生').length).toBeGreaterThan(0);
    expect(screen.getByText('清空待办箱')).toBeInTheDocument();
    expect(screen.getByText('首通：经验 +20 · 办公币 +100 · 零件 +2')).toBeInTheDocument();
    expect(screen.getByText('已通关 0/3')).toBeInTheDocument();
  });
});
