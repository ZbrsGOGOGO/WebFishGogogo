import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CommunityApiError,
  communityBattleErrorMessage,
  createCommunityBattle,
  resetCommunityHttpForTests,
  setCommunitySessionTokens,
  type CommunityBattleRequest,
} from './community';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('community office battle API contract', () => {
  beforeEach(() => {
    resetCommunityHttpForTests();
    setCommunitySessionTokens('access-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetCommunityHttpForTests();
  });

  it('submits only the opponent reference, mode, loadout version and immutable request id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ battleId: 'b-1' }));
    vi.stubGlobal('fetch', fetchMock);
    const request: CommunityBattleRequest = {
      battleRequestId: 'battle:12345678-1234-1234-1234-123456789012',
      opponent: { kind: 'npc', offerId: 'offer-1' },
      mode: 'reward',
      loadoutVersion: 7,
    };

    await createCommunityBattle(request);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    const headers = new Headers(init.headers);
    expect(url).toMatch(/\/v1\/games\/office-battle\/battles$/);
    expect(body).toEqual(request);
    expect(body).not.toHaveProperty('seed');
    expect(body).not.toHaveProperty('winner');
    expect(body).not.toHaveProperty('reward');
    expect(body).not.toHaveProperty('stats');
    expect(headers.get('Idempotency-Key')).toBe(request.battleRequestId);
  });

  it('never refreshes or automatically replays a 401 battle write', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ code: 'UNAUTHORIZED' }, 401));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createCommunityBattle({
      battleRequestId: 'battle:12345678-1234-1234-1234-123456789012',
      opponent: { kind: 'npc', offerId: 'offer-1' },
      mode: 'practice',
      loadoutVersion: 2,
    })).rejects.toMatchObject({ status: 401 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('/auth/refresh');
  });

  it.each([
    ['BATTLE_ENERGY_INSUFFICIENT', /体力不足/],
    ['BATTLE_EQUIPMENT_CONFLICT', /装备配置已变化/],
    ['BATTLE_CLIENT_OUTDATED', /网页版本过旧/],
    ['ACCOUNT_BANNED', /已被封禁/],
    ['VERSION_CONFLICT', /版本已经变化/],
  ])('maps stable failure code %s to an actionable state', (code, message) => {
    expect(communityBattleErrorMessage(
      new CommunityApiError(409, 'server message', { code }),
    )).toMatch(message);
  });
});
