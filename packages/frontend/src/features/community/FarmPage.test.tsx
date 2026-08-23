import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  communityFarmApi,
  type CommunityFarmOverview,
} from '../../api/community';
import {
  resetCommunityAuthStoreForTests,
  useCommunityAuthStore,
} from '../../app/store/community-auth-store';
import { CommunityFarmPage } from './FarmPage';

const overview: CommunityFarmOverview = {
  serverTime: '2026-08-23T00:00:00.000Z',
  state: 'growing',
  plant: {
    name: '工位薄荷', appearanceKey: 'desk_mint', level: 2, experience: 52,
    experienceInLevel: 12, experienceToNextLevel: 50, careStreak: 1,
    cycleStartedAt: '2026-08-23T00:00:00.000Z', maturesAt: '2026-08-23T00:05:00.000Z',
    cycleSeconds: 300, firstCycle: false,
  },
  growth: {
    farmCoins: 0, officeCoins: 620, totalHarvests: 1, farmVersion: 2,
    skillPointsEarned: 1, skillPointsAvailable: 1,
    nextUnlock: { level: 3, name: '会议番茄', kind: 'crop' },
    ordersCompleted: 1, ordersTotal: 3,
  },
  crops: [
    { key: 'desk_mint', name: '工位薄荷', mark: '薄', unlockLevel: 1, durationSeconds: 300, experience: 12, coins: 100, seedCost: 10, description: '成熟最快。', unlocked: true, selected: true, growing: true },
    { key: 'meeting_tomato', name: '会议番茄', mark: '茄', unlockLevel: 3, durationSeconds: 1200, experience: 32, coins: 120, seedCost: 25, description: '稳定产出。', unlocked: false, selected: false, growing: false },
  ],
  tools: [
    { id: 'watering_can', name: '定时浇水壶', slot: '浇水工具', description: '每级让成熟时间缩短 4%。', level: 0, maxLevel: 5, nextCost: 200 },
  ],
  skills: [
    { id: 'quick_care', name: '快速照料', unlockLevel: 2, description: '每级让成熟时间额外缩短 3%。', level: 0, maxLevel: 5, unlocked: true },
  ],
  standardCycleSeconds: 300,
  firstCycleSeconds: 30,
  dailyRewardClaimed: true,
  encouragementAnimationEnabled: true,
  pendingEncouragements: 0,
};

describe('CommunityFarmPage growth system', () => {
  beforeEach(() => {
    resetCommunityAuthStoreForTests();
    useCommunityAuthStore.setState({ phase: 'active', sessionReady: true });
    vi.spyOn(communityFarmApi, 'getOverview').mockResolvedValue(overview);
  });

  afterEach(() => vi.restoreAllMocks());

  it('shows the simple main loop and the optional growth layers together', async () => {
    render(<CommunityFarmPage />);
    expect(await screen.findByRole('heading', { name: '我的工位农场' })).toBeInTheDocument();
    expect(screen.getByText('农场等级')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '选择下一轮作物' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '三件农场工具' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '三条农场技能' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lv.3 解锁' })).toBeDisabled();
  });

  it('sends versioned tool upgrades and refreshes the server state', async () => {
    const upgraded: CommunityFarmOverview = {
      ...overview,
      growth: { ...overview.growth, officeCoins: 420, farmVersion: 3 },
      tools: overview.tools.map((tool) => ({ ...tool, level: 1, nextCost: 500 })),
    };
    const upgrade = vi.spyOn(communityFarmApi, 'upgradeTool').mockResolvedValue({ farm: upgraded, cost: 200 });
    render(<CommunityFarmPage />);
    const tool = await screen.findByText('定时浇水壶');
    fireEvent.click(within(tool.closest('article')!).getByRole('button', { name: '200 办公币升级' }));
    expect(upgrade).toHaveBeenCalledWith('watering_can', 2, expect.any(String));
    expect(await screen.findByText(/定时浇水壶已升到 Lv\.1/)).toBeInTheDocument();
  });
});
