import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  communityGuildApi,
  resetCommunityHttpForTests,
  setCommunitySessionTokens,
} from './community';

describe('community guild boss API contract', () => {
  beforeEach(() => {
    resetCommunityHttpForTests();
    setCommunitySessionTokens('access-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetCommunityHttpForTests();
  });

  it('submits no client-authored damage or reward fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await communityGuildApi.attackBoss('guild-boss:12345678-1234-1234-1234-123456789012');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(url).toMatch(/\/v1\/guilds\/me\/boss\/attacks$/);
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
    expect(headers.get('Idempotency-Key')).toBe(
      'guild-boss:12345678-1234-1234-1234-123456789012',
    );
  });
});
