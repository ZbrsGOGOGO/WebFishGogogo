import type {
  DemonTowerSourceBattleProfile,
  DemonTowerSourceContribution,
  DemonTowerSourceFriend,
  DemonTowerSourceProgress,
  DemonTowerSourceRankingEntry,
  DemonTowerSourceSaveInput,
  DemonTowerSourceSaveReceipt,
  DemonTowerSourceWorld,
  DemonTowerSourceWorldInput,
  DemonTowerSourceWorldReceipt,
} from '@stealth-reader/shared';

import { CommunityApiError, communityHttp } from './community-http';

const ROOT = '/v1/games/demon-tower/source';

/**
 * Source-game writes are server-idempotent. A transport error is retried once
 * with the iframe's exact logical request id; ordinary HTTP failures are never
 * replayed. The id must outlive this transport call because both responses can
 * be lost after the server has already committed.
 */
async function retryTransport<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!(error instanceof CommunityApiError) || error.status !== 0) throw error;
    return operation();
  }
}

export const communityDemonTowerSourceApi = {
  world: (signal?: AbortSignal): Promise<DemonTowerSourceWorld> =>
    communityHttp.get(`${ROOT}/world`, { signal }),

  progress: (signal?: AbortSignal): Promise<DemonTowerSourceProgress> =>
    communityHttp.get(`${ROOT}/progress`, { signal }),

  saveProgress: (
    input: DemonTowerSourceSaveInput,
    signal?: AbortSignal,
  ): Promise<DemonTowerSourceSaveReceipt> =>
    retryTransport(() => communityHttp.put(`${ROOT}/progress`, input, {
      retryAfterRefresh: true,
      signal,
    })),

  damage: (
    input: DemonTowerSourceWorldInput,
    signal?: AbortSignal,
  ): Promise<DemonTowerSourceWorldReceipt> =>
    retryTransport(() => communityHttp.post(`${ROOT}/world/damage`, input, {
      retryAfterRefresh: true,
      signal,
    })),

  channel: (
    input: DemonTowerSourceWorldInput,
    signal?: AbortSignal,
  ): Promise<DemonTowerSourceWorldReceipt> =>
    retryTransport(() => communityHttp.post(`${ROOT}/world/channel`, input, {
      retryAfterRefresh: true,
      signal,
    })),

  clue: (
    input: DemonTowerSourceWorldInput,
    signal?: AbortSignal,
  ): Promise<DemonTowerSourceWorldReceipt> =>
    retryTransport(() => communityHttp.post(`${ROOT}/world/clue`, input, {
      retryAfterRefresh: true,
      signal,
    })),

  contribution: (signal?: AbortSignal): Promise<DemonTowerSourceContribution[]> =>
    communityHttp.get(`${ROOT}/contribution`, { signal }),

  friends: (signal?: AbortSignal): Promise<DemonTowerSourceFriend[]> =>
    communityHttp.get(`${ROOT}/friends`, { signal }),

  battleProfile: (publicId: string, signal?: AbortSignal): Promise<DemonTowerSourceBattleProfile> =>
    communityHttp.get(`${ROOT}/friends/${encodeURIComponent(publicId)}/battle-profile`, { signal }),

  ranking: (limit = 50, signal?: AbortSignal): Promise<DemonTowerSourceRankingEntry[]> =>
    communityHttp.get(`${ROOT}/ranking`, { query: { limit }, signal }),

  settings: (signal?: AbortSignal): Promise<unknown[]> =>
    communityHttp.get(`${ROOT}/settings`, { signal }),

  stories: (signal?: AbortSignal): Promise<unknown[]> =>
    communityHttp.get(`${ROOT}/stories`, { signal }),
};
