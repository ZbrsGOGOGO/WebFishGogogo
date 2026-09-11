import type { DemonTowerEconomyView, DemonTowerShopOfferId } from './demon-tower-economy';
/** Public 九层妖塔 contracts. Seeds, RNG counters and internal combat state are never API data. */
export const DEMON_TOWER_ATTRIBUTE_KEYS = ['STR', 'SPD', 'AGI', 'DEF', 'LUCK'] as const;
export type DemonTowerAttribute = typeof DEMON_TOWER_ATTRIBUTE_KEYS[number];
export type DemonTowerAttributes = Record<DemonTowerAttribute, number>;
export type DemonTowerRarity = '凡' | '精' | '灵' | '仙' | '神';
export type DemonTowerWeaponId = 'w1' | 'w2' | 'w3' | 'w4' | 'w5' | 'w6' | 'w7' | 'w8' | 'w9' | 'w10' | 'w11' | 'w12' | 'w13' | 'w14' | 'w15' | 'w16' | 'w17' | 'w18' | 'w19' | 'w20';
export type DemonTowerSkillId = 's1' | 's2' | 's3' | 's4' | 's5' | 's6' | 's7' | 's8' | 's9' | 's10' | 's11' | 's12' | 's13' | 's14' | 's15' | 's16';
export type DemonTowerMaterial = 'ore' | 'herb' | 'soul' | 'clue';
export type DemonTowerMaterials = Record<DemonTowerMaterial, number>;
export type DemonTowerTerrain = 'plain' | 'lake' | 'mountain' | 'sea';
export type DemonTowerWeaponType = '重兵' | '轻兵' | '长兵' | '盾兵' | '法器';
export interface DemonTowerWeaponDefinition {
  id: DemonTowerWeaponId; name: string; type: DemonTowerWeaponType; attribute: DemonTowerAttribute;
  rarity: DemonTowerRarity; requiredLevel: number; dropLevel: number; legacyRequiredLevel: number; weight: number; tier: number;
  baseBonus: number; qualityCap: number; description: string;
}
export interface DemonTowerSkillDefinition {
  id: DemonTowerSkillId; name: string; category: '回复' | '伤害' | '维度'; kind: 'active' | 'passive';
  rarity: DemonTowerRarity; requiredLevel: number; dropLevel: number; legacyRequiredLevel: number; weight: number; tier: number;
  cooldown: number; qualityCap: number; description: string;
}
export interface DemonTowerFloorDefinition {
  floor: number; name: string; terrain: DemonTowerTerrain; requiredLevel: number; description: string;
  /** Public pre-battle warning, matching the server-controlled boss/elite mechanism. */
  mechanicHint: string;
  enemyNames: readonly string[]; bossName: string; bossMaxHp: number; passageRequired: number;
}
export interface DemonTowerCatalog {
  gameKey: 'demon-tower'; name: '九层妖塔'; version: 1; enabled: boolean;
  attributes: Readonly<Record<DemonTowerAttribute, string>>;
  materials: Readonly<Record<DemonTowerMaterial, string>>;
  weapons: readonly DemonTowerWeaponDefinition[]; skills: readonly DemonTowerSkillDefinition[];
  floors: readonly DemonTowerFloorDefinition[];
  starter: { weapons: readonly DemonTowerWeaponId[]; skills: readonly DemonTowerSkillId[]; loadout: DemonTowerLoadout };
  rules: { maxLevel: number; staminaCap: number; staminaRestoreMs: number; exploreCost: number;
    trainCost: number; restCost: number; bossCost: number; bossAttemptsPerDay: number;
    combatRoundLimit: number; bossRoundLimit: number; activeSkillSlots: number; passiveSkillSlots: number;
    dailyOfficeCoinCap: number; dailyActivityTarget: number; dailyActivityCoins: number; dailyLeaderboardCoins: number;
    restHealingPercent: number; healingRestoreMs: number; donationValues: { ore: number; clue: number };
    lootGuaranteeEvery: number; attributeResetCooldownMs: number;
    resetTimezone: 'Asia/Shanghai'; rulesText: readonly string[] };
}
export type DemonTowerAffix = 'critical' | 'dodge' | 'leech' | 'boss_damage' | 'penetration';
export interface DemonTowerOwnedWeapon { id: DemonTowerWeaponId; quality: number; spareCopies: number; star?: number; favor?: number; levelExempt?: boolean; qualityExperience?: number; breakthrough?: number; affixes?: DemonTowerAffix[] }
export interface DemonTowerOwnedSkill { id: DemonTowerSkillId; quality: number; spareCopies: number; levelExempt?: boolean; qualityExperience?: number; star?: number; favor?: number }
export type DemonTowerLootSource = 'normal' | 'rift' | 'meditation' | 'boss_first' | 'boss_weekly' | 'weapon_box' | 'skill_box';
export type DemonTowerSkin = 'field' | 'ledger' | 'memo';
export interface DemonTowerExpansionView {
  version: 1; skillPages: number; essences: number; weaponBoxes: number; weaponBoxPity: number;
  riftsToday: number; meditationsToday: number; weeklyBossAttempts: number; week: string;
  claimedBossFloors: number[]; passageTokens: number; titles: string[]; skin: DemonTowerSkin;
  unlockedSkins: DemonTowerSkin[];
  arena?: DemonTowerArenaView;
  squadId?: string | null; squadReadyToday?: number;
}
export type DemonTowerArenaSkillId = `${'str' | 'spd' | 'agi' | 'def' | 'luck'}${1 | 2 | 3}`;
export interface DemonTowerArenaSkillDefinition { id: DemonTowerArenaSkillId; name: string; attribute: DemonTowerAttribute; kind: 'active' | 'passive' | 'ultimate'; cost: number; requiredLevel: number; description: string }
export const DEMON_TOWER_ARENA_SKILLS: readonly DemonTowerArenaSkillDefinition[] = [
  { id: 'str1', name: '裂地斩', attribute: 'STR', kind: 'active', cost: 1, requiredLevel: 1, description: '2倍力量伤害，自身短暂减速。' },
  { id: 'str2', name: '武道根基', attribute: 'STR', kind: 'passive', cost: 3, requiredLevel: 16, description: '力量+8，普通攻击伤害+10%。' },
  { id: 'str3', name: '崩山绝式', attribute: 'STR', kind: 'ultimate', cost: 5, requiredLevel: 31, description: '3倍力量伤害，破防30%持续2回合。' },
  { id: 'spd1', name: '疾影连刺', attribute: 'SPD', kind: 'active', cost: 1, requiredLevel: 1, description: '3段0.6倍速度伤害。' },
  { id: 'spd2', name: '风步', attribute: 'SPD', kind: 'passive', cost: 3, requiredLevel: 16, description: '先手速度+12，闪避+15个百分点。' },
  { id: 'spd3', name: '风驰绝式', attribute: 'SPD', kind: 'ultimate', cost: 5, requiredLevel: 31, description: '2.8倍速度伤害，并获得一回合先手。' },
  { id: 'agi1', name: '毒刃', attribute: 'AGI', kind: 'active', cost: 1, requiredLevel: 1, description: '0.8倍敏捷伤害，随后2回合0.3倍敏捷毒伤。' },
  { id: 'agi2', name: '幻身', attribute: 'AGI', kind: 'passive', cost: 3, requiredLevel: 16, description: '暴击+20、闪避+10个百分点。' },
  { id: 'agi3', name: '万影归一', attribute: 'AGI', kind: 'ultimate', cost: 5, requiredLevel: 31, description: '2.8倍敏捷必中伤害。' },
  { id: 'def1', name: '铁壁', attribute: 'DEF', kind: 'active', cost: 1, requiredLevel: 1, description: '获得1.5倍防御护盾，并反击0.8倍防御伤害。' },
  { id: 'def2', name: '反震', attribute: 'DEF', kind: 'passive', cost: 3, requiredLevel: 16, description: '反射实际损失生命的30%，不递归。' },
  { id: 'def3', name: '玄武绝式', attribute: 'DEF', kind: 'ultimate', cost: 5, requiredLevel: 31, description: '获得2倍防御护盾，恢复20%生命。' },
  { id: 'luck1', name: '回春', attribute: 'LUCK', kind: 'active', cost: 1, requiredLevel: 1, description: '恢复20+2倍幸运生命并普通攻击。' },
  { id: 'luck2', name: '闪转', attribute: 'LUCK', kind: 'passive', cost: 3, requiredLevel: 16, description: '每场一次致命伤20%概率保留1生命。' },
  { id: 'luck3', name: '气运绝式', attribute: 'LUCK', kind: 'ultimate', cost: 5, requiredLevel: 31, description: '1—4倍幸运爆发，不使用压至1血机制。' },
];
export interface DemonTowerArenaReport { opponentPublicId: string; opponentName: string; outcome: 'victory' | 'defeat' | 'draw'; rounds: number; log: string[]; completedAt: number }
export interface DemonTowerArenaView { enabled: boolean; rating: number; rank: '青铜' | '白银' | '黄金' | '妖王'; honor: number; skillPoints: number; learned: DemonTowerArenaSkillId[]; loadout: DemonTowerArenaSkillId[]; attemptsToday: number; winsToday: number; lastReport: DemonTowerArenaReport | null; skinUnlocked: boolean }
export interface DemonTowerSocialView {
  enabled: boolean; serverNow: number;
  opponents: { publicId: string; displayName: string; level: number; rating: number; rank: DemonTowerArenaView['rank'] }[];
  squads: DemonTowerSquadView[];
}
export interface DemonTowerSquadView { id: string; ownerPublicId: string | null; floor: number; status: 'waiting' | 'active' | 'victory' | 'defeat' | 'closed'; round: number; boss: { hp: number; maxHp: number; minions: number }; members: { publicId: string; displayName: string; ready: boolean; hp: number; maxHp: number; damage: number; claimed: boolean }[]; log: string[]; expiresAt: number }
export const DEMON_TOWER_EXPANSION_RULES = {
  riftCost: 3, riftsPerDay: 5, meditationCost: 2, meditationsPerDay: 10,
  weeklyBossCost: 3, weeklyBossPerWeek: 3, weaponBoxSoul: 12, skillBoxSoul: 10,
  starCharmSoul: 40, enlightenmentSoul: 35, selectionPages: 30,
  /** Safe free adaptation: no paid currency, no destructive star downgrade. */
  starSuccess: [0.8, 0.55, 0.3, 0.12] as readonly number[],
} as const;
export const DEMON_TOWER_AFFIXES: Record<DemonTowerAffix, { name: string; value: number; description: string }> = {
  critical: { name: '会心', value: 0.04, description: '暴击率+4个百分点' },
  dodge: { name: '轻身', value: 0.04, description: '闪避率+4个百分点' },
  leech: { name: '汲取', value: 0.04, description: '直接伤害吸血4%' },
  boss_damage: { name: '破阵', value: 0.08, description: '对首领直接伤害+8%' },
  penetration: { name: '洞穿', value: 0.06, description: '忽略6%防御' },
};
export const DEMON_TOWER_ULTIMATES: Partial<Record<DemonTowerWeaponId, { name: string; description: string }>> = {
  w4: { name: '真·镇魂归元', description: '每场首次普攻必中，追加一倍力量真实伤害，恢复追加实际伤害的30%。' },
  w8: { name: '真·无影绝式', description: '每场首次普攻追加三段必中敏捷伤害，每段0.6倍敏捷。' },
  w12: { name: '真·龙吟万象', description: '每场首次普攻对全部存活敌人追加1.2倍速度必中伤害，非首领停顿一次。' },
  w16: { name: '真·不动金身', description: '每场开局增加2倍防御护盾，首次受到直接伤害完全抵消。' },
  w20: { name: '真·混元改命', description: '每场首次普攻追加1.5倍幸运必中伤害，同时施加两回合20%破防。' },
};
export function demonTowerItemRarity(rarity: DemonTowerRarity, breakthrough = 0): DemonTowerRarity {
  return DEMON_TOWER_RARITY_ORDER[Math.min(4, DEMON_TOWER_RARITY_ORDER.indexOf(rarity) + Math.max(0, Math.floor(breakthrough)))];
}
export function demonTowerQualityLimit(rarity: DemonTowerRarity, level: number): number {
  const rank = DEMON_TOWER_RARITY_ORDER.indexOf(rarity);
  const realm = Math.min(5, 1 + Math.floor((Math.max(1, level) - 1) / 15));
  if (rank >= 2 && realm < rank + 1) return 0;
  return Math.min(({ 凡: 3, 精: 5, 灵: 7, 仙: 9, 神: 9 })[rarity], realm === 1 ? 3 : realm === 2 ? 5 : realm === 3 ? 7 : 9);
}
/** Explicit design rubric (0–100 in each dimension), not an empirical DPS claim. */
export function demonTowerStrengthRating(kind: 'weapon' | 'skill', id: string) {
  const item = (kind === 'weapon' ? DEMON_TOWER_WEAPONS : DEMON_TOWER_SKILLS).find(entry => entry.id === id);
  if (!item) return null;
  const rank = DEMON_TOWER_RARITY_ORDER.indexOf(item.rarity);
  const numeric = kind === 'weapon' ? Math.min(100, (item as DemonTowerWeaponDefinition).baseBonus / 23 * 100) : 25 + rank * 20;
  const permanent = ['w8', 'w20', 's8', 's9', 's11', 's12'].includes(id) ? 95 : ['w13', 'w15', 'w16'].includes(id) ? 70 : 20 + rank * 10;
  const utility = ['s13', 'w20'].includes(id) ? 100 : ['w4', 'w10', 'w12', 's15', 's16'].includes(id) ? 90 : 30 + rank * 12;
  const breadth = ['s1', 's3', 's9', 's13', 'w15', 'w20'].includes(id) ? 95 : 60;
  const score = Math.round(Math.round(numeric) * 0.35 + permanent * 0.25 + utility * 0.25 + breadth * 0.15);
  return { numeric: Math.round(numeric), permanent, utility, breadth, score, tier: score >= 80 ? 0 : score >= 65 ? 1 : score >= 45 ? 2 : 3 };
}
export type DemonTowerInnateId = 'strength' | 'speed' | 'agility' | 'defense' | 'luck' | 'master' | 'shield' | 'feign';
export interface DemonTowerGrowthView {
  rulesVersion: 2; pendingLegacyBattle: boolean; chosenAttribute: DemonTowerAttribute | null;
  innates: DemonTowerInnateId[]; unlockedCount: number; nextInnateLevel: number | null;
  /** Counts eligible exploration settlements without these rarities, not secret RNG state. */
  misses: { ling: number; xian: number }; eligible: { ling: boolean; xian: boolean };
}
export const DEMON_TOWER_INNATES: readonly { id: DemonTowerInnateId; name: string; attribute?: DemonTowerAttribute; description: string }[] = [
  { id: 'strength', name: '天生神力', attribute: 'STR', description: '永久力量+8，不占技能槽，不计入可洗点基础属性。' },
  { id: 'speed', name: '疾如雷电', attribute: 'SPD', description: '永久速度+8；每次普通攻击有30%概率追加一次速度伤害，不递归连击。' },
  { id: 'agility', name: '身轻如燕', attribute: 'AGI', description: '永久敏捷+8，直接攻击暴击率增加5个百分点。' },
  { id: 'defense', name: '钢筋铁骨', attribute: 'DEF', description: '永久防御+8，受到直接攻击伤害减少10%。' },
  { id: 'luck', name: '气运之子', attribute: 'LUCK', description: '永久幸运+8。' },
  { id: 'master', name: '兵器通神', description: '普通攻击及其连击伤害增加20%，不放大技能或反伤。' },
  { id: 'shield', name: '金刚不坏', description: '每场开始额外获得1倍防御护盾。' },
  { id: 'feign', name: '装死', description: '每场第一次致命伤保留1生命，优先于续命丹心消耗；后续攻击仍可击败你。' },
];
export const DEMON_TOWER_RARITY_ORDER: readonly DemonTowerRarity[] = ['凡', '精', '灵', '仙', '神'];
export const DEMON_TOWER_LOOT_WEIGHTS = { weapon: { 凡: 0, 精: 40, 灵: 30, 仙: 20, 神: 10 }, skill: { 凡: 40, 精: 30, 灵: 20, 仙: 10, 神: 0 } } as const;
export interface DemonTowerUpgradeCost {
  available: boolean; reason: 'max_quality' | 'level_required' | null; requiredLevel: number;
  spareCopies: number; materials: DemonTowerMaterials;
}
export interface DemonTowerLoadout {
  mainHand: DemonTowerWeaponId; artifact: DemonTowerWeaponId | null;
  /** Boss automation tries usable active skills in this order, then a normal attack. */
  activeSkills: DemonTowerSkillId[]; passiveSkills: DemonTowerSkillId[];
}
export interface DemonTowerEffectView { id: string; name: string; remainingTurns: number; magnitude: number }
export interface DemonTowerCombatantView {
  id: string; name: string; hp: number; maxHp: number; shield: number;
  attributes: DemonTowerAttributes; effects: DemonTowerEffectView[];
}
export interface DemonTowerCombatLog {
  turn: number; actor: 'player' | 'enemy' | 'system'; kind: 'damage' | 'heal' | 'shield' | 'effect' | 'dodge' | 'defeat' | 'reward' | 'info';
  text: string; amount?: number; targetId?: string;
}
export interface DemonTowerBattleView {
  source?: 'rift' | 'weekly_boss';
  id: string; kind: 'explore'; floor: number; turn: number; roundLimit: number;
  player: DemonTowerCombatantView; enemies: DemonTowerCombatantView[];
  availableSkills: Array<{ id: DemonTowerSkillId; cooldownRemaining: number; usable: boolean }>;
  log: DemonTowerCombatLog[];
}
export interface DemonTowerBattleReport {
  source?: 'rift' | 'weekly_boss';
  id: string; kind: 'explore' | 'boss'; floor: number; outcome: 'victory' | 'defeat' | 'fled' | 'timeout' | 'contributed';
  turns: number; damage: number; experience: number; materials: DemonTowerMaterials;
  /** Actual credited coins are returned by the service receipt, not this combat simulation. */
  log: DemonTowerCombatLog[]; completedAt: number;
}
export interface DemonTowerDailyView {
  serviceDate: string; activity: number; activityTarget: number; rewardClaimed: boolean;
  bossAttempts: number; bossAttemptsMax: number; officeCoinsEarned: number; officeCoinCap: number;
}
export interface DemonTowerProfileView {
  economy?: DemonTowerEconomyView;
  expansion?: DemonTowerExpansionView;
  growth?: DemonTowerGrowthView;
  version: number; level: number; experience: number; experienceToNext: number; totalExperience: number;
  attributes: DemonTowerAttributes; effectiveAttributes: DemonTowerAttributes; unspentPoints: number;
  /** Only spent free points are refundable; null means a first reset has no cooldown. */
  attributeReset: { allocatedPoints: number; eligibleAt: number | null };
  hp: number; maxHp: number; stamina: number; staminaMax: number; nextStaminaAt: number | null;
  materials: DemonTowerMaterials; weapons: DemonTowerOwnedWeapon[]; skills: DemonTowerOwnedSkill[];
  loadout: DemonTowerLoadout; selectedFloor: number; personalUnlockedFloor: number;
  daily: DemonTowerDailyView; battle: DemonTowerBattleView | null; lastReport: DemonTowerBattleReport | null;
  availableActions: DemonTowerActionKind[]; createdAt: number;
}
export interface DemonTowerWorldView {
  version: number; unlockedFloor: number; currentFloor: number; phase: 'boss' | 'passage' | 'complete';
  boss: { name: string; hp: number; maxHp: number }; passage: { current: number; required: number };
  completedFloors: number[]; updatedAt: number;
}
export interface DemonTowerOverview {
  serverNow: number; profile: DemonTowerProfileView | null; world: DemonTowerWorldView;
  wallet: { officeCoinBalance: number }; writesEnabled: boolean;
  /** Server-owned automation. Omitted only by older clients/test fixtures. */
  autoExplore?: DemonTowerAutoRunView | null;
}
export const DEMON_TOWER_AUTO_LIMITS = { maxExplorations: 20, maxSteps: 260, durationMs: 900_000, stepIntervalMs: 2000, startHealthPercent: 30, battleHealthPercent: 20 } as const;
export type DemonTowerAutoStopReason = 'completed' | 'manual_stop' | 'low_health' | 'defeat' | 'battle_timeout' | 'stamina_empty' | 'vip_expired' | 'session_ended' | 'account_inactive' | 'day_changed' | 'maintenance' | 'time_limit' | 'step_limit' | 'profile_changed' | 'floor_changed' | 'quota_reached' | 'server_error';
export interface DemonTowerAutoStartInput { requestId: string; expectedVersion: number; floor: number; maxExplorations: number }
/** Stop is naturally idempotent by its owned run ID, with no moving version requirement. */
export type DemonTowerAutoStopInput = Record<string, never>;
export interface DemonTowerAutoRunView {
  id: string; version: number; status: 'running' | 'completed' | 'stopped'; stopReason: DemonTowerAutoStopReason | null;
  serviceDate: string; floor: number; maxExplorations: number; startedExplorations: number; completedExplorations: number;
  steps: number; maxSteps: number; officeCoinsGranted: number; createdAt: number; nextStepAt: number | null; expiresAt: number; stoppedAt: number | null;
}
export interface DemonTowerAutoResponse { enabled: boolean; replayed: boolean; run: DemonTowerAutoRunView | null; overview: DemonTowerOverview }
export type DemonTowerAction =
  | { kind: 'shop_purchase'; payload: { offerId: DemonTowerShopOfferId; quantity: number } }
  | { kind: 'use_rune'; payload: { rune: DemonTowerAffix; itemId: DemonTowerWeaponId; replace?: DemonTowerAffix } }
  | { kind: 'enroll'; payload: Record<string, never> }
  | { kind: 'explore'; payload: Record<string, never> }
  | { kind: 'attack'; payload: { targetId: string } }
  | { kind: 'skill'; payload: { skillId: DemonTowerSkillId; targetId?: string } }
  | { kind: 'flee'; payload: Record<string, never> }
  | { kind: 'train'; payload: Record<string, never> }
  | { kind: 'rest'; payload: Record<string, never> }
  | { kind: 'equip'; payload: DemonTowerLoadout }
  | { kind: 'allocate'; payload: { attribute: DemonTowerAttribute; points: number } }
  | { kind: 'reset_attributes'; payload: Record<string, never> }
  | { kind: 'choose_innate'; payload: { attribute: DemonTowerAttribute } }
  | { kind: 'upgrade'; payload: { itemType: 'weapon' | 'skill'; itemId: DemonTowerWeaponId | DemonTowerSkillId } }
  | { kind: 'expedition'; payload: { mode: 'rift' | 'meditate' | 'weekly_boss' } }
  | { kind: 'market'; payload: { offer: 'weapon_box' | 'skill_box' | 'enlightenment' | 'skill_selection' | 'recycle_quality'; itemId?: DemonTowerWeaponId | DemonTowerSkillId } }
  | { kind: 'star_up'; payload: { itemType: 'weapon' | 'skill'; itemId: DemonTowerWeaponId | DemonTowerSkillId } }
  | { kind: 'breakthrough'; payload: { itemId: DemonTowerWeaponId } }
  | { kind: 'select_skin'; payload: { skin: DemonTowerSkin } }
  | { kind: 'claim_boss_loot'; payload: { floor: number } }
  | { kind: 'arena_enroll'; payload: { enabled: boolean } }
  | { kind: 'arena_learn'; payload: { skillId: DemonTowerArenaSkillId } }
  | { kind: 'arena_equip'; payload: { skills: DemonTowerArenaSkillId[] } }
  | { kind: 'arena_challenge'; payload: { opponentPublicId: string } }
  | { kind: 'honor_exchange'; payload: { offer: 'skin' | 'essence' | 'materials' } }
  | { kind: 'squad_create'; payload: { floor: number } }
  | { kind: 'squad_join'; payload: { squadId: string } }
  | { kind: 'squad_leave'; payload: Record<string, never> }
  | { kind: 'squad_ready'; payload: Record<string, never> }
  | { kind: 'squad_step'; payload: Record<string, never> }
  | { kind: 'squad_claim'; payload: Record<string, never> }
  | { kind: 'select_floor'; payload: { floor: number } }
  | { kind: 'challenge_boss'; payload: { floor: number } }
  | { kind: 'donate'; payload: { floor: number; material: 'ore' | 'clue'; amount: number } }
  | { kind: 'claim_reward'; payload: Record<string, never> };
