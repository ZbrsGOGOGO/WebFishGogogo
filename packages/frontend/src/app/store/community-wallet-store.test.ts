import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { communityFarmApi, type CommunityFarmOverview } from '../../api/community-farm';
import { setCommunitySessionTokens } from '../../api/community-http';
import { resetCommunityAuthStoreForTests, useCommunityAuthStore } from './community-auth-store';
import {
  beginCommunityWalletObservation, finishCommunityWalletObservation,
  publishCommunityWalletOverview, refreshCommunityWallet,
  resetCommunityWalletStoreForTests, useCommunityWalletStore,
} from './community-wallet-store';

const USER = {
  id: 'wallet-user', publicId: 'wallet-public', email: 'wallet@example.test',
  displayName: '余额测试', accountStatus: 'active' as const, onboardingCompleted: true,
  socialVerificationStatus: 'unverified' as const,
};
function snapshot(officeCoins = 620, second = 10): CommunityFarmOverview {
  return { serverTime: `2026-09-08T01:00:${String(second).padStart(2, '0')}.000Z`, growth: { officeCoins } } as CommunityFarmOverview;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

describe('community wallet session-scoped server balance', () => {
  beforeEach(() => {
    resetCommunityAuthStoreForTests(); resetCommunityWalletStoreForTests();
    useCommunityAuthStore.setState({ phase: 'active', sessionReady: true, user: USER });
    vi.spyOn(communityFarmApi, 'getOverview').mockResolvedValue(snapshot());
  });
  afterEach(() => { vi.restoreAllMocks(); resetCommunityAuthStoreForTests(); resetCommunityWalletStoreForTests(); });

  it('deduplicates a shared read and publishes only the real server balance', async () => {
    const read = deferred<CommunityFarmOverview>();
    vi.mocked(communityFarmApi.getOverview).mockReturnValue(read.promise);
    const first = refreshCommunityWallet(); const second = refreshCommunityWallet();
    expect(first).toBe(second); expect(communityFarmApi.getOverview).toHaveBeenCalledOnce();
    expect(useCommunityWalletStore.getState()).toMatchObject({ officeCoins: null, status: 'loading' });
    read.resolve(snapshot(137)); await first;
    expect(useCommunityWalletStore.getState()).toMatchObject({ officeCoins: 137, ownerId: USER.publicId, status: 'ready' });
  });

  it.each(['guest', 'bootstrapping', 'suspended', 'banned', 'deleting', 'pending_email'] as const)(
    'does not read or expose an account balance in phase %s', async (phase) => {
      await refreshCommunityWallet();
      vi.mocked(communityFarmApi.getOverview).mockClear();
      useCommunityAuthStore.setState({ phase });
      await refreshCommunityWallet();
      expect(communityFarmApi.getOverview).not.toHaveBeenCalled();
      expect(useCommunityWalletStore.getState()).toMatchObject({ officeCoins: null, ownerId: null });
    },
  );

  it('does not turn an unavailable initial balance into a fabricated zero', async () => {
    vi.mocked(communityFarmApi.getOverview).mockRejectedValue(new Error('offline'));
    await refreshCommunityWallet();
    expect(useCommunityWalletStore.getState()).toMatchObject({ officeCoins: null, status: 'error' });
  });

  it('retains a known balance but marks it unsynced after a failed refresh', async () => {
    await refreshCommunityWallet();
    vi.mocked(communityFarmApi.getOverview).mockRejectedValue(new Error('offline'));
    await refreshCommunityWallet();
    expect(useCommunityWalletStore.getState()).toMatchObject({ officeCoins: 620, status: 'stale' });
  });

  it('rejects older read responses after a newer read has applied', () => {
    const older = beginCommunityWalletObservation(); const newer = beginCommunityWalletObservation();
    publishCommunityWalletOverview(newer, snapshot(500, 20));
    publishCommunityWalletOverview(older, snapshot(620, 10));
    expect(useCommunityWalletStore.getState()).toMatchObject({ officeCoins: 500, status: 'ready' });
  });

  it('does not let a pending read undo a successful purchase', () => {
    const oldRead = beginCommunityWalletObservation();
    const purchase = beginCommunityWalletObservation('mutation');
    publishCommunityWalletOverview(purchase, snapshot(420, 20));
    finishCommunityWalletObservation(purchase);
    publishCommunityWalletOverview(oldRead, snapshot(620, 10));
    expect(useCommunityWalletStore.getState()).toMatchObject({ officeCoins: 420, status: 'ready' });
  });

  it('ignores reads started during a mutation, even if they finish afterward', async () => {
    const purchase = beginCommunityWalletObservation('mutation');
    const during = beginCommunityWalletObservation();
    await refreshCommunityWallet();
    expect(communityFarmApi.getOverview).not.toHaveBeenCalled();
    publishCommunityWalletOverview(purchase, snapshot(420, 20));
    finishCommunityWalletObservation(purchase);
    publishCommunityWalletOverview(during, snapshot(620, 21));
    expect(useCommunityWalletStore.getState().officeCoins).toBe(420);
  });

  it('does not let completing an older mutation invalidate the newer mutation result', () => {
    const older = beginCommunityWalletObservation('mutation');
    const newer = beginCommunityWalletObservation('mutation');
    finishCommunityWalletObservation(older);
    publishCommunityWalletOverview(newer, snapshot(300, 30));
    finishCommunityWalletObservation(newer);
    expect(useCommunityWalletStore.getState()).toMatchObject({ officeCoins: 300, status: 'ready' });
  });

  it('treats an old idempotency receipt as stale even when it belongs to a new request', () => {
    publishCommunityWalletOverview(beginCommunityWalletObservation(), snapshot(420, 20));
    const replay = beginCommunityWalletObservation('mutation');
    publishCommunityWalletOverview(replay, snapshot(620, 10));
    finishCommunityWalletObservation(replay);
    expect(useCommunityWalletStore.getState()).toMatchObject({ officeCoins: 420, status: 'stale' });
  });

  it('clears old identity data immediately and ignores its late request after switching accounts', async () => {
    const read = deferred<CommunityFarmOverview>();
    vi.mocked(communityFarmApi.getOverview).mockReturnValueOnce(read.promise);
    const pending = refreshCommunityWallet();
    useCommunityAuthStore.setState({ user: { ...USER, publicId: 'other-public' } });
    expect(useCommunityWalletStore.getState()).toMatchObject({ ownerId: 'other-public', officeCoins: null });
    read.resolve(snapshot(999)); await pending;
    expect(useCommunityWalletStore.getState().officeCoins).toBeNull();
  });

  it('rejects a previous session response after logging back into the same account', () => {
    const old = beginCommunityWalletObservation();
    setCommunitySessionTokens(null);
    useCommunityAuthStore.setState({ phase: 'guest', user: null });
    useCommunityAuthStore.setState({ phase: 'active', user: USER });
    publishCommunityWalletOverview(old, snapshot(999));
    expect(useCommunityWalletStore.getState().officeCoins).toBeNull();
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 1.5])('rejects an invalid balance %s without replacing trusted data', (value) => {
    publishCommunityWalletOverview(beginCommunityWalletObservation(), snapshot(420, 20));
    publishCommunityWalletOverview(beginCommunityWalletObservation(), snapshot(value, 30));
    expect(useCommunityWalletStore.getState()).toMatchObject({ officeCoins: 420, status: 'stale' });
  });
});
