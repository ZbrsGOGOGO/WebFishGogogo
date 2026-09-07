import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { communityFarmApi } from './community-farm';
import { resetCommunityHttpForTests, setCommunitySessionTokens } from './community-http';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('community farm session recovery', () => {
  beforeEach(() => {
    resetCommunityHttpForTests();
    setCommunitySessionTokens('expired-farm-token', 'old-csrf');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetCommunityHttpForTests();
  });

  it.each([
    ['care', '/v1/farm/care'],
    ['harvestAndCare', '/v1/farm/harvest-and-care'],
  ] as const)('refreshes once and retains the original idempotency key for %s', async (action, path) => {
    const result = { farm: { state: 'growing' } };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ message: 'expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({
        accessToken: 'fresh-farm-token', csrfToken: 'fresh-csrf', user: { id: 'same-user' },
      }))
      .mockResolvedValueOnce(jsonResponse(result));
    vi.stubGlobal('fetch', fetchMock);

    await expect(communityFarmApi[action]('farm:one-user-operation')).resolves.toEqual(result);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/v1\/auth\/refresh$/);
    for (const index of [0, 2]) {
      const [url, init] = fetchMock.mock.calls[index] as [string, RequestInit];
      expect(url.endsWith(path)).toBe(true);
      expect(init.method).toBe('POST');
      expect(new Headers(init.headers).get('Idempotency-Key')).toBe('farm:one-user-operation');
    }
    const replayHeaders = new Headers((fetchMock.mock.calls[2][1] as RequestInit).headers);
    expect(replayHeaders.get('Authorization')).toBe('Bearer fresh-farm-token');
    expect(replayHeaders.get('X-CSRF-Token')).toBe('fresh-csrf');
  });

  it.each(['care', 'harvestAndCare'] as const)('does not loop when %s still returns 401 after refresh', async (action) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ message: 'expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'fresh-token', user: { id: 'same-user' } }))
      .mockResolvedValueOnce(jsonResponse({ message: 'invalid session' }, 401));
    vi.stubGlobal('fetch', fetchMock);
    await expect(communityFarmApi[action]('farm:no-loop')).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([409, 429, 500])('never refreshes or replays a non-authentication failure (%s)', async (status) => {
    const body = { code: 'OFFICE_COIN_INSUFFICIENT', required: 440, current: 237 };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body, status));
    vi.stubGlobal('fetch', fetchMock);
    await expect(communityFarmApi.care('farm:no-replay')).rejects.toMatchObject({ status, body });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not automatically replay a watering request after an ambiguous network failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(communityFarmApi.care('farm:network')).rejects.toMatchObject({ status: 0 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not replay an old watering request after switching accounts during its response', async () => {
    let resolve!: (response: Response) => void;
    const pending = new Promise<Response>((resolveResponse) => { resolve = resolveResponse; });
    const fetchMock = vi.fn(() => pending);
    vi.stubGlobal('fetch', fetchMock);
    const care = communityFarmApi.care('farm:old-account');
    setCommunitySessionTokens('new-account-token');
    resolve(jsonResponse({ message: 'expired' }, 401));
    await expect(care).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not replay a harvest after switching accounts during session refresh', async () => {
    let resolve!: (response: Response) => void;
    const pending = new Promise<Response>((resolveResponse) => { resolve = resolveResponse; });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ message: 'expired' }, 401))
      .mockImplementationOnce(() => pending);
    vi.stubGlobal('fetch', fetchMock);
    const harvest = communityFarmApi.harvestAndCare('farm:old-harvest');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    setCommunitySessionTokens('new-account-token');
    resolve(jsonResponse({ accessToken: 'old-refreshed-token', user: { id: 'old-user' } }));
    await expect(harvest).rejects.toMatchObject({ status: 409, body: { code: 'STALE_SESSION_REFRESH' } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
