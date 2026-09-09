import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const gate = vi.hoisted(() => ({ enabled: true }));
vi.mock('./community-nav', async (original) => {
  const actual = await original<typeof import('./community-nav')>();
  return { ...actual, COMMUNITY_FEATURE_FLAGS: { ...actual.COMMUNITY_FEATURE_FLAGS, get demonTower() { return gate.enabled; } } };
});
vi.mock('../features/games/demon-tower/DemonTowerPage', () => ({ DemonTowerPage: () => <h1>妖塔角色测试入口</h1> }));
vi.mock('../features/games/demon-tower/DemonTowerLeaderboardPage', () => ({ DemonTowerLeaderboardPage: () => <h1>妖塔贡献测试入口</h1> }));
vi.mock('../features/workstation-tower-defense', () => ({ WorkstationTowerDefensePage: () => <h1>既有工位塔防测试入口</h1> }));

import { communityGameRoomsApi } from '../api/community-game-rooms';
import { resetCommunityHttpForTests } from '../api/community-http';
import { CommunityGamesPage } from '../features/games/rooms/CommunityGamesPage';
import { CommunityLeaderboardsPage } from '../features/games/rooms/CommunityLeaderboardsPage';
import { CommunityModeRouter } from './community-router';
import { resetCommunityAuthStoreForTests, useCommunityAuthStore } from './store/community-auth-store';

function router(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><CommunityModeRouter /></MemoryRouter>);
}
describe('demon tower integration release gates', () => {
  beforeEach(() => {
    gate.enabled = true;
    resetCommunityHttpForTests(); resetCommunityAuthStoreForTests();
    useCommunityAuthStore.setState({ phase: 'active', sessionReady: true, user: {
      id: 'tower-entry-fixture', publicId: 'tower-entry-fixture', email: 'entry@users.invalid',
      displayName: '入口验收成员', accountStatus: 'active', onboardingCompleted: true, socialVerificationStatus: 'unverified',
    } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } })));
    vi.spyOn(communityGameRoomsApi, 'catalog').mockResolvedValue({ games: [], rankingRules: '测试规则', rewardRules: '测试奖励', settlementTime: '测试结算', historyNotice: '保留旧游戏' });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it.each(['/games/demon-tower', '/ledou', '/battle'])('routes %s to the new account-bound game when enabled', async (path) => {
    router(path);
    expect(await screen.findByRole('heading', { name: '妖塔角色测试入口' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /便签遮罩/ })).toHaveLength(1);
  });
  it.each(['/ledou', '/battle'])('keeps a safe existing-game fallback at %s when the new flag is off', async (path) => {
    gate.enabled = false; router(path);
    expect(await screen.findByRole('heading', { name: '既有工位塔防测试入口' })).toBeInTheDocument();
  });
  it('does not replace the existing tower-defense route', async () => {
    router('/tower-defense');
    expect(await screen.findByRole('heading', { name: '既有工位塔防测试入口' })).toBeInTheDocument();
  });
  it('keeps the enabled contribution page public, without exposing a private save page', async () => {
    useCommunityAuthStore.setState({ phase: 'guest', user: null });
    const mounted = router('/games/demon-tower/leaderboard');
    expect(await screen.findByRole('heading', { name: '妖塔贡献测试入口' })).toBeInTheDocument();
    mounted.unmount(); router('/games/demon-tower');
    expect(await screen.findByRole('heading', { name: '欢迎回来' })).toBeInTheDocument();
  });
  it('links the free character game and separate boss leaderboard from the games hub', async () => {
    render(<MemoryRouter><CommunityGamesPage /></MemoryRouter>);
    expect(screen.getByRole('link', { name: '进入角色档案 →' })).toHaveAttribute('href', '/games/demon-tower');
    expect(screen.getByRole('link', { name: '查看妖塔贡献日榜' })).toHaveAttribute('href', '/games/demon-tower/leaderboard');
    expect(await screen.findByText('保留旧游戏')).toBeInTheDocument();
  });
  it('includes the new independent board in the sidebar leaderboard hub without mixing construction into score', async () => {
    render(<MemoryRouter initialEntries={['/leaderboards?tab=games']}><CommunityLeaderboardsPage /></MemoryRouter>);
    expect(screen.getByRole('link', { name: '查看妖塔贡献日榜 →' })).toHaveAttribute('href', '/games/demon-tower/leaderboard');
    expect(screen.getByText(/通道建设贡献独立展示，不计入伤害日榜/)).toBeInTheDocument();
    expect(await screen.findByText(/测试结算/)).toBeInTheDocument();
  });
  it('does not advertise the game or its leaderboard from hubs before enablement', async () => {
    gate.enabled = false;
    const games = render(<MemoryRouter><CommunityGamesPage /></MemoryRouter>);
    expect(await screen.findByText('保留旧游戏')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /妖塔/ })).not.toBeInTheDocument();
    games.unmount();
    render(<MemoryRouter initialEntries={['/leaderboards?tab=games']}><CommunityLeaderboardsPage /></MemoryRouter>);
    expect(await screen.findByText(/测试结算/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /妖塔/ })).not.toBeInTheDocument();
  });
});
