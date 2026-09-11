import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEVELOPMENT_LIMITS, type DevelopmentAccess } from '@stealth-reader/shared';

import { communityDevelopmentApi } from '../../api/community-development';
import type { CommunityAuthUser } from '../../api/community-auth';
import { setCommunitySessionTokens } from '../../api/community-http';
import { resetCommunityAuthStoreForTests, useCommunityAuthStore } from '../../app/store/community-auth-store';
import { CommunitySiteLayout } from '../../components/layout/CommunitySiteLayout';
import { DevelopmentAccessGate } from './development-access';

const ownerAccess: DevelopmentAccess = {
  enabled: true,
  role: 'owner',
  reviewMode: 'manual',
  limits: DEVELOPMENT_LIMITS,
};

function user(publicId: string): CommunityAuthUser {
  return {
    id: publicId,
    publicId,
    username: publicId,
    email: `${publicId}@example.com`,
    displayName: publicId,
    accountStatus: 'active',
    onboardingCompleted: true,
    socialVerificationStatus: 'unverified',
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function renderDevelopmentRoute() {
  return render(
    <MemoryRouter initialEntries={['/development']}>
      <Routes>
        <Route element={<CommunitySiteLayout />}>
          <Route element={<DevelopmentAccessGate />}>
            <Route path="/development" element={<h1>私有开发页</h1>} />
          </Route>
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('development access boundary', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    resetCommunityAuthStoreForTests();
    useCommunityAuthStore.setState({
      phase: 'active',
      sessionReady: true,
      user: user('account-a'),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    resetCommunityAuthStoreForTests();
  });

  it('denies the route and does not expose a navigation entry when access is disabled', async () => {
    vi.spyOn(communityDevelopmentApi, 'getAccess').mockResolvedValue({
      ...ownerAccess,
      enabled: false,
      role: null,
    });

    renderDevelopmentRoute();

    expect(await screen.findByText('当前账号没有访问权限')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '私有开发页' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '开发协作' })).not.toBeInTheDocument();
  });

  it('shows the private route and desktop/mobile entries only after an allowed response', async () => {
    const pending = deferred<DevelopmentAccess>();
    vi.spyOn(communityDevelopmentApi, 'getAccess').mockReturnValue(pending.promise);

    renderDevelopmentRoute();
    expect(screen.queryByRole('link', { name: '开发协作' })).not.toBeInTheDocument();

    await act(async () => {
      pending.resolve(ownerAccess);
      await pending.promise;
    });

    expect(await screen.findByRole('heading', { name: '私有开发页' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: '开发协作' }).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('link', { name: '开发' })).toHaveAttribute('href', '/development');
  });

  it('clears account A immediately and ignores its late allow response after switching to B', async () => {
    const accountA = deferred<DevelopmentAccess>();
    const accountB = deferred<DevelopmentAccess>();
    vi.spyOn(communityDevelopmentApi, 'getAccess')
      .mockReturnValueOnce(accountA.promise)
      .mockReturnValueOnce(accountB.promise);
    renderDevelopmentRoute();

    act(() => {
      useCommunityAuthStore.setState({ user: user('account-b'), phase: 'active' });
    });
    expect(screen.queryByRole('link', { name: '开发协作' })).not.toBeInTheDocument();

    await act(async () => {
      accountB.resolve({ ...ownerAccess, enabled: false, role: null });
      await accountB.promise;
    });
    expect(await screen.findByText('当前账号没有访问权限')).toBeInTheDocument();

    await act(async () => {
      accountA.resolve(ownerAccess);
      await accountA.promise;
    });
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: '开发协作' })).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('heading', { name: '私有开发页' })).not.toBeInTheDocument();
  });

  it('rechecks and immediately hides allowed access across a new session for the same account', async () => {
    const next = deferred<DevelopmentAccess>();
    vi.spyOn(communityDevelopmentApi, 'getAccess').mockResolvedValueOnce(ownerAccess).mockReturnValueOnce(next.promise);
    renderDevelopmentRoute();
    expect(await screen.findByRole('heading', { name: '私有开发页' })).toBeInTheDocument();
    act(() => { setCommunitySessionTokens(null); useCommunityAuthStore.setState({ loading: false }); });
    expect(screen.queryByRole('heading', { name: '私有开发页' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '开发协作' })).not.toBeInTheDocument();
    expect(communityDevelopmentApi.getAccess).toHaveBeenCalledTimes(2);
    await act(async () => { next.resolve({ ...ownerAccess, enabled: false, role: null }); await next.promise; });
    expect(await screen.findByText('当前账号没有访问权限')).toBeInTheDocument();
  });

  it('ignores an old allow response even when a new session has the same publicId', async () => {
    const old = deferred<DevelopmentAccess>(); const next = deferred<DevelopmentAccess>();
    vi.spyOn(communityDevelopmentApi, 'getAccess').mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    renderDevelopmentRoute();
    act(() => { setCommunitySessionTokens(null); useCommunityAuthStore.setState({ loading: false }); });
    await act(async () => { old.resolve(ownerAccess); await old.promise; });
    expect(screen.queryByRole('heading', { name: '私有开发页' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '开发协作' })).not.toBeInTheDocument();
    await act(async () => { next.resolve({ ...ownerAccess, enabled: false, role: null }); await next.promise; });
    expect(await screen.findByText('当前账号没有访问权限')).toBeInTheDocument();
  });
});
