import { communityHttp } from './community-http';
import { communityIdempotencyHeaders } from './community-idempotency';

export type CommunityPlantState = 'idle' | 'growing' | 'ready';

export interface CommunityFarmReward {
  standardRewardGranted: boolean;
  onboardingRewardGranted: boolean;
  orderRewardGranted: boolean;
  ordersCompleted: number;
  ordersTotal: number;
  farmExperience: number;
  officeCoins: number;
  levelUp: boolean;
  summary: string | null;
}

export type CommunityFarmToolId = 'watering_can' | 'planter_box' | 'harvest_basket';
export type CommunityFarmSkillId = 'quick_care' | 'green_thumb' | 'abundant_harvest';

export interface CommunityFarmCrop {
  key: string;
  name: string;
  mark: string;
  unlockLevel: number;
  durationSeconds: number;
  experience: number;
  coins: number;
  seedCost: number;
  seedCostPerPlot: number;
  description: string;
  unlocked: boolean;
  selected: boolean;
  growing: boolean;
}

export interface CommunityFarmTool {
  id: CommunityFarmToolId;
  name: string;
  slot: string;
  description: string;
  level: number;
  maxLevel: number;
  nextCost: number;
}

export interface CommunityFarmSkill {
  id: CommunityFarmSkillId;
  name: string;
  unlockLevel: number;
  description: string;
  level: number;
  maxLevel: number;
  unlocked: boolean;
}

export interface CommunityFarmOverview {
  serverTime: string;
  state: CommunityPlantState;
  plant: {
    name: string;
    appearanceKey: string;
    level: number;
    experience: number;
    experienceInLevel: number;
    experienceToNextLevel: number | null;
    careStreak: number;
    cycleStartedAt: string | null;
    maturesAt: string | null;
    cycleSeconds: number | null;
    firstCycle: boolean;
  };
  growth: {
    farmCoins: number;
    officeCoins: number;
    totalHarvests: number;
    farmVersion: number;
    skillPointsEarned: number;
    skillPointsAvailable: number;
    nextUnlock: { level: number; name: string; kind: 'crop' | 'skill' } | null;
    plotCount: number;
    maxPlotCount: number;
    nextPlotUnlock: { level: number; count: number } | null;
    officeCoinLevelBonusPercent: number;
    ordersCompleted: number;
    ordersTotal: number;
  };
  crops: CommunityFarmCrop[];
  tools: CommunityFarmTool[];
  skills: CommunityFarmSkill[];
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

export function selectCommunityFarmCrop(
  cropKey: string,
  expectedVersion: number,
  idempotencyKey: string,
): Promise<CommunityFarmMutationResult> {
  return communityHttp.put(
    '/v1/farm/crop',
    { cropKey, expectedVersion },
    {
      headers: communityIdempotencyHeaders(idempotencyKey),
      retryAfterRefresh: false,
    },
  );
}

export function upgradeCommunityFarmTool(
  toolId: CommunityFarmToolId,
  expectedVersion: number,
  idempotencyKey: string,
): Promise<CommunityFarmMutationResult & { cost: number }> {
  return communityHttp.post(
    `/v1/farm/tools/${encodeURIComponent(toolId)}/upgrade`,
    { expectedVersion },
    {
      headers: communityIdempotencyHeaders(idempotencyKey),
      retryAfterRefresh: false,
    },
  );
}

export function upgradeCommunityFarmSkill(
  skillId: CommunityFarmSkillId,
  expectedVersion: number,
  idempotencyKey: string,
): Promise<CommunityFarmMutationResult> {
  return communityHttp.post(
    `/v1/farm/skills/${encodeURIComponent(skillId)}/upgrade`,
    { expectedVersion },
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
  selectCrop: selectCommunityFarmCrop,
  upgradeTool: upgradeCommunityFarmTool,
  upgradeSkill: upgradeCommunityFarmSkill,
};
