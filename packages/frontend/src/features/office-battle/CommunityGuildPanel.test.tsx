import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { communityGuildApi, type CommunityGuildOverview } from '../../api/community';
import { CommunityGuildPanel } from './CommunityGuildPanel';

const locked: CommunityGuildOverview = {
  serverTime: '2026-08-23T08:00:00.000Z',
  unlockLevel: 15,
  unlocked: false,
  player: { level: 8, officeCoins: 900 },
  rules: {
    createCost: 20_000,
    dailyEffectiveDonation: 500,
    maxDonationPerRequest: 5_000,
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
      player: { level: 15, officeCoins: 500 },
      membership: {
        guild: { id: 'guild-1', name: '准时下班联盟', level: 1, treasury: 0, memberCount: 1, memberCapacity: 30, version: 1 },
        me: { role: 'owner', activity: 0, donatedToday: 0 },
        buildings: [],
        members: [{ publicId: 'user-1', displayName: '负责人', role: 'owner', activity: 0, joinedAt: '2026-08-23T08:00:00.000Z' }],
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
});
