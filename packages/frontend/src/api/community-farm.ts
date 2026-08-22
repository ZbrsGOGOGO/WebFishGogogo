import { communityHttp } from './community-http';
import { communityIdempotencyHeaders } from './community-idempotency';

export type CommunityPlantState = 'idle' | 'growing' | 'ready';

export interface CommunityFarmReward {
  standardRewardGranted: boolean;
  onboardingRewardGranted: boolean;
  summary: string | null;
}

export interface CommunityFarmOverview {
  serverTime: string;
  state: CommunityPlantState;
  plant: {
    name: string;
    appearanceKey: string;
    level: number;
    experience: number;
    careStreak: number;
    cycleStartedAt: string | null;
    maturesAt: string | null;
    cycleSeconds: number | null;
    firstCycle: boolean;
  };
  standardCycleSeconds: number;
  firstCycleSeconds: number;
  dailyRewardClaimed: boolean;
  lastReward?: CommunityFarmReward | null;
  encouragementAnimationEnabled: boolean;
  pendingEncouragements: number;
}

export interface CommunityFarmMutationResult {
  farm: CommunityFarmOverview;
  reward?: CommunityFarmReward | null;
}

export function getCommunityFarm(): Promise<CommunityFarmOverview> {
  return communityHttp.get('/v1/farm');
}

export function careForCommunityPlant(
  idempotencyKey: string,
): Promise<CommunityFarmMutationResult> {
  return communityHttp.post('/v1/farm/care', undefined, {
    headers: communityIdempotencyHeaders(idempotencyKey),
    retryAfterRefresh: false,
  });
}

export function harvestAndCareForCommunityPlant(
  idempotencyKey: string,
): Promise<CommunityFarmMutationResult> {
  return communityHttp.post('/v1/farm/harvest-and-care', undefined, {
    headers: communityIdempotencyHeaders(idempotencyKey),
    retryAfterRefresh: false,
  });
}

export function encourageCommunityPlant(
  publicId: string,
  idempotencyKey: string,
): Promise<{ acknowledged: true }> {
  return communityHttp.post(
    '/v1/farm/encouragements',
    { publicId },
    {
      headers: communityIdempotencyHeaders(idempotencyKey),
      retryAfterRefresh: false,
    },
  );
}

export const communityFarmApi = {
  getOverview: getCommunityFarm,
  care: careForCommunityPlant,
  harvestAndCare: harvestAndCareForCommunityPlant,
  encourage: encourageCommunityPlant,
};
