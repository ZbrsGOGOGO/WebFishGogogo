/** Cosmetic-only closed identifiers. Render locally; never interpret them as SVG, HTML or URLs. */
export const DEMON_TOWER_APPEARANCE_OPTIONS = {
  hat: [{ id: 'none', label: '无' }, { id: 'conical', label: '斗笠' }, { id: 'official', label: '官帽' }, { id: 'straw', label: '草帽' }, { id: 'helmet', label: '头盔' }],
  hair: [{ id: 'short', label: '短发' }, { id: 'long', label: '长发' }, { id: 'bald', label: '光头' }, { id: 'ponytail', label: '马尾' }, { id: 'curly', label: '卷发' }],
  face: [{ id: 'round', label: '圆脸' }, { id: 'square', label: '方脸' }, { id: 'pointed', label: '尖脸' }, { id: 'baby', label: '娃娃脸' }],
  glasses: [{ id: 'none', label: '无' }, { id: 'round', label: '圆框' }, { id: 'square', label: '方框' }, { id: 'sunglasses', label: '墨镜' }],
  top: [{ id: 'cloth', label: '布衣' }, { id: 'armor', label: '战甲' }, { id: 'robe', label: '道袍' }, { id: 'brocade', label: '锦衣' }],
  bottom: [{ id: 'burlap', label: '麻裤' }, { id: 'leather', label: '皮甲裤' }, { id: 'robe', label: '长袍下摆' }, { id: 'war', label: '战裤' }],
  shoes: [{ id: 'straw', label: '草鞋' }, { id: 'cloth', label: '布鞋' }, { id: 'boots', label: '战靴' }, { id: 'cloud', label: '云履' }],
  held: [{ id: 'none', label: '无' }, { id: 'sword', label: '剑' }, { id: 'blade', label: '刀' }, { id: 'staff', label: '法杖' }, { id: 'fan', label: '扇' }, { id: 'gourd', label: '葫芦' }],
} as const;
export type DemonTowerAppearanceSlot = keyof typeof DEMON_TOWER_APPEARANCE_OPTIONS;
export type DemonTowerAppearance = { [K in DemonTowerAppearanceSlot]: typeof DEMON_TOWER_APPEARANCE_OPTIONS[K][number]['id'] };
export const DEMON_TOWER_APPEARANCE_SLOTS: readonly DemonTowerAppearanceSlot[] = ['hat', 'hair', 'face', 'glasses', 'top', 'bottom', 'shoes', 'held'];
export const DEMON_TOWER_APPEARANCE_LABELS: Readonly<Record<DemonTowerAppearanceSlot, string>> = {
  hat: '帽子', hair: '发型', face: '脸型', glasses: '眼镜', top: '上衣', bottom: '裤子', shoes: '鞋', held: '手持',
};
export const DEMON_TOWER_DEFAULT_APPEARANCE: Readonly<DemonTowerAppearance> = {
  hat: 'none', hair: 'short', face: 'round', glasses: 'none', top: 'cloth', bottom: 'burlap', shoes: 'cloth', held: 'none',
};
/** Advisory loadout score only: no world gate, ranking, contribution or damage multiplier. */
export interface DemonTowerCombatPower {
  total: number; base: number; temporary: number;
  /** Each part is already weighted; their sum equals base. Inventory-only items never count. */
  parts: { level: number; attributes: number; weapons: number; skills: number; innates: number };
}
export const DEMON_TOWER_COMBAT_POWER_WEIGHTS = {
  level: 6, attribute: 2, weaponQuality: 2, weaponStar: 8, skillQuality: 5, immortalSkill: 30, divineSkill: 50, innate: 15,
} as const;

/** Shared existing XP curve; this is not a balance change. */
export function demonTowerExperienceRequirement(level: number): number {
  if (!Number.isSafeInteger(level) || level < 1 || level > 120) throw new RangeError('Invalid demon tower level');
  return level === 120 ? 0 : 30 + level * 10 + Math.floor(level * level / 25);
}
