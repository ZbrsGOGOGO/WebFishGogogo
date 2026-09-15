import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { communityFarmApi } from '../../api/community-farm';
import { communityFeedsApi, type CommunityFeedType } from '../../api/community-feeds';
import { communityProfileApi, type CommunityPublicProfile } from '../../api/community-profile';
import { communityRelationshipsApi } from '../../api/community-relationships';
import { resetCommunityAuthStoreForTests, useCommunityAuthStore } from '../../app/store/community-auth-store';
import { TOWER_TEST_USER } from '../games/demon-tower/test-fixtures';
import { CommunityPublicProfilePage } from './PublicProfilePage';

const features = vi.hoisted(() => ({ friends: true, feed: true, chat: true, farm: true, socialVerification: false }));
vi.mock('../../app/community-nav', () => ({ COMMUNITY_FEATURE_FLAGS: features }));
const otherId = 'synthetic-profile-other';
const publicProfile = (extra: Partial<CommunityPublicProfile> = {}): CommunityPublicProfile => ({
  publicId: otherId, displayName: '互动同事', avatarKey: 'green', battleProfession: 'developer',
  relationship: { status: 'none', canRequest: false, canFeed: false, canEncouragePlant: false, canBlock: false },
  ...extra,
});
const friendProfile = (extra: Partial<CommunityPublicProfile> = {}): CommunityPublicProfile => publicProfile({
  relationship: { ...publicProfile().relationship, status: 'friend', canFeed: true, canEncouragePlant: true, canBlock: true },
  plant: { name: '好友薄荷', appearanceKey: 'desk_mint', careStreak: 5 },
  ...extra,
});
const show = (publicId = otherId) => render(<MemoryRouter initialEntries={[`/users/${encodeURIComponent(publicId)}`]}><Routes>
  <Route path="/users/:publicId" element={<CommunityPublicProfilePage />} />
  <Route path="/me" element={<h1>我的工作台</h1>} />
</Routes></MemoryRouter>);

