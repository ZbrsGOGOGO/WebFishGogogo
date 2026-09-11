import type { DemonTowerAttribute, DemonTowerRarity, DemonTowerSkillId } from './demon-tower';

export type DemonTowerOfficeOffer = 'stamina' | 'star' | 'pass' | 'permanent';
export interface DemonTowerOfficeOfferView {
  offer: DemonTowerOfficeOffer; attribute?: DemonTowerAttribute; name: string; currency: 'office_coin'; price: number;
  limit: number; limitPeriod: 'day' | 'week' | 'lifetime'; purchased: number; remaining: number;
  /** Gameplay eligibility only; UI also compares the independently supplied unified wallet balance. */
  available: boolean; reason: string | null;
}
export interface DemonTowerProvisionsView {
  version: 1; serviceDate: string; week: string; trackingStartedAt: number | null;
  passes: number; fragments: number; ordinaryStarted: number; passStarted: number; passDailyLimit: number;
  offers: DemonTowerOfficeOfferView[];
  chest: { opened: number; limit: number; nextCost: number | null; available: boolean; reason: string | null };
  skills: { skillId: DemonTowerSkillId; name: string; rarity: DemonTowerRarity; requiredLevel: number; cost: number | null; owned: boolean; available: boolean; reason: string | null }[];
  history: { id: string; at: number; kind: 'purchase' | 'chest' | 'pass' | 'fragment'; description: string; cost: number }[];
}
export const DEMON_TOWER_PROVISIONS_RULES = {
  staminaPrice: 60, staminaAmount: 20, staminaDaily: 2,
  starPrice: 150, starWeekly: 1, permanentPrice: 300, permanentAmount: 1,
  passPrice: 30, passBuyDaily: 2, passUseDaily: 2, passCap: 99,
  fragmentCap: 1_000_000, chestBaseCost: 30, chestStepCost: 25, chestDaily: 5,
  chestWeights: { materials: 40, fragments: 35, weapon: 20, permanent: 5 },
  chestMaterials: 3, chestFragments: 1, historyLimit: 30,
  fragmentCosts: { 凡: 3, 精: 6, 灵: 12, 仙: 30 } as Partial<Record<DemonTowerRarity, number>>,
} as const;
