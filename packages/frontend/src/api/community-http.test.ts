import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  communityHttp,
  getCommunityAccessToken,
  refreshCommunitySession,
  resetCommunityHttpForTests,
  setCommunitySessionInvalidatedHandler,
  setCommunitySessionTokens,
} from './community-http';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
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

  it('downloads private files as bytes with the same authenticated client', async () => {
    const bytes = new Uint8Array([0, 255, 80, 75, 3, 4]);
    const fetchMock = vi.fn().mockResolvedValue(new Response(bytes));
    vi.stubGlobal('fetch', fetchMock);
    setCommunitySessionTokens('file-reader-token');
    const result = await communityHttp.get<Blob>('/v1/development/private-file', { responseType: 'blob' });
    const contents = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(result);
    });
    expect(new Uint8Array(contents)).toEqual(bytes);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer file-reader-token');
    expect(init.credentials).toBe('include');
    expect(init).not.toHaveProperty('responseType');
  });

  it('parses a denied file download as an API error instead of saving the error as a file', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ message: '无权访问附件' }, 403)));
    await expect(communityHttp.get<Blob>('/v1/development/private-file', { responseType: 'blob' }))
      .rejects.toMatchObject({ status: 403, message: '无权访问附件' });
  });

  it('does not hand an old account file to a new account after a delayed download', async () => {
    const pending = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn(() => pending.promise));
    setCommunitySessionTokens('old-file-reader');
    const download = communityHttp.get<Blob>('/v1/development/private-file', { responseType: 'blob' });
    setCommunitySessionTokens('new-file-reader');
    pending.resolve(new Response('private attachment'));
    await expect(download).rejects.toMatchObject({ status: 409 });
  });

  it('sends multipart bodies with browser-generated boundaries and does not replay uploads', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: 'expired' }, 401));
    vi.stubGlobal('fetch', fetchMock);
    setCommunitySessionTokens('upload-token', 'upload-csrf');
    const form = new FormData();
    form.append('expectedVersion', '1');
    form.append('file', new File(['需求'], 'notes.txt', { type: 'text/plain' }));
    await expect(communityHttp.post('/v1/development/attachments', form)).rejects.toMatchObject({ status: 401 });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(form);
    expect(new Headers(init.headers).has('Content-Type')).toBe(false);
    expect(new Headers(init.headers).get('X-CSRF-Token')).toBe('upload-csrf');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not publish an old refresh success or let its finally detach a newer refresh', async () => {
    const oldResponse = deferred<Response>();
    const currentResponse = deferred<Response>();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => oldResponse.promise)
      .mockImplementationOnce(() => currentResponse.promise);
    vi.stubGlobal('fetch', fetchMock);

    const oldRefresh = refreshCommunitySession();
    setCommunitySessionTokens('new-login-token', 'new-login-csrf');
    const currentRefresh = refreshCommunitySession();
    const joinedCurrentRefresh = refreshCommunitySession();

    oldResponse.resolve(jsonResponse({
      accessToken: 'stale-refresh-token',
      user: { id: 'old-user' },
    }));
    await expect(oldRefresh).rejects.toMatchObject({
      status: 409,
      body: { code: 'STALE_SESSION_REFRESH' },
    });
    expect(getCommunityAccessToken()).toBe('new-login-token');

    // The stale promise's finally must not clear the current single-flight.
    expect(joinedCurrentRefresh).toBe(currentRefresh);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    currentResponse.resolve(jsonResponse({
      accessToken: 'current-refresh-token',
      user: { id: 'new-user' },
    }));
    await expect(currentRefresh).resolves.toMatchObject({
      accessToken: 'current-refresh-token',
    });
    expect(getCommunityAccessToken()).toBe('current-refresh-token');
  });

  it('does not let an old refresh failure clear a new login or invalidate it', async () => {
    const oldResponse = deferred<Response>();
    const invalidated = vi.fn();
    vi.stubGlobal('fetch', vi.fn(() => oldResponse.promise));
    setCommunitySessionInvalidatedHandler(invalidated);

    const oldRefresh = refreshCommunitySession();
    setCommunitySessionTokens('new-login-token', 'new-login-csrf');
    oldResponse.resolve(jsonResponse({ code: 'INVALID_SESSION' }, 401));

    await expect(oldRefresh).rejects.toMatchObject({ status: 401 });
    expect(getCommunityAccessToken()).toBe('new-login-token');
    expect(invalidated).not.toHaveBeenCalled();
  });

  it('does not refresh or replay an old GET after the session changes', async () => {
    const oldBusinessResponse = deferred<Response>();
    const fetchMock = vi.fn((
      _input: string | URL | Request,
      _init?: RequestInit,
    ) => oldBusinessResponse.promise);
    vi.stubGlobal('fetch', fetchMock);
    setCommunitySessionTokens('old-user-token');

    const oldRequest = communityHttp.get('/v1/private-snapshot');
    setCommunitySessionTokens('new-user-token');
    oldBusinessResponse.resolve(jsonResponse({ code: 'INVALID_SESSION' }, 401));

    await expect(oldRequest).rejects.toMatchObject({ status: 401 });
    expect(getCommunityAccessToken()).toBe('new-user-token');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith('/v1/auth/refresh'),
      ),
    ).toBe(false);
  });

  it.each([false, true])('does not deliver an old successful authenticated response after switching accounts (replayed: %s)', async (replayed) => {
    const oldResponse = deferred<Response>();
    const fetchMock = vi.fn();
    if (replayed) {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ message: 'expired' }, 401))
        .mockResolvedValueOnce(jsonResponse({ accessToken: 'refreshed-old-token', user: { id: 'old-user' } }));
    }
    fetchMock.mockImplementationOnce(() => oldResponse.promise);
    vi.stubGlobal('fetch', fetchMock);
    setCommunitySessionTokens('old-user-token');
    const oldRequest = communityHttp.get('/v1/private-snapshot');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(replayed ? 3 : 1));
    setCommunitySessionTokens('new-user-token');
    oldResponse.resolve(jsonResponse({ privateData: 'only for the previous account' }));
    await expect(oldRequest).rejects.toMatchObject({ status: 409, body: { code: 'STALE_SESSION_REFRESH' } });
    expect(getCommunityAccessToken()).toBe('new-user-token');
    expect(fetchMock).toHaveBeenCalledTimes(replayed ? 3 : 1);
  });

  it('still delivers an outstanding response after a normal refresh in the same account', async () => {
    const oldResponse = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn()
      .mockImplementationOnce(() => oldResponse.promise)
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'refreshed-token', user: { id: 'same-user' } })));
    setCommunitySessionTokens('expired-token');
    const pendingRequest = communityHttp.get('/v1/private-snapshot');
    await refreshCommunitySession();
    oldResponse.resolve(jsonResponse({ ok: true }));
    await expect(pendingRequest).resolves.toEqual({ ok: true });
    expect(getCommunityAccessToken()).toBe('refreshed-token');
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