export type DemonTowerActionKind = DemonTowerAction['kind'];
export type DemonTowerActionInput = DemonTowerAction & { requestId: string; expectedVersion: number };
export interface DemonTowerActionReceipt {
  requestId: string; replayed: boolean; overview: DemonTowerOverview;
  events: string[]; officeCoinsGranted: number; effectiveBossDamage: number; passageContribution: number;
}
export interface DemonTowerLeaderboardEntry {
  rank: number; publicId: string; displayName: string; level: number;
  bossDamage: number; passageContribution: number; score: number;
}
export interface DemonTowerLeaderboard {
  serverNow: number; serviceDate: string; entries: DemonTowerLeaderboardEntry[];
  me: DemonTowerLeaderboardEntry | null; rewardDescription: string;
  award: { officeCoins: number; status: 'pending' | 'awarded' | 'no_eligible_player'; winnerPublicId: string | null };
}
export interface DemonTowerContributions {
  serverNow: number; floor: number; entries: DemonTowerLeaderboardEntry[];
  me: DemonTowerLeaderboardEntry | null; rewardDescription: string;
}

const weapon = (id: DemonTowerWeaponId, name: string, type: DemonTowerWeaponType, attribute: DemonTowerAttribute,
  rarity: DemonTowerRarity, legacyRequiredLevel: number, baseBonus: number, description: string): DemonTowerWeaponDefinition =>
  ({ id, name, type, attribute, rarity, legacyRequiredLevel,
    dropLevel: ({ 凡: 1, 精: 1, 灵: 16, 仙: 31, 神: 46 })[rarity], requiredLevel: ({ 凡: 1, 精: 16, 灵: 31, 仙: 46, 神: 61 })[rarity],
    tier: ({ 凡: 3, 精: 3, 灵: 2, 仙: 1, 神: 0 })[rarity],
    weight: ({ w1: 0.9, w2: 0.9, w3: 0.9, w5: 1.1, w10: 1.1, w14: 0.9, w19: 1.2, w20: 0.7 } as Partial<Record<DemonTowerWeaponId, number>>)[id] ?? 1,
    baseBonus, qualityCap: ({ 凡: 3, 精: 5, 灵: 7, 仙: 9, 神: 9 })[rarity], description });
