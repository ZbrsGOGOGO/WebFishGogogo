import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const featureFlags = vi.hoisted(() => ({
  battleServer: true,
  publicProfile: false,
  socialVerification: false,
}));

vi.mock('../../app/community-nav', () => ({
  COMMUNITY_FEATURE_FLAGS: featureFlags,
}));

import {
  resetCommunityAuthStoreForTests,
  useCommunityAuthStore,
} from '../../app/store/community-auth-store';
import {
  communityFarmApi,
  communityProfileApi,
  type CommunityFarmOverview,
  type CommunityProfile,
} from '../../api/community';
import { CommunityMyProfilePage } from './MyProfilePage';

const profile: CommunityProfile = {
  id: 'user-1',
  publicId: 'ZBRS-1001',
  email: 'profile@example.com',
  displayName: '正式玩家',
  accountStatus: 'active',
  onboardingCompleted: true,
  socialVerificationStatus: 'verified',
  avatarKey: 'violet',
  battleProfession: 'developer',
  battleLevel: 8,
};

const farmOverview: CommunityFarmOverview = {
  serverTime: '2026-08-23T00:00:00.000Z',
  state: 'growing',
  plant: {
    name: '工位新芽',
    appearanceKey: 'desk_leaf',
    level: 2,
    experience: 50,
    experienceInLevel: 10,
    experienceToNextLevel: 50,
    careStreak: 1,
    cycleStartedAt: '2026-08-23T00:00:00.000Z',
    maturesAt: '2026-08-23T20:00:00.000Z',
    cycleSeconds: 72_000,
    firstCycle: false,
  },
  growth: { farmCoins: 0, officeCoins: 620, totalHarvests: 1, farmVersion: 2, skillPointsEarned: 1, skillPointsAvailable: 1, nextUnlock: { level: 3, name: '会议番茄', kind: 'crop' }, plotCount: 1, maxPlotCount: 6, nextPlotUnlock: { level: 3, count: 2 }, officeCoinLevelBonusPercent: 0, ordersCompleted: 1, ordersTotal: 3 },
  crops: [],
  tools: [],
  skills: [],
  standardCycleSeconds: 72_000,
  firstCycleSeconds: 30,
  dailyRewardClaimed: true,
  encouragementAnimationEnabled: true,
  pendingEncouragements: 0,
};

describe('CommunityMyProfilePage office battle entry', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetCommunityAuthStoreForTests();
    featureFlags.battleServer = true;
    useCommunityAuthStore.setState({
      phase: 'active',
      sessionReady: true,
      user: profile,
    });
    vi.spyOn(communityProfileApi, 'getMe').mockResolvedValue(profile);
    vi.spyOn(communityFarmApi, 'getOverview').mockResolvedValue(farmOverview);
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/me']}>
        <CommunityMyProfilePage />
      </MemoryRouter>,
    );
  }

  it('describes and links to the saved battle profile when battle is enabled', async () => {
    renderPage();

    expect(
      await screen.findByText('等级 8 · 六件装备、仓库、技能和战绩会跟随账号保存。'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '进入办公室乐斗' })).toHaveAttribute(
      'href',
      '/ledou',
    );
    expect(screen.queryByText(/服务端|正式档案|本机试玩/)).not.toBeInTheDocument();
  });

  it('uses the same player-facing copy when the battle flag changes', async () => {
    featureFlags.battleServer = false;
    renderPage();

    expect(
      await screen.findByText('等级 8 · 六件装备、仓库、技能和战绩会跟随账号保存。'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '进入乐斗' })).toHaveAttribute(
      'href',
      '/ledou',
    );
    expect(screen.queryByText(/服务端|正式档案|本机试玩/)).not.toBeInTheDocument();
  });

  it('shows the existing desk plant from the farm overview', async () => {
    renderPage();

    expect(await screen.findByText(/工位新芽 · Lv\.2/)).toBeInTheDocument();
    expect(screen.queryByText('尚未领养工位绿植')).not.toBeInTheDocument();
  });
});
