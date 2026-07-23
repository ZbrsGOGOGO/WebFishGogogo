import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { request, ApiError } from './http';
import { setStoredToken, clearStoredToken } from './token-storage';

describe('http request wrapper', () => {
  beforeEach(() => {
    clearStoredToken();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearStoredToken();
  });

  it('injects the Bearer JWT when a token is stored', async () => {
    setStoredToken('my-jwt');
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await request('/documents');

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer my-jwt');
  });

  it('omits Authorization for public endpoints (auth: false)', async () => {
    setStoredToken('my-jwt');
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ accessToken: 'x' }), { status: 200 }));

    await request('/auth/login', { method: 'POST', body: { email: 'a', password: 'b' }, auth: false });

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBeNull();
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('throws ApiError and clears token on 401', async () => {
    setStoredToken('stale');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: '未授权' }), { status: 401 }),
    );

    await expect(request('/documents')).rejects.toBeInstanceOf(ApiError);
    expect(globalThis.localStorage.getItem('stealth-reader.token')).toBeNull();
  });
});
