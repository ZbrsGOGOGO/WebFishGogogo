import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DemonTowerActionReceipt, DemonTowerExplorationReceipt, DemonTowerOverview } from '@stealth-reader/shared';
import { communityDemonTowerApi } from '../../../api/community-demon-tower';
import { CommunityApiError, setCommunitySessionTokens } from '../../../api/community-http';
import { resetCommunityAuthStoreForTests, useCommunityAuthStore } from '../../../app/store/community-auth-store';
import * as wallet from '../../../app/store/community-wallet-store';
import { DemonTowerPage } from './DemonTowerPage';
import { DemonTowerExplorationResult } from './DemonTowerExplorationResult';
import { useDemonTower } from './useDemonTower';
import { TOWER_TEST_NOW, TOWER_TEST_USER, towerBattle, towerCatalog, towerOverview, towerProfile, towerReceipt } from './test-fixtures';

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const departure = (overrides: Partial<DemonTowerExplorationReceipt> = {}): DemonTowerExplorationReceipt => ({
  requestId: '00000000-0000-4000-8000-000000000010', appliedVersion: 2, completedAt: TOWER_TEST_NOW, source: 'manual',
  result: { outcome: 'treasure', floor: 1, staminaSpent: 5, passesSpent: 0, experience: 30, materials: { ore: 4, herb: 2, soul: 0, clue: 0 }, spiritStones: 6 },
  events: ['经验已结算。', '获得绑定武器。', '属性已成长。', '免费保底已生效。', '找到旧日宝匣，收集了经验与材料。', '探索奇遇：灵石+6。'], officeCoinsGranted: 2, ...overrides,
});
function page() { return render(<MemoryRouter initialEntries={['/games/demon-tower?tab=explore']}><DemonTowerPage /></MemoryRouter>); }
describe('Exploration results and transport recovery', () => {
  beforeEach(() => {
    vi.restoreAllMocks(); resetCommunityAuthStoreForTests(); setCommunitySessionTokens('synthetic-explore-a');
    useCommunityAuthStore.setState({ phase: 'active', user: TOWER_TEST_USER, sessionReady: true }); wallet.resetCommunityWalletStoreForTests();
    vi.spyOn(wallet, 'refreshCommunityWallet').mockResolvedValue();
    vi.spyOn(communityDemonTowerApi, 'catalog').mockResolvedValue(towerCatalog());
    vi.spyOn(communityDemonTowerApi, 'overview').mockResolvedValue(towerOverview());
    vi.spyOn(communityDemonTowerApi, 'action').mockResolvedValue(towerReceipt());
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
  it('restores a noncombat departure from the server with every event and actual costs/rewards, without a mutation', async () => {
    const receipt = departure(); vi.mocked(communityDemonTowerApi.overview).mockResolvedValue(towerOverview({ lastExploration: receipt, profile: towerProfile({ version: 2, stamina: 90 }) }));
    page(); const panel = await screen.findByRole('region', { name: '探索出发结果 · 发现宝匣' });
    expect(within(panel).getByText(/没有战斗不是探索失败/)).toBeTruthy();
    expect(within(panel).getByText('体力消耗').nextElementSibling).toHaveTextContent('5');
    expect(within(panel).getByText('探索符消耗').nextElementSibling).toHaveTextContent('0');
    const list = within(panel).getByRole('list', { name: '完整探索回执' }); expect(within(list).getAllByRole('listitem')).toHaveLength(6);
    expect(within(list).getByText(receipt.events[4])).toBeTruthy(); expect(within(panel).getByText('办公币已到账 +2')).toBeTruthy();
    expect(communityDemonTowerApi.action).not.toHaveBeenCalled(); expect(panel.textContent).not.toContain(TOWER_TEST_USER.email!);
  });
  it.each(['battle', 'blessing'] as const)('uses the server %s classification and does not present final battle rewards as departure rewards', outcome => {
    const receipt = departure({ result: { ...departure().result!, outcome, experience: 8, materials: { ore: 0, herb: 0, soul: 0, clue: 0 }, spiritStones: 0 }, officeCoinsGranted: 0 });
    render(<DemonTowerExplorationResult receipt={receipt} catalog={towerCatalog()} stale={false} />);
    expect(screen.getByRole('heading', { name: `探索出发结果 · ${outcome === 'battle' ? '遭遇妖物' : '灵脉机缘'}` })).toBeTruthy();
    if (outcome === 'battle') expect(screen.getByText(/战斗完成奖励另见战报/)).toBeTruthy();
    expect(screen.getByText('已获妖塔经验').nextElementSibling).toHaveTextContent('+8');
  });
  it('reports actual pass use and displays legacy text without inventing missing numeric costs', () => {
    const pass = departure({ result: { ...departure().result!, staminaSpent: 0, passesSpent: 1 } });
    const first = render(<DemonTowerExplorationResult receipt={pass} catalog={towerCatalog()} stale={false} />);
    expect(screen.getByText('体力消耗').nextElementSibling).toHaveTextContent('0'); expect(screen.getByText('探索符消耗').nextElementSibling).toHaveTextContent('1'); first.unmount();
    render(<DemonTowerExplorationResult receipt={departure({ source: 'legacy', result: undefined })} catalog={towerCatalog()} stale={false} />);
    expect(screen.getByRole('heading', { name: '最近探索回执（旧版）' })).toBeTruthy(); expect(screen.queryByText('体力消耗')).toBeNull();
    expect(screen.queryByText('探索符消耗')).toBeNull(); expect(screen.queryByText('已获妖塔经验')).toBeNull(); expect(screen.getByText(/不会推断或补造数值/)).toBeTruthy();
  });
  it('degrades safely with an older API and shows all retained original events', async () => {
    const events = departure().events; vi.mocked(communityDemonTowerApi.action).mockResolvedValue(towerReceipt({ events }));
    page(); fireEvent.click(await screen.findByRole('button', { name: /开始探索/ }));
    expect(await screen.findByText(events[5])).toBeTruthy(); expect(screen.queryByRole('region', { name: /探索出发结果/ })).toBeNull();
    expect(screen.queryByText('体力消耗')).toBeNull();
  });
  it('blocks all new actions after a failed read until a successful sync, not just a disabled render', async () => {
    const { result } = renderHook(() => useDemonTower()); await waitFor(() => expect(result.current.overview).not.toBeNull());
    vi.mocked(communityDemonTowerApi.overview).mockRejectedValue(new CommunityApiError(0, 'synthetic offline'));
    await act(async () => { await result.current.refresh(); }); expect(result.current.stale).toBe(true);
    await act(async () => { expect(await result.current.act({ kind: 'explore', payload: {} })).toBe(false); expect(await result.current.act({ kind: 'train', payload: {} })).toBe(false); });
    expect(communityDemonTowerApi.action).not.toHaveBeenCalled();
    vi.mocked(communityDemonTowerApi.overview).mockResolvedValue(towerOverview()); await act(async () => { await result.current.refresh(); });
    await act(async () => { expect(await result.current.act({ kind: 'explore', payload: {} })).toBe(true); }); expect(communityDemonTowerApi.action).toHaveBeenCalledOnce();
  });
  it('disables the visible exploration button when the existing snapshot becomes stale', async () => {
    page(); await screen.findByRole('button', { name: /开始探索/ });
    vi.mocked(communityDemonTowerApi.overview).mockRejectedValue(new CommunityApiError(0, 'offline')); fireEvent.click(screen.getByRole('button', { name: '刷新妖塔状态' }));
    await screen.findByText(/当前显示上次同步档案/); expect(screen.getByRole('button', { name: /开始探索/ })).toBeDisabled(); expect(screen.getByRole('button', { name: /潜心修炼/ })).toBeDisabled();
  });
  it('keeps the original UUID after a lost action response while allowing server recovery and exact confirmation', async () => {
    const lost = deferred<DemonTowerActionReceipt>(); vi.mocked(communityDemonTowerApi.action).mockReturnValueOnce(lost.promise);
    const { result } = renderHook(() => useDemonTower()); await waitFor(() => expect(result.current.overview).not.toBeNull());
    let request!: Promise<boolean>; act(() => { request = result.current.act({ kind: 'explore', payload: {} }); void result.current.act({ kind: 'explore', payload: {} }); });
    const input = vi.mocked(communityDemonTowerApi.action).mock.calls[0][0], receipt = departure({ requestId: input.requestId });
    await act(async () => { lost.reject(new CommunityApiError(0, 'lost after commit')); await request; }); expect(result.current.pending).toBe(true); expect(result.current.stale).toBe(true);
    const current = towerOverview({ lastExploration: receipt, profile: towerProfile({ version: 2, stamina: 90, battle: towerBattle(), availableActions: ['attack', 'skill', 'flee'] }) });
    vi.mocked(communityDemonTowerApi.overview).mockResolvedValue(current); await act(async () => { await result.current.refresh(); });
    expect(result.current.overview?.lastExploration).toEqual(receipt); expect(result.current.pending).toBe(true);
    await act(async () => { expect(await result.current.act({ kind: 'explore', payload: {} })).toBe(false); }); expect(communityDemonTowerApi.action).toHaveBeenCalledOnce();
    vi.mocked(communityDemonTowerApi.action).mockResolvedValue(towerReceipt({ requestId: input.requestId, replayed: true, exploration: receipt, overview: current }));
    await act(async () => { expect(await result.current.retry()).toBe(true); }); expect(vi.mocked(communityDemonTowerApi.action).mock.calls[1][0]).toEqual(input);
    expect(result.current.pending).toBe(false); expect(result.current.overview?.profile?.stamina).toBe(90);
  });
  it('never replaces a newer departure with an older historical reply, even with equal profile versions', async () => {
    const newer = departure({ appliedVersion: 8 }), older = departure({ requestId: '00000000-0000-4000-8000-000000000011', appliedVersion: 2 });
    vi.mocked(communityDemonTowerApi.overview).mockResolvedValue(towerOverview({ lastExploration: newer, profile: towerProfile({ version: 8 }) }));
    vi.mocked(communityDemonTowerApi.action).mockResolvedValue(towerReceipt({ replayed: true, exploration: older, overview: towerOverview({ lastExploration: older, profile: towerProfile({ version: 8 }) }) }));
    const { result } = renderHook(() => useDemonTower()); await waitFor(() => expect(result.current.overview?.lastExploration).toEqual(newer));
    await act(async () => { await result.current.act({ kind: 'train', payload: {} }); }); expect(result.current.overview?.lastExploration).toEqual(newer);
  });
  it('discards a previous session read and receipt when the same owner logs in again', async () => {
    const oldRead = deferred<DemonTowerOverview>(), freshRead = deferred<DemonTowerOverview>();
    vi.mocked(communityDemonTowerApi.overview).mockReturnValueOnce(oldRead.promise).mockReturnValueOnce(freshRead.promise);
    const { result } = renderHook(() => useDemonTower()); await waitFor(() => expect(communityDemonTowerApi.overview).toHaveBeenCalledOnce());
    act(() => { setCommunitySessionTokens('synthetic-explore-relogin'); useCommunityAuthStore.setState({ sessionReady: true }); });
    await waitFor(() => expect(communityDemonTowerApi.overview).toHaveBeenCalledTimes(2)); expect(result.current.overview).toBeNull();
    await act(async () => { oldRead.resolve(towerOverview({ lastExploration: departure({ events: ['旧会话私有回执'] }) })); await oldRead.promise; });
    expect(result.current.overview).toBeNull(); await act(async () => { freshRead.resolve(towerOverview({ lastExploration: null })); await freshRead.promise; });
    expect(result.current.overview?.lastExploration).toBeNull(); expect(result.current.receipt).toBeNull();
  });
  it('ignores a late mutation reply after unmount without launching a new private read', async () => {
    const late = deferred<DemonTowerActionReceipt>(); vi.mocked(communityDemonTowerApi.action).mockReturnValue(late.promise);
    const { result, unmount } = renderHook(() => useDemonTower()); await waitFor(() => expect(result.current.overview).not.toBeNull());
    let request!: Promise<boolean>; act(() => { request = result.current.act({ kind: 'explore', payload: {} }); }); unmount();
    await act(async () => { late.resolve(towerReceipt({ exploration: departure() })); expect(await request).toBe(false); });
    expect(communityDemonTowerApi.overview).toHaveBeenCalledOnce(); expect(wallet.refreshCommunityWallet).not.toHaveBeenCalled();
  });
});
