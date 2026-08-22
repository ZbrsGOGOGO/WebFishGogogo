import { render, screen, waitFor } from '@testing-library/react';
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
    capabilities: { enhancementEnabled: false, friendChallengesEnabled: true },
  },
  profile: {
    publicId: 'ZBRS-1', displayName: '正式账号', profession: 'developer', battleLevel: 3,
    totalBattleExperience: 40, experienceInLevel: 10, experienceToNextLevel: 50,
    wins: 2, losses: 1, power: 180,
    stats: { hp: 100, attack: 20, defense: 12, speed: 10, luck: 8 },
    energy: { current: 0, max: 12, serviceDate: '2026-08-22', resetsAt: '2026-08-22T21:00:00.000Z' },
    workspaceCoins: 8, parts: 2, profileVersion: 1, loadoutVersion: 1,
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