const skill = (id: DemonTowerSkillId, name: string, category: DemonTowerSkillDefinition['category'], kind: DemonTowerSkillDefinition['kind'],
  rarity: DemonTowerRarity, legacyRequiredLevel: number, cooldown: number, description: string): DemonTowerSkillDefinition =>
  ({ id, name, category, kind, rarity, legacyRequiredLevel,
    requiredLevel: ({ 凡: 1, 精: 16, 灵: 31, 仙: 46, 神: 61 })[rarity], dropLevel: ({ 凡: 1, 精: 16, 灵: 31, 仙: 46, 神: 61 })[rarity],
    tier: ({ 凡: 3, 精: 2, 灵: 1, 仙: 0, 神: 0 })[rarity], weight: id === 's13' ? 0.6 : id === 's15' || id === 's16' ? 0.9 : 1,
    cooldown, qualityCap: ({ 凡: 3, 精: 5, 灵: 7, 仙: 9, 神: 9 })[rarity], description });

export const DEMON_TOWER_WEAPONS: readonly DemonTowerWeaponDefinition[] = [
  weapon('w1', '斩马刀', '重兵', 'STR', '精', 1, 6, '破甲：目标防御不低于自身力量时，伤害增加15%。'),
  weapon('w2', '玄铁锤', '重兵', 'STR', '灵', 12, 10, '震慑：命中有20%概率使目标跳过一次行动。'),
  weapon('w3', '裂岳斧', '重兵', 'STR', '仙', 28, 16, '蓄力：连续3回合未损失生命后，下次攻击伤害增加40%。'),
  weapon('w4', '镇魂钺', '重兵', 'STR', '神', 48, 23, '吸血：实际造成伤害的20%恢复生命，不超过生命上限。'),
  weapon('w5', '鱼肠匕', '轻兵', 'AGI', '精', 1, 6, '背刺：本场先手时，首次普通攻击必定暴击。'),
  weapon('w6', '秋水短剑', '轻兵', 'AGI', '灵', 12, 10, '连击：普通攻击命中有30%概率追加0.5倍敏捷伤害。'),
  weapon('w7', '影刃', '轻兵', 'AGI', '仙', 28, 16, '残影：成功闪避后，反击1倍敏捷伤害。'),
  weapon('w8', '无影双匕', '轻兵', 'AGI', '神', 48, 23, '极速：常驻敏捷+15，普通攻击分为两段，每段65%伤害。'),
  weapon('w9', '梨花枪', '长兵', 'SPD', '精', 1, 6, '突刺：决定先后手时，额外获得15速度。'),
  weapon('w10', '方天画戟', '长兵', 'SPD', '灵', 12, 10, '横扫：普通攻击同时命中所有存活敌人，伤害不衰减。'),
  weapon('w11', '寒梅枪', '长兵', 'SPD', '仙', 28, 16, '穿云：直接攻击无视目标25%防御。'),
  weapon('w12', '龙渊戟', '长兵', 'SPD', '神', 48, 23, '龙吟：普通攻击追加一段50%伤害，并向其他敌人溅射40%伤害。'),
  weapon('w13', '罡气盾', '盾兵', 'DEF', '精', 1, 6, '格挡：受到直接攻击伤害减少20%，成功免伤/闪避仍为0。'),
  weapon('w14', '玄铁锏', '盾兵', 'DEF', '灵', 12, 10, '反震：直接攻击实际损失生命的25%反弹给攻击者，不触发连锁。'),
  weapon('w15', '玄武盾', '盾兵', 'DEF', '仙', 28, 16, '壁垒：每场战斗开始获得1.5倍防御护盾。'),
  weapon('w16', '不动明王盾', '盾兵', 'DEF', '神', 48, 23, '绝对防御：受到直接攻击时，有10%概率完全免伤。'),
  weapon('w17', '摄魂铃', '法器', 'LUCK', '精', 1, 6, '惑心：敌方命中与闪避概率分别降低15个百分点。'),
  weapon('w18', '招妖幡', '法器', 'LUCK', '灵', 12, 10, '召灵：每2回合对当前存活敌人造成0.5倍幸运伤害。'),
  weapon('w19', '乾坤壶', '法器', 'LUCK', '仙', 28, 16, '聚气：修炼获得的妖塔经验增加30%。'),
  weapon('w20', '混元幡', '法器', 'LUCK', '神', 48, 23, '改命：常驻幸运+15，探索物品掉落概率增加10个百分点。'),
];
export const DEMON_TOWER_SKILLS: readonly DemonTowerSkillDefinition[] = [
  skill('s1', '回春术', '回复', 'active', '凡', 1, 3, '恢复20+2倍幸运生命，随后同回合普通攻击一次；旧进行中战斗沿用原治疗规则。'),
  skill('s2', '裂地斩', '伤害', 'active', '凡', 1, 2, '造成2倍力量伤害；命中非首领目标时20%概率震慑一次，自身下一回合速度降低25%。'),
  skill('s3', '铁壁', '维度', 'active', '凡', 1, 3, '获得1.5倍防御护盾，持续2回合；品质提升护盾量。'),
  skill('s4', '力之祝福', '维度', 'active', '凡', 1, 4, '力量增加10，持续3回合。'),
  skill('s5', '疾影连刺', '伤害', 'active', '精', 6, 2, '连续攻击3段，每段0.6倍速度伤害，逐段结算护盾。'),
  skill('s6', '毒刃', '伤害', 'active', '精', 6, 2, '造成0.5倍敏捷伤害，并在随后2个回合末造成0.3倍敏捷毒伤。'),
  skill('s7', '幻身', '维度', 'active', '精', 6, 3, '暴击率增加25个百分点、闪避率增加20个百分点，持续2回合。'),
  skill('s8', '幸运星', '维度', 'passive', '精', 6, 0, '常驻幸运+8，并提高探索宝箱获得经验和材料的数量。'),
  skill('s9', '疗伤真气', '回复', 'passive', '灵', 18, 0, '存活时每个回合结束恢复0.5倍幸运生命。'),
  skill('s10', '灭却斩', '伤害', 'active', '灵', 18, 3, '造成1.5倍力量伤害；对首领或精英再增加50%。'),
  skill('s11', '风之祝福', '维度', 'passive', '灵', 18, 0, '常驻速度+8。'),
  skill('s12', '生生不息', '回复', 'passive', '灵', 18, 0, '战斗外生命自动恢复速度增加30%。'),
  skill('s13', '续命丹心', '回复', 'active', '仙', 36, 0, '每场一次：恢复至至少50%生命，并保留一次致命伤后50%生命复起的效果。'),
  skill('s14', '全维淬炼', '维度', 'active', '仙', 36, 5, '五属性各增加5，持续2回合。'),
  skill('s15', '气运一击', '伤害', 'active', '仙', 36, 4, '非首领目标有8%概率被压至1生命（无视护盾）；否则造成1至4倍幸运伤害。共享首领免疫压血，只结算普通伤害。'),
  skill('s16', '崩山击', '伤害', 'active', '仙', 36, 4, '造成3倍力量伤害，并使目标防御降低30%，持续2回合。'),
];
/** Conditional on receiving this item kind. Level filtering and guarantees are applied before normalization. */
export const DEMON_TOWER_SOURCE_WEIGHTS: Record<DemonTowerLootSource, { weapon: Record<DemonTowerRarity, number>; skill: Record<DemonTowerRarity, number> }> = {
  normal: DEMON_TOWER_LOOT_WEIGHTS,
  rift: { weapon: { 凡: 0, 精: 30, 灵: 30, 仙: 25, 神: 15 }, skill: { 凡: 30, 精: 30, 灵: 25, 仙: 15, 神: 0 } },
  meditation: { weapon: { 凡: 0, 精: 0, 灵: 0, 仙: 0, 神: 0 }, skill: { 凡: 30, 精: 30, 灵: 25, 仙: 15, 神: 0 } },
  boss_first: { weapon: { 凡: 0, 精: 0, 灵: 60, 仙: 40, 神: 0 }, skill: { 凡: 0, 精: 0, 灵: 60, 仙: 40, 神: 0 } },
  // Weight ×1.5 is normalized by the sampler: 40/30/20/15, not the inconsistent draft percentages.
  boss_weekly: { weapon: { 凡: 0, 精: 40, 灵: 30, 仙: 20, 神: 15 }, skill: { 凡: 40, 精: 30, 灵: 20, 仙: 15, 神: 0 } },
  weapon_box: { weapon: { 凡: 0, 精: 10, 灵: 35, 仙: 40, 神: 15 }, skill: DEMON_TOWER_LOOT_WEIGHTS.skill },
  skill_box: { weapon: DEMON_TOWER_LOOT_WEIGHTS.weapon, skill: { 凡: 10, 精: 35, 灵: 40, 仙: 15, 神: 0 } },
};
export function demonTowerLootPool(kind: 'weapon' | 'skill', level: number, minimum: DemonTowerRarity = '凡', source: DemonTowerLootSource = 'normal') {
  const definitions = kind === 'weapon' ? DEMON_TOWER_WEAPONS : DEMON_TOWER_SKILLS;
  return DEMON_TOWER_RARITY_ORDER.filter(rarity => DEMON_TOWER_RARITY_ORDER.indexOf(rarity) >= DEMON_TOWER_RARITY_ORDER.indexOf(minimum))
    .map(rarity => ({ rarity, weight: DEMON_TOWER_SOURCE_WEIGHTS[source][kind][rarity], items: definitions.filter(item => item.rarity === rarity && item.dropLevel <= level) }))
    .filter(group => group.weight > 0 && group.items.length > 0);
}
export function demonTowerItemDropPercent(kind: 'weapon' | 'skill', id: string, level: number): number {
  const pool = demonTowerLootPool(kind, level), group = pool.find(entry => entry.items.some(item => item.id === id));
  const item = group?.items.find(entry => entry.id === id);
  if (!group || !item) return 0;
  return 100 * group.weight / pool.reduce((sum, entry) => sum + entry.weight, 0) * item.weight / group.items.reduce((sum, entry) => sum + entry.weight, 0);
}
const DEMON_TOWER_MECHANIC_HINTS: Record<number, string> = {
  1: '犼野守关者与精英先蓄力、下次行动重击（1.35倍）；蓄力不攻击，震慑可打断，提前铁壁或治疗可应对。',
  2: '湖雾妖物先预告毒雾、下次弱攻击穿透护盾才施加2回合毒伤；毒不叠层，护盾与治疗都有效。',
  3: '山岭守关者与精英带有限护盾，第4回合举盾时不会攻击；可先清其他敌人，或趁举盾治疗。',
  4: '潮毒先预告、下次弱攻击穿透护盾才施加2回合毒伤；震慑打断预备，持续毒可由护盾吸收。',
  5: '赤风重击在蓄力后释放（1.8倍），蓄力时不攻击；控制打断或提前护盾，比硬扛更稳。',
  6: '寒星护势仅提供有限护盾，第4回合再次举盾并放弃攻击；首领盾量按楼层强度，不按共享总生命计算。',
  7: '鸣雷守关者与精英先蓄力、下次释放1.8倍重击；可在预告回合治疗、护盾，或以震慑打断。',
  8: '归墟毒雾先预告，随后弱攻击穿透护盾才上2回合毒伤；毒伤不叠层，提前防护可阻止中毒。',
  9: '镇塔灵带有限护势，第4回合举盾时放弃攻击；盾量不随全服血池增长，普通配装也能贡献有效伤害。',
};
export const DEMON_TOWER_FLOORS: readonly DemonTowerFloorDefinition[] = ([
  { floor: 1, name: '犼野平原', terrain: 'plain', requiredLevel: 1, description: '草海与古道交汇，新手也能参与守关者与通道协作。', enemyNames: ['游荡妖卒', '荒原狼', '石甲蜥'], bossName: '百战羚王·犼野', bossMaxHp: 2400, passageRequired: 60 },
  { floor: 2, name: '雾隐镜湖', terrain: 'lake', requiredLevel: 5, description: '雾气深处藏着水底贝匣，灵草在湖畔生长。', enemyNames: ['碧鳞鱼妖', '雾隐盗', '泽畔水鬼'], bossName: '镜湖灵蜃·照影', bossMaxHp: 7000, passageRequired: 110 },
  { floor: 3, name: '裂石群山', terrain: 'mountain', requiredLevel: 12, description: '矿砂与残卷散落山径，厚甲妖物守着石窟。', enemyNames: ['山魈', '裂石魔', '石甲蜥'], bossName: '裂岳山君·磐岳', bossMaxHp: 15000, passageRequired: 180 },
  { floor: 4, name: '潮生之海', terrain: 'sea', requiredLevel: 22, description: '踏过退潮礁石，合力修筑通往高塔的栈桥。', enemyNames: ['潮生海妖', '礁石蟹将', '怒涛游魂'], bossName: '沧潮蛟君·覆浪', bossMaxHp: 28000, passageRequired: 260 },
  { floor: 5, name: '赤风荒原', terrain: 'plain', requiredLevel: 36, description: '赤风掠过断戟，成群妖卒考验横扫与防御配装。', enemyNames: ['赤风妖骑', '荒原兽卫', '火羽妖禽'], bossName: '赤羽妖侯·焚翎', bossMaxHp: 47000, passageRequired: 360 },
  { floor: 6, name: '寒星冰湖', terrain: 'lake', requiredLevel: 52, description: '冰湖映出繁星，速度与续航让探索更加从容。', enemyNames: ['冰鳞灵妖', '寒雾守卫', '星霜影兽'], bossName: '寒星玄龟·凝霜', bossMaxHp: 74000, passageRequired: 480 },
  { floor: 7, name: '雷鸣绝岭', terrain: 'mountain', requiredLevel: 72, description: '雷光照亮古代封印，各流派一起收集修复材料。', enemyNames: ['雷羽山魈', '鸣石魔像', '奔霆兽'], bossName: '鸣霄雷猿·震岳', bossMaxHp: 110000, passageRequired: 620 },
  { floor: 8, name: '归墟深海', terrain: 'sea', requiredLevel: 94, description: '古楼船停泊归墟，守关者与群妖共同守护最后航道。', enemyNames: ['归墟幽鳞', '深海甲将', '沉舟妖灵'], bossName: '归墟鲲影·吞澜', bossMaxHp: 155000, passageRequired: 780 },
  { floor: 9, name: '九霄天台', terrain: 'mountain', requiredLevel: 110, description: '九层云阶汇聚众人贡献，最终封印完成后仍可自由探索。', enemyNames: ['云阶妖卫', '天台影将', '九霄灵兽'], bossName: '九霄镇塔灵·太初', bossMaxHp: 210000, passageRequired: 1000 },
] satisfies Array<Omit<DemonTowerFloorDefinition, 'mechanicHint'>>).map((floor) => ({ ...floor, mechanicHint: DEMON_TOWER_MECHANIC_HINTS[floor.floor] }));
export const DEMON_TOWER_CATALOG: DemonTowerCatalog = {
  gameKey: 'demon-tower', name: '九层妖塔', version: 1, enabled: true,
  attributes: { STR: '力量', SPD: '速度', AGI: '敏捷', DEF: '防御', LUCK: '幸运' },
  materials: { ore: '玄铁砂', herb: '灵草', soul: '妖塔残魂', clue: '通道线索' },
  weapons: DEMON_TOWER_WEAPONS, skills: DEMON_TOWER_SKILLS, floors: DEMON_TOWER_FLOORS,
  starter: { weapons: ['w1', 'w5', 'w9', 'w13', 'w17'], skills: ['s1', 's2', 's3', 's4'],
    loadout: { mainHand: 'w1', artifact: 'w17', activeSkills: ['s2', 's1', 's3'], passiveSkills: [] } },
  rules: { maxLevel: 120, staminaCap: 100, staminaRestoreMs: 180_000, exploreCost: 5, trainCost: 6, restCost: 5,
    bossCost: 10, bossAttemptsPerDay: 3, combatRoundLimit: 12, bossRoundLimit: 5, activeSkillSlots: 3, passiveSkillSlots: 2,
    dailyOfficeCoinCap: 200, dailyActivityTarget: 3, dailyActivityCoins: 30, dailyLeaderboardCoins: 100,
    restHealingPercent: 50, healingRestoreMs: 30_000, donationValues: { ore: 1, clue: 5 }, lootGuaranteeEvery: 4,
    attributeResetCooldownMs: 86_400_000, resetTimezone: 'Asia/Shanghai',
    rulesText: [
      '完全免费，没有充值或付费战力。灵石仅为妖塔内绑定物资，不可转赠或兑换办公币；妖塔等级、体力和材料独立于平台账号成长。',
      '开局赠送五类基础武器和四个基础技能，可立即选择流派；主手一件、副法器一件、主动技能三个、被动技能两个。',
      '法器也可作为主手，普通攻击按主手对应属性计算；同一件武器不能同时占据主手和副法器槽。',
      '战斗外可免费重置已分配自由点，首次随时可用、以后每24小时一次；固有属性保留，不提供治疗或额外资源。',
      '普通战斗每次操作一个回合，无实时倒计时；世界首领按配装技能优先顺序自动进行最多五回合。',
      '世界首领伤害与通道材料由全服共享，不要求实时组队或最低人数；后来者可探索已解锁楼层。',
      '妖塔日常办公币最多200枚/上海自然日，由平台统一钱包结算；没有额外付费或承诺返利。',
      '重复物品保留为副本。升阶必定成功：优先消耗一个副本，否则使用独立材料；到品质上限仍保留副本。',
      '每4次可掉落探索结算至少获得1件物品，保底在抽中的稀有度内优先未收录；常规武器池精/灵/仙/神权重40/30/20/10，技能池凡/精/灵/仙同权重，先过滤获取等级再归一。不是每次探索的绝对出货率。',
      '达到Lv16后累计无灵以上探索结算，连续20次未得则下一次保底；Lv31后仙以上同理50次。未达资格不计数，保底可调整武器/技能种类以保证有合法物品，不会抽空。',
      '武器星级独立于+N。每次普攻行动主手与已装法器各+1熟练度，多段不重复；每星需当前星级×15熟练度，升星清零，最高5星，每星普攻伤害+10%。无降星、无付费升星。',
      '免费选择一次心性主维获得首个命格；随后在Lv16/31/46/61/76/91/106依次补齐8命格，不占技能槽。旧角色同样可选；旧战斗结束后启用新规则。',
      '新手赠送五武器和旧存档已拥有物品保留使用资格。新掉落武器按获取/装备双等级限制，不删除旧装备，不增加充值或自动购买。',
      '内部物资申领单集中管理灵石物资、残魂秘市和绑定符文；灵石每日总获取上限200，其中世界首领有效伤害按0.5折算、每日最多100，不回填历史收益。',
      '临时药丸每维每日最多+15，北京时间零点到期，进行中战斗保留快照；论道和小队不使用临时药效。永久丹每维累计最多+5，洗点不影响。',
      '战斗外生命与体力按服务器时间恢复，战斗内不自动回血；负伤可以休整。',
  ] },
};

