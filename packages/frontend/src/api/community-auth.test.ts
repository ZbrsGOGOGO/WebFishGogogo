import { afterEach, describe, expect, it, vi } from 'vitest';

import { communityAuthApi } from './community-auth';
import {
  getCommunityAccessToken,
  resetCommunityHttpForTests,
  setCommunitySessionTokens,
} from './community-http';

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('community auth credential client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetCommunityHttpForTests();
  });

  it('sends an authenticated password change without making it replayable', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    setCommunitySessionTokens('short-lived-access');

    await communityAuthApi.changePassword({
      currentPassword: 'Current-Office#2026',
      newPassword: 'Changed-Office#2026',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/auth\/password-change$/);
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(new Headers(init.headers).get('Authorization')).toBe(
      'Bearer short-lived-access',
    );
    expect(JSON.parse(String(init.body))).toEqual({
      currentPassword: 'Current-Office#2026',
      newPassword: 'Changed-Office#2026',
    });
  });

  it('does not refresh and replay a password change after a 401', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 'INVALID_SESSION' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    setCommunitySessionTokens('expired-access');

    await expect(
      communityAuthApi.changePassword({
        currentPassword: 'Current-Office#2026',
        newPassword: 'Changed-Office#2026',
      }),
    ).rejects.toMatchObject({ status: 401 });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(
      /\/api\/v1\/auth\/password-change$/,
    );
  });

  it.each(['logout', 'logoutAll'] as const)(
    'does not let a delayed %s cleanup clear a newer login token',
    async (method) => {
      const response = deferred<Response>();
      vi.stubGlobal('fetch', vi.fn(() => response.promise));
      setCommunitySessionTokens('old-session-token', 'old-session-csrf');

      const loggingOut = communityAuthApi[method]();
      setCommunitySessionTokens('new-login-token', 'new-login-csrf');
      response.resolve(new Response(null, { status: 204 }));
      await loggingOut;

      expect(getCommunityAccessToken()).toBe('new-login-token');
    },
  );

  it('rejects an old login response instead of publishing it over a newer session', async () => {
    const response = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn(() => response.promise));

    const oldLogin = communityAuthApi.login({
      username: 'old-user',
      password: 'a-secure-password',
    });
    setCommunitySessionTokens('new-session-token', 'new-session-csrf');
    response.resolve(new Response(JSON.stringify({
      accessToken: 'old-login-token',
      csrfToken: 'old-login-csrf',
      user: { id: 'old-user' },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    await expect(oldLogin).rejects.toMatchObject({
      status: 409,
      body: { code: 'STALE_AUTH_RESULT' },
    });
    expect(getCommunityAccessToken()).toBe('new-session-token');
  });
});
