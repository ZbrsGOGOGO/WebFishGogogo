import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMUNITY_ACHIEVEMENTS, type CommunityProgressionCatalog, type CommunityProgressionView, type CommunityTitleReceipt, type SupportAdminView } from '@stealth-reader/shared';
import { communityProgressionApi } from '../../api/community-progression';
import { CommunityApiError, setCommunitySessionTokens } from '../../api/community-http';
import { resetCommunityAuthStoreForTests, useCommunityAuthStore } from '../../app/store/community-auth-store';
import { TOWER_TEST_USER } from '../games/demon-tower/test-fixtures';
import { CommunityAchievementsPage } from './CommunityAchievementsPage';
import { CommunityHonors, CommunityTitleBadge } from './CommunityTitleBadge';
import { CommunityVipSummary, membershipRemaining } from './CommunityVipSummary';
import { useCommunityProgression } from './useCommunityProgression';
import { CommunityProgressionCard } from './CommunityProgressionCard';

const catalog: CommunityProgressionCatalog = { enabled: true, achievements: COMMUNITY_ACHIEVEMENTS, membership: { giftDays: 30, automaticRenewal: false, paid: false, benefit: 'demon_tower_auto_explore', existingAccountsOnly: true }, historicalDataNotice: '只读取可核验历史。' };
const title = COMMUNITY_ACHIEVEMENTS.find(item => item.key === 'farm_first')!.title;
const overview = (extra: Partial<CommunityProgressionView> = {}): CommunityProgressionView => ({ serverNow: '2026-09-09T00:00:00.000Z', enabled: true, writesEnabled: true, vip: { active: true, startsAt: '2026-09-09T00:00:00.000Z', expiresAt: '2026-10-09T00:00:00.000Z', source: 'launch_gift', benefits: ['demon_tower_auto_explore'] }, presentation: { version: 0, equippedTitle: null }, achievements: COMMUNITY_ACHIEVEMENTS.map(item => ({ key: item.key, progress: item.key === title.key ? 1 : 0, target: item.target, eligible: item.key === title.key, unlockedAt: item.key === title.key ? '2026-09-09T00:00:00.000Z' : null })), ...extra });
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
  it('renders the complete fixed milestone catalog, private reads only, fixed gift explanation and no checkout', async () => {
    const view = wrap(<CommunityAchievementsPage />);
    expect(await screen.findByRole('heading', { name: '第一批收获' })).toBeVisible();
    expect(screen.getAllByRole('progressbar')).toHaveLength(COMMUNITY_ACHIEVEMENTS.length);
    expect(screen.getByRole('heading', { name: '第一次三星合成' })).toBeVisible();
    expect(screen.getByRole('heading', { name: '职业晋升 · 大老板' })).toBeVisible();
    expect(screen.getByRole('heading', { name: '九层纪念' })).toBeVisible();
    const rules = screen.getByText('权益、赠送与支持说明');
    expect(rules.closest('details')).not.toHaveAttribute('open');
    fireEvent.click(rules);
    expect(screen.getByText(/新注册账号不自动获赠/)).toBeVisible();
    expect(screen.getByText(/没有支付或自动续费入口/)).toBeVisible();
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

  it('groups the complete actual catalog and filters category and unlock state without writing', async () => {
    wrap(<CommunityAchievementsPage />); await screen.findByRole('heading', { name: '第一批收获' });
    expect(screen.getByRole('region', { name: '日常与共创' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '九层妖塔' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^工位绿植/ }));
    expect(screen.getAllByRole('progressbar')).toHaveLength(3);
    expect(screen.queryByRole('heading', { name: '九层纪念' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: '解锁状态' }), { target: { value: 'unlocked' } });
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByRole('article', { name: '第一批收获' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: '解锁状态' }), { target: { value: 'eligible' } });
    expect(screen.getByRole('heading', { name: '没有匹配的成就' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '查看全部收藏' }));
    expect(screen.getAllByRole('progressbar')).toHaveLength(COMMUNITY_ACHIEVEMENTS.length);
    expect(screen.getByRole('combobox', { name: '解锁状态' })).toHaveValue('all');
    expect(communityProgressionApi.refresh).not.toHaveBeenCalled(); expect(communityProgressionApi.title).not.toHaveBeenCalled();
  });

  it('searches titles and conditions and respects a smaller server catalog instead of hardcoding milestones', async () => {
    const definitions = COMMUNITY_ACHIEVEMENTS.filter(item => item.key === 'farm_first' || item.key === 'tower_5');
    vi.mocked(communityProgressionApi.catalog).mockResolvedValue({ ...catalog, achievements: definitions });
    wrap(<CommunityAchievementsPage />); await screen.findByRole('heading', { name: '第一批收获' });
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /^开发协作/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: '搜索成就或称号' }), { target: { value: '工位园丁' } });
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByRole('article', { name: '第一批收获' })).toBeVisible();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '独立等级' } });
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByRole('article', { name: '妖塔启程' })).toBeVisible();
    expect(communityProgressionApi.title).not.toHaveBeenCalled();
  });

  it('keeps qualifying titles locked until explicit synchronization and uses server progress targets', async () => {
    const initial = overview();
    initial.achievements = initial.achievements.map(item => item.key === 'tower_5' ? { ...item, progress: 8, target: 7, eligible: true } : item);
    vi.mocked(communityProgressionApi.me).mockResolvedValue(initial);
    wrap(<CommunityAchievementsPage />); await screen.findByRole('heading', { name: '妖塔启程' });
    fireEvent.change(screen.getByRole('combobox', { name: '解锁状态' }), { target: { value: 'eligible' } });
    const candidate = within(screen.getByRole('article', { name: '妖塔启程' }));
    expect(candidate.getByRole('progressbar')).toHaveAttribute('max', '7');
    expect(candidate.getByRole('progressbar')).toHaveAttribute('value', '7');
    expect(candidate.getByText('8 / 7')).toBeInTheDocument();
    expect(candidate.getByRole('button', { name: '请先同步解锁' })).toBeDisabled();
    expect(communityProgressionApi.refresh).not.toHaveBeenCalled();
    const synced = { ...initial, achievements: initial.achievements.map(item => item.key === 'tower_5' ? { ...item, unlockedAt: initial.serverNow } : item) };
    vi.mocked(communityProgressionApi.refresh).mockResolvedValue({ newlyUnlocked: ['tower_5'], overview: synced });
    fireEvent.click(screen.getByRole('button', { name: '同步成就进度' }));
    expect(await screen.findByText(/已解锁 1 项成就，无需逐个领奖/)).toBeVisible();
    fireEvent.change(screen.getByRole('combobox', { name: '解锁状态' }), { target: { value: 'unlocked' } });
    expect(screen.getByRole('button', { name: '佩戴入塔行者' })).not.toBeDisabled();
    expect(communityProgressionApi.refresh).toHaveBeenCalledOnce(); expect(communityProgressionApi.title).not.toHaveBeenCalled();
  });

  it('shows missing metric records as awaiting synchronization rather than a fabricated zero', async () => {
    vi.mocked(communityProgressionApi.me).mockResolvedValue(overview({ achievements: [] }));
    wrap(<CommunityAchievementsPage />); await screen.findByRole('heading', { name: '第一批收获' });
    const item = within(screen.getByRole('article', { name: '第一批收获' }));
    expect(item.getByText('进度待同步')).toBeVisible();
    expect(item.getByText('— / 1')).toBeVisible();
    expect(item.getByRole('progressbar')).not.toHaveAttribute('value');
    expect(item.getByRole('button', { name: '尚未解锁' })).toBeDisabled();
  });

  it('keeps profile growth concise while showing the actual current title and collection count', async () => {
    vi.mocked(communityProgressionApi.me).mockResolvedValue(overview({ presentation: { version: 3, equippedTitle: title } }));
    wrap(<CommunityProgressionCard />);
    expect(await screen.findByLabelText('佩戴称号：工位园丁')).toBeVisible();
    expect(screen.getByRole('link', { name: '成就与称号 →' })).toHaveAttribute('href', '/achievements');
    expect(screen.getByText('当前公开佩戴')).toBeVisible();
    expect(screen.getByText('成就收藏')).toBeVisible();
    expect(screen.queryByRole('button', { name: /佩戴|同步成就/ })).not.toBeInTheDocument();
    expect(communityProgressionApi.title).not.toHaveBeenCalled(); expect(communityProgressionApi.refresh).not.toHaveBeenCalled();
  });

  it('loads administrator support records only after explicit open and preserves the mounted form when collapsed', async () => {
    useCommunityAuthStore.setState({ user: { ...TOWER_TEST_USER, roles: ['admin'] } });
    const totals = { orders: 0, months: 0, amountFen: 0, currency: 'CNY' as const };
    const view: SupportAdminView = { totals, grossTotals: totals, activeHolders: 0, entries: [], hasMore: false };
    const read = vi.spyOn(communityProgressionApi, 'supportAdmin').mockResolvedValue(view);
    wrap(<CommunityAchievementsPage />); await screen.findByRole('heading', { name: '第一批收获' });
    const toggle = screen.getByRole('button', { name: /^支持台账管理/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false'); expect(read).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: '支持管理后台' })).not.toBeInTheDocument();
    fireEvent.click(toggle); await waitFor(() => expect(read).toHaveBeenCalledOnce());
    fireEvent.change(screen.getByRole('textbox', { name: '用户登录账号' }), { target: { value: 'keep-this-draft' } });
    fireEvent.click(toggle);
    expect(screen.queryByRole('region', { name: '支持管理后台' })).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByRole('textbox', { name: '用户登录账号' })).toHaveValue('keep-this-draft');
    expect(read).toHaveBeenCalledOnce();
    act(() => { useCommunityAuthStore.setState({ user: { ...TOWER_TEST_USER, roles: [] } }); });
    expect(screen.queryByRole('button', { name: /^支持台账管理/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '支持管理后台' })).not.toBeInTheDocument();
    act(() => { useCommunityAuthStore.setState({ user: { ...TOWER_TEST_USER, roles: ['admin'] } }); });
    expect(screen.getByRole('button', { name: /^支持台账管理/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('region', { name: '支持管理后台' })).not.toBeInTheDocument(); expect(read).toHaveBeenCalledOnce();
  });

  it('never renders or reads the support administrator panel for ordinary members', async () => {
    const read = vi.spyOn(communityProgressionApi, 'supportAdmin');
    wrap(<CommunityAchievementsPage />); await screen.findByRole('heading', { name: '第一批收获' });
    expect(screen.queryByRole('button', { name: /^支持台账管理/ })).not.toBeInTheDocument(); expect(read).not.toHaveBeenCalled();
  });

  it('preserves an uncertain administrator grant and its original operation number across collapse', async () => {
    useCommunityAuthStore.setState({ user: { ...TOWER_TEST_USER, roles: ['admin'] } });
    const totals = { orders: 0, months: 0, amountFen: 0, currency: 'CNY' as const };
    vi.spyOn(communityProgressionApi, 'supportAdmin').mockResolvedValue({ totals, grossTotals: totals, activeHolders: 0, entries: [], hasMore: false });
    const grant = vi.spyOn(communityProgressionApi, 'supportGrant').mockRejectedValueOnce(new CommunityApiError(502, 'lost')).mockResolvedValue({ replayed: true, id: 'original-receipt' });
    wrap(<CommunityAchievementsPage />); await screen.findByRole('heading', { name: '第一批收获' });
    const toggle = screen.getByRole('button', { name: /^支持台账管理/ });
    fireEvent.click(toggle);
    await screen.findByText('还没有支持登记');
    fireEvent.change(screen.getByRole('textbox', { name: '用户登录账号' }), { target: { value: 'core-user' } });
    fireEvent.change(screen.getByRole('textbox', { name: '爱发电订单号' }), { target: { value: 'TEST_ORDER_123' } });
    fireEvent.change(screen.getByRole('textbox', { name: '实际支持金额（人民币元）' }), { target: { value: '1.00' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /我已在爱发电核验付款/ }));
    fireEvent.submit(screen.getByRole('form', { name: '核验后授予表单' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '确认上次登记' })).not.toBeDisabled());
    expect(grant).toHaveBeenCalledOnce();
    const originalInput = grant.mock.calls[0][0];
    expect(originalInput).toEqual({ requestId: expect.any(String), username: 'core-user', orderReference: 'TEST_ORDER_123', amountFen: 100, months: 1, confirmed: true });
    fireEvent.click(toggle);
    expect(screen.queryByRole('button', { name: '确认上次登记' })).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByRole('textbox', { name: '用户登录账号' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: '爱发电订单号' })).toHaveValue('TEST_ORDER_123');
    fireEvent.click(screen.getByRole('button', { name: '确认上次登记' }));
    await screen.findByText('已确认：原登记成功，未重复发放。');
    expect(grant).toHaveBeenCalledTimes(2); expect(grant.mock.calls[1][0]).toEqual(originalInput);
    expect(communityProgressionApi.refresh).not.toHaveBeenCalled(); expect(communityProgressionApi.title).not.toHaveBeenCalled();
  });

  it('resets a pending public-title confirmation and collection filters on account change', async () => {
    wrap(<CommunityAchievementsPage />); await screen.findByRole('button', { name: '佩戴工位园丁' });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '工位园丁' } });
    fireEvent.click(screen.getByRole('button', { name: '佩戴工位园丁' }));
    expect(screen.getByRole('dialog')).toBeVisible();
    act(() => { setCommunitySessionTokens('next-gallery-session'); useCommunityAuthStore.setState({ user: { ...TOWER_TEST_USER, publicId: 'next-gallery-member' } }); });
    await screen.findByRole('heading', { name: '九层纪念' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(communityProgressionApi.title).not.toHaveBeenCalled();
  });

  it('resets filters and administrator disclosure on same-account login and rejects the old delayed read', async () => {
    useCommunityAuthStore.setState({ user: { ...TOWER_TEST_USER, roles: ['admin'] } });
    const totals = { orders: 0, months: 0, amountFen: 0, currency: 'CNY' as const };
    const adminRead = vi.spyOn(communityProgressionApi, 'supportAdmin').mockResolvedValue({ totals, grossTotals: totals, activeHolders: 0, entries: [], hasMore: false });
    wrap(<CommunityAchievementsPage />); await screen.findByRole('heading', { name: '第一批收获' });
    fireEvent.click(screen.getByRole('button', { name: /^支持台账管理/ }));
    await screen.findByText('还没有支持登记');
    fireEvent.click(screen.getByRole('button', { name: /^工位绿植/ }));
    fireEvent.change(screen.getByRole('combobox', { name: '解锁状态' }), { target: { value: 'unlocked' } });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '工位园丁' } });
    const oldRead = deferred<CommunityProgressionView>();
    vi.mocked(communityProgressionApi.me).mockReturnValueOnce(oldRead.promise);
    fireEvent.click(screen.getByRole('button', { name: '重新读取' }));
    await waitFor(() => expect(communityProgressionApi.me).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: '佩戴工位园丁' }));
    expect(screen.getByRole('dialog')).toBeVisible();
    const oldSignal = vi.mocked(communityProgressionApi.me).mock.calls[1][0];
    act(() => { setCommunitySessionTokens('same-member-new-session'); useCommunityAuthStore.setState({ user: { ...TOWER_TEST_USER, roles: ['admin'] } }); });
    await screen.findByRole('heading', { name: '九层纪念' });
    expect(communityProgressionApi.me).toHaveBeenCalledTimes(3); expect(oldSignal?.aborted).toBe(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(screen.getByRole('combobox', { name: '解锁状态' })).toHaveValue('all');
    expect(screen.getByRole('button', { name: /^全部收藏/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^支持台账管理/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('region', { name: '支持管理后台' })).not.toBeInTheDocument(); expect(adminRead).toHaveBeenCalledOnce();
    await act(async () => { oldRead.resolve(overview({ presentation: { version: 99, equippedTitle: title } })); await oldRead.promise; });
    expect(within(screen.getByRole('region', { name: '佩戴状态' })).getByText('未佩戴称号')).toBeVisible();
    expect(communityProgressionApi.title).not.toHaveBeenCalled(); expect(adminRead).toHaveBeenCalledOnce();
  });
});
