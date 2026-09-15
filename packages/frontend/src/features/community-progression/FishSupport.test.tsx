import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fishProgressView, type CommunityMembershipView, type SupportAdminView, type SupportEntryView } from '@stealth-reader/shared';
import { communityProgressionApi } from '../../api/community-progression';
import { communityAuthApi } from '../../api/community-auth';
import { CommunityApiError, getCommunitySessionGeneration, setCommunitySessionTokens } from '../../api/community-http';
import { useCommunityAuthStore, resetCommunityAuthStoreForTests } from '../../app/store/community-auth-store';
import { TOWER_TEST_USER } from '../games/demon-tower/test-fixtures';
import { FishGrowthSummary } from './FishGrowthSummary';
import { FISH_EVENT, isFishGamePath, useFishActivity, type FishEventDetail } from './useFishActivity';
import { SupportAdminPanel } from './SupportAdminPanel';
import { beijingMembershipDate, CommunityVipSummary, membershipRemaining } from './CommunityVipSummary';

vi.mock('../../app/community-nav', () => ({ COMMUNITY_FEATURE_FLAGS: { communityProgressionEnabled: true } }));
const wrapper = ({ children }: { children: React.ReactNode }) => <MemoryRouter initialEntries={['/games/ballpoint-breach/arena']}>{children}</MemoryRouter>;
const totals = { orders: 0, months: 0, amountFen: 0, currency: 'CNY' as const };
const adminView: SupportAdminView = { totals, grossTotals: totals, activeHolders: 0, entries: [], hasMore: false };
const member: CommunityMembershipView = { active: true, startsAt: '2099-09-01T00:00:00Z', expiresAt: '2099-10-01T00:00:00Z', source: 'afdian_support', benefits: ['demon_tower_auto_explore'] };
const entry: SupportEntryView = { id: 'synthetic-ledger-1', username: 'growth_user', displayName: '很长的期权持有者昵称和称号测试', orderHint: '123456', amountFen: 1599, months: 1, startsAt: member.startsAt!, expiresAt: member.expiresAt!, createdAt: '2099-08-31T12:00:00Z', revokedAt: null };
const filledAdmin: SupportAdminView = { totals: { ...totals, amountFen: 1599, months: 1, orders: 1 }, grossTotals: { ...totals, amountFen: 3198, months: 2, orders: 2 }, activeHolders: 1, entries: [entry], hasMore: true };
function emitFish(progress: ReturnType<typeof fishProgressView>, generation = getCommunitySessionGeneration(), owner = TOWER_TEST_USER.publicId): void {
  window.dispatchEvent(new CustomEvent<FishEventDetail>(FISH_EVENT, { detail: { owner, generation, progress } }));
}
function fillGrant(amount = '15.99'): void {
  fireEvent.change(screen.getByLabelText('用户登录账号'), { target: { value: 'growth_user' } });
  fireEvent.change(screen.getByLabelText('爱发电订单号'), { target: { value: 'SYNTH-12345' } });
  fireEvent.change(screen.getByLabelText('实际支持金额（人民币元）'), { target: { value: amount } });
  fireEvent.click(screen.getByRole('checkbox'));
}
describe('fish activity and supporter management UI', () => {
  beforeEach(() => {
    resetCommunityAuthStoreForTests(); useCommunityAuthStore.setState({ phase: 'active', user: TOWER_TEST_USER, sessionReady: true });
    vi.spyOn(document, 'hasFocus').mockReturnValue(true); vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    vi.spyOn(communityProgressionApi, 'heartbeat').mockResolvedValue(fishProgressView());
    vi.spyOn(communityProgressionApi, 'supportAdmin').mockResolvedValue(adminView);
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
  it('sends no claimed duration/XP and stops after three inactive minutes', async () => {
    vi.useFakeTimers(); renderHook(useFishActivity, { wrapper });
    await act(async () => { await Promise.resolve(); });
    expect(communityProgressionApi.heartbeat).toHaveBeenCalledOnce();
    expect(vi.mocked(communityProgressionApi.heartbeat).mock.calls[0][0]).toEqual({ mode: 'game', sequence: 1, tabId: expect.any(String) });
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); });
    expect(vi.mocked(communityProgressionApi.heartbeat).mock.lastCall?.[0].mode).toBe('pause');
    const calls = vi.mocked(communityProgressionApi.heartbeat).mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); }); expect(communityProgressionApi.heartbeat).toHaveBeenCalledTimes(calls);
  });
  it('remembers hiding while a heartbeat is in flight, so refocus cannot claim hidden time', async () => {
    vi.useFakeTimers(); let resolve!: (value: ReturnType<typeof fishProgressView>) => void;
    vi.mocked(communityProgressionApi.heartbeat).mockImplementationOnce(() => new Promise(yes => { resolve = yes; }));
    renderHook(useFishActivity, { wrapper });
    vi.mocked(document.hasFocus).mockReturnValue(false); fireEvent.blur(window);
    vi.mocked(document.hasFocus).mockReturnValue(true); fireEvent.focus(window);
    await act(async () => { resolve(fishProgressView()); });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(vi.mocked(communityProgressionApi.heartbeat).mock.lastCall?.[0].mode).toBe('pause');
  });
  it('never tracks guests and cancels pending results on logout/unmount', async () => {
    useCommunityAuthStore.setState({ phase: 'guest', user: null }); renderHook(useFishActivity, { wrapper });
    expect(communityProgressionApi.heartbeat).not.toHaveBeenCalled();
    cleanup(); useCommunityAuthStore.setState({ phase: 'active', user: TOWER_TEST_USER });
    const event = vi.fn(); window.addEventListener(FISH_EVENT, event);
    let resolve!: (value: ReturnType<typeof fishProgressView>) => void;
    vi.mocked(communityProgressionApi.heartbeat).mockImplementation(() => new Promise(yes => { resolve = yes; }));
    const hook = renderHook(useFishActivity, { wrapper }); hook.unmount();
    await act(async () => { resolve(fishProgressView(500)); }); expect(event).not.toHaveBeenCalled(); window.removeEventListener(FISH_EVENT, event);
  });
  it('discards a previous same-account session heartbeat and cannot send further stale ticks', async () => {
    vi.useFakeTimers();
    const event = vi.fn(); window.addEventListener(FISH_EVENT, event);
    let resolve!: (value: ReturnType<typeof fishProgressView>) => void;
    vi.mocked(communityProgressionApi.heartbeat).mockImplementationOnce(() => new Promise(yes => { resolve = yes; }));
    renderHook(useFishActivity, { wrapper });
    // A fresh login may use the same public account id; owner alone is not a session boundary.
    setCommunitySessionTokens(null); setCommunitySessionTokens('synthetic-new-login');
    await act(async () => { resolve(fishProgressView(500)); });
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(event).not.toHaveBeenCalled(); expect(communityProgressionApi.heartbeat).toHaveBeenCalledOnce();
    window.removeEventListener(FISH_EVENT, event);
  });
  it('restores a new same-account login tracker with a fresh tab and sequence, isolating the old pending reply', async () => {
    vi.useFakeTimers();
    let resolveOld!: (progress: ReturnType<typeof fishProgressView>) => void, resolveLogin!: () => void;
    const heartbeat = vi.mocked(communityProgressionApi.heartbeat).mockResolvedValue(fishProgressView(2));
    heartbeat.mockImplementationOnce(() => new Promise(yes => { resolveOld = yes; }));
    const loginGate = new Promise<void>(yes => { resolveLogin = yes; });
    vi.spyOn(communityAuthApi, 'login').mockImplementationOnce(async () => {
      await loginGate;
      setCommunitySessionTokens('synthetic-published-login', 'synthetic-csrf');
      return { accessToken: 'synthetic-published-login', user: { ...TOWER_TEST_USER } };
    });
    const event = vi.fn(); window.addEventListener(FISH_EVENT, event);
    renderHook(useFishActivity, { wrapper });
    const oldTab = heartbeat.mock.calls[0][0].tabId, oldSignal = heartbeat.mock.calls[0][1];
    let login!: ReturnType<ReturnType<typeof useCommunityAuthStore.getState>['login']>;
    act(() => { login = useCommunityAuthStore.getState().login({ username: 'synthetic-user', password: 'synthetic-test-password' }); });
    expect(useCommunityAuthStore.getState()).toMatchObject({ phase: 'active', loading: true, user: { publicId: TOWER_TEST_USER.publicId } });
    expect(oldSignal?.aborted).toBe(true); expect(heartbeat).toHaveBeenCalledOnce();
    // No heartbeat starts in the login interval, while the old token is absent.
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); }); expect(heartbeat).toHaveBeenCalledOnce();
    await act(async () => { resolveLogin(); await login; });
    expect(heartbeat).toHaveBeenCalledTimes(2);
    const newTab = heartbeat.mock.calls[1][0].tabId;
    expect(newTab).not.toBe(oldTab); expect(heartbeat.mock.calls[1][0]).toEqual({ tabId: newTab, sequence: 1, mode: 'game' });
    expect((event.mock.calls[0][0] as CustomEvent<FishEventDetail>).detail).toEqual({ owner: TOWER_TEST_USER.publicId, generation: getCommunitySessionGeneration(), progress: fishProgressView(2) });
    await act(async () => { resolveOld(fishProgressView(500)); }); expect(event).toHaveBeenCalledOnce();
    // Ordinary profile/auth metadata updates do not reset a session's timer.
    act(() => useCommunityAuthStore.setState({ error: 'synthetic-metadata-update' })); expect(heartbeat).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(heartbeat).toHaveBeenCalledTimes(3); expect(heartbeat.mock.calls[2][0]).toEqual({ tabId: newTab, sequence: 2, mode: 'game' });
    expect(event).toHaveBeenCalledTimes(2); window.removeEventListener(FISH_EVENT, event);
  });
  it('publishes actual heartbeat progress with a session generation and unchanged business payload', async () => {
    const event = vi.fn(); window.addEventListener(FISH_EVENT, event);
    vi.mocked(communityProgressionApi.heartbeat).mockResolvedValueOnce(fishProgressView(2));
    const generation = getCommunitySessionGeneration(); renderHook(useFishActivity, { wrapper });
    await waitFor(() => expect(event).toHaveBeenCalledOnce());
    expect((event.mock.calls[0][0] as CustomEvent<FishEventDetail>).detail).toEqual({ owner: TOWER_TEST_USER.publicId, generation, progress: fishProgressView(2) });
    expect(vi.mocked(communityProgressionApi.heartbeat).mock.calls[0][0]).toEqual({ mode: 'game', sequence: 1, tabId: expect.any(String) });
    window.removeEventListener(FISH_EVENT, event);
  });
  it('classifies real game workspaces, not the game directory', () => {
    for (const path of ['/games/ballpoint-breach/arena', '/games/demon-tower', '/games/zhengdao', '/tower-defense', '/tower-defense/practice']) expect(isFishGamePath(path)).toBe(true);
    for (const path of ['/', '/me', '/games', '/games/rooms', '/games/leaderboards/snake', '/games/demon-tower/leaderboard', '/achievements']) expect(isFishGamePath(path)).toBe(false);
  });
  it('keeps one tracker across standalone tools and games, pauses at route/cover boundaries, then resumes', async () => {
    vi.useFakeTimers();
    let go!: ReturnType<typeof useNavigate>;
    function Tracker() { go = useNavigate(); useFishActivity(); return null; }
    render(<MemoryRouter initialEntries={['/tools/timer']}><Tracker /></MemoryRouter>);
    await act(async () => { await Promise.resolve(); });
    const spy = vi.mocked(communityProgressionApi.heartbeat), tab = spy.mock.calls[0][0].tabId;
    expect(spy.mock.lastCall?.[0].mode).toBe('browse');
    await act(async () => { go('/games/snake'); });
    expect(spy.mock.lastCall?.[0].mode).toBe('pause');
    // A second boundary while already paused must not leave needsPause stuck forever.
    await act(async () => { go('/games/tetris'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(spy.mock.lastCall?.[0]).toMatchObject({ tabId: tab, mode: 'game' });
    const cover = document.createElement('div'); document.body.append(cover);
    await act(async () => { cover.setAttribute('data-activity-covered', 'true'); await Promise.resolve(); });
    expect(spy.mock.lastCall?.[0].mode).toBe('pause');
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(spy.mock.lastCall?.[0].mode).toBe('browse');
    await act(async () => { go('/tools/calculator'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(spy.mock.lastCall?.[0]).toMatchObject({ tabId: tab, mode: 'browse' });
    expect(new Set(spy.mock.calls.map(c => c[0].sequence)).size).toBe(spy.mock.calls.length);
    cover.remove();
  });
  it('shows six ranks, exact progress, and privacy/rate-cap instructions', () => {
    render(<FishGrowthSummary initial={fishProgressView(600, 36000, 3600, 60, 60)} />, { wrapper });
    expect(screen.getByRole('heading', { name: '摸鱼达人' })).toBeVisible();
    expect(screen.getByRole('progressbar')).toHaveAttribute('max', '1200'); expect(screen.getByRole('progressbar')).toHaveAttribute('value', '0'); expect(screen.getAllByRole('listitem')).toHaveLength(6);
    expect(screen.getByText('今日新增')).toBeVisible(); expect(screen.getByText('+2')).toBeVisible(); expect(screen.getByText('/ 360 点')).toBeVisible();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '距离打窝仙人还差1200点');
    expect(screen.getByText(/只保留汇总时长/)).toBeInTheDocument();
  });
  it('shows interval progress and a truthful complete highest-rank path', () => {
    const view = render(<FishGrowthSummary initial={fishProgressView(900)} />, { wrapper });
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '300'); expect(screen.getByRole('progressbar')).toHaveAttribute('max', '1200');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '距离打窝仙人还差900点');
    view.rerender(<FishGrowthSummary initial={fishProgressView(12001)} />);
    expect(screen.getByRole('heading', { name: '摸鱼之王' })).toBeVisible(); expect(screen.getByText('总指数仍可继续积累')).toBeVisible();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '已抵达最高境界');
    expect(screen.getAllByRole('listitem').every(item => item.getAttribute('data-unlocked') === 'true')).toBe(true);
  });
  it('does not invent missing older-server fish data, including the compact summary', () => {
    const view = render(<FishGrowthSummary compact />, { wrapper }); expect(view.container).toBeEmptyDOMElement();
    view.rerender(<FishGrowthSummary compact initial={fishProgressView()} />);
    expect(screen.getByRole('link', { name: /成长指数 0/ })).toHaveAttribute('href', '/achievements');
    expect(screen.getByText('初入鱼场 · 今日 +0 / 360 点')).toBeVisible();
    expect(screen.getByRole('progressbar')).toHaveAttribute('max', '1'); expect(screen.getByRole('progressbar')).toHaveAttribute('value', '0');
  });
  it('rejects wrong-owner and old-generation events and accepts current-session progress', () => {
    const initial = fishProgressView(120), oldGeneration = getCommunitySessionGeneration();
    const view = render(<FishGrowthSummary initial={initial} />, { wrapper });
    act(() => emitFish(fishProgressView(600), oldGeneration, 'different-synthetic-owner'));
    expect(screen.getByRole('heading', { name: '摸鱼小将' })).toBeVisible();
    setCommunitySessionTokens(null); setCommunitySessionTokens('synthetic-new-login');
    view.rerender(<FishGrowthSummary initial={initial} />);
    act(() => emitFish(fishProgressView(600), oldGeneration)); expect(screen.getByRole('heading', { name: '摸鱼小将' })).toBeVisible();
    act(() => emitFish(fishProgressView(600))); expect(screen.getByRole('heading', { name: '摸鱼达人' })).toBeVisible();
  });
  it('lets fresh same-account server data reset today even when cumulative experience is unchanged', () => {
    const initial = fishProgressView(600);
    const view = render(<FishGrowthSummary initial={initial} />, { wrapper });
    act(() => emitFish(fishProgressView(600, 36000, 3600, 60, 60))); expect(screen.getByText('+2')).toBeVisible();
    view.rerender(<FishGrowthSummary initial={fishProgressView(600)} />);
    expect(screen.getByText('+0')).toBeVisible(); expect(screen.queryByText('+2')).not.toBeInTheDocument();
    act(() => emitFish(fishProgressView(599, 0, 0, 60, 0))); expect(screen.getByText('+0')).toBeVisible();
  });
  it('shows supporter status and private aggregate amounts without a checkout or financial promise', () => {
    render(<CommunityVipSummary vip={member} support={{ ...totals, amountFen: 1599, months: 2, orders: 1 }} serverNow="2099-09-10T00:00:00Z" giftDays={30} />, { wrapper });
    expect(screen.getByRole('heading', { name: '期权持有者' })).toBeVisible(); expect(screen.getByText('支持权益有效')).toBeVisible();
    const ledger = within(screen.getByRole('region', { name: '已核验累计支持' }));
    expect(ledger.getByText('¥15.99')).toBeVisible(); expect(ledger.getByText('登记月数')).toBeVisible(); expect(ledger.getByText('2')).toBeVisible(); expect(ledger.getByText('登记笔数')).toBeVisible();
    expect(screen.getByText(/不代表真实股权/)).not.toBeVisible();
    fireEvent.click(screen.getByText('权益、赠送与支持说明'));
    expect(screen.getByText(/不代表真实股权/)).toBeVisible(); expect(screen.getByRole('link', { name: /爱发电主页/ })).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText('2099/10/01 08:00:00').parentElement).toHaveTextContent('截止 2099/10/01 08:00:00（北京时间）');
  });
  it.each([
    ['赠送有效期内', { ...member, source: 'launch_gift' as const }],
    ['权益有效', { ...member, source: null }],
    ['当前未开通', { active: false, startsAt: null, expiresAt: null, source: null, benefits: [] }],
    ['权益已到期', { ...member, expiresAt: '2099-09-09T23:59:59Z' }],
    ['等待生效', { ...member, startsAt: '2099-09-11T00:00:00Z' }],
    ['当前未生效', { ...member, active: false }],
    ['权益状态待确认', { ...member, startsAt: 'invalid-date' }],
    ['权益状态待确认', { ...member, expiresAt: null }],
  ] as [string, CommunityMembershipView][])('accurately presents %s without assigning eligibility', (label, vip) => {
    render(<CommunityVipSummary vip={vip} serverNow="2099-09-10T00:00:00Z" giftDays={30} />, { wrapper });
    expect(screen.getByText(label)).toBeVisible(); expect(screen.queryByText('支持权益有效')).not.toBeInTheDocument();
    expect(screen.getByText('支持总量暂未同步，不推算历史金额。')).toBeVisible(); expect(screen.queryByText('¥0.00')).not.toBeInTheDocument();
    if (label === '等待生效') { expect(screen.getByText('距记录截止时间 · 尚未生效')).toBeVisible(); expect(screen.getByText('2099/09/11 08:00:00').parentElement).toHaveTextContent('生效 2099/09/11 08:00:00（北京时间）'); }
  });
  it('updates expiry from the monotonic server clock, not a local client date', () => {
    vi.useFakeTimers(); let elapsed = 0; vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
    render(<CommunityVipSummary vip={{ ...member, expiresAt: '2099-09-10T00:00:29Z' }} serverNow="2099-09-10T00:00:00Z" giftDays={30} support={totals} />, { wrapper });
    expect(screen.getByText('支持权益有效')).toBeVisible(); expect(screen.getByText('¥0.00')).toBeVisible();
    elapsed = 30_000; act(() => vi.advanceTimersByTime(30_000));
    expect(screen.getByText('权益已到期')).toBeVisible(); expect(screen.getByText('已到期')).toBeVisible();
    expect(screen.queryByText('支持权益有效')).not.toBeInTheDocument();
  });
  it('formats explicit Beijing timestamps and keeps countdown helper compatibility', () => {
    expect(beijingMembershipDate('2099-10-01T00:00:00Z')).toBe('2099/10/01 08:00:00');
    expect(beijingMembershipDate('invalid-date')).toBe('时间记录待确认');
    expect(membershipRemaining(null, 0)).toBe('未获赠'); expect(membershipRemaining('invalid-date', 0)).toBe('已到期');
    expect(membershipRemaining('2099-10-01T00:00:00Z', Date.parse('2099-09-30T23:59:59Z'))).toBe('0 小时 1 分钟');
  });
  it('requires verification and retries the identical order UUID after an uncertain response', async () => {
    const spy = vi.spyOn(communityProgressionApi, 'supportGrant').mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ replayed: true, id: 'synthetic' });
    render(<SupportAdminPanel writesEnabled />, { wrapper }); await screen.findByText(/还没有支持登记/);
    fireEvent.change(screen.getByLabelText('用户登录账号'), { target: { value: 'growth_user' } });
    fireEvent.change(screen.getByLabelText('爱发电订单号'), { target: { value: 'SYNTH-12345' } });
    fireEvent.change(screen.getByLabelText('实际支持金额（人民币元）'), { target: { value: '15.99' } });
    fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: '登记并授予' }));
    await screen.findByRole('button', { name: '确认上次登记' }); expect(screen.getByLabelText('用户登录账号')).toBeDisabled();
    expect(spy.mock.calls[0][0]).toMatchObject({ amountFen: 1599, confirmed: true, months: 1 });
    fireEvent.click(screen.getByRole('button', { name: '确认上次登记' })); await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(spy.mock.calls[0][0]).toEqual(spy.mock.calls[1][0]); expect(await screen.findByText(/原登记成功，未重复发放/)).toBeVisible();
  });
  it('disables supporter grants while the site is read-only', async () => {
    render(<SupportAdminPanel writesEnabled={false} />, { wrapper }); await screen.findByText(/还没有支持登记/);
    expect(screen.getByRole('button', { name: '登记并授予' })).toBeDisabled();
    const grant = vi.spyOn(communityProgressionApi, 'supportGrant');
    fireEvent.submit(screen.getByRole('form', { name: '核验后授予表单' })); expect(grant).not.toHaveBeenCalled();
  });
  it('distinguishes loading and failed reads from an actual empty ledger, with explicit retry', async () => {
    let reject!: (error: Error) => void;
    vi.mocked(communityProgressionApi.supportAdmin).mockImplementationOnce(() => new Promise((_resolve, no) => { reject = no; }));
    render(<SupportAdminPanel writesEnabled />, { wrapper });
    expect(screen.getByText('正在读取支持台账…')).toBeVisible(); expect(screen.queryByText('¥0.00')).not.toBeInTheDocument(); expect(screen.queryByText('还没有支持登记')).not.toBeInTheDocument();
    await act(async () => { reject(new Error('offline')); });
    expect(screen.getByRole('alert')).toHaveTextContent('支持台账暂未同步'); expect(screen.queryByText('正在读取支持台账…')).not.toBeInTheDocument(); expect(screen.queryByText('¥0.00')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重新读取台账' }));
    await screen.findByText('还没有支持登记'); expect(communityProgressionApi.supportAdmin).toHaveBeenCalledTimes(2);
    expect(within(screen.getByLabelText('有效支持累计')).getByText('¥0.00')).toBeVisible();
  });
  it('aborts a read on unmount and does not let an old response replace a newer view', async () => {
    let resolve!: (value: SupportAdminView) => void;
    vi.mocked(communityProgressionApi.supportAdmin).mockImplementationOnce(() => new Promise(yes => { resolve = yes; }));
    const first = render(<SupportAdminPanel writesEnabled />, { wrapper });
    const signal = vi.mocked(communityProgressionApi.supportAdmin).mock.calls[0][1]; first.unmount(); expect(signal?.aborted).toBe(true);
    render(<SupportAdminPanel writesEnabled />, { wrapper }); await screen.findByText('还没有支持登记');
    await act(async () => { resolve(filledAdmin); });
    expect(screen.queryByText(entry.displayName!)).not.toBeInTheDocument(); expect(screen.getByText('还没有支持登记')).toBeVisible();
  });
  it('separates effective and gross totals and displays real dates, order tails and audit records', async () => {
    vi.mocked(communityProgressionApi.supportAdmin).mockResolvedValue({ ...filledAdmin, entries: [entry, { ...entry, id: 'synthetic-revoked-2', revokedAt: '2099-09-01T13:00:00Z', displayName: null, username: null, orderHint: null }] });
    render(<SupportAdminPanel writesEnabled />, { wrapper }); await screen.findByText(entry.displayName!);
    const effective = within(screen.getByLabelText('有效支持累计'));
    expect(effective.getByText('¥15.99')).toBeVisible(); expect(effective.queryByText('¥31.98')).not.toBeInTheDocument();
    expect(screen.getByText('1 个月 · 订单尾号 123456')).toBeVisible(); expect(screen.getByText('已匿名化用户')).toBeVisible(); expect(screen.getByText('1 个月 · 订单尾号 已清除')).toBeVisible();
    expect(screen.getAllByText(/生效 2099\/09\/01 08:00:00/)).toHaveLength(2); expect(screen.getByText('已作废')).toBeVisible();
    expect(screen.getAllByRole('button', { name: '作废这笔登记' })).toHaveLength(1);
    expect(screen.getByText('凭据 synthetic-ledger-1')).not.toBeVisible(); fireEvent.click(screen.getAllByText('登记审计信息')[0]); expect(screen.getByText('凭据 synthetic-ledger-1')).toBeVisible();
    expect(screen.getByText(/原始累计（含作废）：¥31.98/)).not.toBeVisible(); fireEvent.click(screen.getByText('台账口径与授予边界')); expect(screen.getByText(/原始累计（含作废）：¥31.98/)).toBeVisible();
  });
  it('does not write without the original amount/month/verification boundaries', async () => {
    const grant = vi.spyOn(communityProgressionApi, 'supportGrant'); render(<SupportAdminPanel writesEnabled />, { wrapper }); await screen.findByText('还没有支持登记');
    fillGrant('15.999'); fireEvent.submit(screen.getByRole('form', { name: '核验后授予表单' })); expect(screen.getByRole('status')).toHaveTextContent('最多两位小数'); expect(grant).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('实际支持金额（人民币元）'), { target: { value: '15.99' } });
    fireEvent.change(screen.getByLabelText('授予月数（每月 30 天）'), { target: { value: '13' } }); fireEvent.submit(screen.getByRole('form', { name: '核验后授予表单' })); expect(grant).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('授予月数（每月 30 天）'), { target: { value: '1' } }); fireEvent.click(screen.getByRole('checkbox')); fireEvent.submit(screen.getByRole('form', { name: '核验后授予表单' })); expect(grant).not.toHaveBeenCalled();
  });
  it('retains an uncertain grant lock through an explicit read refresh and blocks paging/revoke', async () => {
    vi.mocked(communityProgressionApi.supportAdmin).mockResolvedValue(filledAdmin);
    const grant = vi.spyOn(communityProgressionApi, 'supportGrant').mockRejectedValue(new Error('offline'));
    const revoke = vi.spyOn(communityProgressionApi, 'supportRevoke');
    render(<SupportAdminPanel writesEnabled />, { wrapper }); await screen.findByText(entry.displayName!); fillGrant(); fireEvent.click(screen.getByRole('button', { name: '登记并授予' }));
    await screen.findByRole('button', { name: '确认上次登记' });
    fireEvent.click(screen.getByRole('button', { name: '刷新支持记录' })); await screen.findByText(entry.displayName!);
    expect(screen.getByLabelText('用户登录账号')).toBeDisabled(); expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled(); expect(screen.getByRole('button', { name: '作废这笔登记' })).toBeDisabled();
    expect(grant).toHaveBeenCalledOnce(); expect(revoke).not.toHaveBeenCalled();
  });
  it('does not revoke a cancelled confirmation and preserves the original audit warning', async () => {
    vi.mocked(communityProgressionApi.supportAdmin).mockResolvedValue(filledAdmin);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false), revoke = vi.spyOn(communityProgressionApi, 'supportRevoke');
    render(<SupportAdminPanel writesEnabled />, { wrapper }); await screen.findByText(entry.displayName!);
    fireEvent.click(screen.getByRole('button', { name: '作废这笔登记' })); expect(revoke).not.toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledWith('确认作废这笔登记？对应期限将失效，保留作废审计。不处理站外退款，不移动其他登记的起止时间。');
    expect(screen.getByRole('button', { name: '登记并授予' })).toBeEnabled();
  });
  it('locks uncertain revoke to the exact id until explicit confirmation without automatically retrying', async () => {
    vi.mocked(communityProgressionApi.supportAdmin).mockResolvedValue(filledAdmin); const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const revoke = vi.spyOn(communityProgressionApi, 'supportRevoke').mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ revoked: true });
    const grant = vi.spyOn(communityProgressionApi, 'supportGrant');
    render(<SupportAdminPanel writesEnabled />, { wrapper }); await screen.findByText(entry.displayName!);
    fireEvent.click(screen.getByRole('button', { name: '作废这笔登记' })); await screen.findByRole('button', { name: '确认上次作废' });
    expect(screen.getByRole('button', { name: '登记并授予' })).toBeDisabled(); expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled();
    fireEvent.submit(screen.getByRole('form', { name: '核验后授予表单' })); expect(grant).not.toHaveBeenCalled(); expect(revoke).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: '刷新支持记录' })); await screen.findByText(entry.displayName!);
    expect(screen.getByRole('button', { name: '确认上次作废' })).toBeVisible(); expect(revoke).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: '确认上次作废' })); await screen.findByText(/已作废该登记；如存在后续登记/);
    expect(revoke.mock.calls.map(call => call[0])).toEqual([entry.id, entry.id]); expect(confirm).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: '确认上次作废' })).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: '登记并授予' })).toBeEnabled();
  });
  it('releases a definitively rejected revoke without treating it as uncertain or expanding permission', async () => {
    vi.mocked(communityProgressionApi.supportAdmin).mockResolvedValue(filledAdmin); vi.spyOn(window, 'confirm').mockReturnValue(true);
    const revoke = vi.spyOn(communityProgressionApi, 'supportRevoke').mockRejectedValue(new CommunityApiError(403, 'forbidden', {}));
    render(<SupportAdminPanel writesEnabled />, { wrapper }); await screen.findByText(entry.displayName!);
    fireEvent.click(screen.getByRole('button', { name: '作废这笔登记' })); await screen.findByText('当前账号不能进行此操作。');
    expect(screen.queryByRole('button', { name: '确认上次作废' })).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: '登记并授予' })).toBeEnabled(); expect(revoke).toHaveBeenCalledOnce();
  });
});
