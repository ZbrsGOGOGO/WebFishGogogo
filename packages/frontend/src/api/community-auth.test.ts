import { afterEach, describe, expect, it, vi } from 'vitest';

import { communityAuthApi } from './community-auth';
import {
  resetCommunityHttpForTests,
  setCommunitySessionTokens,
} from './community-http';

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
});
