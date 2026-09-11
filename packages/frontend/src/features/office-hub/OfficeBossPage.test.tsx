import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OfficeHubOverview, OfficeReliefOutcome, OfficeReliefView } from '@stealth-reader/shared';
import { officeHubApi } from '../../api/office-hub';
import { CommunityApiError, setCommunitySessionTokens } from '../../api/community-http';
import { resetCommunityAuthStoreForTests, useCommunityAuthStore } from '../../app/store/community-auth-store';
import { GamePrivacyProvider } from '../games/GamePrivacyContext';
import { TOWER_TEST_USER } from '../games/demon-tower/test-fixtures';
import { OfficeBossPage } from './OfficeBossPage';

const NOW = '2026-09-11T07:00:00.000Z';
function relief(overrides: Partial<OfficeReliefView> = {}): OfficeReliefView {
  return { schemaVersion: 1, version: 1, chances: 3, remainderSeconds: 900, trackedSeconds: 6300, tokenBalance: 2000, totalPlays: 0, titles: [], skins: [], equippedSkin: null, pending: [], history: [], lastResult: null, startedAt: NOW, ...overrides };
}
function overview(value: OfficeReliefView | undefined = relief()): OfficeHubOverview {
  return {
    serverTime: NOW, notice: null, moderation: null, relief: value,
    collection: { day: '2026-09-11', promotionTier: 0, hourlyExp: 40, waveExp: 150, farmExp: 0, farmEarned: 0, farmDraws: 0, creditedWaves: 0, tickets: 0, dailyTicketClaimed: false, socialPoints: 0, socialEarnedToday: 0, socialExchangesToday: 0, pityR: 0, pitySSR: 0, draws: 0, owned: {}, equipped: null, lastDraw: null, reputation: 0, dailyUp: 'skin-mint', theme: '茶水间故事' },
    weekly: { guildId: null, guildName: null, week: '2026-09-07', announcement: '', canEdit: false, totalWaves: 0, targetWaves: 40, rewardClaimed: false, myWaves: 0, reputation: 0, leaderboard: [], departments: [] },
    boss: { startedAt: null, endsAt: null, hits: 0, damage: 0, claimed: false, rewardCoins: 20 }, stories: [], drawings: [], spies: [],
  };
}
function outcome(overrides: Partial<OfficeReliefOutcome> = {}): OfficeReliefOutcome { return { id: 'result-a', at: NOW, kind: 'coin', tokenDelta: 500, message: '纸片回执：获得 500 解压币', tool: 'keyboard', ...overrides }; }
function receipt(requestId: string, result = outcome(), values: Partial<OfficeReliefView> = {}, replayed = false): OfficeHubOverview {
  return { ...overview(relief({ version: 2, chances: 2, tokenBalance: 2500, history: [result], lastResult: result, ...values })), reliefReceipt: { requestId, replayed, outcome: result } };
}
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
let navigate: ReturnType<typeof useNavigate>;
function Navigation() { navigate = useNavigate(); return null; }
function tree(path: string, covered = false) { return <MemoryRouter initialEntries={[path]}><Navigation /><GamePrivacyProvider value={{ covered, toggleCover: null }}><div hidden={covered}><OfficeBossPage /></div></GamePrivacyProvider></MemoryRouter>; }
function page(view = overview(), path = '/games/office-boss') { vi.spyOn(officeHubApi, 'overview').mockResolvedValue(view); return render(tree(path)); }
async function start() { fireEvent.click(await screen.findByRole('button', { name: '消耗 1 次机会 · 释放压力' })); fireEvent.click(screen.getByRole('button', { name: '确认释放 · 1 次机会' })); }
const art = (): Element => document.querySelector('[aria-label="纸片挑战"] svg')!;
beforeEach(() => {
  resetCommunityAuthStoreForTests();
  setCommunitySessionTokens('synthetic-relief-ui-session');
  useCommunityAuthStore.setState({ phase: 'active', user: { ...TOWER_TEST_USER }, sessionReady: true });
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); resetCommunityAuthStoreForTests(); });

