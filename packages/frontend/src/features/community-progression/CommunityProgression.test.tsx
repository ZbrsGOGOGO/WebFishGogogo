import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMUNITY_ACHIEVEMENTS, type CommunityProgressionCatalog, type CommunityProgressionView, type CommunityTitleReceipt } from '@stealth-reader/shared';
import { communityProgressionApi } from '../../api/community-progression';
import { CommunityApiError, setCommunitySessionTokens } from '../../api/community-http';
import { resetCommunityAuthStoreForTests, useCommunityAuthStore } from '../../app/store/community-auth-store';
import { TOWER_TEST_USER } from '../games/demon-tower/test-fixtures';
import { CommunityAchievementsPage } from './CommunityAchievementsPage';
import { CommunityHonors, CommunityTitleBadge } from './CommunityTitleBadge';
import { CommunityVipSummary, membershipRemaining } from './CommunityVipSummary';
import { useCommunityProgression } from './useCommunityProgression';

const catalog: CommunityProgressionCatalog = { enabled: true, achievements: COMMUNITY_ACHIEVEMENTS, membership: { giftDays: 30, automaticRenewal: false, paid: false, benefit: 'demon_tower_auto_explore', existingAccountsOnly: true }, historicalDataNotice: '只读取可核验历史。' };
const title = COMMUNITY_ACHIEVEMENTS[0].title;
const overview = (extra: Partial<CommunityProgressionView> = {}): CommunityProgressionView => ({ serverNow: '2026-09-09T00:00:00.000Z', enabled: true, writesEnabled: true, vip: { active: true, startsAt: '2026-09-09T00:00:00.000Z', expiresAt: '2026-10-09T00:00:00.000Z', source: 'launch_gift', benefits: ['demon_tower_auto_explore'] }, presentation: { version: 0, equippedTitle: null }, achievements: COMMUNITY_ACHIEVEMENTS.map((item, index) => ({ key: item.key, progress: index ? 0 : 1, target: item.target, eligible: index === 0, unlockedAt: index ? null : '2026-09-09T00:00:00.000Z' })), ...extra });
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((yes) => { resolve = yes; }); return { promise, resolve }; };
const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);
describe('community achievements, titles and VIP', () => {
  beforeEach(() => {
    vi.restoreAllMocks(); resetCommunityAuthStoreForTests(); setCommunitySessionTokens('synthetic-progression');
    useCommunityAuthStore.setState({ phase: 'active', user: TOWER_TEST_USER, sessionReady: true });
    vi.spyOn(communityProgressionApi, 'catalog').mockResolvedValue(catalog);
    vi.spyOn(communityProgressionApi, 'me').mockResolvedValue(overview());
    vi.spyOn(communityProgressionApi, 'title').mockImplementation(async (input) => ({ requestId: input.requestId, replayed: false, overview: overview({ presentation: { version: 1, equippedTitle: input.titleKey ? title : null } }) }));
    vi.spyOn(communityProgressionApi, 'refresh').mockResolvedValue({ newlyUnlocked: [], overview: overview() });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
  it('renders 12 actual milestones, private reads only, fixed gift explanation and no checkout', async () => {
    const view = wrap(<CommunityAchievementsPage />);
    expect(await screen.findByRole('heading', { name: '第一批收获' })).toBeVisible();
    expect(screen.getAllByRole('progressbar')).toHaveLength(12);
    expect(screen.getByText(/新注册账号不自动获赠/)).toBeVisible();
    expect(screen.getByText(/没有收费、购买或自动续费入口/)).toBeVisible();
    expect(communityProgressionApi.refresh).not.toHaveBeenCalled(); expect(communityProgressionApi.title).not.toHaveBeenCalled();
    expect(view.container.querySelector('iframe,video,audio')).toBeNull();
  });
  it('requires explicit public suffix confirmation before sending versioned equip', async () => {
    wrap(<CommunityAchievementsPage />);
    fireEvent.click(await screen.findByRole('button', { name: '佩戴工位园丁' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('成就收藏列表仍遵守'); expect(communityProgressionApi.title).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '确认公开佩戴' }));
    await waitFor(() => expect(communityProgressionApi.title).toHaveBeenCalledOnce());
    expect(vi.mocked(communityProgressionApi.title).mock.calls[0][0]).toMatchObject({ expectedVersion: 0, titleKey: 'farm_first', requestId: expect.any(String) });
    expect(await screen.findByRole('button', { name: '正在佩戴' })).toBeDisabled();
  });
  it('cancelling disclosure never writes, locked titles are disabled', async () => {
    wrap(<CommunityAchievementsPage />); fireEvent.click(await screen.findByRole('button', { name: '佩戴工位园丁' }));
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('dialog')).toBeNull(); expect(screen.getAllByRole('button', { name: '尚未解锁' }).every((button) => button.hasAttribute('disabled'))).toBe(true);
    expect(communityProgressionApi.title).not.toHaveBeenCalled();
  });
  it('unlocks only via explicit bulk sync and disables all mutations during maintenance', async () => {
    vi.mocked(communityProgressionApi.me).mockResolvedValue(overview({ writesEnabled: false }));
    wrap(<CommunityAchievementsPage />); expect(await screen.findByRole('button', { name: '同步成就进度' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '佩戴工位园丁' })).toBeDisabled(); expect(communityProgressionApi.refresh).not.toHaveBeenCalled();
  });
  it('does not read private progression when public catalog says closed', async () => {
    vi.mocked(communityProgressionApi.catalog).mockResolvedValue({ ...catalog, enabled: false });
    wrap(<CommunityAchievementsPage />); expect(await screen.findByText(/成长档案暂未开放/)).toBeVisible(); expect(communityProgressionApi.me).not.toHaveBeenCalled();
  });
  it('retains same UUID and payload after an uncertain result and blocks a second choice', async () => {
    vi.mocked(communityProgressionApi.title).mockRejectedValueOnce(new CommunityApiError(502, 'lost'));
    const { result } = renderHook(() => useCommunityProgression()); await waitFor(() => expect(result.current.overview).not.toBeNull());
    await act(async () => { await result.current.equip('farm_first'); });
    expect(result.current.pending?.titleKey).toBe('farm_first');
    await act(async () => { await result.current.equip(null); }); expect(communityProgressionApi.title).toHaveBeenCalledOnce();
    await act(async () => { await result.current.retry(); });
    const calls = vi.mocked(communityProgressionApi.title).mock.calls; expect(calls[1][0]).toEqual(calls[0][0]); expect(result.current.pending).toBeNull();
  });
  it('blocks rapid duplicate submits synchronously and accepts no client progress or expiry', async () => {
    const pending = deferred<CommunityTitleReceipt>(); vi.mocked(communityProgressionApi.title).mockReturnValue(pending.promise);
    const { result } = renderHook(() => useCommunityProgression()); await waitFor(() => expect(result.current.overview).not.toBeNull());
    let first!: Promise<void>; act(() => { first = result.current.equip('farm_first'); void result.current.equip(null); });
    expect(communityProgressionApi.title).toHaveBeenCalledOnce();
    const input = vi.mocked(communityProgressionApi.title).mock.calls[0][0]; expect(Object.keys(input).sort()).toEqual(['expectedVersion', 'requestId', 'titleKey']);
    await act(async () => { pending.resolve({ requestId: input.requestId, replayed: false, overview: overview() }); await first; });
  });
  it('ignores old account reads and pending receipts after account switch', async () => {
    const pending = deferred<CommunityTitleReceipt>(); vi.mocked(communityProgressionApi.title).mockReturnValue(pending.promise);
    const { result } = renderHook(() => useCommunityProgression()); await waitFor(() => expect(result.current.overview).not.toBeNull());
    let first!: Promise<void>; act(() => { first = result.current.equip('farm_first'); });
    act(() => { setCommunitySessionTokens('synthetic-b'); useCommunityAuthStore.setState({ user: { ...TOWER_TEST_USER, publicId: 'synthetic-b' } }); });
    await waitFor(() => expect(result.current.overview?.presentation.equippedTitle).toBeNull());
    await act(async () => { pending.resolve({ requestId: 'old', replayed: false, overview: overview({ presentation: { version: 90, equippedTitle: title } }) }); await first; });
    expect(result.current.overview?.presentation.version).toBe(0); expect(result.current.pending).toBeNull();
  });
  it('keeps a read initiated before equip from overwriting the new presentation', async () => {
    const { result } = renderHook(() => useCommunityProgression()); await waitFor(() => expect(result.current.overview).not.toBeNull());
    const read = deferred<CommunityProgressionView>(); vi.mocked(communityProgressionApi.me).mockReturnValueOnce(read.promise);
    let reload!: Promise<void>; act(() => { reload = result.current.reload(); }); await waitFor(() => expect(communityProgressionApi.me).toHaveBeenCalledTimes(2));
    await act(async () => { await result.current.equip('farm_first'); });
    await act(async () => { read.resolve(overview()); await reload; }); expect(result.current.overview?.presentation.equippedTitle).toEqual(title);
  });
  it('renders only known fixed badges, null legacy values and blocked authors safely', () => {
    const view = render(<CommunityTitleBadge title={title} />); expect(screen.getByLabelText('佩戴称号：工位园丁')).toBeVisible();
    view.rerender(<CommunityTitleBadge title={title} hidden />); expect(view.container).toBeEmptyDOMElement();
    view.rerender(<CommunityTitleBadge title={{ key: 'farm_first', label: '<img src=x onerror=alert(1)>' }} />); expect(view.container).toBeEmptyDOMElement();
    view.rerender(<CommunityTitleBadge />); expect(view.container).toBeEmptyDOMElement();
    view.rerender(<CommunityHonors honors={['历史荣誉', title]} />); expect(screen.getByText('历史荣誉')).toBeVisible(); expect(screen.getByText('工位园丁')).toBeVisible();
  });
  it('shows expiry without granting rights from local countdown or inventing perpetual membership', () => {
    expect(membershipRemaining(null, 0)).toBe('未获赠'); expect(membershipRemaining('2026-09-09T00:00:00Z', Date.parse('2026-09-09T00:00:00Z'))).toBe('已到期');
    expect(membershipRemaining('2026-09-09T01:02:00Z', Date.parse('2026-09-09T00:00:00Z'))).toBe('1 小时 2 分钟');
    wrap(<CommunityVipSummary vip={{ ...overview().vip, active: false }} serverNow={overview().serverNow} giftDays={30} />);
    expect(screen.getByText('当前未生效')).toBeVisible(); expect(screen.queryByRole('button')).toBeNull();
  });
});
