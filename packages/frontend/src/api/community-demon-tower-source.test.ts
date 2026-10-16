import { afterEach, describe, expect, it, vi } from 'vitest';

import { communityDemonTowerSourceApi } from './community-demon-tower-source';
import { CommunityApiError, communityHttp } from './community-http';

describe('community demon tower source API', () => {
  afterEach(() => vi.restoreAllMocks());
  const requestId = '00000000-0000-4000-8000-000000000001';
  const worldInput = { requestId, layerId: 2, amount: 7, expectedVersion: 3, saveData: '{"level":2}' };

  it('retries a transport failure exactly once with the same UUID idempotency key', async () => {
    const post = vi.spyOn(communityHttp, 'post')
      .mockRejectedValueOnce(new CommunityApiError(0, 'offline'))
      .mockResolvedValueOnce({ requestId: 'server', replayed: true, accepted: 7, unlockedLayer: null, layer: {} });
    await communityDemonTowerSourceApi.damage(worldInput);
    expect(post).toHaveBeenCalledTimes(2);
    const first = post.mock.calls[0][1] as { requestId: string };
    const second = post.mock.calls[1][1] as { requestId: string };
    expect(first.requestId).toBe(second.requestId);
    expect(first).toEqual(worldInput);
  });

  it('does not retry an ordinary server rejection', async () => {
    const post = vi.spyOn(communityHttp, 'post').mockRejectedValue(new CommunityApiError(409, 'conflict'));
    await expect(communityDemonTowerSourceApi.channel({ ...worldInput, layerId: 1, amount: 20 })).rejects.toMatchObject({ status: 409 });
    expect(post).toHaveBeenCalledOnce();
  });

  it('posts shared clues through the same idempotent atomic envelope', async () => {
    const post = vi.spyOn(communityHttp, 'post').mockResolvedValue({ requestId, replayed: false, accepted: 1, unlockedLayer: null, layer: {}, profileVersion: 4 });
    await communityDemonTowerSourceApi.clue({ ...worldInput, amount: 1 });
    expect(post).toHaveBeenCalledWith('/v1/games/demon-tower/source/world/clue', { ...worldInput, amount: 1 }, expect.objectContaining({ retryAfterRefresh: true }));
  });

  it('sends a bounded save to the isolated source endpoint with authenticated replay safety', async () => {
    const put = vi.spyOn(communityHttp, 'put').mockResolvedValue({ requestId: 'server', version: 2, replayed: false, updatedAt: '2026-10-16T00:00:00.000Z' });
    await communityDemonTowerSourceApi.saveProgress({ requestId, expectedVersion: 1, saveData: '{"level":2}' });
    expect(put).toHaveBeenCalledWith('/v1/games/demon-tower/source/progress', { requestId, expectedVersion: 1, saveData: '{"level":2}' }, expect.objectContaining({ retryAfterRefresh: true }));
  });
});
