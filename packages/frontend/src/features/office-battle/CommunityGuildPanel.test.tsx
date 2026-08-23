import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { communityGuildApi, type CommunityGuildOverview } from '../../api/community';
import { CommunityGuildPanel } from './CommunityGuildPanel';

const locked: CommunityGuildOverview = {
  serverTime: '2026-08-23T08:00:00.000Z',
  unlockLevel: 15,
  unlocked: false,
  player: { level: 8, officeCoins: 900, energy: 120, energyCapacity: 120 },
  rules: {
    createCost: 20_000,
    dailyEffectiveDonation: 500,
    maxDonationPerRequest: 5_000,
    boss: {
      unlockLevel: 15,
      energyCost: 10,
      dailyAttempts: 1,
      reward: { officeCoins: 120, experience: 25, activity: 25 },
    },
    market: { status: 'observation', minimumObservationDays: 14 },
  },
  membership: null,
  suggestions: [],
  lastMutation: null,
};

describe('CommunityGuildPanel', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows the real level lock and market observation rule', async () => {
    vi.spyOn(communityGuildApi, 'overview').mockResolvedValue(locked);
    render(<CommunityGuildPanel />);
    expect(await screen.findByText('当前职场 Lv.8')).toBeInTheDocument();
    expect(screen.getByText(/达到 Lv\.15 后可免费加入/)).toBeInTheDocument();
    expect(screen.getByText(/稳定运行 14 天/)).toBeInTheDocument();
  });

  it('moves a donation through the server API and refreshes the treasury snapshot', async () => {
    const member: CommunityGuildOverview = {
      ...locked,
      unlocked: true,
      player: { level: 15, officeCoins: 500, energy: 120, energyCapacity: 120 },
      membership: {
        guild: { id: 'guild-1', name: '准时下班联盟', level: 1, treasury: 0, memberCount: 1, memberCapacity: 30, version: 1 },
        me: { role: 'owner', activity: 0, donatedToday: 0 },
        buildings: [],
        members: [{ publicId: 'user-1', displayName: '负责人', role: 'owner', activity: 0, joinedAt: '2026-08-23T08:00:00.000Z' }],
        boss: {
          serviceDate: '2026-08-23',
          bossName: '季度截止线',
          status: 'ready',
          maxHp: 1350,
          remainingHp: 1350,
          endsAt: '2026-08-23T21:00:00.000Z',
          version: 0,
          attempted: false,
          attemptsRemaining: 1,
          canAttack: true,
          myContribution: null,
          leaderboard: [],
        },
      },
    };
    vi.spyOn(communityGuildApi, 'overview').mockResolvedValue(member);
    const donate = vi.spyOn(communityGuildApi, 'donate').mockResolvedValue({
      ...member,
      player: { ...member.player, officeCoins: 400 },
      membership: {
        ...member.membership!,
        guild: { ...member.membership!.guild, treasury: 100 },
        me: { ...member.membership!.me, activity: 100, donatedToday: 100 },
      },
    });
    render(<CommunityGuildPanel />);
    fireEvent.click(await screen.findByRole('button', { name: '捐 100 币' }));
    await waitFor(() => expect(donate).toHaveBeenCalledWith(100, expect.any(String)));
    expect(await screen.findByText('已向金库捐入 100 办公币')).toBeInTheDocument();
    expect(screen.getAllByText('100').length).toBeGreaterThan(0);
  });

  it('attacks the shared boss through the server and renders the contribution', async () => {
    const member: CommunityGuildOverview = {
      ...locked,
      unlocked: true,
      player: { level: 15, officeCoins: 500, energy: 120, energyCapacity: 120 },
      membership: {
        guild: { id: 'guild-1', name: '准时下班联盟', level: 1, treasury: 0, memberCount: 1, memberCapacity: 30, version: 1 },
        me: { role: 'owner', activity: 0, donatedToday: 0 },
        buildings: [],
        members: [{ publicId: 'user-1', displayName: '负责人', role: 'owner', activity: 0, joinedAt: '2026-08-23T08:00:00.000Z' }],
        boss: {
          serviceDate: '2026-08-23', bossName: '季度截止线', status: 'ready',
          maxHp: 1350, remainingHp: 1350, endsAt: '2026-08-23T21:00:00.000Z', version: 0,
          attempted: false, attemptsRemaining: 1, canAttack: true, myContribution: null, leaderboard: [],
        },
      },
    };
    const attacked: CommunityGuildOverview = {
      ...member,
      player: { ...member.player, officeCoins: 620, energy: 110 },
      membership: {
        ...member.membership!,
        me: { ...member.membership!.me, activity: 25 },
        boss: {
          ...member.membership!.boss,
          status: 'active',
          remainingHp: 520,
          version: 2,
          attempted: true,
          attemptsRemaining: 0,
          canAttack: false,
          myContribution: { damage: 830, criticalHit: false },
          leaderboard: [{ rank: 1, publicId: 'user-1', displayName: '负责人', damage: 830, criticalHit: false }],
        },
      },
    };
    vi.spyOn(communityGuildApi, 'overview').mockResolvedValue(member);
    const attack = vi.spyOn(communityGuildApi, 'attackBoss').mockResolvedValue(attacked);
    const onAssetsChanged = vi.fn().mockResolvedValue(undefined);
    render(<CommunityGuildPanel onAssetsChanged={onAssetsChanged} />);
    fireEvent.click(await screen.findByRole('button', { name: '投入 10 体力攻击' }));
    await waitFor(() => expect(attack).toHaveBeenCalledWith(expect.any(String)));
    expect(onAssetsChanged).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('今日贡献 830 伤害')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '今日已挑战' })).toBeDisabled();
  });
});
