import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { communityGameErrorMessage, communityGameRoomsApi } from './community-game-rooms';
import { CommunityApiError, resetCommunityHttpForTests, setCommunitySessionTokens } from './community-http';

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('community game rooms REST contract', () => {
  beforeEach(() => { resetCommunityHttpForTests(); setCommunitySessionTokens('memory-game-token'); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); resetCommunityHttpForTests(); });
  it('loads the public catalog without an account token', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ games: [] })); vi.stubGlobal('fetch', fetcher);
    await communityGameRoomsApi.catalog();
    expect(fetcher.mock.calls[0][0]).toMatch(/\/v1\/games\/play\/catalog$/);
    expect(new Headers(fetcher.mock.calls[0][1].headers).has('Authorization')).toBe(false);
  });
  it('uses encoded room paths, authentication and abortable reads', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ id: 'room/1' })); vi.stubGlobal('fetch', fetcher); const controller = new AbortController();
    await communityGameRoomsApi.get('room/1', controller.signal);
    expect(fetcher.mock.calls[0][0]).toMatch(/\/rooms\/room%2F1$/);
    expect(fetcher.mock.calls[0][1].signal).toBe(controller.signal);
    expect(new Headers(fetcher.mock.calls[0][1].headers).get('Authorization')).toBe('Bearer memory-game-token');
  });
  it('sends only game actions and their stable idempotency identity, never a score', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ version: 2 })); vi.stubGlobal('fetch', fetcher);
    const input = { actionId: '12345678-1234-4234-9234-123456789012', sequence: 8, kind: 'guess' as const, payload: { text: '雨伞', round: 3 } };
    await communityGameRoomsApi.action('room-1', input);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(input);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).not.toHaveProperty('score');
    expect(fetcher.mock.calls[0][1].method).toBe('POST');
  });
  it('does not automatically replay a state-changing action after a 401', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ message: 'UNAUTHORIZED' }, 401)); vi.stubGlobal('fetch', fetcher);
    await expect(communityGameRoomsApi.ready('room-1', true)).rejects.toMatchObject({ status: 401 });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('separates public-room joining from invitation-code joining', async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(json({ id: 'room-1' }))); vi.stubGlobal('fetch', fetcher);
    await communityGameRoomsApi.join({ roomId: 'room-1' }); await communityGameRoomsApi.join({ code: 'ABCDEFGH' });
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ roomId: 'room-1' });
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ code: 'ABCDEFGH' });
  });
  it('loads a per-game dated board without mixing games or modes', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ items: [] })); vi.stubGlobal('fetch', fetcher);
    await communityGameRoomsApi.leaderboard('undercover', '2026-09-08');
    expect(fetcher.mock.calls[0][0]).toMatch(/\/leaderboards\/undercover\?date=2026-09-08$/);
  });
  it('loads the office coin board from its dedicated authenticated endpoint', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ items: [], me: null })); vi.stubGlobal('fetch', fetcher);
    await communityGameRoomsApi.officeCoinsLeaderboard();
    expect(fetcher.mock.calls[0][0]).toMatch(/\/leaderboards\/office-coins$/);
    expect(new Headers(fetcher.mock.calls[0][1].headers).get('Authorization')).toBe('Bearer memory-game-token');
  });
  it('translates game business errors without exposing terse internal codes', () => {
    expect(communityGameErrorMessage(new CommunityApiError(400, 'Bad Request', { code: 'PLAY_DO_NOT_REVEAL_WORD' }))).toContain('不要直接写出自己的词语');
    expect(communityGameErrorMessage(new CommunityApiError(429, 'Too Many Requests', { code: 'PLAY_CREATE_LIMIT' }))).toContain('60 局');
    expect(communityGameErrorMessage(new CommunityApiError(409, 'Conflict', { code: 'PLAY_STALE_ROUND' }))).toContain('下一轮');
    expect(communityGameErrorMessage(new CommunityApiError(400, 'Bad Request', { code: 'PLAY_UNKNOWN' }))).not.toContain('PLAY_');
  });
});
