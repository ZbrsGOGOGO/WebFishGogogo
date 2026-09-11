/** Free, bound stress-relief activity. Tokens cannot be purchased, transferred or exchanged for office coins. */
export const OFFICE_RELIEF_RULES = {
  secondsPerChance: 1800, chanceCap: 10, activeSecondsPerDay: 14_400,
  tokenCap: 1_000_000_000, maxCoinReward: 10_000, pendingCap: 99, historyLimit: 30,
  titleDuplicateTokens: 500, farmExperiencePerGift: 30,
  weights: { coin: 5000, loss: 4900, title: 50, tower_material: 20, farm_crop: 20, tower_book: 10 },
  weightTotal: 10_000, lossMin: 50, lossMax: 300,
  coinTiers: [
    { min: 100, max: 1000, weight: 32 }, { min: 1001, max: 2000, weight: 26 },
    { min: 2001, max: 3500, weight: 20 }, { min: 3501, max: 5000, weight: 14 }, { min: 5001, max: 10000, weight: 8 },
  ],
} as const;
export const OFFICE_RELIEF_TOOLS = [
  { id: 'keyboard', name: '软糖键盘' }, { id: 'stapler', name: '玩具订书机' }, { id: 'coffee', name: '泡沫咖啡' },
] as const;
export type OfficeReliefTool = typeof OFFICE_RELIEF_TOOLS[number]['id'];
export const OFFICE_RELIEF_TITLES = [
  { id: 'office_relief_fish', name: '摸鱼之神' }, { id: 'office_relief_rebel', name: '反内卷先锋' }, { id: 'office_relief_rest', name: '带薪如厕宗师' },
] as const;
export type OfficeReliefTitleId = typeof OFFICE_RELIEF_TITLES[number]['id'];
export const OFFICE_RELIEF_SKINS = [
  { id: 'mint', name: '薄荷便笺', price: 1200, color: '#34d399' },
  { id: 'peach', name: '蜜桃午后', price: 1800, color: '#fb923c' },
  { id: 'blueprint', name: '蓝图工位', price: 2400, color: '#60a5fa' },
  { id: 'lavender', name: '薰衣草假日', price: 3200, color: '#a78bfa' },
  { id: 'night', name: '午夜茶水间', price: 4200, color: '#64748b' },
  { id: 'gold', name: '金色下班铃', price: 6000, color: '#fbbf24' },
] as const;
export type OfficeReliefSkinId = typeof OFFICE_RELIEF_SKINS[number]['id'];
export const OFFICE_RELIEF_MATERIALS = [
  { id: 'ore', name: '玄铁砂', quantity: 3 }, { id: 'herb', name: '灵草', quantity: 3 }, { id: 'clue', name: '通道线索', quantity: 3 },
] as const;
/** Existing FARM_CROPS keys. Gifts grant plant experience through the real farm level curve, never coins or a harvested crop. */
export const OFFICE_RELIEF_CROPS = [
  { id: 'desk_mint', name: '工位薄荷礼包', quantity: 1 },
  { id: 'meeting_tomato', name: '会议番茄礼包', quantity: 1 },
  { id: 'deadline_strawberry', name: '截止日草莓礼包', quantity: 1 },
] as const;
export const OFFICE_RELIEF_BOOKS = [
  { id: 'skill_fragments', name: '技能碎片册', quantity: 3 },
  { id: 'weapon_manual', name: '主手研习手册', quantity: 15 },
] as const;
export type OfficeReliefDrop = { id: string; receivedAt: string } & (
  | { kind: 'tower_material'; itemId: typeof OFFICE_RELIEF_MATERIALS[number]['id']; quantity: 3 }
  | { kind: 'farm_crop'; itemId: typeof OFFICE_RELIEF_CROPS[number]['id']; quantity: 1 }
  | { kind: 'tower_book'; itemId: 'skill_fragments'; quantity: 3 }
  | { kind: 'tower_book'; itemId: 'weapon_manual'; quantity: 15 }
);
export type OfficeReliefOutcomeKind = 'coin' | 'loss' | 'title' | OfficeReliefDrop['kind'] | 'purchase' | 'equip' | 'claim';
export interface OfficeReliefOutcome {
  id: string; at: string; kind: OfficeReliefOutcomeKind; tokenDelta: number;
  /** Rolled loss may exceed the actual debit when the bound token balance is small. */
  nominalAmount?: number; itemId?: string; dropId?: string; message: string; tool?: OfficeReliefTool;
}
export type OfficeReliefHistory = OfficeReliefOutcome;
export interface OfficeReliefState {
  schemaVersion: 1; version: number; chances: number; remainderSeconds: number;
  /** Accepted new-version active seconds; stops increasing while the chance pool is full. */
  trackedSeconds: number; tokenBalance: number; totalPlays: number;
  titles: OfficeReliefTitleId[]; skins: OfficeReliefSkinId[]; equippedSkin: OfficeReliefSkinId | null;
  pending: OfficeReliefDrop[]; history: OfficeReliefHistory[]; lastResult: OfficeReliefOutcome | null; startedAt: string;
}
export type OfficeReliefView = OfficeReliefState;
export type OfficeReliefAction =
  | { kind: 'play'; tool: OfficeReliefTool }
  | { kind: 'buy'; skinId: OfficeReliefSkinId }
  | { kind: 'equip'; skinId: OfficeReliefSkinId | null }
  | { kind: 'claim'; dropId: string };
export interface OfficeReliefReceipt { requestId: string; replayed: boolean; outcome: OfficeReliefOutcome | null }
