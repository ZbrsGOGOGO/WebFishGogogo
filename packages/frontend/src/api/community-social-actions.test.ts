import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  communityFeedsApi,
  communityInvitesApi,
  communityNotificationsApi,
  communityRelationshipsApi,
} from './community';
import {
  resetCommunityHttpForTests,
  setCommunitySessionTokens,
} from './community-http';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('community social write contracts', () => {
  beforeEach(() => {
    resetCommunityHttpForTests();
    setCommunitySessionTokens('access-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetCommunityHttpForTests();
  });

  it('sends a feed with the caller idempotency key and never retries a 401', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: 'expired' }, 401));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      communityFeedsApi.send(
        { recipientPublicId: 'public-friend', type: 'coffee' },
        'feed:fixed-key',
      ),
    ).rejects.toMatchObject({ status: 401 });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1/feeds');
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe('feed:fixed-key');
  });

  it('adds an idempotency key to friend request mutations', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: 'pending', requestId: 'r-1' }));
    vi.stubGlobal('fetch', fetchMock);

    await communityRelationshipsApi.sendRequest('public-2', 'friend:fixed-key');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe('friend:fixed-key');
    expect(JSON.parse(String(init.body))).toEqual({ publicId: 'public-2' });
  });

  it('previews a referral without authentication and carries the opaque binding contract', async () => {
    setCommunitySessionTokens(null);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      bindingToken: 'rct_opaque-binding-token',
      expiresAt: '2026-08-22T12:00:00.000Z',
      inviter: { publicId: 'public-2', displayName: '邀请人', avatarKey: 'violet' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await communityInvitesApi.preview('ref_public-share-code');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/v1\/referrals\/preview$/);
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Authorization')).toBeNull();
    expect(JSON.parse(String(init.body))).toEqual({ code: 'ref_public-share-code' });
  });

  it('uses the notification cursor returned by the backend', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      items: [], unreadCount: 0, nextCursor: null,
    }));
    vi.stubGlobal('fetch', fetchMock);

    await communityNotificationsApi.list('cursor-value');

    expect(String(fetchMock.mock.calls[0][0])).toMatch(
      /\/v1\/notifications\?cursor=cursor-value$/,
    );
  });
});
