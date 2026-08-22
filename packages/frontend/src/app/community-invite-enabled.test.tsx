import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('community referral acceptance route', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
    window.sessionStorage.clear();
  });

  it('lets a guest preview an enabled referral link without first logging in', async () => {
    vi.stubEnv('VITE_COMMUNITY_INVITE_ENABLED', 'true');
    vi.stubEnv('VITE_COMMUNITY_REGISTRATION_ENABLED', 'true');
    vi.resetModules();
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/v1/referrals/preview')) {
        return Promise.resolve(new Response(JSON.stringify({
          bindingToken: 'rct_router-binding',
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
          inviter: { publicId: 'public-inviter', displayName: '路由邀请人', avatarKey: 'violet' },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      return Promise.resolve(new Response('', { status: 401 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const [{ CommunityModeRouter }, { resetCommunityAuthStoreForTests }] = await Promise.all([
      import('./community-router'),
      import('./store/community-auth-store'),
    ]);
    resetCommunityAuthStoreForTests();

    render(
      <MemoryRouter initialEntries={['/invite/accept?code=ref_router-code']}>
        <CommunityModeRouter />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '接受同事邀请' })).toBeInTheDocument();
    expect(await screen.findByText('路由邀请人')).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls.find(([input]) =>
      String(input).includes('/v1/referrals/preview'),
    ) as [string, RequestInit];
    expect(url).toContain('/v1/referrals/preview');
    expect(new Headers(init.headers).get('Authorization')).toBeNull();
  });
});
