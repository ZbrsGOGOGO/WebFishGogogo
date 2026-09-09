import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DemonTowerActionReceipt, DemonTowerOverview } from '@stealth-reader/shared';

import { communityDemonTowerApi } from '../../../api/community-demon-tower';
import { CommunityApiError, setCommunitySessionTokens } from '../../../api/community-http';
import { resetCommunityAuthStoreForTests, useCommunityAuthStore } from '../../../app/store/community-auth-store';
import * as wallet from '../../../app/store/community-wallet-store';
import { TOWER_TEST_USER, towerCatalog, towerOverview, towerProfile, towerReceipt } from './test-fixtures';
import { useDemonTower } from './useDemonTower';

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
describe('demon tower session-scoped actions', () => {
  beforeEach(() => {
    vi.restoreAllMocks(); resetCommunityAuthStoreForTests(); setCommunitySessionTokens('synthetic-tower-a');
    useCommunityAuthStore.setState({ phase: 'active', user: TOWER_TEST_USER, sessionReady: true });
    wallet.resetCommunityWalletStoreForTests();
    vi.spyOn(communityDemonTowerApi, 'catalog').mockResolvedValue(towerCatalog());
    vi.spyOn(communityDemonTowerApi, 'overview').mockResolvedValue(towerOverview());
    vi.spyOn(wallet, 'refreshCommunityWallet').mockResolvedValue();
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

  it('reads a null profile without starting enrollment', async () => {
    vi.mocked(communityDemonTowerApi.overview).mockResolvedValue(towerOverview({ profile: null }));
    const mutation = vi.spyOn(communityDemonTowerApi, 'action'); const { result } = renderHook(() => useDemonTower());
    await waitFor(() => expect(result.current.overview?.profile).toBeNull());
    expect(mutation).not.toHaveBeenCalled(); expect(result.current.loading).toBe(false);
  });
  it('turns a hung catalog connection into a retryable timeout instead of loading forever', async () => {
    vi.useFakeTimers();
    vi.mocked(communityDemonTowerApi.catalog).mockImplementation((signal) => new Promise((_, reject) => signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))));
    const { result } = renderHook(() => useDemonTower());
    expect(result.current.loading).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(25_000); });
    expect(result.current.loading).toBe(false); expect(result.current.error).toContain('读取超时');
    expect(communityDemonTowerApi.overview).not.toHaveBeenCalled();
  });
  it('describes a failed read as stale data rather than an unconfirmed mutation', async () => {
    const { result } = renderHook(() => useDemonTower());
    await waitFor(() => expect(result.current.overview?.profile?.version).toBe(1));
    vi.mocked(communityDemonTowerApi.overview).mockRejectedValue(new CommunityApiError(0, 'offline'));
    await act(async () => { await result.current.refresh(); });
    expect(result.current.stale).toBe(true); expect(result.current.pending).toBe(false);
    expect(result.current.error).toContain('上次同步'); expect(result.current.error).not.toContain('操作是否完成');
    expect(result.current.overview?.profile?.version).toBe(1);
  });
  it('never requests private overview for a guest or a closed feature', async () => {
    useCommunityAuthStore.setState({ phase: 'guest', user: null }); const first = renderHook(() => useDemonTower());
    await waitFor(() => expect(first.result.current.catalog).not.toBeNull()); expect(communityDemonTowerApi.overview).not.toHaveBeenCalled(); first.unmount();
    useCommunityAuthStore.setState({ phase: 'active', user: TOWER_TEST_USER }); vi.mocked(communityDemonTowerApi.catalog).mockResolvedValue(towerCatalog({ enabled: false }));
    const second = renderHook(() => useDemonTower()); await waitFor(() => expect(second.result.current.catalog?.enabled).toBe(false)); expect(communityDemonTowerApi.overview).not.toHaveBeenCalled();
  });
  it('uses one UUID and version for duplicate clicks and preserves it after an uncertain response', async () => {
    const lost = deferred<DemonTowerActionReceipt>(); const mutation = vi.spyOn(communityDemonTowerApi, 'action').mockReturnValueOnce(lost.promise).mockResolvedValue(towerReceipt({ replayed: true }));
    const { result } = renderHook(() => useDemonTower()); await waitFor(() => expect(result.current.overview?.profile?.version).toBe(1));
    let request!: Promise<boolean>;
    act(() => { request = result.current.act({ kind: 'explore', payload: {} }); void result.current.act({ kind: 'explore', payload: {} }); });
    expect(mutation).toHaveBeenCalledOnce(); expect(result.current.busy).toBe(true);
    await act(async () => { lost.reject(new CommunityApiError(0, 'lost')); await request; });
    expect(result.current.pending).toBe(true); expect(result.current.busy).toBe(false);
    await act(async () => { await result.current.act({ kind: 'train', payload: {} }); }); expect(mutation).toHaveBeenCalledOnce();
    await act(async () => { await result.current.retry(); });
    expect(mutation.mock.calls[1][0]).toEqual(mutation.mock.calls[0][0]); expect(mutation.mock.calls[0][0]).toMatchObject({ kind: 'explore', expectedVersion: 1 });
    expect(mutation.mock.calls[0][0].requestId).toMatch(/^[0-9a-f-]{36}$/i); expect(result.current.pending).toBe(false); expect(result.current.overview?.profile?.version).toBe(2);
  });
  it('does not publish any wallet value from a replayed action receipt', async () => {
    const publish = vi.spyOn(wallet, 'publishCommunityWalletOverview');
    vi.spyOn(communityDemonTowerApi, 'action').mockResolvedValue(towerReceipt({ replayed: true, officeCoinsGranted: 30, overview: towerOverview({ profile: towerProfile({ version: 2 }), wallet: { officeCoinBalance: 1 } }) }));
    const { result } = renderHook(() => useDemonTower()); await waitFor(() => expect(result.current.overview).not.toBeNull());
    await act(async () => { await result.current.act({ kind: 'claim_reward', payload: {} }); });
    expect(publish).not.toHaveBeenCalled(); expect(wallet.refreshCommunityWallet).toHaveBeenCalledOnce();
    expect(wallet.useCommunityWalletStore.getState().officeCoins).toBeNull();
  });
  it('does not regress shared-world progress when an action carries a newer personal profile', async () => {
    const current = towerOverview(); current.world.version = 4; current.world.boss.hp = 1900;
    vi.mocked(communityDemonTowerApi.overview).mockResolvedValue(current);
    const receipt = towerReceipt(); receipt.overview.world.version = 3; receipt.overview.world.boss.hp = 2100;
    vi.spyOn(communityDemonTowerApi, 'action').mockResolvedValue(receipt);
    const { result } = renderHook(() => useDemonTower()); await waitFor(() => expect(result.current.overview?.world.version).toBe(4));
    await act(async () => { await result.current.act({ kind: 'train', payload: {} }); });
    expect(result.current.overview?.profile?.version).toBe(2);
    expect(result.current.overview?.world).toMatchObject({ version: 4, boss: { hp: 1900 } });
  });
  it('does not submit any mutation when maintenance is already known', async () => {
    vi.mocked(communityDemonTowerApi.overview).mockResolvedValue(towerOverview({ writesEnabled: false }));
    const mutation = vi.spyOn(communityDemonTowerApi, 'action'); const { result } = renderHook(() => useDemonTower());
    await waitFor(() => expect(result.current.overview?.writesEnabled).toBe(false));
    await act(async () => { await result.current.act({ kind: 'train', payload: {} }); });
    expect(mutation).not.toHaveBeenCalled(); expect(result.current.pending).toBe(false);
  });
  it('treats maintenance rejection as definite and keeps the read-only snapshot visible', async () => {
    const mutation = vi.spyOn(communityDemonTowerApi, 'action').mockRejectedValue(new CommunityApiError(503, 'maintenance', { code: 'COMMUNITY_WRITES_DISABLED' }));
    const { result } = renderHook(() => useDemonTower()); await waitFor(() => expect(result.current.overview?.profile?.version).toBe(1));
    vi.mocked(communityDemonTowerApi.overview).mockResolvedValue(towerOverview({ writesEnabled: false }));
    await act(async () => { await result.current.act({ kind: 'train', payload: {} }); });
    expect(result.current.pending).toBe(false); expect(result.current.error).toContain('维护只读'); expect(result.current.overview?.writesEnabled).toBe(false);
    await act(async () => { await result.current.retry(); await result.current.act({ kind: 'train', payload: {} }); }); expect(mutation).toHaveBeenCalledOnce();
  });
  it('never silently redirects a rejected boss action onto a newly opened floor', async () => {
    const mutation = vi.spyOn(communityDemonTowerApi, 'action').mockRejectedValue(new CommunityApiError(409, 'new floor', { code: 'DEMON_TOWER_WORLD_FLOOR_CHANGED' }));
    const { result } = renderHook(() => useDemonTower()); await waitFor(() => expect(result.current.overview?.world.currentFloor).toBe(1));
    const next = towerOverview(); next.world = { ...next.world, version: 2, currentFloor: 2, unlockedFloor: 2 };
    vi.mocked(communityDemonTowerApi.overview).mockResolvedValue(next);
    await act(async () => { await result.current.act({ kind: 'challenge_boss', payload: { floor: 1 } }); });
    await waitFor(() => expect(result.current.overview?.world.currentFloor).toBe(2));
    expect(result.current.pending).toBe(false); expect(result.current.error).toContain('确认新的行动目标');
    await act(async () => { await result.current.retry(); }); expect(mutation).toHaveBeenCalledOnce();
    expect(mutation.mock.calls[0][0]).toMatchObject({ kind: 'challenge_boss', payload: { floor: 1 } });
  });
  it('discards a read that began before a mutation even if that read resolves later', async () => {
    const read = deferred<DemonTowerOverview>(); vi.mocked(communityDemonTowerApi.overview).mockResolvedValueOnce(towerOverview()).mockReturnValueOnce(read.promise);
    vi.spyOn(communityDemonTowerApi, 'action').mockResolvedValue(towerReceipt({ overview: towerOverview({ profile: towerProfile({ version: 2, stamina: 90 }) }) }));
    const { result } = renderHook(() => useDemonTower()); await waitFor(() => expect(result.current.overview?.profile?.version).toBe(1));
    let refresh!: Promise<void>; act(() => { refresh = result.current.refresh(); });
    await act(async () => { await result.current.act({ kind: 'explore', payload: {} }); });
    await act(async () => { read.resolve(towerOverview({ profile: towerProfile({ version: 1, stamina: 95 }) })); await refresh; });
    expect(result.current.overview?.profile).toMatchObject({ version: 2, stamina: 90 });
  });
  it('does not replace a newer profile with an older replay overview', async () => {
    vi.mocked(communityDemonTowerApi.overview).mockResolvedValue(towerOverview({ profile: towerProfile({ version: 8 }) }));
    vi.spyOn(communityDemonTowerApi, 'action').mockResolvedValue(towerReceipt({ replayed: true, overview: towerOverview({ profile: towerProfile({ version: 5 }) }) }));
    const { result } = renderHook(() => useDemonTower()); await waitFor(() => expect(result.current.overview?.profile?.version).toBe(8));
    await act(async () => { await result.current.act({ kind: 'train', payload: {} }); }); expect(result.current.overview?.profile?.version).toBe(8);
  });
  it('drops private state and a late mutation reply after an account switch', async () => {
    const write = deferred<DemonTowerActionReceipt>(); vi.spyOn(communityDemonTowerApi, 'action').mockReturnValue(write.promise);
    const { result } = renderHook(() => useDemonTower()); await waitFor(() => expect(result.current.overview).not.toBeNull());
    let request!: Promise<boolean>; act(() => { request = result.current.act({ kind: 'train', payload: {} }); });
    act(() => { setCommunitySessionTokens('synthetic-tower-b'); useCommunityAuthStore.setState({ user: { ...TOWER_TEST_USER, publicId: 'tower-public-b', id: 'tower-user-b', displayName: '另一个合成角色' } }); });
    await waitFor(() => expect(result.current.ownerId).toBe('tower-public-b'));
    await act(async () => { write.resolve(towerReceipt({ overview: towerOverview({ profile: towerProfile({ version: 99 }) }), events: ['旧账号私有战报'] })); await request; });
    expect(result.current.overview?.profile?.version).toBe(1); expect(result.current.receipt).toBeNull(); expect(wallet.refreshCommunityWallet).not.toHaveBeenCalled();
  });
  it('does not overlap an in-flight overview with timer and focus refreshes', async () => {
    vi.useFakeTimers(); const read = deferred<DemonTowerOverview>(); vi.mocked(communityDemonTowerApi.overview).mockReturnValue(read.promise);
    const { result } = renderHook(() => useDemonTower()); await act(async () => { await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(12_000); window.dispatchEvent(new Event('focus')); void result.current.refresh(); });
    expect(communityDemonTowerApi.overview).toHaveBeenCalledOnce();
    await act(async () => { read.resolve(towerOverview()); await read.promise; });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); }); expect(communityDemonTowerApi.overview).toHaveBeenCalledTimes(2);
  });
  it('keeps a clear version-conflict message while synchronizing the updated profile', async () => {
    vi.mocked(communityDemonTowerApi.overview).mockResolvedValueOnce(towerOverview()).mockResolvedValue(towerOverview({ profile: towerProfile({ version: 2 }) }));
    vi.spyOn(communityDemonTowerApi, 'action').mockRejectedValue(new CommunityApiError(409, 'stale', { code: 'DEMON_TOWER_VERSION_CONFLICT' }));
    const { result } = renderHook(() => useDemonTower()); await waitFor(() => expect(result.current.overview?.profile?.version).toBe(1));
    await act(async () => { await result.current.act({ kind: 'train', payload: {} }); });
    await waitFor(() => expect(result.current.overview?.profile?.version).toBe(2)); expect(result.current.pending).toBe(false); expect(result.current.error).toContain('角色状态刚刚发生变化');
  });
  it('allows recovery when the initial public catalog request fails', async () => {
    vi.mocked(communityDemonTowerApi.catalog).mockRejectedValueOnce(new CommunityApiError(0, 'offline')).mockResolvedValue(towerCatalog());
    const { result } = renderHook(() => useDemonTower()); await waitFor(() => expect(result.current.error).not.toBeNull());
    await act(async () => { await result.current.refresh(); });
    await waitFor(() => expect(result.current.catalog?.enabled).toBe(true)); expect(result.current.overview).not.toBeNull();
  });
});
