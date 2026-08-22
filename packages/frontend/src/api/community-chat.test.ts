import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  COMMUNITY_CHAT_ROOM_SLUGS,
  CommunityApiError,
  createCommunityChatSocketTicket,
  getCommunityChatMessages,
  reportCommunityChatMessage,
  resetCommunityHttpForTests,
  setCommunitySessionTokens,
} from './community';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('community chat REST contract', () => {
  beforeEach(() => {
    resetCommunityHttpForTests();
    setCommunitySessionTokens('memory-access-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetCommunityHttpForTests();
  });

  it('keeps exactly the six fixed room slugs', () => {
    expect(COMMUNITY_CHAT_ROOM_SLUGS).toEqual([
      'general', 'developer', 'product', 'qa', 'sales', 'hr',
    ]);
  });

  it('requests a sequence window without mixing before and after cursors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await getCommunityChatMessages('developer', { afterSequence: 42, limit: 100 });

    expect(String(fetchMock.mock.calls[0][0])).toMatch(
      /\/v1\/chat\/rooms\/developer\/messages\?afterSequence=42&limit=100$/,
    );
    expect(() => getCommunityChatMessages('general', {
      afterSequence: 1,
      beforeSequence: 3,
    })).toThrow(/不能同时指定/);
  });

  it('uses a Bearer REST request for the one-time socket ticket and never replays 401', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ code: 'UNAUTHORIZED' }, 401));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createCommunityChatSocketTicket()).rejects.toBeInstanceOf(CommunityApiError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/v1\/chat\/socket-tickets$/);
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer memory-access-token');
    expect(String(url)).not.toContain('memory-access-token');
  });

  it('reports through a non-replayed idempotent write', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ reportId: 'r1', status: 'received' }));
    vi.stubGlobal('fetch', fetchMock);

    await reportCommunityChatMessage(
      'message/1',
      { reason: 'privacy', detail: '包含个人信息' },
      'chat-report:test-key',
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/v1\/chat\/messages\/message%2F1\/report$/);
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe('chat-report:test-key');
    expect(JSON.parse(String(init.body))).toEqual({ reason: 'privacy', detail: '包含个人信息' });
  });
});
