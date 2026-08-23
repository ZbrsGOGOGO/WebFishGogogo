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
    energy: { dailyMax: 12, resetHour: 5, resetTimeZone: 'Asia/Shanghai' },
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
      pointRule: 'Lv.1 获得 1 点，此后每 2 级再获得 1 点。',
      definitions: [
        { id: 'logic_overclock', profession: 'developer', name: '逻辑超频', unlockLevel: 1, description: '每级攻击 +3。', bonusPerLevel: { attack: 3 } },
        { id: 'exception_shield', profession: 'developer', name: '异常兜底', unlockLevel: 5, description: '每级防御 +2。', bonusPerLevel: { defense: 2 } },
        { id: 'rapid_deploy', profession: 'developer', name: '快速发布', unlockLevel: 10, description: '每级速度 +1。', bonusPerLevel: { speed: 1 } },
      ],
    },
    capabilities: { enhancementEnabled: true, friendChallengesEnabled: true },
  },
  profile: {
    publicId: 'ZBRS-1', displayName: '正式账号', profession: 'developer', battleLevel: 3,
    totalBattleExperience: 40, experienceInLevel: 10, experienceToNextLevel: 50,
    wins: 2, losses: 1, power: 180,
    stats: { hp: 100, attack: 20, defense: 12, speed: 10, luck: 8 },
    energy: { current: 0, max: 12, serviceDate: '2026-08-22', resetsAt: '2026-08-22T21:00:00.000Z' },
    workspaceCoins: 8, parts: 2, skillLevels: { logic_overclock: 1 },
    skillPointsEarned: 2, skillPointsAvailable: 1, nextUnlock: { level: 5, name: '异常兜底', kind: 'skill' },
    profileVersion: 1, loadoutVersion: 1,
    inventoryVersion: 1, defenseVersion: 1, accountState: 'active',
  },
  loadout: { equipment, version: 1 },
  defense: { equipmentIds: equipment.map((item) => item.id), challengeVisibility: 'friends', equipmentVisibility: 'friends', version: 1 },
  offers: [{
    offerId: 'offer-1', tier: 'balanced', expiresAt: '2026-08-22T10:15:00.000Z',
    opponent: { publicId: 'NPC-1', displayName: '跨部门需求组', profession: 'product', battleLevel: 3, power: 178 },
    powerDifferencePercent: -1,
    rewardPreview: { battleExperience: 10, workspaceExperience: 3, workspaceCoins: 4, dropEligible: true },
  }],
  dailyActions: { rewardedBattlesUsed: 12, rewardedBattlesLimit: 12, rewardedFriendBattlesUsed: 0, rewardedFriendBattlesLimit: 3 },
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
    expect(screen.getByText(/服务端权威档案/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '消耗 1 体力行动' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '零奖励练习' })).toBeEnabled();
    expect(storageWrite).not.toHaveBeenCalled();
  });

  it('shows the profession skill tree and persists a versioned upgrade', async () => {
    vi.spyOn(communityBattleApi, 'getBootstrap').mockResolvedValue(bootstrap);
    const upgrade = vi.spyOn(communityBattleApi, 'upgradeSkill').mockResolvedValue({
      profile: {
        ...bootstrap.profile!,
        profileVersion: 2,
        power: 190,
        skillLevels: { logic_overclock: 2 },
        skillPointsAvailable: 0,
      },
      inventoryVersion: 1,
    });
    render(<CommunityBattlePage />);
    fireEvent.click(await screen.findByRole('tab', { name: '职业技能' }));
    expect(screen.getByText('逻辑超频')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '消耗 1 点升级' }));
    expect(upgrade).toHaveBeenCalledWith('logic_overclock', 1, expect.any(String));
    expect(await screen.findByText(/逻辑超频已升到 Lv\.2/)).toBeInTheDocument();
  });

  it('keeps history navigation available while an outdated banned profile cannot act', async () => {
    vi.spyOn(communityBattleApi, 'getBootstrap').mockResolvedValue({
      ...bootstrap,
      clientCompatibility: { status: 'upgrade_required', minClientVersion: '2.0.0' },
      profile: { ...bootstrap.profile!, accountState: 'banned', restrictionReason: '安全复核中', energy: { ...bootstrap.profile!.energy, current: 5 } },
    });

    render(<CommunityBattlePage />);

    expect(await screen.findByText(/正式档案已被封禁/)).toBeInTheDocument();
    expect(screen.getByText(/当前网页版本过旧/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '消耗 1 体力行动' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '零奖励练习' })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole('tab', { name: '战斗记录' })).toBeEnabled());
  });
});
