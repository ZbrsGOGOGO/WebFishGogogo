import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fishProgressView, type SupportAdminView } from '@stealth-reader/shared';
import { communityProgressionApi } from '../../api/community-progression';
import { useCommunityAuthStore, resetCommunityAuthStoreForTests } from '../../app/store/community-auth-store';
import { TOWER_TEST_USER } from '../games/demon-tower/test-fixtures';
import { FishGrowthSummary } from './FishGrowthSummary';
import { FISH_EVENT, isFishGamePath, useFishActivity } from './useFishActivity';
import { SupportAdminPanel } from './SupportAdminPanel';
import { CommunityVipSummary } from './CommunityVipSummary';

vi.mock('../../app/community-nav', () => ({ COMMUNITY_FEATURE_FLAGS: { communityProgressionEnabled: true } }));
const wrapper = ({ children }: { children: React.ReactNode }) => <MemoryRouter initialEntries={['/games/ballpoint-breach/arena']}>{children}</MemoryRouter>;
const totals = { orders: 0, months: 0, amountFen: 0, currency: 'CNY' as const };
const adminView: SupportAdminView = { totals, grossTotals: totals, activeHolders: 0, entries: [], hasMore: false };
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
    expect(screen.getByRole('progressbar')).toHaveAttribute('max', '1800'); expect(screen.getAllByRole('listitem')).toHaveLength(6);
    expect(screen.getByText(/今日 \+2 \/ 360/)).toBeVisible();
    expect(screen.getByText(/只保留汇总时长/)).toBeInTheDocument();
  });
  it('shows supporter status and private aggregate amounts without a checkout or financial promise', () => {
    render(<CommunityVipSummary vip={{ active: true, startsAt: '2099-09-01T00:00:00Z', expiresAt: '2099-10-01T00:00:00Z', source: 'afdian_support', benefits: ['demon_tower_auto_explore'] }} support={{ ...totals, amountFen: 1599, months: 2, orders: 1 }} serverNow="2099-09-10T00:00:00Z" giftDays={30} />, { wrapper });
    expect(screen.getByRole('heading', { name: '期权持有者' })).toBeVisible(); expect(screen.getByText(/15.99.*2 个月/)).toBeVisible();
    expect(screen.getByText(/不代表真实股权/)).toBeVisible(); expect(screen.getByRole('link', { name: /爱发电主页/ })).toHaveAttribute('rel', 'noopener noreferrer');
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
  });
});