/** Display helper only. The server recomputes against locked, owned inventory. */
export function demonTowerUpgradeCost(itemType: 'weapon' | 'skill', itemId: string, quality: number, spareCopies: number, level: number, levelExempt = false, expandedRarity?: DemonTowerRarity): DemonTowerUpgradeCost {
  const item = (itemType === 'weapon' ? DEMON_TOWER_WEAPONS : DEMON_TOWER_SKILLS).find((entry) => entry.id === itemId);
  const materials: DemonTowerMaterials = { ore: 0, herb: 0, soul: 0, clue: 0 };
  const next = quality + 1;
  const requiredLevel = expandedRarity ? [1, 16, 31, 46, 61].find(candidate => demonTowerQualityLimit(expandedRarity, candidate) >= next) ?? 121 : Math.max(levelExempt ? item?.legacyRequiredLevel ?? 120 : item?.requiredLevel ?? 120, Math.max(1, (next - 2) * 8));
  const cap = expandedRarity ? ({ 凡: 3, 精: 5, 灵: 7, 仙: 9, 神: 9 })[expandedRarity] : item?.qualityCap ?? 0;
  const reason = !item || quality >= cap ? 'max_quality' : level < requiredLevel ? 'level_required' : null;
  if (spareCopies < 1 && item) {
    if (itemType === 'weapon') materials.ore = 3 + next * 3;
    else materials.herb = 2 + next * 2;
    materials.soul = Math.max(1, next);
  }
  return { available: reason === null, reason, requiredLevel, spareCopies: spareCopies > 0 ? 1 : 0, materials };
}
