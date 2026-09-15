import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommunityPublicProfile } from '../../api/community-profile';
import { communityProfileApi } from '../../api/community-profile';
import { communityRelationshipsApi } from '../../api/community-relationships';
import { communityFarmApi } from '../../api/community-farm';
import { communityFeedsApi } from '../../api/community-feeds';
import { setCommunitySessionTokens } from '../../api/community-http';
import { resetCommunityAuthStoreForTests, useCommunityAuthStore } from '../../app/store/community-auth-store';
import { TOWER_TEST_USER } from '../games/demon-tower/test-fixtures';
import { CommunityPublicProfilePage } from './PublicProfilePage';
const features = vi.hoisted(() => ({ friends: true, feed: true, chat: true, farm: true, socialVerification: false }));
vi.mock('../../app/community-nav', () => ({ COMMUNITY_FEATURE_FLAGS: features }));
const profile = (extra: Partial<CommunityPublicProfile> = {}): CommunityPublicProfile => ({ publicId: 'synthetic-profile-other', displayName: '档案同事', avatarKey: 'green', battleProfession: 'developer', equippedTitle: { key: 'farm_first', label: '工位园丁' }, relationship: { status: 'none', canRequest: false, canFeed: false, canEncouragePlant: false, canBlock: false }, ...extra });
const show = () => render(<MemoryRouter initialEntries={['/users/synthetic-profile-other']}><Routes><Route path="/users/:publicId" element={<CommunityPublicProfilePage />} /><Route path="/me" element={<h1>我的工作台</h1>} /></Routes></MemoryRouter>);
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
async function startConcurrentRereads() {
  const friend = profile({ honors: [{ key: 'farm_25', label: '绿意常驻' }], relationship: { ...profile().relationship, status: 'friend', canBlock: true, canFeed: true } });
  const oldRead = deferred<CommunityPublicProfile>(), latestRead = deferred<CommunityPublicProfile>();
  const feedReceipt = deferred<void>(), blockReceipt = deferred<void>();
  vi.mocked(communityProfileApi.getPublic).mockResolvedValueOnce(friend).mockReturnValueOnce(oldRead.promise).mockReturnValueOnce(latestRead.promise);
  vi.spyOn(communityFeedsApi, 'send').mockImplementation(async () => {
    await feedReceipt.promise;
    return { event: { id: 'feed-a', direction: 'sent', type: 'coffee', user: { publicId: friend.publicId, displayName: friend.displayName, avatarKey: 'green', battleProfession: 'developer' }, createdAt: '2026-09-15T00:00:00Z' }, sentToday: 1, sendDailyLimit: 5 };
  });
  vi.spyOn(communityRelationshipsApi, 'block').mockImplementation(async () => { await blockReceipt.promise; return { status: 'blocked_by_me' }; });
  show(); await screen.findByLabelText('称号：绿意常驻');
  fireEvent.click(screen.getByRole('button', { name: '拉黑' }));
  fireEvent.click(screen.getByRole('button', { name: '送咖啡' }));
  fireEvent.click(screen.getByRole('button', { name: '确认拉黑' }));
  await act(async () => { feedReceipt.resolve(); });
  await waitFor(() => expect(communityProfileApi.getPublic).toHaveBeenCalledTimes(2));
  await act(async () => { blockReceipt.resolve(); });
  await waitFor(() => expect(communityProfileApi.getPublic).toHaveBeenCalledTimes(3));
  return { friend, oldRead, latestRead };
}
describe('public profile title privacy projection', () => {
  beforeEach(() => { vi.restoreAllMocks(); Object.assign(features, { friends: true, feed: true, chat: true, farm: true, socialVerification: false }); resetCommunityAuthStoreForTests(); setCommunitySessionTokens('synthetic-public-a'); useCommunityAuthStore.setState({ phase: 'active', user: TOWER_TEST_USER, sessionReady: true }); vi.spyOn(communityProfileApi, 'getPublic').mockResolvedValue(profile()); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });
  it('shows opted-in public suffix but not a private honors collection', async () => {
    show(); expect(await screen.findByLabelText('佩戴称号：工位园丁')).toBeVisible(); expect(screen.getByText('荣誉可见范围由该用户控制。')).toBeVisible();
    expect(screen.queryByText('绿意常驻')).toBeNull();
  });
  it('renders accessible collection badges and handles legacy text entries safely', async () => {
    vi.mocked(communityProfileApi.getPublic).mockResolvedValue(profile({ equippedTitle: null, honors: [{ key: 'farm_25', label: '绿意常驻' }, '旧版纪念'] }));
    show(); expect(await screen.findByLabelText('称号：绿意常驻')).toBeVisible(); expect(screen.getByText('旧版纪念')).toBeVisible(); expect(screen.queryByText('[object Object]')).toBeNull();
  });
  it.each(['blocked_by_me', 'unavailable'] as const)('does not reveal a suffix or honors when the returned profile is %s', async status => {
    vi.mocked(communityProfileApi.getPublic).mockResolvedValue(profile({ honors: [{ key: 'farm_25', label: '绿意常驻' }, '仅原关系可见'], relationship: { ...profile().relationship, status } }));
    show(); await screen.findByRole('heading', { level: 1, name: '档案同事' }); expect(screen.queryByText('工位园丁')).toBeNull();
    expect(screen.queryByText('绿意常驻')).toBeNull(); expect(screen.queryByText('仅原关系可见')).toBeNull();
    expect(within(screen.getByRole('region', { name: '公开荣誉' })).getByText('荣誉可见范围由该用户控制。')).toBeVisible();
  });
  it.each([
    { key: 'unknown-title', label: '假管理员身份' },
    { key: 'farm_first', label: '伪造园丁称号' },
  ])('does not expose an unknown or mismatched title: $label', async title => {
    vi.mocked(communityProfileApi.getPublic).mockResolvedValue(profile({ equippedTitle: title, honors: [title] }));
    show(); await screen.findByRole('heading', { level: 1, name: '档案同事' });
    expect(screen.queryByText(title.label)).toBeNull();
  });
  it('respects the returned honors projection rather than assuming friendship grants it', async () => {
    vi.mocked(communityProfileApi.getPublic).mockResolvedValue(profile({ relationship: { ...profile().relationship, status: 'friend' } }));
    show(); expect(await screen.findByText('荣誉可见范围由该用户控制。')).toBeVisible();
    expect(screen.queryByLabelText('称号：绿意常驻')).toBeNull();
  });
  it('renders server-opened honors for a non-friend and keeps an empty collection distinct from privacy', async () => {
    vi.mocked(communityProfileApi.getPublic).mockResolvedValueOnce(profile({ honors: [{ key: 'farm_25', label: '绿意常驻' }] }));
    const first = show(); expect(await screen.findByLabelText('称号：绿意常驻')).toBeVisible();
    first.unmount(); vi.mocked(communityProfileApi.getPublic).mockResolvedValue(profile({ honors: [] }));
    show(); expect(await screen.findByText('尚未获得荣誉')).toBeVisible();
    expect(screen.queryByText('未向你开放')).toBeNull();
  });
  it('keeps a long nickname, public identifier and biography intact in a single wrapping identity heading', async () => {
    const displayName = '一位名字很长的同事'.repeat(10), publicId = 'synthetic-profile-other', bio = 'https://example.invalid/'.repeat(20);
    vi.mocked(communityProfileApi.getPublic).mockResolvedValue(profile({ displayName, publicId, bio, ipRegion: '浙江' }));
    show(); expect(await screen.findByRole('heading', { level: 1, name: displayName })).toBeVisible();
    expect(screen.getAllByText(displayName)).toHaveLength(1);
    expect(screen.getByText(publicId)).toBeVisible(); expect(screen.getByText('程序员')).toBeVisible();
    expect(within(screen.getByRole('region', { name: '个人简介' })).getByText(bio)).toBeVisible();
    expect(screen.getByText('浙江')).toBeVisible();
  });
  it('only renders public fields and does not start private-profile, growth or wallet requests', async () => {
    const rawResponse = { ...profile(), email: 'private-mail@example.invalid', supportAmount: 'PRIVATE_SUPPORT_150', privateGrowth: 'PRIVATE_GROWTH_999', officeCoins: 'PRIVATE_WALLET_620' };
    vi.mocked(communityProfileApi.getPublic).mockResolvedValue(rawResponse);
    const getMe = vi.spyOn(communityProfileApi, 'getMe'), farmOverview = vi.spyOn(communityFarmApi, 'getOverview'), feedOverview = vi.spyOn(communityFeedsApi, 'getOverview');
    show(); await screen.findByRole('heading', { level: 1, name: '档案同事' });
    expect(screen.queryByText(/private-mail|PRIVATE_SUPPORT|PRIVATE_GROWTH|PRIVATE_WALLET/)).toBeNull();
    expect(getMe).not.toHaveBeenCalled(); expect(farmOverview).not.toHaveBeenCalled(); expect(feedOverview).not.toHaveBeenCalled();
    expect(communityProfileApi.getPublic).toHaveBeenCalledExactlyOnceWith('synthetic-profile-other');
  });
  it('clears the old title, honors and friend actions after blocking even when the refreshed profile is unavailable', async () => {
    let rejectRefresh!: (reason: Error) => void;
    vi.mocked(communityProfileApi.getPublic).mockResolvedValueOnce(profile({
      honors: [{ key: 'farm_25', label: '绿意常驻' }],
      relationship: { ...profile().relationship, status: 'friend', canBlock: true, canFeed: true },
    })).mockReturnValueOnce(new Promise((_resolve, reject) => { rejectRefresh = reject; }));
    vi.spyOn(communityRelationshipsApi, 'block').mockResolvedValue({ status: 'blocked_by_me' });
    show();
    expect(await screen.findByLabelText('佩戴称号：工位园丁')).toBeVisible();
    expect(screen.getByLabelText('称号：绿意常驻')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '拉黑' }));
    fireEvent.click(screen.getByRole('button', { name: '确认拉黑' }));
    await waitFor(() => expect(communityProfileApi.getPublic).toHaveBeenCalledTimes(2));
    expect(screen.queryByLabelText('佩戴称号：工位园丁')).toBeNull();
    expect(screen.queryByLabelText('称号：绿意常驻')).toBeNull();
    expect(screen.queryByRole('button', { name: '送咖啡' })).toBeNull();
    await act(async () => { rejectRefresh(new Error('没有找到对应的用户或记录')); await Promise.resolve(); });
    expect(await screen.findByRole('alert')).toHaveTextContent('没有找到对应的用户或记录');
    expect(screen.queryByText('档案同事')).toBeNull();
    expect(screen.queryByLabelText('佩戴称号：工位园丁')).toBeNull();
    expect(screen.getByRole('button', { name: '重新加载' })).toBeVisible();
  });
  it.each(['friend', 'failed'] as const)('keeps the newest restricted projection when an older concurrent reread finishes with %s', async outcome => {
    const { friend, oldRead, latestRead } = await startConcurrentRereads();
    await act(async () => { latestRead.resolve(profile({ relationship: { ...profile().relationship, status: 'blocked_by_me' }, honors: friend.honors })); });
    expect(await screen.findByRole('button', { name: '解除拉黑' })).toBeVisible();
    await act(async () => { if (outcome === 'friend') oldRead.resolve(friend); else oldRead.reject(new Error('旧好友读取失败')); });
    expect(screen.queryByLabelText('佩戴称号：工位园丁')).toBeNull();
    expect(screen.queryByLabelText('称号：绿意常驻')).toBeNull();
    expect(screen.queryByRole('link', { name: '发私聊' })).toBeNull();
    expect(screen.queryByRole('region', { name: '投喂好友' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: '解除拉黑' })).toBeVisible();
    expect(communityProfileApi.getPublic).toHaveBeenCalledTimes(3);
  });
  it('does not finish loading or repaint old honors when the older read finishes before the latest restricted read', async () => {
    const { friend, oldRead, latestRead } = await startConcurrentRereads();
    await act(async () => { oldRead.resolve(friend); });
    expect(screen.getByText('正在加载公开主页…')).toBeVisible();
    expect(screen.queryByLabelText('称号：绿意常驻')).toBeNull();
    expect(screen.queryByRole('button', { name: '重新加载' })).toBeNull();
    await act(async () => { latestRead.resolve(profile({ relationship: { ...profile().relationship, status: 'unavailable' } })); });
    await screen.findByRole('heading', { level: 1, name: '档案同事' });
    expect(screen.queryByText('正在加载公开主页…')).toBeNull();
    expect(screen.queryByLabelText('佩戴称号：工位园丁')).toBeNull();
    expect(screen.queryByLabelText('称号：绿意常驻')).toBeNull();
    expect(screen.queryByRole('link', { name: '发私聊' })).toBeNull();
  });
  it('cannot paint the previous viewers private honors after an account switch', async () => {
    let resolve!: (value: CommunityPublicProfile) => void;
    vi.mocked(communityProfileApi.getPublic).mockReturnValueOnce(new Promise((yes) => { resolve = yes; })).mockResolvedValue(profile({ displayName: '新会话可见' }));
    show(); await waitFor(() => expect(communityProfileApi.getPublic).toHaveBeenCalledOnce());
    act(() => { setCommunitySessionTokens('synthetic-public-b'); useCommunityAuthStore.setState({ user: { ...TOWER_TEST_USER, publicId: 'viewer-b' } }); });
    await screen.findByRole('heading', { level: 1, name: '新会话可见' });
    await act(async () => { resolve(profile({ displayName: '旧会话私密', honors: ['仅旧好友可见'] })); await Promise.resolve(); });
    expect(screen.queryByText('仅旧好友可见')).toBeNull(); expect(screen.queryByText('旧会话私密')).toBeNull();
  });
  it('immediately clears previous-session honors while rereading the same publicId after a fresh login', async () => {
    let resolveNext!: (value: CommunityPublicProfile) => void;
    vi.mocked(communityProfileApi.getPublic).mockResolvedValueOnce(profile({ honors: ['仅旧登录可见'] })).mockReturnValueOnce(new Promise(resolve => { resolveNext = resolve; }));
    show(); expect(await screen.findByText('仅旧登录可见')).toBeVisible();
    act(() => { setCommunitySessionTokens('synthetic-same-viewer-new-session'); useCommunityAuthStore.setState({ loading: false }); });
    expect(screen.queryByText('仅旧登录可见')).toBeNull();
    expect(screen.queryByLabelText('佩戴称号：工位园丁')).toBeNull();
    await waitFor(() => expect(communityProfileApi.getPublic).toHaveBeenCalledTimes(2));
    await act(async () => { resolveNext(profile({ displayName: '同账号重新核验可见' })); await Promise.resolve(); });
    expect(await screen.findByRole('heading', { level: 1, name: '同账号重新核验可见' })).toBeVisible();
    expect(screen.queryByText('仅旧登录可见')).toBeNull();
  });
  it('ignores a delayed old-session projection when a fresh session keeps the same viewer publicId', async () => {
    let resolveOld!: (value: CommunityPublicProfile) => void;
    vi.mocked(communityProfileApi.getPublic).mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; })).mockResolvedValue(profile({ displayName: '新的同账号会话' }));
    show(); await waitFor(() => expect(communityProfileApi.getPublic).toHaveBeenCalledTimes(1));
    act(() => { setCommunitySessionTokens('synthetic-same-id-next-session'); useCommunityAuthStore.setState({ user: { ...TOWER_TEST_USER } }); });
    expect(await screen.findByRole('heading', { level: 1, name: '新的同账号会话' })).toBeVisible();
    await act(async () => { resolveOld(profile({ displayName: '旧会话档案', honors: ['旧登录私有荣誉'] })); await Promise.resolve(); });
    expect(screen.queryByText('旧会话档案')).toBeNull(); expect(screen.queryByText('旧登录私有荣誉')).toBeNull();
    expect(communityProfileApi.getPublic).toHaveBeenCalledTimes(2);
  });
});
