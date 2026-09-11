import type { DemonTowerAffix, DemonTowerAttributes, DemonTowerAttribute } from './demon-tower';

export type DemonTowerShopOfferId = 'stamina_small' | 'stamina_large' | 'heal' | 'materials' | 'fine_weapon_box' | 'rune_box' | `pill_${DemonTowerAttribute}` | `permanent_${DemonTowerAttribute}`;
export type DemonTowerShopCurrency = 'spirit_stone' | 'soul';
export interface DemonTowerShopOffer {
  id: DemonTowerShopOfferId; name: string; currency: DemonTowerShopCurrency; price: number;
  limit: number; limitPeriod: 'day' | 'week' | 'lifetime'; purchased: number; remaining: number;
  description: string; available: boolean; reason: string | null;
}
export interface DemonTowerEconomyLedgerEntry {
  id: string; at: number; kind: 'earn' | 'purchase' | 'rune'; description: string;
  amount: number; balance: number; currency: DemonTowerShopCurrency;
}
/** Account-bound tower resources only. No paid grants, transfers or office-coin conversion. */
export interface DemonTowerEconomyView {
  version: 1; balance: number; dailyEarned: number; dailyCap: number; bossEarned: number; bossCap: number;
  serviceDate: string; week: string; buffsExpiresAt: number; buffs: DemonTowerAttributes;
  permanent: DemonTowerAttributes; runes: Partial<Record<DemonTowerAffix, number>>;
  offers: DemonTowerShopOffer[]; ledger: DemonTowerEconomyLedgerEntry[];
}
export const DEMON_TOWER_ECONOMY_RULES = {
  dailyCap: 200, bossDailyCap: 100, bossStonePerDamage: 0.5, balanceCap: 1_000_000,
  ledgerLimit: 30, runeCap: 99, runeSlots: 3, pillAttributeBonus: 5, pillDailyLimit: 3,
  permanentAttributeLimit: 5,
} as const;
