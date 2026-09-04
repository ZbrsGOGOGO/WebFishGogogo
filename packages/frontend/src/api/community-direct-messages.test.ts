import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getCommunityDirectMessages,
  markCommunityDirectConversationRead,
  openCommunityDirectConversation,
  resetCommunityHttpForTests,
  setCommunitySessionTokens,
} from './community';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('community direct message REST contract', () => {
  beforeEach(() => {
    resetCommunityHttpForTests();
    setCommunitySessionTokens('memory-access-token', 'csrf-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetCommunityHttpForTests();
  });

  it('opens a conversation with a public friend id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'conversation-1' }));
    vi.stubGlobal('fetch', fetchMock);

    await openCommunityDirectConversation('friend/id');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/v1\/chat\/direct-conversations$/);
    expect(JSON.parse(String(init.body))).toEqual({ friendPublicId: 'friend/id' });
  });

  it('uses sequence cursors and rejects an ambiguous history window', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await getCommunityDirectMessages('conversation/1', {
      beforeSequence: 42,
      limit: 20,
    });

    expect(String(fetchMock.mock.calls[0][0])).toMatch(
      /\/v1\/chat\/direct-conversations\/conversation%2F1\/messages\?beforeSequence=42&limit=20$/,
    );
    expect(() => getCommunityDirectMessages('c1', {
      beforeSequence: 2,
      afterSequence: 1,
    })).toThrow(/不能同时指定/);
  });

  it('marks read with an idempotency key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      conversationId: 'c1', lastReadSequence: 9, unreadCount: 0,
    }));
    vi.stubGlobal('fetch', fetchMock);

    await markCommunityDirectConversationRead('c1', 9, 'direct-read:test');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe('direct-read:test');
    expect(JSON.parse(String(init.body))).toEqual({ throughSequence: 9 });
  });
});
