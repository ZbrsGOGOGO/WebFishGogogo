import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  communityHttp,
  refreshCommunitySession,
  resetCommunityHttpForTests,
  setCommunitySessionTokens,
} from './community-http';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('community http session client', () => {
  beforeEach(() => {
    resetCommunityHttpForTests();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetCommunityHttpForTests();
  });

  it('keeps access tokens in memory and always includes cookies', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    setCommunitySessionTokens('memory-only-token', 'csrf-token');

    await communityHttp.post('/v1/example', { value: 1 });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(init.credentials).toBe('include');
    expect(headers.get('Authorization')).toBe('Bearer memory-only-token');
    expect(headers.get('X-CSRF-Token')).toBe('csrf-token');
    expect(setItem).not.toHaveBeenCalled();
    expect(window.localStorage).toHaveLength(0);
  });

  it('uses one refresh request for simultaneous 401 responses', async () => {
    const attempts = new Map<string, number>();
    const fetchMock = vi.fn(async (
      input: string | URL | Request,
      _init?: RequestInit,
    ) => {
      const url = String(input);
      if (url.endsWith('/v1/auth/refresh')) {
        await Promise.resolve();
        return jsonResponse({
          accessToken: 'fresh-token',
          user: { id: 'u1' },
        });
      }
      const next = (attempts.get(url) ?? 0) + 1;
      attempts.set(url, next);
      return next === 1
        ? jsonResponse({ message: 'expired' }, 401)
        : jsonResponse({ ok: true });
    });
    vi.stubGlobal('fetch', fetchMock);
    setCommunitySessionTokens('expired-token');

    const [first, second] = await Promise.all([
      communityHttp.get<{ ok: boolean }>('/v1/first'),
      communityHttp.get<{ ok: boolean }>('/v1/second'),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/v1/auth/refresh')),
    ).toHaveLength(1);
    const freshBusinessCalls = fetchMock.mock.calls.filter(
      ([input, init]) =>
        !String(input).endsWith('/v1/auth/refresh') &&
        new Headers((init as RequestInit).headers).get('Authorization') ===
          'Bearer fresh-token',
    );
    expect(freshBusinessCalls).toHaveLength(2);
  });

  it('does not refresh or replay a write request after 401 by default', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ message: 'expired after write boundary' }, 401),
    );
    vi.stubGlobal('fetch', fetchMock);
    setCommunitySessionTokens('expired-token');

    await expect(
      communityHttp.post('/v1/feed', { friendId: 'friend-1' }),
    ).rejects.toMatchObject({ status: 401 });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith('/v1/auth/refresh'),
      ),
    ).toBe(false);
  });

  it('uses a fixed same-origin Web Lock when the browser supports cross-tab locks', async () => {
    const lockRequest = vi.fn(async (
      _name: string,
      _options: LockOptions,
      callback: () => Promise<unknown>,
    ) => callback());
    vi.stubGlobal('navigator', { locks: { request: lockRequest } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      accessToken: 'locked-refresh-token',
      user: { id: 'u1' },
    })));

    await refreshCommunitySession();

    expect(lockRequest).toHaveBeenCalledOnce();
    expect(lockRequest.mock.calls[0][0]).toBe('zbrs-community-refresh-v1');
    expect(lockRequest.mock.calls[0][1]).toMatchObject({ mode: 'exclusive' });
  });

  it('waits and retries exactly once for the stable refresh rotation race code', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ code: 'REFRESH_TOKEN_ROTATION_RACE' }, 409))
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'race-recovered', user: { id: 'u1' } }));
    vi.stubGlobal('fetch', fetchMock);

    const session = await refreshCommunitySession();

    expect(session.accessToken).toBe('race-recovered');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry any other refresh 409 response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ code: 'UNRELATED_CONFLICT' }, 409));
    vi.stubGlobal('fetch', fetchMock);

    await expect(refreshCommunitySession()).rejects.toMatchObject({ status: 409 });

    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