describe('pressure workspace server-bound actions', () => {
  it('opens one quiet workspace with server chance progress, module tokens and the original daily tab', async () => {
    page();
    expect(await screen.findByRole('heading', { name: '暴打小老板' })).toBeVisible();
    expect(screen.queryByRole('navigation', { name: '公司工作台功能' })).not.toBeInTheDocument();
    const metrics = screen.getByLabelText('机会与独立代币');
    expect(metrics).toHaveTextContent('解压币 · 仅本模块2,000');
    expect(within(metrics).getByRole('progressbar')).toHaveAttribute('value', '900');
    expect(screen.getByText(/每日最多计 4 小时/)).toBeVisible();
    fireEvent.click(screen.getByRole('link', { name: '每日巡视' }));
    expect(await screen.findByRole('button', { name: '开始今日巡视' })).toBeVisible();
    act(() => navigate(-1));
    expect(await screen.findByRole('button', { name: '消耗 1 次机会 · 释放压力' })).toBeVisible();
  });
  it('explicitly confirms a manual challenge and sends only original version/tool/UUID once', async () => {
    const pending = deferred<OfficeHubOverview>();
    const write = vi.spyOn(officeHubApi, 'action').mockReturnValue(pending.promise);
    page();
    fireEvent.change(await screen.findByLabelText('演出工具'), { target: { value: 'coffee' } });
    fireEvent.click(screen.getByRole('button', { name: '消耗 1 次机会 · 释放压力' }));
    expect(write).not.toHaveBeenCalled();
    expect(screen.getByRole('region', { name: '操作二次确认' })).toHaveFocus();
    const confirm = screen.getByRole('button', { name: '确认释放 · 1 次机会' });
    fireEvent.click(confirm); fireEvent.click(confirm);
    expect(write).toHaveBeenCalledOnce();
    const [action, data, id] = write.mock.calls[0];
    expect(action).toBe('relief_play'); expect(data).toEqual({ tool: 'coffee', expectedVersion: 1 }); expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(screen.getByRole('button', { name: '消耗 1 次机会 · 释放压力' })).toBeDisabled();
    await act(async () => pending.resolve(receipt(id!)));
    expect(await screen.findByText('纸片回执：获得 500 解压币')).toBeVisible();
  });
  it('locks unknown outcomes across GET refresh and retries the exact old UUID, action and version', async () => {
    const write = vi.spyOn(officeHubApi, 'action').mockRejectedValueOnce(new CommunityApiError(503, 'internal detail'));
    page(); await start();
    expect(await screen.findByRole('button', { name: '核对原请求' })).toBeVisible();
    expect(screen.getByRole('alert')).not.toHaveTextContent('internal detail');
    vi.mocked(officeHubApi.overview).mockResolvedValue(overview(relief({ version: 2, chances: 2, tokenBalance: 2500 })));
    fireEvent.click(screen.getByRole('button', { name: '刷新资料' }));
    await waitFor(() => expect(screen.getByLabelText('机会与独立代币')).toHaveTextContent('2,500'));
    expect(screen.getByRole('button', { name: '消耗 1 次机会 · 释放压力' })).toBeDisabled();
    fireEvent.click(screen.getByRole('link', { name: '外观与称号' }));
    expect(screen.getAllByRole('button', { name: '购买外观' }).every(button => button.hasAttribute('disabled'))).toBe(true);
    const id = write.mock.calls[0][2]!;
    write.mockResolvedValueOnce(receipt(id, outcome(), {}, true));
    fireEvent.click(screen.getByRole('button', { name: '核对原请求' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: '核对原请求' })).not.toBeInTheDocument());
    expect(write.mock.calls[1]).toEqual(write.mock.calls[0]);
    expect(art()).toHaveAttribute('data-effect', 'none');
  });
  it.each([undefined, { requestId: 'another-request', replayed: false, outcome: null }])('does not acknowledge a 200 response without its matching receipt: %j', async reliefReceipt => {
    vi.spyOn(officeHubApi, 'action').mockResolvedValue({ ...overview(), reliefReceipt });
    page(); await start();
    expect(await screen.findByRole('alert')).toHaveTextContent('回执尚未匹配');
    expect(screen.getByRole('button', { name: '核对原请求' })).toBeVisible();
    expect(screen.getByRole('button', { name: '消耗 1 次机会 · 释放压力' })).toBeDisabled();
  });
  it('does not turn an explicit version rejection into an automatic second purchase', async () => {
    const write = vi.spyOn(officeHubApi, 'action').mockRejectedValue(new CommunityApiError(409, '', { code: 'OFFICE_RELIEF_VERSION_CONFLICT' }));
    page(); await start();
    expect(await screen.findByRole('alert')).toHaveTextContent('本次未提交');
    expect(screen.queryByRole('button', { name: '核对原请求' })).not.toBeInTheDocument();
    expect(write).toHaveBeenCalledOnce();
  });
  it('makes a captured quote stale after refresh instead of silently using a new version or balance', async () => {
    const write = vi.spyOn(officeHubApi, 'action');
    page(overview(), '/games/office-boss?section=collection');
    const card = (await screen.findByRole('heading', { name: '薄荷便笺' })).closest('article')!;
    const buy = within(card).getByRole('button', { name: '购买外观' }); buy.focus(); fireEvent.click(buy);
    expect(screen.getByRole('region', { name: '操作二次确认' })).toHaveTextContent('总价 1,200 解压币，购买后余额 800');
    vi.mocked(officeHubApi.overview).mockResolvedValue(overview(relief({ version: 2, tokenBalance: 5000 })));
    fireEvent.click(screen.getByRole('button', { name: '刷新资料' }));
    expect(await screen.findByText(/资料版本已更新/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '确认购买外观' }));
    expect(write).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '取消' })); expect(buy).toHaveFocus();
    fireEvent.click(buy);
    expect(screen.getByRole('region', { name: '操作二次确认' })).toHaveTextContent('购买后余额 3,800');
  });
  it('keeps the unresolved request through a same-session page unmount, without auto-retrying it', async () => {
    const write = vi.spyOn(officeHubApi, 'action').mockRejectedValue(new Error('lost'));
    const rendered = page(); await start(); await screen.findByRole('button', { name: '核对原请求' });
    const original = write.mock.calls[0]; rendered.unmount();
    render(tree('/games/office-boss'));
    expect(await screen.findByRole('button', { name: '核对原请求' })).toBeVisible();
    expect(write).toHaveBeenCalledOnce();
    write.mockResolvedValueOnce(receipt(original[2]!, outcome(), {}, true));
    fireEvent.click(screen.getByRole('button', { name: '核对原请求' }));
    await waitFor(() => expect(write).toHaveBeenCalledTimes(2)); expect(write.mock.calls[1]).toEqual(original);
  });
  it('does not leak a late response or unlock an in-flight action belonging to a different account', async () => {
    const first = deferred<OfficeHubOverview>(), second = deferred<OfficeHubOverview>();
    const write = vi.spyOn(officeHubApi, 'action').mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    page(); await start(); const oldId = write.mock.calls[0][2]!;
    vi.mocked(officeHubApi.overview).mockResolvedValue(overview(relief({ tokenBalance: 777 })));
    act(() => { setCommunitySessionTokens('synthetic-other'); useCommunityAuthStore.setState({ user: { ...TOWER_TEST_USER, publicId: 'relief-other' } }); });
    await waitFor(() => expect(screen.getByLabelText('机会与独立代币')).toHaveTextContent('777'));
    await start();
    await act(async () => first.resolve(receipt(oldId, outcome({ message: '另一个账号的私有回执' }))));
    expect(screen.queryByText('另一个账号的私有回执')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '消耗 1 次机会 · 释放压力' })).toBeDisabled();
    await act(async () => second.resolve(receipt(write.mock.calls[1][2]!, outcome({ message: '当前账号确认回执' }))));
    expect(await screen.findByText('当前账号确认回执')).toBeVisible();
  });
  it('resets drafts and ignores prior-session responses after re-login to the same public account', async () => {
    const pending = deferred<OfficeHubOverview>(); const write = vi.spyOn(officeHubApi, 'action').mockReturnValue(pending.promise);
    page(); await start();
    act(() => { setCommunitySessionTokens('same-user-new-session'); useCommunityAuthStore.setState({ user: { ...TOWER_TEST_USER } }); });
    await waitFor(() => expect(screen.getByRole('button', { name: '消耗 1 次机会 · 释放压力' })).toBeEnabled());
    await act(async () => pending.resolve(receipt(write.mock.calls[0][2]!, outcome({ message: '旧会话回执' }))));
    expect(screen.queryByText('旧会话回执')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '核对原请求' })).not.toBeInTheDocument();
  });
  it('does not let an older GET replace a completed action receipt', async () => {
    const oldGet = deferred<OfficeHubOverview>();
    vi.spyOn(officeHubApi, 'action').mockImplementation(async (_action, _data, id) => receipt(id!));
    page(); await screen.findByLabelText('演出工具');
    vi.mocked(officeHubApi.overview).mockReturnValue(oldGet.promise);
    fireEvent.click(screen.getByRole('button', { name: '刷新资料' }));
    await start(); await screen.findByText('纸片回执：获得 500 解压币');
    await act(async () => oldGet.resolve(overview(relief({ tokenBalance: 123 }))));
    expect(screen.getByLabelText('机会与独立代币')).toHaveTextContent('2,500');
  });
});

