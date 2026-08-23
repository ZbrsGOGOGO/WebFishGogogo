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
    wins: 2, losses: 1, power: 180,
    stats: { hp: 100, attack: 20, defense: 12, speed: 10, luck: 8 },
    energy: { current: 0, max: 120, serviceDate: '2026-08-22', resetsAt: '2026-08-22T10:10:00.000Z', nextRecoveryAt: '2026-08-22T10:10:00.000Z', recoveryMinutes: 10 },
    workspaceCoins: 800, parts: 2, skillLevels: { pve_batch_script: 1 },
    skillPointsEarned: 2, skillPointsAvailable: 1, skillPoints: { pve: { earned: 2, available: 1 }, pvp: { earned: 0, available: 0 } }, nextUnlock: { level: 5, name: '逻辑超频', kind: 'skill' },
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
    expect(screen.getByText(/选对手、开打、拿奖励/)).toBeInTheDocument();
    expect(screen.queryByText('一眼看懂成长路线')).not.toBeInTheDocument();
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
    fireEvent.click(await screen.findByRole('tab', { name: '技能' }));
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
});
