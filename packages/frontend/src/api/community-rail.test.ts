import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CommunityApiError, resetCommunityHttpForTests, setCommunitySessionTokens } from './community-http';
import { communityRailApi, railErrorMessage } from './community-rail';

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('rail REST contract', () => {
  beforeEach(() => { resetCommunityHttpForTests(); setCommunitySessionTokens('synthetic-rail-token'); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); resetCommunityHttpForTests(); });
  it('loads public catalog and daily board without bearer credentials', async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(json({}))); vi.stubGlobal('fetch', fetcher);
    await communityRailApi.catalog(); await communityRailApi.leaderboard('2026-09-09');
    expect(fetcher.mock.calls[0][0]).toMatch(/\/v1\/games\/rail\/catalog$/);
    expect(fetcher.mock.calls[1][0]).toMatch(/\/v1\/games\/rail\/leaderboard\?date=2026-09-09$/);
    for (const call of fetcher.mock.calls) expect(new Headers(call[1].headers).has('Authorization')).toBe(false);
  });
  it('encodes authenticated room paths and forwards abort signals', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({})); vi.stubGlobal('fetch', fetcher); const abort = new AbortController();
    await communityRailApi.get('room/one', abort.signal);
    expect(fetcher.mock.calls[0][0]).toMatch(/\/rooms\/room%2Fone$/);
    expect(fetcher.mock.calls[0][1].signal).toBe(abort.signal);
    expect(new Headers(fetcher.mock.calls[0][1].headers).get('Authorization')).toBe('Bearer synthetic-rail-token');
  });
  it('sends password admission in request bodies, never URLs or invitation codes', async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(json({}))); vi.stubGlobal('fetch', fetcher);
    await communityRailApi.join({ roomId: 'room1', password: 'synthetic-secret', role: 'spectator' });
    await communityRailApi.password('room1', '', 8);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ roomId: 'room1', password: 'synthetic-secret', role: 'spectator' });
    expect(fetcher.mock.calls[0][0]).not.toContain('secret');
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ password: '', expectedVersion: 8 });
  });
  it('preserves server action identity and sends no computed survival scores', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({})); vi.stubGlobal('fetch', fetcher);
    const input = { actionId: '00000000-0000-4000-8000-000000000001', sequence: 7, kind: 'choose_track' as const, payload: { roundToken: 'round-2', track: 'B' as const } };
    await communityRailApi.action('room1', input);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(input);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).not.toHaveProperty('score');
  });
  it('does not refresh-replay writes after an authorization failure', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ code: 'UNAUTHORIZED' }, 401)); vi.stubGlobal('fetch', fetcher);
    await expect(communityRailApi.bots('room1', { count: 2, expectedVersion: 6 })).rejects.toMatchObject({ status: 401 });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('uses bounded chat cursors, separate chat channels and own-message withdrawal', async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(json({}))); vi.stubGlobal('fetch', fetcher);
    await communityRailApi.chat('room1', 12); await communityRailApi.sendChat('room1', { clientMessageId: 'uuid', channel: 'spectator', body: '观众看法' }); await communityRailApi.withdrawChat('room1', 'message/1'); await communityRailApi.stats();
    expect(fetcher.mock.calls[0][0]).toMatch(/\/rooms\/room1\/chat\?afterSequence=12$/);
    expect(JSON.parse(fetcher.mock.calls[1][1].body).channel).toBe('spectator');
    expect(fetcher.mock.calls[2][0]).toMatch(/\/chat\/message%2F1\/withdraw$/);
    expect(fetcher.mock.calls[3][0]).toMatch(/\/v1\/games\/rail\/me$/);
  });
  it('translates private-room and phase failures without echoing raw internal errors', () => {
    expect(railErrorMessage(new CommunityApiError(403, 'Forbidden', { code: 'RAIL_PASSWORD_INCORRECT' }))).toContain('密码不正确');
    expect(railErrorMessage(new CommunityApiError(409, 'Conflict', { code: 'RAIL_STALE_ROUND' }))).toContain('下一回合');
    expect(railErrorMessage(new CommunityApiError(400, 'Invalid', { code: 'RAIL_UNKNOWN' }))).not.toContain('RAIL_');
  });
  it('requests channel-specific expanded windows and keeps beforeSequence available', async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(json({})));
    vi.stubGlobal('fetch', fetcher);
    const abort = new AbortController();
    await communityRailApi.chat('room/1', { channel: 'spectator', limit: 100 }, abort.signal);
    const url = new URL(String(fetcher.mock.calls[0][0]), 'https://example.invalid');
    expect(url.pathname).toContain('/rooms/room%2F1/chat');
    expect(url.searchParams.get('channel')).toBe('spectator');
    expect(url.searchParams.get('limit')).toBe('100');
    expect(fetcher.mock.calls[0][1].signal).toBe(abort.signal);
    await communityRailApi.chat('room1', { beforeSequence: 60, channel: 'player' });
    expect(String(fetcher.mock.calls[1][0])).toContain('beforeSequence=60');
  });
});
