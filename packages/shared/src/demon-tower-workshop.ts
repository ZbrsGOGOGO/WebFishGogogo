import { TOWER_WORKSHOP_SOURCE as SOURCE } from './demon-tower-workshop-source';

export { TOWER_WORKSHOP_SOURCE } from './demon-tower-workshop-source';
export type TowerForgeSlot = typeof SOURCE.SLOTS[number]['key'];
export type TowerForgeQuality = typeof SOURCE.QUAL_ORDER[number];
export type TowerRefineGrade = typeof SOURCE.GRADE_ORDER[number];
export interface TowerForgedAffix { id: string; name: string; stat: string; key: string | null; value: number; description: string }
export interface TowerForgedItem {
  id: string; slot: TowerForgeSlot; quality: TowerForgeQuality; name: string; requiredLevel: number;
  weaponType: string | null; set: string | null; affixes: TowerForgedAffix[];
}
export interface TowerForgeReceipt {
  id: number; failed: boolean; successPercent: number; materialQuality: TowerForgeQuality;
  grade: TowerRefineGrade; item: TowerForgedItem; cost: Record<string, number>;
}
export interface TowerWorkshopState {
  version: 1; sequence: number; serviceDate: string;
  materials: Record<string, number>; refined: Record<string, Record<string, number>>;
  dailyBought: Record<string, number>; items: TowerForgedItem[];
  equipped: Partial<Record<TowerForgeSlot, string>>; lastForge: TowerForgeReceipt | null;
}
export type TowerWorkshopAction =
  | { kind: 'workshop_refine'; payload: { grade: TowerRefineGrade; material: string; batches: number } }
  | { kind: 'workshop_forge'; payload: { slot: TowerForgeSlot; quality: TowerForgeQuality; grade: TowerRefineGrade; set: string; weaponType: string; auxiliary?: string; auxiliaryCount?: number } }
  | { kind: 'workshop_recast' | 'workshop_equip'; payload: { itemId: string } }
  | { kind: 'workshop_purchase'; payload: { material: 'ht' | 'mt'; quantity: number } };

export function emptyTowerWorkshop(serviceDate: string): TowerWorkshopState {
  return { version: 1, sequence: 0, serviceDate, materials: {}, refined: {}, dailyBought: {}, items: [], equipped: {}, lastForge: null };
}

/** Slot-count and priority are identical to the supplied computeSetTiers. */
export function towerWorkshopSets(w: TowerWorkshopState | undefined): Array<{ id: string; name: string; count: number; tier: 't3' | 't5' | null; active: boolean; description: string }> {
  const counts: Record<string, number> = {};
  if (w) for (const item of w.items) if (w.equipped[item.slot] === item.id && item.set && !['白', '绿'].includes(item.quality)) counts[item.set] = (counts[item.set] ?? 0) + 1;
  const entries = SOURCE.SET_LIST.map(id => {
    const count = counts[id] ?? 0, tier = count >= 5 ? 't5' : count >= 3 ? 't3' : null;
    return { id, name: SOURCE.SETS[id].name, count, tier: tier as 't3' | 't5' | null, active: false, description: tier ? SOURCE.SETS[id][tier].desc : `3件：${SOURCE.SETS[id].t3.desc}；5件：${SOURCE.SETS[id].t5.desc}` };
  });
  const best = entries.filter(e => e.tier).sort((a, b) => b.count - a.count)[0];
  if (best) best.active = true;
  return entries;
}

export function towerWorkshopBonuses(w: TowerWorkshopState | undefined): Record<string, number> {
  const result: Record<string, number> = {};
  if (!w) return result;
  const add = (key: string, value: number): void => { result[key] = (result[key] ?? 0) + value; };
  const counts: Record<string, number> = {};
  for (const item of w.items) if (w.equipped[item.slot] === item.id) for (const a of item.affixes) {
    counts[a.id] = (counts[a.id] ?? 0) + 1;
    if (a.stat !== 'dimPct' && counts[a.id] > SOURCE.AFFIX_CAP) continue;
    // Source equipDimBonus adds flat attribute points, despite the historic dimPct name.
    add(a.stat === 'dimPct' ? `dim_${a.key}` : a.stat, a.stat === 'hp' || a.stat === 'dimPct' ? a.value : a.value / 100);
    const def = SOURCE.AFFIX_BY_ID[a.id as keyof typeof SOURCE.AFFIX_BY_ID];
    if (def) for (const key of ['killHeal', 'dodgeFollowup', 'enemyAtkDown'] as const) if (key in def) add(key, Number((def as unknown as Record<string, unknown>)[key]));
    if (a.stat === 'survive1') result.survive1 = 1;
  }
  const active = towerWorkshopSets(w).find(s => s.active);
  if (active?.tier) for (const [key, value] of Object.entries(SOURCE.SETS[active.id as keyof typeof SOURCE.SETS][active.tier].bonus)) add(key, value);
  result.lifesteal = Math.min(.3, result.lifesteal ?? 0); result.dodge = Math.min(.4, result.dodge ?? 0); result.reflect = Math.min(.5, result.reflect ?? 0);
  return result;
}
