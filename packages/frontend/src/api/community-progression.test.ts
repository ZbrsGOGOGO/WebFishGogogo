import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommunityApiError, resetCommunityHttpForTests, setCommunitySessionTokens } from './community-http';
import { communityProgressionApi, progressionErrorMessage, progressionUncertain } from './community-progression';
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
describe('community progression transport', () => {
  beforeEach(() => { resetCommunityHttpForTests(); setCommunitySessionTokens('synthetic-progression'); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); resetCommunityHttpForTests(); });
  it('reads catalog anonymously and own summary with bearer, forwards cancellation', async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(json({}))); vi.stubGlobal('fetch', fetcher); const controller = new AbortController();
    await communityProgressionApi.catalog(controller.signal); await communityProgressionApi.me(controller.signal);
    expect(fetcher.mock.calls[0][0]).toMatch(/\/community\/progression\/catalog$/); expect(new Headers(fetcher.mock.calls[0][1].headers).has('Authorization')).toBe(false);
    expect(fetcher.mock.calls[1][0]).toMatch(/\/community\/progression\/me$/); expect(new Headers(fetcher.mock.calls[1][1].headers).get('Authorization')).toBe('Bearer synthetic-progression');
    expect(fetcher.mock.calls.every((call) => call[1].method === 'GET' && call[1].signal === controller.signal)).toBe(true);
  });
  it('submits only explicit sync and stable UUID/CAS title, never privilege or reward fields', async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(json({}))); vi.stubGlobal('fetch', fetcher);
    const input = { requestId: '00000000-0000-4000-8000-000000000001', expectedVersion: 3, titleKey: null };
    await communityProgressionApi.refresh(); await communityProgressionApi.title(input);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({}); expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual(input);
  });
  it('never automatically repeats a write following 401', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({}, 401)); vi.stubGlobal('fetch', fetcher);
    await expect(communityProgressionApi.refresh()).rejects.toMatchObject({ status: 401 }); expect(fetcher).toHaveBeenCalledOnce();
  });
  it('distinguishes uncertain outcomes from definitive maintenance and hides raw error text', () => {
    expect(progressionUncertain(new CommunityApiError(502, 'private detail'))).toBe(true);
    expect(progressionUncertain(new CommunityApiError(503, '', { code: 'COMMUNITY_WRITES_DISABLED' }))).toBe(false);
    expect(progressionErrorMessage(new Error('private detail'))).not.toContain('private detail');
    expect(progressionErrorMessage(new CommunityApiError(409, '', { code: 'TITLE_NOT_UNLOCKED' }))).toContain('尚未解锁');
  });
});