describe('public profile original social capabilities', () => {
  beforeEach(() => {
    vi.restoreAllMocks(); resetCommunityAuthStoreForTests();
    Object.assign(features, { friends: true, feed: true, chat: true, farm: true, socialVerification: false });
    useCommunityAuthStore.setState({ phase: 'active', user: TOWER_TEST_USER, sessionReady: true });
    vi.spyOn(communityProfileApi, 'getPublic').mockResolvedValue(publicProfile());
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('keeps friend chat, block, all three feeds and plant encouragement in correctly named sections', async () => {
    vi.mocked(communityProfileApi.getPublic).mockResolvedValue(friendProfile());
    show(); await screen.findByRole('heading', { level: 1, name: '互动同事' });
    const actions = screen.getByRole('region', { name: '同事互动' });
    expect(within(actions).getByRole('link', { name: '发私聊' })).toHaveAttribute('href', `/messages/with/${otherId}`);
    expect(within(actions).getByRole('button', { name: '拉黑' })).toBeEnabled();
    const feeds = screen.getByRole('region', { name: '投喂好友' });
    for (const name of ['送咖啡', '送小饼干', '送加油便签']) expect(within(feeds).getByRole('button', { name })).toBeEnabled();
    const plant = screen.getByRole('region', { name: '工位绿植' });
    expect(within(plant).getByText('连续照料 5 天')).toBeVisible();
    expect(within(plant).getByRole('button', { name: '鼓励一下' })).toBeEnabled();
    expect(screen.queryByText(/塔防成绩仅保存在玩家自己的浏览器/)).toBeNull();
    expect(screen.getByText(/正式塔防与本机练习的进度、成绩和奖励分别保存/)).toBeVisible();
  });
  it('does not infer feed or plant visibility from friendship when the server denies those capabilities', async () => {
    vi.mocked(communityProfileApi.getPublic).mockResolvedValue(friendProfile({ relationship: { ...publicProfile().relationship, status: 'friend' } }));
    show(); await screen.findByRole('heading', { name: '互动同事' });
    expect(screen.getByRole('link', { name: '发私聊' })).toBeVisible();
    expect(screen.queryByRole('region', { name: '投喂好友' })).toBeNull();
    expect(screen.queryByRole('region', { name: '工位绿植' })).toBeNull();
    expect(screen.queryByText('好友薄荷')).toBeNull();
    expect(screen.queryByRole('button', { name: '发送好友申请' })).toBeNull();
  });
  it('removes social feature entrances when their independent feature flags are disabled', async () => {
    Object.assign(features, { friends: false, feed: false, chat: false, farm: false });
    vi.mocked(communityProfileApi.getPublic).mockResolvedValue(friendProfile());
    show(); await screen.findByRole('heading', { name: '互动同事' });
    expect(screen.queryByRole('link', { name: '发私聊' })).toBeNull(); expect(screen.queryByRole('button', { name: '拉黑' })).toBeNull();
    expect(screen.queryByRole('region', { name: '投喂好友' })).toBeNull(); expect(screen.queryByRole('region', { name: '工位绿植' })).toBeNull();
    expect(communityProfileApi.getPublic).toHaveBeenCalledExactlyOnceWith(otherId);
  });
  it.each(['friends', 'chat'] as const)('keeps private chat unavailable when %s is off without inventing other restrictions', async flag => {
    features[flag] = false; vi.mocked(communityProfileApi.getPublic).mockResolvedValue(friendProfile());
    show(); await screen.findByRole('heading', { name: '互动同事' });
    expect(screen.queryByRole('link', { name: '发私聊' })).toBeNull();
    expect(screen.getByRole('region', { name: '投喂好友' })).toBeVisible();
    expect(screen.getByRole('region', { name: '工位绿植' })).toBeVisible();
  });
  it('keeps incoming requests directed to the existing friends page', async () => {
    vi.mocked(communityProfileApi.getPublic).mockResolvedValue(publicProfile({ relationship: { ...publicProfile().relationship, status: 'incoming_pending', requestId: 'request-a' } }));
    show(); expect(await screen.findByRole('link', { name: '处理好友申请' })).toHaveAttribute('href', '/friends');
  });
  it('keeps private-chat identifiers URL-encoded on the existing route', async () => {
    const publicId = 'synthetic:id with space';
    vi.mocked(communityProfileApi.getPublic).mockResolvedValue(friendProfile({ publicId }));
    show(publicId); expect(await screen.findByRole('link', { name: '发私聊' })).toHaveAttribute('href', `/messages/with/${encodeURIComponent(publicId)}`);
    expect(communityProfileApi.getPublic).toHaveBeenCalledExactlyOnceWith(publicId);
  });
  it('preserves the existing request payload, idempotency key and refresh', async () => {
    vi.mocked(communityProfileApi.getPublic).mockResolvedValue(publicProfile({ relationship: { ...publicProfile().relationship, canRequest: true } }));
    const send = vi.spyOn(communityRelationshipsApi, 'sendRequest').mockResolvedValue({ status: 'pending' });
    show(); fireEvent.click(await screen.findByRole('button', { name: '发送好友申请' }));
    await waitFor(() => expect(send).toHaveBeenCalledExactlyOnceWith(otherId, expect.any(String)));
    expect(await screen.findByText('好友申请已发送')).toBeVisible();
    await waitFor(() => expect(communityProfileApi.getPublic).toHaveBeenCalledTimes(2));
  });
  it('preserves outgoing cancellation with the server-provided request ID', async () => {
    vi.mocked(communityProfileApi.getPublic).mockResolvedValue(publicProfile({ relationship: { ...publicProfile().relationship, status: 'outgoing_pending', requestId: 'request-a' } }));
    const cancel = vi.spyOn(communityRelationshipsApi, 'cancelRequest').mockResolvedValue();
    show(); fireEvent.click(await screen.findByRole('button', { name: '取消申请' }));
    await waitFor(() => expect(cancel).toHaveBeenCalledExactlyOnceWith('request-a', expect.any(String)));
    expect(await screen.findByText('好友申请已取消')).toBeVisible();
  });
  it('keeps unblock available without re-exposing blocked honors', async () => {
    vi.mocked(communityProfileApi.getPublic).mockResolvedValue(publicProfile({ relationship: { ...publicProfile().relationship, status: 'blocked_by_me' }, honors: [{ key: 'farm_25', label: '绿意常驻' }] }));
    const unblock = vi.spyOn(communityRelationshipsApi, 'unblock').mockResolvedValue();
    show(); fireEvent.click(await screen.findByRole('button', { name: '解除拉黑' }));
    await waitFor(() => expect(unblock).toHaveBeenCalledExactlyOnceWith(otherId, expect.any(String)));
    expect(await screen.findByText('已解除拉黑')).toBeVisible(); expect(screen.queryByText('绿意常驻')).toBeNull();
  });
  it('keeps applicable verification blocking writes while preserving private-chat read navigation', async () => {
    features.socialVerification = true;
    useCommunityAuthStore.setState({ user: { ...TOWER_TEST_USER, socialVerificationStatus: 'unverified' } });
    vi.mocked(communityProfileApi.getPublic).mockResolvedValue(friendProfile());
    const send = vi.spyOn(communityFeedsApi, 'send'), encourage = vi.spyOn(communityFarmApi, 'encourage');
    show(); expect(await screen.findByRole('link', { name: '查看身份核验状态' })).toHaveAttribute('href', '/settings/verification');
    for (const name of ['送咖啡', '送小饼干', '送加油便签', '鼓励一下']) {
      const button = screen.getByRole('button', { name }); expect(button).toBeDisabled(); fireEvent.click(button);
    }
    expect(send).not.toHaveBeenCalled(); expect(encourage).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: '发私聊' })).toHaveAttribute('href', `/messages/with/${otherId}`);
  });
  it('keeps request writes disabled for an unverified viewer', async () => {
    features.socialVerification = true;
    useCommunityAuthStore.setState({ user: { ...TOWER_TEST_USER, socialVerificationStatus: 'unverified' } });
    vi.mocked(communityProfileApi.getPublic).mockResolvedValue(publicProfile({ relationship: { ...publicProfile().relationship, canRequest: true } }));
    const send = vi.spyOn(communityRelationshipsApi, 'sendRequest');
    show(); const button = await screen.findByRole('button', { name: '发送好友申请' });
    expect(button).toBeDisabled(); fireEvent.click(button); expect(send).not.toHaveBeenCalled();
  });
  it.each([
    { type: 'coffee', button: '送咖啡' }, { type: 'cookie', button: '送小饼干' }, { type: 'cheer_note', button: '送加油便签' },
  ] satisfies { type: CommunityFeedType; button: string }[])('preserves $type feeding without adding a new reward or request', async ({ type, button }) => {
    vi.mocked(communityProfileApi.getPublic).mockResolvedValue(friendProfile());
    const send = vi.spyOn(communityFeedsApi, 'send').mockResolvedValue({ event: { id: 'feed-a', direction: 'sent', type, user: { publicId: otherId, displayName: '互动同事', avatarKey: 'green', battleProfession: 'developer' }, createdAt: '2026-09-15T00:00:00Z' }, sentToday: 1, sendDailyLimit: 5 });
    show(); fireEvent.click(await screen.findByRole('button', { name: button }));
    await waitFor(() => expect(send).toHaveBeenCalledExactlyOnceWith({ recipientPublicId: otherId, type }, expect.any(String)));
    expect(await screen.findByText(`投喂成功：${type}`)).toBeVisible();
    await waitFor(() => expect(communityProfileApi.getPublic).toHaveBeenCalledTimes(2));
  });
  it('preserves plant encouragement animation, feedback and timer cleanup without fetching balances', async () => {
    vi.mocked(communityProfileApi.getPublic).mockResolvedValue(friendProfile());
    const encourage = vi.spyOn(communityFarmApi, 'encourage').mockResolvedValue({ acknowledged: true });
    const overview = vi.spyOn(communityFarmApi, 'getOverview'), clear = vi.spyOn(window, 'clearTimeout'), schedule = vi.spyOn(window, 'setTimeout');
    const view = show(); fireEvent.click(await screen.findByRole('button', { name: '鼓励一下' }));
    await waitFor(() => expect(encourage).toHaveBeenCalledExactlyOnceWith(otherId, expect.any(String)));
    expect(await screen.findByText('鼓励已送达')).toBeVisible();
    expect(screen.getByText('好友薄荷').closest('[data-encouraged]')).toHaveAttribute('data-encouraged', 'true');
    expect(overview).not.toHaveBeenCalled(); expect(communityProfileApi.getPublic).toHaveBeenCalledTimes(1);
    const encouragementTimerCall = schedule.mock.calls.findIndex(([, delay]) => delay === 1800);
    expect(encouragementTimerCall).toBeGreaterThanOrEqual(0);
    const timerHandle = schedule.mock.results[encouragementTimerCall].value;
    clear.mockClear(); view.unmount(); expect(clear).toHaveBeenCalledWith(timerHandle);
  });
  it.each(['feed', 'block', 'encourage'] as const)('does not reread or schedule animation after an unmounted workspace receives a late %s receipt', async operation => {
    let finish!: () => void;
    const receipt = new Promise<void>(resolve => { finish = resolve; });
    vi.mocked(communityProfileApi.getPublic).mockResolvedValue(friendProfile());
    const send = vi.spyOn(communityFeedsApi, 'send').mockImplementation(async () => {
      await receipt;
      return { event: { id: 'feed-late', direction: 'sent', type: 'coffee', user: { publicId: otherId, displayName: '互动同事', avatarKey: 'green', battleProfession: 'developer' }, createdAt: '2026-09-15T00:00:00Z' }, sentToday: 1, sendDailyLimit: 5 };
    });
    const block = vi.spyOn(communityRelationshipsApi, 'block').mockImplementation(async () => { await receipt; return { status: 'blocked_by_me' }; });
    const encourage = vi.spyOn(communityFarmApi, 'encourage').mockImplementation(async () => { await receipt; return { acknowledged: true }; });
    const schedule = vi.spyOn(window, 'setTimeout');
    const view = show(); await screen.findByRole('heading', { level: 1, name: '互动同事' });
    if (operation === 'feed') fireEvent.click(screen.getByRole('button', { name: '送咖啡' }));
    else if (operation === 'block') {
      fireEvent.click(screen.getByRole('button', { name: '拉黑' }));
      fireEvent.click(screen.getByRole('button', { name: '确认拉黑' }));
    } else fireEvent.click(screen.getByRole('button', { name: '鼓励一下' }));
    expect(operation === 'feed' ? send : operation === 'block' ? block : encourage).toHaveBeenCalledOnce();
    view.unmount(); schedule.mockClear();
    await act(async () => { finish(); });
    expect(communityProfileApi.getPublic).toHaveBeenCalledExactlyOnceWith(otherId);
    expect(schedule.mock.calls.some(([, delay]) => delay === 1800)).toBe(false);
  });
  it('retains visitor login interaction instead of making authenticated writes', async () => {
    useCommunityAuthStore.setState({ phase: 'guest', user: null });
    show(); expect(await screen.findByRole('link', { name: '登录后互动' })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('button', { name: '发送好友申请' })).toBeNull();
    expect(screen.queryByRole('link', { name: '发私聊' })).toBeNull();
  });
  it('retains the self-profile redirect to the private workbench', async () => {
    useCommunityAuthStore.setState({ user: { ...TOWER_TEST_USER, publicId: otherId } });
    show(); expect(await screen.findByRole('heading', { name: '我的工作台' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: '互动同事' })).toBeNull();
  });
});
