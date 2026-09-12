import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMUNITY_ACHIEVEMENTS, type CommunityProgressionView, type DemonTowerAutoResponse, type DemonTowerAutoRunView } from '@stealth-reader/shared';
import { communityDemonTowerApi } from '../../../api/community-demon-tower';
import { communityProgressionApi } from '../../../api/community-progression';
import { CommunityApiError, setCommunitySessionTokens } from '../../../api/community-http';
import { resetCommunityAuthStoreForTests, useCommunityAuthStore } from '../../../app/store/community-auth-store';
import * as wallet from '../../../app/store/community-wallet-store';
import { GamePrivacyProvider } from '../GamePrivacyContext';
import { DemonTowerAutoExplore, AUTO_STOP_REASONS } from './DemonTowerAutoExplore';
import { DemonTowerPage } from './DemonTowerPage';
import { TOWER_TEST_NOW, TOWER_TEST_USER, towerBattle, towerCatalog, towerOverview, towerProfile } from './test-fixtures';

const vip = (active = true): CommunityProgressionView => ({ serverNow: new Date(TOWER_TEST_NOW).toISOString(), enabled: true, writesEnabled: true, vip: { active, startsAt: new Date(TOWER_TEST_NOW).toISOString(), expiresAt: new Date(TOWER_TEST_NOW + 86_400_000).toISOString(), source: 'launch_gift', benefits: ['demon_tower_auto_explore'] }, presentation: { version: 0, equippedTitle: null }, achievements: [] });
const run = (extra: Partial<DemonTowerAutoRunView> = {}): DemonTowerAutoRunView => ({ id: 'run-synthetic-a', version: 1, status: 'running', stopReason: null, serviceDate: '2026-09-09', floor: 1, maxExplorations: 3, startedExplorations: 1, completedExplorations: 0, steps: 1, maxSteps: 260, officeCoinsGranted: 0, createdAt: TOWER_TEST_NOW, nextStepAt: TOWER_TEST_NOW + 2000, expiresAt: TOWER_TEST_NOW + 900_000, stoppedAt: null, ...extra });
const response = (job: DemonTowerAutoRunView | null = null, enabled = true): DemonTowerAutoResponse => ({ enabled, replayed: false, run: job, overview: towerOverview({ autoExplore: job }) });
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((yes) => { resolve = yes; }); return { promise, resolve }; };
vi.mock('../../../app/community-nav', () => ({ COMMUNITY_FEATURE_FLAGS: { demonTowerAuto: true, communityProgressionEnabled: true } }));
describe('demon tower server-owned automatic exploration UI', () => {
  let onOverview = vi.fn<(next: ReturnType<typeof towerOverview>) => void>(); let onPending = vi.fn<(pending: boolean) => void>();
  beforeEach(() => {
    vi.restoreAllMocks(); resetCommunityAuthStoreForTests(); setCommunitySessionTokens('synthetic-auto-a');
    useCommunityAuthStore.setState({ phase: 'active', user: TOWER_TEST_USER, sessionReady: true });
    onOverview = vi.fn(); onPending = vi.fn();
    vi.spyOn(wallet, 'refreshCommunityWallet').mockResolvedValue();
    vi.spyOn(communityProgressionApi, 'catalog').mockResolvedValue({ enabled: true, achievements: COMMUNITY_ACHIEVEMENTS, membership: { giftDays: 30, automaticRenewal: false, paid: false, benefit: 'demon_tower_auto_explore', existingAccountsOnly: true }, historicalDataNotice: '历史说明' });
    vi.spyOn(communityProgressionApi, 'me').mockResolvedValue(vip());
    vi.spyOn(communityDemonTowerApi, 'auto').mockResolvedValue(response());
    vi.spyOn(communityDemonTowerApi, 'autoStart').mockResolvedValue(response(run()));
    vi.spyOn(communityDemonTowerApi, 'autoStop').mockResolvedValue(response(run({ version: 2, status: 'stopped', stopReason: 'manual_stop' })));
    vi.spyOn(communityDemonTowerApi, 'action').mockResolvedValue({} as never);
    vi.spyOn(communityDemonTowerApi, 'catalog').mockResolvedValue(towerCatalog());
    vi.spyOn(communityDemonTowerApi, 'overview').mockResolvedValue(towerOverview());
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
  const ui = (overrides: Partial<React.ComponentProps<typeof DemonTowerAutoExplore>> = {}) => <MemoryRouter><GamePrivacyProvider value={{ covered: false, toggleCover: null }}><DemonTowerAutoExplore overview={towerOverview()} catalog={towerCatalog()} ownerId={TOWER_TEST_USER.publicId} now={TOWER_TEST_NOW} manualPending={false} onOverview={onOverview} onPending={onPending} {...overrides} /></GamePrivacyProvider></MemoryRouter>;
  async function ready() { const button = await screen.findByRole('button', { name: '设置本批委托' }); await waitFor(() => expect(button).toBeEnabled()); return button; }
  it('reads status without starting and discloses server persistence and strict scope before confirmation', async () => {
    render(ui()); fireEvent.click(await ready()); const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('固定第 1 层，最多 3 次'); expect(dialog).toHaveTextContent('最多 15 体力'); expect(dialog).toHaveTextContent('260 步、15 分钟');
    expect(dialog).toHaveTextContent('离开页面仍由服务器继续'); expect(screen.getByText(/不参与首领、建设、修炼/)).toBeVisible();
    expect(communityDemonTowerApi.autoStart).not.toHaveBeenCalled(); expect(communityDemonTowerApi.action).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' })); expect(communityDemonTowerApi.autoStart).not.toHaveBeenCalled();
  });
  it('starts only UUID, latest version, fixed floor and validated count, never client rewards', async () => {
    render(ui()); await ready(); fireEvent.change(screen.getByRole('textbox', { name: '托管探索次数' }), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: '设置本批委托' })); fireEvent.click(screen.getByRole('button', { name: '确认启动服务器托管' }));
    await waitFor(() => expect(communityDemonTowerApi.autoStart).toHaveBeenCalledOnce());
    expect(vi.mocked(communityDemonTowerApi.autoStart).mock.calls[0][0]).toEqual({ requestId: expect.any(String), expectedVersion: towerProfile().version, floor: 1, maxExplorations: 2 });
    expect(onPending).toHaveBeenCalledWith(true); expect(onOverview).toHaveBeenCalledWith(response(run()).overview);
    expect(wallet.refreshCommunityWallet).toHaveBeenCalled(); expect(communityDemonTowerApi.action).not.toHaveBeenCalled();
  });
  it.each(['', '0', '21', '-1', '1.5', '1e1', ' 2'])('rejects invalid exploration count %s without POST', async (value) => {
    render(ui()); await ready(); fireEvent.change(screen.getByRole('textbox', { name: '托管探索次数' }), { target: { value } });
    expect(screen.getByRole('button', { name: '设置本批委托' })).toBeDisabled(); expect(communityDemonTowerApi.autoStart).not.toHaveBeenCalled();
  });
  it('does not enable inactive VIP, and provides the real benefits link', async () => {
    vi.mocked(communityProgressionApi.me).mockResolvedValue(vip(false)); render(ui());
    expect(await screen.findByText(/需要有效的 期权持有者 托管权益/)).toBeVisible(); expect(screen.getByRole('button', { name: '设置本批委托' })).toBeDisabled();
    expect(screen.getByRole('link', { name: '查看成长档案与 期权持有者 权益' })).toHaveAttribute('href', '/achievements');
  });
  it('allows stop when 期权持有者 expired and service disabled, without moving version parameter', async () => {
    vi.mocked(communityProgressionApi.me).mockResolvedValue(vip(false)); vi.mocked(communityDemonTowerApi.auto).mockResolvedValue(response(run(), false));
    render(ui({ overview: towerOverview({ writesEnabled: false, autoExplore: run() }) }));
    fireEvent.click(await screen.findByRole('button', { name: '停止托管并手动接管' }));
    await waitFor(() => expect(communityDemonTowerApi.autoStop).toHaveBeenCalledOnce());
    expect(vi.mocked(communityDemonTowerApi.autoStop).mock.calls[0][0]).toBe('run-synthetic-a'); expect(communityDemonTowerApi.action).not.toHaveBeenCalled();
  });
  it('keeps the same uncertain start request and never repeats a client game step', async () => {
    vi.mocked(communityDemonTowerApi.autoStart).mockRejectedValueOnce(new CommunityApiError(502, 'lost'));
    render(ui()); fireEvent.click(await ready()); fireEvent.click(screen.getByRole('button', { name: '确认启动服务器托管' }));
    const retry = await screen.findByRole('button', { name: '确认上次托管操作' });
    expect(screen.getByRole('button', { name: '设置本批委托' })).toBeDisabled(); fireEvent.click(retry);
    await waitFor(() => expect(communityDemonTowerApi.autoStart).toHaveBeenCalledTimes(2));
    const calls = vi.mocked(communityDemonTowerApi.autoStart).mock.calls; expect(calls[1][0]).toEqual(calls[0][0]); expect(communityDemonTowerApi.action).not.toHaveBeenCalled();
  });
  it('retains original stop run ID on network retry even if state observations change', async () => {
    vi.mocked(communityDemonTowerApi.auto).mockResolvedValue(response(run())); vi.mocked(communityDemonTowerApi.autoStop).mockRejectedValueOnce(new CommunityApiError(0, 'lost'));
    render(ui()); fireEvent.click(await screen.findByRole('button', { name: '停止托管并手动接管' }));
    fireEvent.click(await screen.findByRole('button', { name: '确认上次托管操作' }));
    await waitFor(() => expect(communityDemonTowerApi.autoStop).toHaveBeenCalledTimes(2)); expect(vi.mocked(communityDemonTowerApi.autoStop).mock.calls.map((call) => call[0])).toEqual(['run-synthetic-a', 'run-synthetic-a']);
  });
  it('does not silently change the confirmed floor if another tab selects a region', async () => {
    const view = render(ui()); fireEvent.click(await ready());
    view.rerender(ui({ overview: towerOverview({ profile: towerProfile({ selectedFloor: 2, version: 7 }) }) }));
    expect(screen.getByRole('dialog')).toHaveTextContent('固定第 1 层'); expect(screen.getByRole('button', { name: '确认启动服务器托管' })).toBeDisabled();
    expect(screen.getByText('区域已变化，请取消后重新确认。')).toBeVisible(); expect(communityDemonTowerApi.autoStart).not.toHaveBeenCalled();
  });
  it('revalidates HP and manual in-flight state while confirmation is open', async () => {
    const view = render(ui()); fireEvent.click(await ready());
    const low = towerProfile({ maxHp: 100, hp: 30 }); view.rerender(ui({ overview: towerOverview({ profile: low }) }));
    expect(screen.getByRole('button', { name: '确认启动服务器托管' })).toBeDisabled(); expect(screen.getAllByText(/生命需高于 30%/).length).toBeGreaterThan(0);
    view.rerender(ui({ manualPending: true })); expect(screen.getByRole('button', { name: '确认启动服务器托管' })).toBeDisabled();
  });
  it('reports a stopped unfinished battle for manual takeover and cumulative coins clearly', async () => {
    const job = run({ status: 'stopped', stopReason: 'low_health', officeCoinsGranted: 8 }); vi.mocked(communityDemonTowerApi.auto).mockResolvedValue(response(job));
    render(ui({ overview: towerOverview({ profile: towerProfile({ battle: towerBattle() }), autoExplore: job }) }));
    expect(await screen.findByText(/战斗仍保留在现场/)).toBeVisible(); expect(screen.getByText(/本批累计到账 8 办公币（不是新一笔奖励）/)).toBeVisible();
    expect(AUTO_STOP_REASONS.vip_expired).toContain('到期'); expect(AUTO_STOP_REASONS.day_changed).toContain('每日结算');
  });
  it('ignores pending start receipt after switching accounts and never publishes old wallet observations', async () => {
    const pending = deferred<DemonTowerAutoResponse>(); vi.mocked(communityDemonTowerApi.autoStart).mockReturnValue(pending.promise);
    const view = render(ui()); fireEvent.click(await ready()); fireEvent.click(screen.getByRole('button', { name: '确认启动服务器托管' }));
    await waitFor(() => expect(communityDemonTowerApi.autoStart).toHaveBeenCalledOnce()); onOverview.mockClear();
    act(() => { setCommunitySessionTokens('synthetic-auto-b'); useCommunityAuthStore.setState({ user: { ...TOWER_TEST_USER, publicId: 'synthetic-auto-b' } }); });
    view.rerender(ui({ ownerId: 'synthetic-auto-b' })); await waitFor(() => expect(communityDemonTowerApi.auto).toHaveBeenCalledTimes(2)); onOverview.mockClear();
    await act(async () => { pending.resolve(response(run({ version: 80 }))); await Promise.resolve(); });
    expect(onOverview).not.toHaveBeenCalled(); expect(wallet.refreshCommunityWallet).not.toHaveBeenCalled();
  });
  it('keeps a pending start mounted across real workspace tab switches, never unlocking manual actions', async () => {
    let reject!: (reason: unknown) => void; vi.mocked(communityDemonTowerApi.autoStart).mockReturnValueOnce(new Promise((_, no) => { reject = no; }));
    render(<MemoryRouter><DemonTowerPage /></MemoryRouter>); fireEvent.click(await ready()); fireEvent.click(screen.getByRole('button', { name: '确认启动服务器托管' }));
    const input = vi.mocked(communityDemonTowerApi.autoStart).mock.calls[0][0];
    fireEvent.click(screen.getByRole('tab', { name: /成长/ }));
    expect(screen.getByRole('button', { name: '力量分配 1 点' })).toBeDisabled();
    await act(async () => { reject(new CommunityApiError(502, 'lost')); await Promise.resolve(); });
    fireEvent.click(screen.getByRole('tab', { name: /探索/ }));
    expect(screen.getByRole('button', { name: /开始探索/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '确认上次托管操作' }));
    await waitFor(() => expect(communityDemonTowerApi.autoStart).toHaveBeenCalledTimes(2));
    expect(vi.mocked(communityDemonTowerApi.autoStart).mock.calls[1][0]).toEqual(input);
  });
  it('resets only the old session pending lock on same-account relogin and ignores its late receipt', async () => {
    const pending = deferred<DemonTowerAutoResponse>(); vi.mocked(communityDemonTowerApi.autoStart).mockReturnValue(pending.promise);
    render(<MemoryRouter><DemonTowerPage /></MemoryRouter>); fireEvent.click(await ready()); fireEvent.click(screen.getByRole('button', { name: '确认启动服务器托管' }));
    expect(screen.getByRole('button', { name: /开始探索/ })).toBeDisabled();
    act(() => { setCommunitySessionTokens('synthetic-same-account-new-session'); useCommunityAuthStore.setState({ user: { ...TOWER_TEST_USER } }); });
    await waitFor(() => expect(screen.getByRole('button', { name: /开始探索/ })).toBeEnabled());
    await act(async () => { pending.resolve(response(run({ version: 99 }))); await Promise.resolve(); });
    expect(screen.getByRole('button', { name: /开始探索/ })).toBeEnabled(); expect(screen.queryByRole('button', { name: '停止托管并手动接管' })).toBeNull();
  });
  it('never overlaps status requests and never advances gameplay on a browser interval', async () => {
    vi.useFakeTimers(); const pending = deferred<DemonTowerAutoResponse>(); vi.mocked(communityDemonTowerApi.auto).mockReturnValueOnce(pending.promise);
    render(ui()); await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(communityDemonTowerApi.auto).toHaveBeenCalledOnce(); expect(communityDemonTowerApi.action).not.toHaveBeenCalled();
    await act(async () => { pending.resolve(response(run())); await Promise.resolve(); await vi.advanceTimersByTimeAsync(2500); });
    expect(communityDemonTowerApi.auto).toHaveBeenCalledTimes(2); expect(communityDemonTowerApi.autoStart).not.toHaveBeenCalled(); expect(communityDemonTowerApi.autoStop).not.toHaveBeenCalled();
  });
  it('keeps server activity untouched when the privacy cover is shown or the component unmounts', async () => {
    vi.mocked(communityDemonTowerApi.auto).mockResolvedValue(response(run()));
    const child = <DemonTowerAutoExplore overview={towerOverview({ autoExplore: run() })} catalog={towerCatalog()} ownerId={TOWER_TEST_USER.publicId} now={TOWER_TEST_NOW} manualPending={false} onOverview={onOverview} onPending={onPending} />;
    const view = render(<MemoryRouter><GamePrivacyProvider value={{ covered: false, toggleCover: null }}><div>{child}</div></GamePrivacyProvider></MemoryRouter>);
    await screen.findByRole('button', { name: '停止托管并手动接管' });
    view.rerender(<MemoryRouter><GamePrivacyProvider value={{ covered: true, toggleCover: null }}><div hidden>{child}</div></GamePrivacyProvider></MemoryRouter>);
    expect(screen.queryByRole('button', { name: '停止托管并手动接管' })).toBeNull();
    view.unmount(); expect(communityDemonTowerApi.autoStop).not.toHaveBeenCalled(); expect(communityDemonTowerApi.action).not.toHaveBeenCalled();
  });
});