describe('pressure workspace honest rewards, privacy and compatibility', () => {
  it('shows an explicit opt-in sound toggle and resets it after a privacy cover', async () => {
    const close = vi.fn(async () => {});
    class SilentAudio {
      state = 'suspended';
      resume = async () => { this.state = 'running'; };
      close = close;
    }
    vi.stubGlobal('AudioContext', SilentAudio); vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    const rendered = page();
    const toggle = await screen.findByRole('button', { name: '音效：静音' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(await screen.findByRole('button', { name: '音效：开启' })).toHaveAttribute('aria-pressed', 'true');
    rendered.rerender(tree('/games/office-boss', true));
    expect(close).toHaveBeenCalledOnce();
    rendered.rerender(tree('/games/office-boss'));
    expect(screen.getByRole('button', { name: '音效：静音' })).toHaveAttribute('aria-pressed', 'false');
  });
  it('keeps unsupported sound disabled while manual business actions remain available', async () => {
    vi.stubGlobal('AudioContext', undefined);
    page();
    expect(await screen.findByRole('button', { name: '音效不可用' })).toBeDisabled();
    expect(screen.getByText(/当前浏览器不支持音效/)).toBeVisible();
    expect(await screen.findByRole('button', { name: '消耗 1 次机会 · 释放压力' })).toBeEnabled();
  });
  it('shows the actual bounded token loss rather than the larger rolled amount or a global debit', async () => {
    vi.spyOn(officeHubApi, 'action').mockImplementation(async (_action, _data, id) => receipt(id!, outcome({ kind: 'loss', tokenDelta: -15, nominalAmount: 250, message: '仅扣减剩余的 15 解压币' }), { tokenBalance: 0 }));
    page(overview(relief({ tokenBalance: 15 }))); await start();
    expect(await screen.findByText('-15 解压币')).toBeVisible();
    expect(screen.queryByText('-250 解压币')).not.toBeInTheDocument();
    expect(screen.getByText(/你的办公币与其他资产不受影响/)).toBeVisible();
    expect(screen.getByLabelText('机会与独立代币')).toHaveTextContent('解压币 · 仅本模块0');
  });
  it('hides former-account balances and local confirmation before the next account GET finishes', async () => {
    page(overview(relief({ tokenBalance: 7654321 })));
    fireEvent.click(await screen.findByRole('button', { name: '消耗 1 次机会 · 释放压力' }));
    vi.mocked(officeHubApi.overview).mockImplementation(() => new Promise(() => {}));
    act(() => { setCommunitySessionTokens('new-unloaded-user'); useCommunityAuthStore.setState({ user: { ...TOWER_TEST_USER, publicId: 'relief-unloaded' } }); });
    expect(screen.queryByText('7,654,321')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '操作二次确认' })).not.toBeInTheDocument();
    expect(screen.getByText('正在读取压力整理档案…')).toBeVisible();
  });
  it('scrolls a new inline confirmation into view without smooth motion and never under a privacy cover', async () => {
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scroll });
    const rendered = page();
    fireEvent.click(await screen.findByRole('button', { name: '消耗 1 次机会 · 释放压力' }));
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest', behavior: 'auto' });
    scroll.mockClear(); rendered.rerender(tree('/games/office-boss', true));
    expect(scroll).not.toHaveBeenCalled();
    delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
  });
  it('shows GET history without replaying animation, audio or submitting a challenge', async () => {
    const sound = vi.fn(); vi.stubGlobal('AudioContext', sound);
    const write = vi.spyOn(officeHubApi, 'action');
    page(overview(relief({ lastResult: outcome() })));
    expect(await screen.findByText('纸片回执：获得 500 解压币')).toBeVisible();
    expect(art()).toHaveAttribute('data-effect', 'none');
    expect(sound).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled();
    expect(document.querySelector('audio,video,iframe,img')).toBeNull();
  });
  it('plays one bounded local animation only for a new confirmed result', async () => {
    const write = vi.spyOn(officeHubApi, 'action').mockImplementation(async (_action, _data, id) => receipt(id!));
    page(); await start();
    await waitFor(() => expect(art()).toHaveAttribute('data-effect', 'gain'));
    expect(art().querySelectorAll('[style*="--particle-x"]')).toHaveLength(10);
    fireEvent.blur(window);
    expect(art()).toHaveAttribute('data-effect', 'none');
    fireEvent.click(screen.getByRole('button', { name: '刷新资料' }));
    await waitFor(() => expect(officeHubApi.overview).toHaveBeenCalledTimes(2));
    expect(art()).toHaveAttribute('data-effect', 'none'); expect(write).toHaveBeenCalledOnce();
  });
  it('respects reduced motion immediately and never creates an audio context', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    const sound = vi.fn(); vi.stubGlobal('AudioContext', sound);
    vi.spyOn(officeHubApi, 'action').mockImplementation(async (_action, _data, id) => receipt(id!));
    page(); await start(); await screen.findByText('纸片回执：获得 500 解压币');
    expect(art()).toHaveAttribute('data-effect', 'none'); expect(sound).not.toHaveBeenCalled();
  });
  it('does not animate a response received under the privacy cover, nor replay it after uncovering', async () => {
    const pending = deferred<OfficeHubOverview>(); const write = vi.spyOn(officeHubApi, 'action').mockReturnValue(pending.promise);
    const rendered = page(); await start();
    rendered.rerender(tree('/games/office-boss', true));
    await act(async () => pending.resolve(receipt(write.mock.calls[0][2]!)));
    expect(art()).toHaveAttribute('data-effect', 'none');
    rendered.rerender(tree('/games/office-boss'));
    expect(await screen.findByText('纸片回执：获得 500 解压币')).toBeVisible();
    expect(art()).toHaveAttribute('data-effect', 'none');
  });
  it('preserves old daily fixed rewards when the server has no relief field', async () => {
    const view = overview(); delete view.relief;
    const rendered = page(view);
    expect(await screen.findByText(/机会挑战暂未开放/)).toBeVisible();
    expect(screen.getByRole('button', { name: '消耗 1 次机会 · 释放压力' })).toBeDisabled();
    fireEvent.click(screen.getByRole('link', { name: '每日巡视' }));
    expect(await screen.findByRole('button', { name: '开始今日巡视' })).toBeEnabled();
    rendered.unmount();
    // A fresh session reads the server's finished daily timer, not a client grant.
    act(() => { setCommunitySessionTokens('next-daily-test'); useCommunityAuthStore.setState({ user: { ...TOWER_TEST_USER } }); });
    view.boss = { ...view.boss, startedAt: '2026-09-11T06:59:00Z', endsAt: '2026-09-11T06:59:30Z' };
    vi.mocked(officeHubApi.overview).mockResolvedValue(view);
    const write = vi.spyOn(officeHubApi, 'action').mockResolvedValue({ ...view, boss: { ...view.boss, claimed: true } });
    render(tree('/games/office-boss?mode=daily'));
    fireEvent.click(await screen.findByRole('button', { name: '收工：领取 20 办公币 +5 经验' }));
    expect(write).toHaveBeenCalledWith('boss_claim', {}, expect.any(String));
    expect(await screen.findByRole('button', { name: '今日奖励已领取' })).toBeDisabled();
  });
  it('keeps a rejected cross-module drop and explains real destinations instead of showing fake delivery', async () => {
    const view = overview(relief({ pending: [{ id: 'book-a', kind: 'tower_book', itemId: 'weapon_manual', quantity: 15, receivedAt: NOW }, { id: 'crop-a', kind: 'farm_crop', itemId: 'desk_mint', quantity: 1, receivedAt: NOW }] }));
    const write = vi.spyOn(officeHubApi, 'action').mockRejectedValue(new CommunityApiError(409, '', { code: 'OFFICE_RELIEF_TOWER_BUSY' }));
    page(view);
    const book = (await screen.findByText('主手研习手册')).closest('li')!;
    expect(book).toHaveTextContent('领取时的妖塔主手武器增加 15 暂存品质经验');
    expect(book).toHaveTextContent('不增加熟练度');
    expect(screen.getByRole('link', { name: '去妖塔' })).toHaveAttribute('href', '/games/demon-tower?tab=profile');
    expect(screen.getByRole('link', { name: '去农场' })).toHaveAttribute('href', '/farm');
    expect(screen.getByText(/领取 30 种植经验/)).toHaveTextContent('不发办公币；不会自动收获或更换作物');
    expect(screen.queryByText(/农场币/)).not.toBeInTheDocument();
    fireEvent.click(within(book).getByRole('button', { name: '领取物品' })); fireEvent.click(screen.getByRole('button', { name: '确认领取' }));
    expect(write).toHaveBeenCalledWith('relief_claim', { dropId: 'book-a', expectedVersion: 1 }, expect.any(String));
    expect(await screen.findByRole('alert')).toHaveTextContent('物品仍然保留');
    expect(screen.getByText('主手研习手册')).toBeVisible();
  });
  it('removes a pending gift only after the matching successful server claim', async () => {
    const request = deferred<OfficeHubOverview>();
    const write = vi.spyOn(officeHubApi, 'action').mockReturnValue(request.promise);
    page(overview(relief({ pending: [{ id: 'crop-a', kind: 'farm_crop', itemId: 'desk_mint', quantity: 1, receivedAt: NOW }] })));
    fireEvent.click(await screen.findByRole('button', { name: '领取物品' })); fireEvent.click(screen.getByRole('button', { name: '确认领取' }));
    expect(screen.getByText('工位薄荷礼包')).toBeVisible();
    await act(async () => request.resolve(receipt(write.mock.calls[0][2]!, outcome({ kind: 'claim', tokenDelta: 0, message: '农场已增加 30 种植经验' }), { pending: [], tokenBalance: 2000 })));
    expect(screen.queryByText('工位薄荷礼包')).not.toBeInTheDocument();
    expect(screen.getByText('农场已增加 30 种植经验')).toBeVisible();
    expect(art()).toHaveAttribute('data-effect', 'none');
  });
  it('keeps original daily manual tools cosmetic and stops their local tap effect on blur', async () => {
    const view = overview();
    view.boss = { ...view.boss, startedAt: NOW, endsAt: '2026-09-11T07:00:30Z' };
    const write = vi.spyOn(officeHubApi, 'action').mockResolvedValue({ ...view, boss: { ...view.boss, hits: 1, damage: 4 } });
    page(view, '/games/office-boss?mode=daily');
    fireEvent.change(await screen.findByLabelText('解压工具'), { target: { value: 'stapler' } });
    fireEvent.click(screen.getByRole('button', { name: '释放压力' }));
    expect(write).toHaveBeenCalledWith('boss_hit', { tool: 'stapler' }, expect.any(String));
    await waitFor(() => expect(document.querySelector('[aria-label="每日巡视"] svg')).toHaveAttribute('data-effect', 'tap'));
    expect(screen.getByText(/已释放 4 点压力/)).toBeVisible();
    fireEvent.blur(window);
    expect(document.querySelector('[aria-label="每日巡视"] svg')).toHaveAttribute('data-effect', 'none');
  });
  it('shows only the six fixed cosmetics and buys one without submitting a price, currency or equip', async () => {
    const write = vi.spyOn(officeHubApi, 'action').mockImplementation(async (_action, _data, id) => receipt(id!, outcome({ kind: 'purchase', tokenDelta: -1200, message: '买入薄荷便笺' }), { tokenBalance: 800, skins: ['mint'] }));
    page(overview(), '/games/office-boss?section=collection');
    const card = (await screen.findByRole('heading', { name: '薄荷便笺' })).closest('article')!;
    expect(screen.getAllByRole('article')).toHaveLength(6);
    fireEvent.click(within(card).getByRole('button', { name: '购买外观' })); fireEvent.click(screen.getByRole('button', { name: '确认购买外观' }));
    expect(write).toHaveBeenCalledWith('relief_buy', { skinId: 'mint', expectedVersion: 1 }, expect.any(String));
    expect(await within(card).findByRole('button', { name: '使用外观' })).toBeEnabled();
    expect(art()).toHaveAttribute('data-skin', 'default');
    expect(art()).toHaveAttribute('data-effect', 'none');
  });
  it('equips owned cosmetics explicitly and can return to default without spending', async () => {
    const write = vi.spyOn(officeHubApi, 'action').mockImplementation(async (_action, data, id) => receipt(id!, outcome({ kind: 'equip', tokenDelta: 0 }), { skins: ['mint'], equippedSkin: data?.skinId as 'mint' | null, version: data?.expectedVersion === 1 ? 2 : 3 }));
    page(overview(relief({ skins: ['mint'] })), '/games/office-boss?section=collection');
    const card = (await screen.findByRole('heading', { name: '薄荷便笺' })).closest('article')!;
    fireEvent.click(within(card).getByRole('button', { name: '使用外观' })); fireEvent.click(screen.getByRole('button', { name: '确认使用' }));
    await waitFor(() => expect(art()).toHaveAttribute('data-skin', 'mint'));
    fireEvent.click(screen.getByRole('button', { name: '恢复默认' })); fireEvent.click(screen.getByRole('button', { name: '确认恢复' }));
    await waitFor(() => expect(art()).toHaveAttribute('data-skin', 'default'));
    expect(write.mock.calls[1][1]).toEqual({ skinId: null, expectedVersion: 2 });
  });
  it('does not claim global title uniqueness and links manual title wearing to achievements', async () => {
    page(overview(relief({ titles: ['office_relief_fish'], lastResult: outcome({ kind: 'title', tokenDelta: 0, message: '获得摸鱼之神' }) })), '/games/office-boss?section=collection');
    expect(await screen.findByRole('link', { name: '去成就页查看 / 佩戴称号' })).toHaveAttribute('href', '/achievements');
    expect(screen.getByText(/称号不宣称全站唯一/)).toBeVisible();
    expect(screen.queryByText('全站独一份')).not.toBeInTheDocument();
  });
  it.each([
    [relief({ chances: 0 }), '暂无机会'],
    [relief({ tokenBalance: 999990001 }), '接近容量上限'],
    [relief({ pending: Array.from({ length: 99 }, (_, index) => ({ id: `drop-${index}`, kind: 'tower_material' as const, itemId: 'ore' as const, quantity: 3 as const, receivedAt: NOW })) }), '待领区已满'],
  ])('disables unavailable challenges using known service capacity boundaries', async (value, reason) => {
    page(overview(value));
    expect(await screen.findByText(new RegExp(reason))).toBeVisible();
    expect(screen.getByRole('button', { name: '消耗 1 次机会 · 释放压力' })).toBeDisabled();
  });
  it('keeps exact-capacity play available and states conditional tier odds clearly', async () => {
    page(overview(relief({ tokenBalance: 999990000, chances: 10 })), '/games/office-boss?section=rules');
    expect(await screen.findByRole('button', { name: '消耗 1 次机会 · 释放压力' })).toBeEnabled();
    expect(screen.getByText(/池已满，暂停计入/)).toBeVisible();
    expect(screen.getByText(/游戏时间不重复加成/)).toBeVisible();
    expect(screen.getByText(/折合所有挑战的 4%/)).toBeInTheDocument();
    expect(screen.getByText('1,001–2,000 解压币')).toBeInTheDocument();
    expect(screen.getByText('3 款等概率，中奖礼包均领取 30 种植经验')).toBeVisible();
    expect(screen.queryByText(/农场币/)).not.toBeInTheDocument();
  });
});
