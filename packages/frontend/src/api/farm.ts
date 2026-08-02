// 小农场 API 客户端。

import { http } from './http';

export type FarmPlotState = 'locked' | 'empty' | 'growing' | 'ready';

export interface FarmOnboarding {
  stage: 'choose_plot' | 'growing' | 'ready' | 'completed';
  quickGrowAvailable: boolean;
  quickGrowSeconds: number;
  firstHarvestCompleted: boolean;
  firstHarvestBonusFarmExp: number;
}

export interface FarmSummary {
  level: number;
  experience: number;
  expToNextLevel: number | null;
  plotCount: number;
}

export interface FarmAssets {
  water: number;
  sunlight: number;
  fertilizer: number;
}

export interface FarmInventory {
  wheatSeed: number;
  strawberrySeed: number;
  coffeeSeed: number;
  seed_wheat?: number;
  seed_strawberry?: number;
  seed_coffee?: number;
  [seedSlug: string]: number | undefined;
}

export interface FarmCropDefinition {
  slug: string;
  name: string;
  emoji: string;
  growSeconds: number;
  requiredLevel: number;
  plantCost: {
    water: number;
    seedSlug: string;
    seedQuantity: number;
  };
  rewards: {
    experience?: number;
    officeCoin?: number;
    decorationCoin?: number;
    energy?: number;
  };
}

export interface PlantedCrop {
  slug: string;
  name: string;
  emoji: string;
}

export interface FarmPlot {
  id: string;
  slotIndex: number;
  state: FarmPlotState;
  crop: PlantedCrop | null;
  plantedAt: string | null;
  maturesAt: string | null;
}

export interface FarmOverview {
  serverTime: string;
  onboarding: FarmOnboarding;
  farm: FarmSummary;
  assets: FarmAssets;
  inventory: FarmInventory;
  crops: FarmCropDefinition[];
  plots: FarmPlot[];
}

function createIdempotencyKey(action: 'plant' | 'harvest'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${action}-${crypto.randomUUID()}`;
  }

  return `${action}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getFarm(): Promise<FarmOverview> {
  return http.get<FarmOverview>('/v1/farm');
}

export function plantCrop(
  plotId: string,
  cropSlug: string,
): Promise<FarmOverview> {
  return http.post<FarmOverview>(
    `/v1/farm/plots/${encodeURIComponent(plotId)}/plant`,
    { cropSlug },
    {
      headers: {
        'Idempotency-Key': createIdempotencyKey('plant'),
      },
    },
  );
}

export function harvestCrop(plotId: string): Promise<FarmOverview> {
  return http.post<FarmOverview>(
    `/v1/farm/plots/${encodeURIComponent(plotId)}/harvest`,
    undefined,
    {
      headers: {
        'Idempotency-Key': createIdempotencyKey('harvest'),
      },
    },
  );
}

export const farmApi = {
  getFarm,
  plantCrop,
  harvestCrop,
};
