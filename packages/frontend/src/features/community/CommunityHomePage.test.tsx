import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetCommunityAuthStoreForTests, useCommunityAuthStore } from '../../app/store/community-auth-store';
import { resetCommunityWalletStoreForTests, useCommunityWalletStore } from '../../app/store/community-wallet-store';
import { communityAuthApi, communityFarmApi, communityFeedsApi, communityNotificationsApi, communityProfileApi, communityRelationshipsApi, type CommunityAuthUser, type CommunityFarmOverview, type CommunityProfile } from '../../api/community';
import { setCommunitySessionTokens } from '../../api/community-http';
import { RequireCommunityAccount } from '../../app/community-route-guards';
import { CommunityLoginPage } from '../community-auth/LoginPage';
import { CommunityHomePage } from './CommunityHomePage';

const enabledFeatures = vi.hoisted(() => ({ farm: true, friends: true, feed: true, news: true, community: true, chat: true, registration: true }));
const sceneRenderState = vi.hoisted(() => ({ failed: false }));
vi.mock('../../app/community-nav', async importOriginal => {
  const original = await importOriginal<typeof import('../../app/community-nav')>();
  return { ...original, COMMUNITY_FEATURE_FLAGS: { ...original.COMMUNITY_FEATURE_FLAGS, ...enabledFeatures } };
});
vi.mock('./WorkspaceDeskScene', () => ({ default: () => { if (sceneRenderState.failed) throw new Error('decorative chunk unavailable'); return <div>交互工位场景</div>; } }));
const sessionUser: CommunityAuthUser = { id: 'user-1', publicId: 'ZBRS-1001', email: 'home@example.com', displayName: '首页用户', accountStatus: 'active', onboardingCompleted: true, socialVerificationStatus: 'verified', battleProfession: 'developer' };
const currentProfile: CommunityProfile = { ...sessionUser, displayName: '真实主页用户', battleProfession: 'qa' };
const farm: CommunityFarmOverview = {
  serverTime: '2026-09-15T00:00:00Z', state: 'ready',
  plant: { name: '工位薄荷', appearanceKey: 'desk_mint', level: 2, experience: 50, experienceInLevel: 10, experienceToNextLevel: 30, careStreak: 1, cycleStartedAt: null, maturesAt: null, cycleSeconds: 300, firstCycle: false },
  growth: { farmCoins: 0, officeCoins: 620, totalHarvests: 1, farmVersion: 2, skillPointsEarned: 1, skillPointsAvailable: 1, nextUnlock: null, plotCount: 1, maxPlotCount: 6, nextPlotUnlock: null, officeCoinLevelBonusPercent: 0, ordersCompleted: 1, ordersTotal: 3 },
  crops: [], tools: [], skills: [], standardCycleSeconds: 300, firstCycleSeconds: 30, dailyRewardClaimed: true, encouragementAnimationEnabled: true, pendingEncouragements: 0,
};
const renderHome = (): ReturnType<typeof render> => render(<MemoryRouter initialEntries={['/']}><CommunityHomePage /></MemoryRouter>);
const suppressExpectedSceneError = (event: ErrorEvent): void => { if (event.error instanceof Error && event.error.message === 'decorative chunk unavailable') event.preventDefault(); };
describe('CommunityHomePage workspace', () => {
  beforeEach(() => {
    window.addEventListener('error', suppressExpectedSceneError);
    vi.restoreAllMocks(); sceneRenderState.failed = false; resetCommunityAuthStoreForTests(); resetCommunityWalletStoreForTests();
    useCommunityAuthStore.setState({ phase: 'active', sessionReady: true, user: sessionUser });
    vi.spyOn(communityProfileApi, 'getMe').mockResolvedValue(currentProfile);
    vi.spyOn(communityNotificationsApi, 'list').mockResolvedValue({ items: [], unreadCount: 3, nextCursor: null });
    vi.spyOn(communityFarmApi, 'getOverview').mockResolvedValue(farm);
    vi.spyOn(communityRelationshipsApi, 'listRequests').mockResolvedValue({ items: [], pendingIncomingCount: 2, pendingOutgoingCount: 0, dailySent: 0, dailyLimit: 20 });
    vi.spyOn(communityFeedsApi, 'getOverview').mockResolvedValue({ sentToday: 1, sendDailyLimit: 5, receivedToday: 0, receiveDailyLimit: 5, eligibleFriends: [], items: [] });
  });
  afterEach(() => window.removeEventListener('error', suppressExpectedSceneError));
  it('uses authoritative profile, notification, balance and plant state without repeating campaign promotions', async () => {
    renderHome();
    expect(await screen.findByText('真实主页用户')).toBeInTheDocument();
    expect(screen.getByText('社区职业：测试')).toBeInTheDocument();
    expect(screen.queryByText('社区职业：developer')).not.toBeInTheDocument();
    expect(screen.getByText('620')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('可以收获了')).toBeInTheDocument();
    expect(screen.getByText('工位薄荷 · 农场等级 2，离线生长继续。')).toBeInTheDocument();
    expect(useCommunityWalletStore.getState()).toMatchObject({ officeCoins: 620, ownerId: sessionUser.publicId });
    expect(communityProfileApi.getMe).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('link', { name: /马上守一局|第一次来|去塔防/ })).not.toBeInTheDocument();
  });
  it('gives visitors two directly usable primary actions and labels account-only destinations', () => {
    useCommunityAuthStore.setState({ phase: 'guest', user: null });
    renderHome();
    const hero = screen.getByRole('region', { name: /把日常，\s*安排得刚刚好。/ });
    expect(within(hero).getByRole('link', { name: /打开工具箱/ })).toHaveAttribute('href', '/tools');
    expect(within(hero).getByRole('link', { name: /探索休闲项目/ })).toHaveAttribute('href', '/games');
    expect(screen.getByRole('link', { name: /交流空间/ })).toHaveAttribute('href', '/community');
    expect(screen.getByRole('link', { name: /工位绿植/ })).toHaveAttribute('href', '/farm');
    expect(screen.getByText('需登录 · 发帖、聊天与好友互动')).toBeInTheDocument();
    expect(communityProfileApi.getMe).not.toHaveBeenCalled();
    expect(communityFarmApi.getOverview).not.toHaveBeenCalled();
  });
  it('shows loading as unknown rather than fabricated zero notification and wallet values', () => {
    vi.spyOn(communityNotificationsApi, 'list').mockImplementation(() => new Promise(() => {}));
    renderHome();
    expect(screen.getByText('消息待同步')).toBeInTheDocument();
    expect(screen.getByText('余额待同步')).toBeInTheDocument();
    expect(screen.queryByText('当前没有未读提醒')).not.toBeInTheDocument();
  });
  it('keeps a failed summary explicit and allows a verified refresh', async () => {
    vi.spyOn(communityNotificationsApi, 'list').mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ items: [], unreadCount: 0, nextCursor: null });
    renderHome();
    expect(await screen.findByText('offline')).toBeInTheDocument();
    expect(screen.getByText('消息待同步')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /刷新状态/ }));
    expect(await screen.findByText('当前没有未读提醒')).toBeInTheDocument();
    expect(communityNotificationsApi.list).toHaveBeenCalledTimes(2);
  });
  it('does not load the interactive scene until explicitly requested and can close it', async () => {
    renderHome();
    expect(screen.queryByText('交互工位场景')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /启动 3D 视角/ }));
    expect(await screen.findByText('交互工位场景')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /关闭 3D 视角/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /关闭 3D 视角/ }));
    expect(screen.queryByText('交互工位场景')).not.toBeInTheDocument();
  });
  it('discards the prior account’s delayed response when a different account is active', async () => {
    let finishFirst!: (profile: CommunityProfile) => void;
    vi.spyOn(communityProfileApi, 'getMe').mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; })).mockResolvedValue({ ...currentProfile, id: 'user-2', publicId: 'ZBRS-2002', displayName: '另一位同事' });
    renderHome();
    await act(async () => { useCommunityAuthStore.setState({ user: { ...sessionUser, id: 'user-2', publicId: 'ZBRS-2002', displayName: '第二用户' } }); });
    expect(await screen.findByText('另一位同事')).toBeInTheDocument();
    await act(async () => { finishFirst(currentProfile); });
    expect(screen.queryByText('真实主页用户')).not.toBeInTheDocument();
    expect(screen.getByText('另一位同事')).toBeInTheDocument();
  });
  it('keeps the desk and working links available when the decorative scene fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {}); sceneRenderState.failed = true;
    renderHome(); fireEvent.click(screen.getByRole('button', { name: /启动 3D 视角/ }));
    expect(await screen.findByText('3D 场景暂时没有加载成功')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /随手工具/ })).toHaveAttribute('href', '/tools');
    expect(screen.getByRole('link', { name: /^休闲项目/ })).toHaveAttribute('href', '/games');
    fireEvent.click(screen.getByRole('button', { name: /关闭 3D 视角/ }));
    expect(screen.getByText('属于你的个人空间')).toBeInTheDocument();
  });
  it('does not reuse an old response after the same account logs in under a new session generation', async () => {
    let finishOld!: (profile: CommunityProfile) => void;
    vi.spyOn(communityProfileApi, 'getMe').mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; })).mockResolvedValue({ ...currentProfile, displayName: '新会话资料' });
    renderHome();
    await act(async () => { setCommunitySessionTokens('synthetic-new-session'); useCommunityAuthStore.setState({ user: { ...sessionUser } }); });
    expect(await screen.findByText('新会话资料')).toBeInTheDocument();
    await act(async () => finishOld(currentProfile));
    expect(screen.queryByText('真实主页用户')).not.toBeInTheDocument();
    expect(screen.getByText('新会话资料')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /刷新状态/ })).not.toBeDisabled();
  });
  it.each([
    { label: /工位绿植/, pathname: '/farm' },
    { label: /消息中心/, pathname: '/notifications' },
    { label: /每日热榜/, pathname: '/news/trending' },
  ])('returns a guest to $pathname after authenticating from that home destination', async ({ label, pathname }) => {
    useCommunityAuthStore.setState({ phase: 'guest', user: null });
    vi.spyOn(communityAuthApi, 'login').mockResolvedValue({ accessToken: 'synthetic-home-return-only', user: sessionUser });
    function Destination() { const location = useLocation(); return <output aria-label="返回目的地">{location.pathname}</output>; }
    render(<MemoryRouter initialEntries={['/']}><Routes><Route path="/" element={<CommunityHomePage />} /><Route path="/login" element={<CommunityLoginPage />} /><Route element={<RequireCommunityAccount />}><Route path="/farm" element={<Destination />} /><Route path="/notifications" element={<Destination />} /><Route path="/news/trending" element={<Destination />} /></Route></Routes></MemoryRouter>);
    fireEvent.click(screen.getByRole('link', { name: label }));
    expect(await screen.findByRole('heading', { name: '欢迎回来' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: '账号' }), { target: { value: 'home_user' } });
    fireEvent.change(screen.getByLabelText(/^密码/), { target: { value: 'synthetic-password' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    expect(await screen.findByLabelText('返回目的地')).toHaveTextContent(pathname);
  });
});
