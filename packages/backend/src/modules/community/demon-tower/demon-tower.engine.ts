import { createHash, createHmac } from 'node:crypto';
import {
  DEMON_TOWER_ATTRIBUTE_KEYS, DEMON_TOWER_CATALOG, DEMON_TOWER_FLOORS, DEMON_TOWER_SKILLS,
  DEMON_TOWER_WEAPONS, DEMON_TOWER_INNATES, DEMON_TOWER_RARITY_ORDER, demonTowerLootPool, demonTowerUpgradeCost,
  DEMON_TOWER_EXPANSION_RULES, DEMON_TOWER_AFFIXES, DEMON_TOWER_ULTIMATES, demonTowerItemRarity, demonTowerQualityLimit,
  DEMON_TOWER_ARENA_SKILLS, DEMON_TOWER_ECONOMY_RULES,
} from '@stealth-reader/shared';
import type {
  DemonTowerAction, DemonTowerActionKind, DemonTowerAttribute, DemonTowerAttributes, DemonTowerBattleReport,
  DemonTowerBattleView, DemonTowerCombatantView, DemonTowerCombatLog, DemonTowerEffectView,
  DemonTowerLoadout, DemonTowerMaterials, DemonTowerOwnedSkill, DemonTowerOwnedWeapon,
  DemonTowerProfileView, DemonTowerSkillId, DemonTowerWeaponId, DemonTowerWorldView, DemonTowerInnateId, DemonTowerRarity,
  DemonTowerExpansionView, DemonTowerLootSource, DemonTowerAffix, DemonTowerSkin,
  DemonTowerArenaSkillId, DemonTowerEconomyView, DemonTowerShopOffer, DemonTowerShopOfferId, DemonTowerEconomyLedgerEntry,
} from '@stealth-reader/shared';
import { demonTowerArenaRank, simulateDemonTowerDuel, type DemonTowerSocialBuild } from './demon-tower-social.engine';

const RULES = DEMON_TOWER_CATALOG.rules;
const MAX_RESOURCE = 1_000_000;
const MAX_XP = 1_000_000_000;
const MAX_LOG = 100;
type EffectId = 'strength' | 'all' | 'illusion' | 'slow' | 'poison' | 'shred' | 'stun' | 'shield' | 'charge_warning' | 'charge_ready' | 'venom_warning' | 'venom_ready' | 'guard_warning';
type EnemyMechanic = 'charge' | 'guard' | 'venom';
interface Effect { id: EffectId; magnitude: number; turns: number }
interface Fighter {
  id: string; name: string; hp: number; maxHp: number; shield: number; attributes: DemonTowerAttributes;
  effects: Effect[]; elite: boolean; boss: boolean; mechanic?: EnemyMechanic;
}
interface Battle {
  /** Immutable for an in-flight battle, including after the daily shop reset. */
  economyVersion?: 1;
  expansionVersion?: 1; source?: 'rift' | 'weekly_boss'; ultimateUsed?: boolean; divineGuardUsed?: boolean;
  /** Absent means the persisted pre-growth rules; never change a battle in flight. */
  rulesVersion?: 2; innates?: DemonTowerInnateId[]; feignUsed?: boolean;
  id: string; kind: 'explore' | 'boss'; floor: number; turn: number; roundLimit: number;
  player: Fighter; enemies: Fighter[]; cooldowns: Partial<Record<DemonTowerSkillId, number>>;
  usedRevive: boolean; reviveArmed: boolean; firstAttack: boolean; untouchedTurns: number;
  totalDamage: number; bossDamage: number; playerDamageTaken: number; landedPlayerHits: number; log: DemonTowerCombatLog[];
}
/** Private JSON only. Never spread state or battle into API responses. */
export interface DemonTowerEngineState {
  economy?: DemonTowerEconomyState;
  expansion?: DemonTowerExpansionView;
  arenaOpponentsToday?: string[]; arenaBestRank?: number;
  growth?: { rulesVersion: 2; chosenAttribute: DemonTowerAttribute | null; innates: DemonTowerInnateId[]; misses: { ling: number; xian: number } };
  schemaVersion: 1; createdAt: number; lastActionAt: number; rngSeed: string; rngCounter: number;
  level: number; experience: number; totalExperience: number; attributes: DemonTowerAttributes; unspentPoints: number;
  /** Optional for saves created before free attribute resets were available. */
  lastAttributeResetAt?: number | null;
  hp: number; stamina: number; staminaAt: number; healingAt: number;
  materials: DemonTowerMaterials; weapons: DemonTowerOwnedWeapon[]; skills: DemonTowerOwnedSkill[];
  loadout: DemonTowerLoadout; selectedFloor: number; battle: Battle | null; lastReport: DemonTowerBattleReport | null;
  lootPity: { stepsSinceGuarantee: number; nextKind: 'weapon' | 'skill' };
  daily: { serviceDate: string; activity: number; bossAttempts: number; rewardClaimed: boolean };
}
export interface DemonTowerEconomyState {
  version: 1; balance: number; serviceDate: string; week: string; dailyEarned: number; bossEarned: number;
  dailyPurchases: Partial<Record<DemonTowerShopOfferId, number>>; weeklyPurchases: Partial<Record<DemonTowerShopOfferId, number>>;
  permanent: DemonTowerAttributes; buffs: DemonTowerAttributes; runes: Partial<Record<DemonTowerAffix, number>>;
  ledgerSequence: number; ledger: DemonTowerEconomyLedgerEntry[];
}
export interface DemonTowerEngineContext { now: number; serviceDate: string; world: DemonTowerWorldView; expansionEnabled?: boolean; contributedFloors?: number[];
  arenaOpponent?: { publicId: string; displayName: string; build: DemonTowerSocialBuild } }
export interface DemonTowerWorldEffect { kind: 'boss_damage' | 'construction'; floor: number; amount: number }
export interface DemonTowerEngineResult {
  state: DemonTowerEngineState; events: string[]; worldEffect: DemonTowerWorldEffect | null;
  /** Proposed ordinary payout only. Service applies the 200/day cap and ledger in the same transaction. */
  officeCoinIntent: number;
}
export class DemonTowerEngineError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'DemonTowerEngineError'; }
}
function fail(code: string): never { throw new DemonTowerEngineError(code); }
const own = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);
const clone = <T>(input: T): T => JSON.parse(JSON.stringify(input)) as T;
const emptyMaterials = (): DemonTowerMaterials => ({ ore: 0, herb: 0, soul: 0, clue: 0 });
const copyAttributes = (input: DemonTowerAttributes): DemonTowerAttributes => ({ STR: input.STR, SPD: input.SPD, AGI: input.AGI, DEF: input.DEF, LUCK: input.LUCK });
const copyMaterials = (input: DemonTowerMaterials): DemonTowerMaterials => ({ ore: input.ore, herb: input.herb, soul: input.soul, clue: input.clue });
const bound = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const integer = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
function clock(now: number, serviceDate?: string): void {
  if (!integer(now, 0, 8_640_000_000_000_000 - 86_400_000)) fail('INVALID_TIME');
  if (serviceDate !== undefined && (typeof serviceDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate) ||
    new Date(now + 8 * 3_600_000).toISOString().slice(0, 10) !== serviceDate)) fail('INVALID_SERVICE_DATE');
}
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('INVALID_ACTION');
  const object = value as Record<string, unknown>;
  if (Reflect.ownKeys(object).some((key) => typeof key !== 'string' || !keys.includes(key) || !Object.getOwnPropertyDescriptor(object, key)?.enumerable || !('value' in Object.getOwnPropertyDescriptor(object, key)!))) fail('INVALID_ACTION');
  return object;
}
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const object = record(value, keys);
  if (Object.keys(object).length !== keys.length || keys.some((key) => !own(object, key))) fail('INVALID_ACTION');
  return object;
}
const weaponDefinition = (id: string) => DEMON_TOWER_WEAPONS.find((item) => item.id === id) ?? fail('INVALID_WEAPON');
const skillDefinition = (id: string) => DEMON_TOWER_SKILLS.find((item) => item.id === id) ?? fail('INVALID_SKILL');
const floorDefinition = (floor: number) => DEMON_TOWER_FLOORS.find((item) => item.floor === floor) ?? fail('INVALID_FLOOR');
function random(state: DemonTowerEngineState): number {
  if (!integer(state.rngCounter, 0, Number.MAX_SAFE_INTEGER - 1)) fail('INVALID_STATE');
  const value = createHmac('sha256', state.rngSeed).update(`roll:${state.rngCounter++}`).digest();
  return value.readUInt32BE(0) / 0x1_0000_0000;
}
function identifier(state: DemonTowerEngineState, kind: string): string {
  return createHmac('sha256', state.rngSeed).update(`${kind}:${state.rngCounter++}`).digest('hex').slice(0, 24);
}
const weaponOwned = (state: DemonTowerEngineState, id: DemonTowerWeaponId) => state.weapons.find((item) => item.id === id) ?? fail('WEAPON_NOT_OWNED');
const skillOwned = (state: DemonTowerEngineState, id: DemonTowerSkillId) => state.skills.find((item) => item.id === id) ?? fail('SKILL_NOT_OWNED');
const combatSkillOwned = (state: DemonTowerEngineState, id: DemonTowerSkillId): DemonTowerOwnedSkill => state.skills.find(item => item.id === id) ?? (state.expansion && boundSkills(state).includes(id) ? { id, quality: 0, spareCopies: 0, star: 1 } : fail('SKILL_NOT_OWNED'));
const hasWeapon = (state: DemonTowerEngineState, id: DemonTowerWeaponId): boolean => state.loadout.mainHand === id || state.loadout.artifact === id;
const hasPassive = (state: DemonTowerEngineState, id: DemonTowerSkillId): boolean => state.loadout.passiveSkills.includes(id);
const weaponScale = (state: DemonTowerEngineState, id: DemonTowerWeaponId): number => 1 + weaponOwned(state, id).quality * 0.15;
const skillScale = (state: DemonTowerEngineState, id: DemonTowerSkillId): number => (1 + combatSkillOwned(state, id).quality * 0.12) * (state.expansion && (!state.battle || state.battle.expansionVersion) ? 1 + ((combatSkillOwned(state, id).star ?? 1) - 1) * 0.08 : 1);
const battleInnate = (battle: Battle, id: DemonTowerInnateId): boolean => battle.rulesVersion === 2 && Boolean(battle.innates?.includes(id));
function unlockInnates(state: DemonTowerEngineState): void {
  const growth = state.growth;
  if (!growth?.chosenAttribute) return;
  const first = DEMON_TOWER_INNATES.find(item => item.attribute === growth.chosenAttribute)!;
  // Recompute from the immutable first choice and level, never trust client-supplied trait lists.
  growth.innates = [first.id, ...DEMON_TOWER_INNATES.filter(item => item.id !== first.id).map(item => item.id)]
    .slice(0, Math.min(8, 1 + Math.floor((state.level - 1) / 15)));
}
/** Write-path-only additive migration. GET and old in-flight battles never persist or advance this adapter. */
function enableGrowth(state: DemonTowerEngineState): void {
  if (state.battle || state.growth) return;
  state.growth = { rulesVersion: 2, chosenAttribute: null, innates: [], misses: { ling: 0, xian: 0 } };
  for (const item of state.weapons) { item.star = 1; item.favor = 0; item.levelExempt = true; }
  for (const item of state.skills) item.levelExempt = true;
}
function chance(state: DemonTowerEngineState, probability: number): boolean { return random(state) < bound(probability, 0, 1); }
function effect(fighter: Fighter, id: EffectId): Effect | undefined { return fighter.effects.find((item) => item.id === id && item.turns > 0); }
function putEffect(fighter: Fighter, id: EffectId, magnitude: number, turns: number): void {
  fighter.effects = fighter.effects.filter((item) => item.id !== id);
  fighter.effects.push({ id, magnitude, turns });
}
function dimensions(fighter: Fighter): DemonTowerAttributes {
  const result = copyAttributes(fighter.attributes);
  const all = effect(fighter, 'all')?.magnitude ?? 0;
  for (const key of DEMON_TOWER_ATTRIBUTE_KEYS) result[key] += all;
  result.STR += effect(fighter, 'strength')?.magnitude ?? 0;
  result.SPD = Math.floor(result.SPD * (1 - (effect(fighter, 'slow')?.magnitude ?? 0)));
  result.DEF = Math.floor(result.DEF * (1 - (effect(fighter, 'shred')?.magnitude ?? 0)));
  return result;
}
export function demonTowerEffectiveAttributes(state: DemonTowerEngineState, includeTemporary = true): DemonTowerAttributes {
  const result = copyAttributes(state.attributes);
  for (const id of [state.loadout.mainHand, state.loadout.artifact]) {
    if (!id) continue;
    const item = weaponDefinition(id), owned = weaponOwned(state, id);
    result[item.attribute] += Math.round(item.baseBonus * (1 + owned.quality * 0.1));
    if (state.expansion && owned.breakthrough) {
      result[item.attribute] += owned.breakthrough * 3;
      result[DEMON_TOWER_ATTRIBUTE_KEYS[(DEMON_TOWER_ATTRIBUTE_KEYS.indexOf(item.attribute) + 1) % 5]] += owned.breakthrough * 4;
    }
  }
  if (hasWeapon(state, 'w8')) result.AGI += Math.round(15 * weaponScale(state, 'w8'));
  if (hasWeapon(state, 'w20')) result.LUCK += Math.round(15 * weaponScale(state, 'w20'));
  if (hasPassive(state, 's8')) result.LUCK += Math.round(8 * skillScale(state, 's8'));
  if (hasPassive(state, 's11')) result.SPD += Math.round(8 * skillScale(state, 's11'));
  for (const innate of DEMON_TOWER_INNATES) if (innate.attribute && state.growth?.innates.includes(innate.id)) result[innate.attribute] += 8;
  for (const key of DEMON_TOWER_ATTRIBUTE_KEYS) result[key] += (state.economy?.permanent[key] ?? 0) + (includeTemporary ? state.economy?.buffs[key] ?? 0 : 0);
  return result;
}
export function demonTowerMaxHp(state: DemonTowerEngineState, includeTemporary = true): number {
  return 80 + state.level * 5 + demonTowerEffectiveAttributes(state, includeTemporary).DEF * 4;
}
export function demonTowerExperienceToNext(level: number): number {
  if (!integer(level, 1, RULES.maxLevel)) fail('INVALID_LEVEL');
  return level === RULES.maxLevel ? 0 : 30 + level * 10 + Math.floor(level * level / 25);
}
export function demonTowerPersonalUnlockedFloor(level: number): number {
  return DEMON_TOWER_FLOORS.filter((floor) => floor.requiredLevel <= level).at(-1)?.floor ?? 1;
}
function inherentAttributes(level: number): DemonTowerAttributes {
  if (!integer(level, 1, RULES.maxLevel)) fail('INVALID_STATE');
  const attributes: DemonTowerAttributes = { STR: 10, SPD: 10, AGI: 10, DEF: 10, LUCK: 10 };
  for (let previousLevel = 1; previousLevel < level; previousLevel += 1) {
    attributes[DEMON_TOWER_ATTRIBUTE_KEYS[(previousLevel * 2) % 5]] += 1;
    attributes[DEMON_TOWER_ATTRIBUTE_KEYS[(previousLevel * 2 + 1) % 5]] += 1;
  }
  return attributes;
}
function gainXp(state: DemonTowerEngineState, amount: number, events: string[]): number {
  const granted = Math.min(MAX_XP - state.totalExperience, Math.max(0, Math.round(amount)));
  state.totalExperience += granted;
  if (state.level === RULES.maxLevel) return granted;
  state.experience += granted;
  while (state.level < RULES.maxLevel && state.experience >= demonTowerExperienceToNext(state.level)) {
    state.experience -= demonTowerExperienceToNext(state.level);
    const next = state.level++;
    state.attributes[DEMON_TOWER_ATTRIBUTE_KEYS[(next * 2) % 5]] += 1;
    state.attributes[DEMON_TOWER_ATTRIBUTE_KEYS[(next * 2 + 1) % 5]] += 1;
    state.unspentPoints += 2;
    state.hp = Math.min(demonTowerMaxHp(state), state.hp + 15);
    events.push(`提升至妖塔 Lv.${state.level}，获得2点自由属性。`);
  }
  if (state.level === RULES.maxLevel) state.experience = 0;
  unlockInnates(state);
  if (state.expansion && !state.battle) settleQualityExperience(state, events);
  return granted;
}
function gainMaterials(state: DemonTowerEngineState, materials: Partial<DemonTowerMaterials>): DemonTowerMaterials {
  const granted = emptyMaterials();
  for (const key of Object.keys(granted) as Array<keyof DemonTowerMaterials>) {
    granted[key] = Math.min(MAX_RESOURCE - state.materials[key], Math.max(0, Math.round(materials[key] ?? 0)));
    state.materials[key] += granted[key];
  }
  return granted;
}
function activity(state: DemonTowerEngineState): void { state.daily.activity = Math.min(10_000, state.daily.activity + 1); }
export function createDemonTowerState(now: number, serviceDate: string, seed: string): DemonTowerEngineState {
  clock(now, serviceDate);
  if (typeof seed !== 'string' || seed.length < 16 || seed.length > 512) fail('INVALID_SEED');
  const state: DemonTowerEngineState = {
    schemaVersion: 1, createdAt: now, lastActionAt: now, rngSeed: createHash('sha256').update(seed).digest('hex'), rngCounter: 0,
    level: 1, experience: 0, totalExperience: 0, attributes: { STR: 10, SPD: 10, AGI: 10, DEF: 10, LUCK: 10 }, unspentPoints: 3,
    lastAttributeResetAt: null,
    hp: 125, stamina: RULES.staminaCap, staminaAt: now, healingAt: now,
    materials: { ore: 12, herb: 10, soul: 4, clue: 0 },
    weapons: DEMON_TOWER_CATALOG.starter.weapons.map((id) => ({ id, quality: 0, spareCopies: 0 })),
    skills: DEMON_TOWER_CATALOG.starter.skills.map((id) => ({ id, quality: 0, spareCopies: 0 })),
    loadout: clone(DEMON_TOWER_CATALOG.starter.loadout),
    selectedFloor: 1, battle: null, lastReport: null, lootPity: { stepsSinceGuarantee: 0, nextKind: 'weapon' },
    daily: { serviceDate, activity: 0, bossAttempts: 0, rewardClaimed: false },
  };
  enableGrowth(state);
  state.hp = demonTowerMaxHp(state);
  return state;
}
export function advanceDemonTowerState(input: DemonTowerEngineState, now: number, serviceDate: string): DemonTowerEngineState {
  clock(now, serviceDate);
  if (input.schemaVersion !== 1 || now < Math.max(input.lastActionAt, input.staminaAt, input.healingAt) || serviceDate < input.daily.serviceDate) fail('INVALID_TIME');
  if (input.growth && (input.growth.rulesVersion !== 2 || !integer(input.growth.misses?.ling, 0, 20) || !integer(input.growth.misses?.xian, 0, 50) ||
    (input.growth.chosenAttribute !== null && !DEMON_TOWER_ATTRIBUTE_KEYS.includes(input.growth.chosenAttribute)) || !Array.isArray(input.growth.innates) ||
    input.growth.innates.some(id => !DEMON_TOWER_INNATES.some(item => item.id === id)))) fail('INVALID_GROWTH_STATE');
  if (input.battle?.rulesVersion !== undefined && input.battle.rulesVersion !== 2) fail('INVALID_GROWTH_STATE');
  if (input.battle?.expansionVersion !== undefined && input.battle.expansionVersion !== 1) fail('INVALID_EXPANSION_STATE');
  if (input.battle?.economyVersion !== undefined && input.battle.economyVersion !== 1) fail('INVALID_ECONOMY_STATE');
  if (input.expansion) validateExpansionState(input);
  if (input.economy) validateEconomyState(input.economy, input.daily.serviceDate);
  const state = clone(input);
  if (state.economy) advanceEconomy(state.economy, serviceDate);
  const elapsed = Math.max(0, now - state.staminaAt);
  const restored = Math.floor(elapsed / RULES.staminaRestoreMs);
  if (state.stamina >= RULES.staminaCap) state.staminaAt = now;
  else if (restored > 0) {
    state.stamina = Math.min(RULES.staminaCap, state.stamina + restored);
    state.staminaAt = state.stamina === RULES.staminaCap ? now : state.staminaAt + restored * RULES.staminaRestoreMs;
  }
  const maxHp = state.battle?.player.maxHp ?? demonTowerMaxHp(state);
  state.hp = Math.min(state.hp, maxHp);
  const interval = Math.max(1, Math.floor(RULES.healingRestoreMs / (hasPassive(state, 's12') ? 1 + 0.3 * skillScale(state, 's12') : 1)));
  if (state.battle || state.hp >= maxHp) state.healingAt = now;
  else {
    const points = Math.floor(Math.max(0, now - state.healingAt) / interval);
    state.hp = Math.min(maxHp, state.hp + points);
    state.healingAt = state.hp === maxHp ? now : state.healingAt + points * interval;
  }
  if (state.daily.serviceDate !== serviceDate) state.daily = { serviceDate, activity: 0, bossAttempts: 0, rewardClaimed: false };
  if (state.expansion) {
    if (input.daily.serviceDate !== serviceDate) {
      state.expansion.riftsToday = 0; state.expansion.meditationsToday = 0; state.expansion.squadReadyToday = 0;
      state.arenaOpponentsToday = [];
      if (state.expansion.arena) { state.expansion.arena.attemptsToday = 0; state.expansion.arena.winsToday = 0; }
    }
    if (state.expansion.week !== expansionWeek(serviceDate)) { state.expansion.week = expansionWeek(serviceDate); state.expansion.weeklyBossAttempts = 0; }
  }
  return state;
}
const ECONOMY = DEMON_TOWER_ECONOMY_RULES;
const zeroAttributes = (): DemonTowerAttributes => ({ STR: 0, SPD: 0, AGI: 0, DEF: 0, LUCK: 0 });
type ShopDefinition = Omit<DemonTowerShopOffer, 'purchased' | 'remaining' | 'available' | 'reason'>;
const SHOP_OFFERS: readonly ShopDefinition[] = [
  { id: 'stamina_small', name: '小份体力包', currency: 'spirit_stone', price: 20, limit: 5, limitPeriod: 'day', description: '立即恢复3点体力；不足完整恢复空间时不扣款。' },
  { id: 'stamina_large', name: '大份体力包', currency: 'spirit_stone', price: 45, limit: 2, limitPeriod: 'day', description: '立即恢复8点体力；不足完整恢复空间时不扣款。' },
  ...DEMON_TOWER_ATTRIBUTE_KEYS.map(attribute => ({ id: `pill_${attribute}` as DemonTowerShopOfferId, name: `${DEMON_TOWER_CATALOG.attributes[attribute]}临时药丸`, currency: 'spirit_stone' as const, price: 15, limit: 3, limitPeriod: 'day' as const, description: `${DEMON_TOWER_CATALOG.attributes[attribute]}+5，立即生效；同维每日最多+15，北京时间零点到期。仅用于个人探索和首领，不用于论道/小队。${attribute === 'LUCK' ? '沿用幸运对暴击、相关技能与掉落触发率的作用，不改变奇遇分支概率。' : ''}` })),
  { id: 'heal', name: '疗伤符', currency: 'spirit_stone', price: 30, limit: 2, limitPeriod: 'day', description: '立即恢复全部生命；满血不扣款，不改变原有自然恢复与休整。' },
  { id: 'materials', name: '基础材料包', currency: 'spirit_stone', price: 25, limit: 3, limitPeriod: 'day', description: '随机获得矿石×3或线索×3；任一可能奖励超上限时不扣款。' },
  ...DEMON_TOWER_ATTRIBUTE_KEYS.map(attribute => ({ id: `permanent_${attribute}` as DemonTowerShopOfferId, name: `${DEMON_TOWER_CATALOG.attributes[attribute]}永久丹`, currency: 'soul' as const, price: 30, limit: 5, limitPeriod: 'lifetime' as const, description: `${DEMON_TOWER_CATALOG.attributes[attribute]}永久+1，每维累计最多+5；独立于自由属性点，洗点不丢失。` })),
  { id: 'fine_weapon_box', name: '精级武器箱', currency: 'soul', price: 8, limit: 1, limitPeriod: 'week', description: '每周折扣补给，Lv.16起随机获得1件达到装备等级的精级武器，同名转品质经验；不累计或消耗旧武器箱保底。' },
  { id: 'rune_box', name: '绑定符文箱', currency: 'soul', price: 40, limit: 1, limitPeriod: 'week', description: '随机获得2枚绑定符文；武器品质+3/+6/+9解锁1/2/3槽，可替换已解锁词条。每种最多99枚，任一可能奖励超限时不扣款。' },
];
function initialEconomy(serviceDate: string): DemonTowerEconomyState {
  return { version: 1, balance: 0, serviceDate, week: expansionWeek(serviceDate), dailyEarned: 0, bossEarned: 0,
    dailyPurchases: {}, weeklyPurchases: {}, permanent: zeroAttributes(), buffs: zeroAttributes(), runes: {}, ledgerSequence: 0, ledger: [] };
}
function advanceEconomy(value: DemonTowerEconomyState, serviceDate: string): void {
  if (value.serviceDate !== serviceDate) { value.serviceDate = serviceDate; value.dailyEarned = 0; value.bossEarned = 0; value.dailyPurchases = {}; value.buffs = zeroAttributes(); }
  if (value.week !== expansionWeek(serviceDate)) { value.week = expansionWeek(serviceDate); value.weeklyPurchases = {}; }
}
function validateEconomyState(value: DemonTowerEconomyState, serviceDate: string): void {
  const invalid = () => fail('INVALID_ECONOMY_STATE');
  // A rollback client preserves unknown JSON but may advance the outer daily
  // date. Accept an older valid economy date and roll it forward once, never
  // reset its persistent assets or block a later re-upgrade.
  if (!value || value.version !== 1 || typeof value.serviceDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.serviceDate) ||
    !Number.isFinite(Date.parse(`${value.serviceDate}T00:00:00Z`)) || new Date(`${value.serviceDate}T00:00:00Z`).toISOString().slice(0, 10) !== value.serviceDate ||
    value.serviceDate > serviceDate || value.week !== expansionWeek(value.serviceDate) ||
    !integer(value.balance, 0, ECONOMY.balanceCap) || !integer(value.dailyEarned, 0, ECONOMY.dailyCap) ||
    !integer(value.bossEarned, 0, Math.min(ECONOMY.bossDailyCap, value.dailyEarned)) || !integer(value.ledgerSequence, 0, Number.MAX_SAFE_INTEGER - 1)) invalid();
  for (const [map, period] of [[value.dailyPurchases, 'day'], [value.weeklyPurchases, 'week']] as const) {
    if (!map || typeof map !== 'object' || Array.isArray(map)) invalid();
    for (const [id, count] of Object.entries(map)) {
      const offer = SHOP_OFFERS.find(item => item.id === id && item.limitPeriod === period);
      if (!offer || !integer(count, 0, offer.limit)) invalid();
    }
  }
  for (const [map, maximum, multiple] of [[value.permanent, 5, 1], [value.buffs, 15, 5]] as const) {
    if (!map || typeof map !== 'object' || Array.isArray(map) || Object.keys(map).length !== 5) invalid();
    for (const key of DEMON_TOWER_ATTRIBUTE_KEYS) if (!integer(map[key], 0, maximum) || map[key] % multiple !== 0) invalid();
  }
  for (const key of DEMON_TOWER_ATTRIBUTE_KEYS) if (value.buffs[key] !== (value.dailyPurchases[`pill_${key}`] ?? 0) * 5) invalid();
  if (!value.runes || typeof value.runes !== 'object' || Array.isArray(value.runes) || Object.keys(value.runes).length > 5) invalid();
  for (const [key, count] of Object.entries(value.runes)) if (!own(DEMON_TOWER_AFFIXES, key) || !integer(count, 0, ECONOMY.runeCap)) invalid();
  if (!Array.isArray(value.ledger) || value.ledger.length > ECONOMY.ledgerLimit || value.ledger.some(entry => !entry || typeof entry !== 'object') || new Set(value.ledger.map(entry => entry.id)).size !== value.ledger.length) invalid();
  for (const entry of value.ledger) if (!entry || !/^\d+$/.test(entry.id) || Number(entry.id) > value.ledgerSequence || !integer(entry.at, 0, 8_640_000_000_000_000) ||
    !['earn', 'purchase', 'rune'].includes(entry.kind) || typeof entry.description !== 'string' || entry.description.length > 300 ||
    !integer(entry.amount, -ECONOMY.balanceCap, ECONOMY.balanceCap) || !integer(entry.balance, 0, ECONOMY.balanceCap) || !['soul', 'spirit_stone'].includes(entry.currency)) invalid();
}
function economyLedger(state: DemonTowerEngineState, now: number, entry: Omit<DemonTowerEconomyLedgerEntry, 'id' | 'at'>): void {
  const economy = state.economy!;
  if (!integer(economy.ledgerSequence, 0, Number.MAX_SAFE_INTEGER - 2)) fail('INVALID_ECONOMY_STATE');
  economy.ledger.push({ ...entry, id: String(++economy.ledgerSequence), at: now });
  economy.ledger = economy.ledger.slice(-ECONOMY.ledgerLimit);
}
/** Separate deterministic stream: earning stones never perturbs old combat or equipment RNG. */
function economyRoll(state: DemonTowerEngineState, source: string, min: number, max: number): number {
  const bytes = createHmac('sha256', state.rngSeed).update(`economy:${state.daily.serviceDate}:${source}:${state.rngCounter}:${state.economy?.ledgerSequence ?? 0}`).digest();
  return min + Math.floor(bytes.readUInt32BE(0) / 0x1_0000_0000 * (max - min + 1));
}
function grantSpirit(state: DemonTowerEngineState, amount: number, now: number, source: string, events: string[], boss = false): number {
  if (!state.economy) return 0;
  const economy = state.economy;
  const actual = Math.min(amount, ECONOMY.dailyCap - economy.dailyEarned, ECONOMY.balanceCap - economy.balance, boss ? ECONOMY.bossDailyCap - economy.bossEarned : ECONOMY.dailyCap);
  if (actual <= 0) { events.push(`${source}：灵石当日额度或库存已满，本次不增加灵石。`); return 0; }
  economy.balance += actual; economy.dailyEarned += actual; if (boss) economy.bossEarned += actual;
  economyLedger(state, now, { kind: 'earn', description: source, amount: actual, balance: economy.balance, currency: 'spirit_stone' });
  events.push(`${source}：灵石+${actual}（今日${economy.dailyEarned}/${ECONOMY.dailyCap}）。`);
  return actual;
}
/** Call only inside the command transaction AFTER the locked world has capped effective damage. No predicted payouts. */
export function grantDemonTowerBossSpirit(state: DemonTowerEngineState, effectiveDamage: number, now: number, serviceDate: string, events: string[]): number {
  clock(now, serviceDate);
  if (!integer(effectiveDamage, 0, 1_000_000_000) || serviceDate !== state.daily.serviceDate) fail('INVALID_ECONOMY_REWARD');
  if (!state.economy) return 0;
  validateEconomyState(state.economy, serviceDate);
  return grantSpirit(state, Math.floor(effectiveDamage * ECONOMY.bossStonePerDamage), now, '世界首领有效贡献', events, true);
}
function shopPurchased(economy: DemonTowerEconomyState, offer: ShopDefinition): number {
  return offer.limitPeriod === 'lifetime' ? economy.permanent[offer.id.slice('permanent_'.length) as DemonTowerAttribute]
    : (offer.limitPeriod === 'day' ? economy.dailyPurchases : economy.weeklyPurchases)[offer.id] ?? 0;
}
function shopReason(state: DemonTowerEngineState, offer: ShopDefinition, quantity: number): string | null {
  const economy = state.economy!;
  if (state.battle) return 'BATTLE_IN_PROGRESS';
  if (shopPurchased(economy, offer) + quantity > offer.limit) return 'SHOP_LIMIT_REACHED';
  if (offer.id === 'stamina_small' || offer.id === 'stamina_large') {
    if (state.stamina + quantity * (offer.id === 'stamina_small' ? 3 : 8) > RULES.staminaCap) return 'STAMINA_SPACE_REQUIRED';
  }
  if (offer.id === 'heal' && (quantity !== 1 || state.hp >= demonTowerMaxHp(state))) return quantity !== 1 ? 'SHOP_QUANTITY_INVALID' : 'HEALTH_FULL';
  if (offer.id === 'materials' && (state.materials.ore + quantity * 3 > MAX_RESOURCE || state.materials.clue + quantity * 3 > MAX_RESOURCE)) return 'RESOURCE_FULL';
  if (offer.id === 'fine_weapon_box') {
    const pool = DEMON_TOWER_WEAPONS.filter(item => item.rarity === '精' && item.requiredLevel <= state.level);
    if (!pool.length) return 'LOOT_LEVEL_REQUIRED';
    if (pool.some(item => (state.weapons.find(owned => owned.id === item.id)?.qualityExperience ?? 0) >= MAX_RESOURCE)) return 'RESOURCE_FULL';
  }
  if (offer.id === 'rune_box' && Object.keys(DEMON_TOWER_AFFIXES).some(key => (economy.runes[key as DemonTowerAffix] ?? 0) + quantity * 2 > ECONOMY.runeCap)) return 'RUNE_STORAGE_FULL';
  if ((offer.currency === 'soul' ? state.materials.soul : economy.balance) < offer.price * quantity) return offer.currency === 'soul' ? 'NOT_ENOUGH_SOUL' : 'NOT_ENOUGH_SPIRIT_STONES';
  return null;
}
function economyAction(state: DemonTowerEngineState, kind: 'shop_purchase' | 'use_rune', raw: unknown, context: DemonTowerEngineContext, events: string[]): void {
  if (!context.expansionEnabled || !state.expansion || !state.economy) fail('EXPANSION_DISABLED');
  const economy = state.economy;
  if (kind === 'use_rune') {
    const value = record(raw, ['rune', 'itemId', 'replace']);
    if (typeof value.rune !== 'string' || !own(DEMON_TOWER_AFFIXES, value.rune) || typeof value.itemId !== 'string' ||
      (own(value, 'replace') && (typeof value.replace !== 'string' || !own(DEMON_TOWER_AFFIXES, value.replace)))) fail('INVALID_RUNE');
    const rune = value.rune as DemonTowerAffix, weapon = weaponOwned(state, weaponDefinition(value.itemId).id);
    if ((economy.runes[rune] ?? 0) < 1) fail('RUNE_NOT_OWNED');
    if (weapon.affixes?.includes(rune)) fail('RUNE_ALREADY_APPLIED');
    const affixes = [...(weapon.affixes ?? [])], slots = Math.min(ECONOMY.runeSlots, Math.floor(weapon.quality / 3));
    if (slots < 1) fail('RUNE_QUALITY_REQUIRED');
    if (value.replace !== undefined) {
      const index = affixes.indexOf(value.replace as DemonTowerAffix);
      if (index < 0 || index >= slots) fail('RUNE_REPLACEMENT_INVALID');
      affixes[index] = rune;
    } else { if (affixes.length >= slots) fail('RUNE_REPLACEMENT_REQUIRED'); affixes.push(rune); }
    weapon.affixes = affixes; economy.runes[rune] = (economy.runes[rune] ?? 0) - 1;
    const description = `${weaponDefinition(weapon.id).name}：${value.replace ? `替换${DEMON_TOWER_AFFIXES[value.replace as DemonTowerAffix].name}为` : '附加'}${DEMON_TOWER_AFFIXES[rune].name}，消耗绑定符文×1。`;
    economyLedger(state, context.now, { kind: 'rune', description, amount: 0, balance: economy.balance, currency: 'spirit_stone' }); events.push(description); return;
  }
  const value = exact(raw, ['offerId', 'quantity']);
  if (typeof value.offerId !== 'string') fail('INVALID_SHOP_OFFER');
  const offer = SHOP_OFFERS.find(item => item.id === value.offerId) ?? fail('INVALID_SHOP_OFFER');
  if (!integer(value.quantity, 1, 5)) fail('SHOP_QUANTITY_INVALID');
  const quantity = value.quantity, reason = shopReason(state, offer, quantity);
  if (reason) fail(reason);
  const cost = offer.price * quantity;
  if (offer.currency === 'soul') state.materials.soul -= cost; else economy.balance -= cost;
  if (offer.limitPeriod !== 'lifetime') { const purchases = offer.limitPeriod === 'day' ? economy.dailyPurchases : economy.weeklyPurchases; purchases[offer.id] = (purchases[offer.id] ?? 0) + quantity; }
  if (offer.id.startsWith('pill_')) economy.buffs[offer.id.slice(5) as DemonTowerAttribute] += quantity * ECONOMY.pillAttributeBonus;
  else if (offer.id.startsWith('permanent_')) economy.permanent[offer.id.slice(10) as DemonTowerAttribute] += quantity;
  else if (offer.id === 'stamina_small' || offer.id === 'stamina_large') { state.stamina += quantity * (offer.id === 'stamina_small' ? 3 : 8); if (state.stamina === RULES.staminaCap) state.staminaAt = context.now; }
  else if (offer.id === 'heal') { state.hp = demonTowerMaxHp(state); state.healingAt = context.now; }
  else if (offer.id === 'materials') {
    const material = economyRoll(state, 'material-pack', 0, 1) === 0 ? 'ore' : 'clue';
    gainMaterials(state, { [material]: quantity * 3 }); events.push(`材料包获得${DEMON_TOWER_CATALOG.materials[material]}×${quantity * 3}。`);
  } else if (offer.id === 'fine_weapon_box') {
    const pool = DEMON_TOWER_WEAPONS.filter(item => item.rarity === '精' && item.requiredLevel <= state.level);
    grantLootItem(state, 'weapon', pool[economyRoll(state, 'fine-weapon-box', 0, pool.length - 1)].id, events);
  } else if (offer.id === 'rune_box') {
    const runes = Object.keys(DEMON_TOWER_AFFIXES) as DemonTowerAffix[];
    for (let index = 0; index < 2; index++) { const rune = runes[economyRoll(state, `rune-box-${index}`, 0, runes.length - 1)]; economy.runes[rune] = (economy.runes[rune] ?? 0) + 1; events.push(`获得绑定${DEMON_TOWER_AFFIXES[rune].name}符文×1。`); }
  }
  economyLedger(state, context.now, { kind: 'purchase', description: `${offer.name}×${quantity}`, amount: -cost, balance: offer.currency === 'soul' ? state.materials.soul : economy.balance, currency: offer.currency });
  events.push(`已申领${offer.name}×${quantity}，消耗${cost}${offer.currency === 'soul' ? '残魂' : '灵石'}；物品及收益绑定当前账号。`);
}
function economyView(state: DemonTowerEngineState, now: number): DemonTowerEconomyView {
  const serviceDate = new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);
  const value = state.economy ? clone(state.economy) : initialEconomy(serviceDate);
  if (state.economy) validateEconomyState(state.economy, state.daily.serviceDate);
  advanceEconomy(value, serviceDate);
  const projected = { ...state, economy: value };
  return { version: 1, balance: value.balance, dailyEarned: value.dailyEarned, dailyCap: ECONOMY.dailyCap, bossEarned: value.bossEarned, bossCap: ECONOMY.bossDailyCap,
    serviceDate, week: value.week, buffsExpiresAt: Date.parse(`${serviceDate}T00:00:00+08:00`) + 86_400_000,
    buffs: copyAttributes(value.buffs), permanent: copyAttributes(value.permanent), runes: { ...value.runes },
    offers: SHOP_OFFERS.map(offer => { const purchased = shopPurchased(value, offer), reason = shopReason(projected, offer, 1); return { ...offer, purchased, remaining: offer.limit - purchased, available: reason === null, reason }; }),
    ledger: value.ledger.map(entry => ({ id: entry.id, at: entry.at, kind: entry.kind, description: entry.description, amount: entry.amount, balance: entry.balance, currency: entry.currency })).reverse() };
}
function validateExpansionState(state: DemonTowerEngineState): void {
  const value = state.expansion!;
  if (value.version !== 1 || !integer(value.skillPages, 0, MAX_RESOURCE) || !integer(value.essences, 0, MAX_RESOURCE) || !integer(value.weaponBoxes, 0, MAX_RESOURCE) ||
    !integer(value.weaponBoxPity, 0, 9) || !integer(value.riftsToday, 0, 5) || !integer(value.meditationsToday, 0, 10) || !integer(value.weeklyBossAttempts, 0, 3) ||
    !integer(value.passageTokens, 0, MAX_RESOURCE) || !/^\d{4}-\d{2}-\d{2}$/.test(value.week) || !['field', 'ledger', 'memo'].includes(value.skin) ||
    !Array.isArray(value.unlockedSkins) || value.unlockedSkins.length > 3 || !value.unlockedSkins.includes(value.skin) || value.unlockedSkins.some(skin => !['field', 'ledger', 'memo'].includes(skin)) ||
    !Array.isArray(value.claimedBossFloors) || value.claimedBossFloors.length > 9 || new Set(value.claimedBossFloors).size !== value.claimedBossFloors.length || value.claimedBossFloors.some(floor => !integer(floor, 1, 9)) ||
    !Array.isArray(value.titles) || value.titles.length > 16 || value.titles.some(title => typeof title !== 'string' || title.length > 80) || !integer(value.squadReadyToday ?? 0, 0, 3) ||
    value.squadId != null && (typeof value.squadId !== 'string' || !/^[0-9a-f-]{36}$/i.test(value.squadId))) fail('INVALID_EXPANSION_STATE');
  for (const owned of [...state.weapons, ...state.skills]) if (!integer(owned.qualityExperience ?? 0, 0, MAX_RESOURCE) || !integer(owned.star ?? 1, 1, 5) || !integer(owned.favor ?? 0, 0, 60)) fail('INVALID_EXPANSION_STATE');
  for (const owned of state.weapons) if (!integer(owned.breakthrough ?? 0, 0, 3) || !Array.isArray(owned.affixes ?? []) || (owned.affixes?.length ?? 0) > 3 || new Set(owned.affixes ?? []).size !== (owned.affixes?.length ?? 0) || owned.affixes?.some(key => !Object.prototype.hasOwnProperty.call(DEMON_TOWER_AFFIXES, key))) fail('INVALID_EXPANSION_STATE');
  if (value.arena) {
    const arena = value.arena;
    if (typeof arena.enabled !== 'boolean' || !integer(arena.rating, 0, 100_000) || !integer(arena.honor, 0, MAX_RESOURCE) || !integer(arena.skillPoints, 0, 1000) ||
      !integer(arena.attemptsToday, 0, 5) || !integer(arena.winsToday, 0, 5) || !Array.isArray(arena.learned) || arena.learned.length > 15 || new Set(arena.learned).size !== arena.learned.length ||
      arena.learned.some(id => !DEMON_TOWER_ARENA_SKILLS.some(skill => skill.id === id)) || !Array.isArray(arena.loadout) || arena.loadout.length > 4 || arena.loadout.some(id => !arena.learned.includes(id)) ||
      !Array.isArray(state.arenaOpponentsToday ?? []) || (state.arenaOpponentsToday?.length ?? 0) > 5) fail('INVALID_EXPANSION_STATE');
  }
}
function spendStamina(state: DemonTowerEngineState, cost: number, now: number): void {
  if (state.stamina < cost) fail('NOT_ENOUGH_STAMINA');
  if (state.stamina === RULES.staminaCap) state.staminaAt = now;
  state.stamina -= cost;
}
function log(battle: Battle, actor: DemonTowerCombatLog['actor'], kind: DemonTowerCombatLog['kind'], text: string, amount?: number, targetId?: string): void {
  battle.log.push({ turn: battle.turn, actor, kind, text, ...(amount !== undefined ? { amount } : {}), ...(targetId ? { targetId } : {}) });
  if (battle.log.length > MAX_LOG) battle.log.splice(0, battle.log.length - MAX_LOG);
}
function heal(battle: Battle, fighter: Fighter, amount: number, label: string): void {
  const actual = Math.min(fighter.maxHp - fighter.hp, Math.max(0, Math.round(amount)));
  fighter.hp += actual;
  if (actual > 0) log(battle, fighter.id === 'player' ? 'player' : 'enemy', 'heal', `${label}恢复${actual}生命。`, actual, fighter.id);
}
/** Damage primitive always clamps shielding before HP. Reflected/poison damage cannot grow HP. */
function damage(battle: Battle, target: Fighter, amount: number, actor: 'player' | 'enemy', label: string): number {
  const safe = Math.max(0, Math.round(amount));
  const absorbed = Math.min(Math.max(0, target.shield), safe);
  target.shield -= absorbed;
  const temporaryShield = effect(target, 'shield');
  if (temporaryShield) temporaryShield.magnitude = Math.max(0, temporaryShield.magnitude - absorbed);
  const actual = Math.min(target.hp, Math.max(0, safe - absorbed));
  target.hp -= actual;
  if (actor === 'player') {
    battle.totalDamage += actual;
    if (target.boss) battle.bossDamage += actual;
  }
  if (target.id === 'player') battle.playerDamageTaken += actual;
  log(battle, actor, 'damage', `${label}：${target.name}损失${actual}生命${absorbed ? `，护盾吸收${absorbed}` : ''}。`, actual, target.id);
  if (target.hp <= 0) log(battle, actor, 'defeat', `${target.name}暂时退场。`, 0, target.id);
  return actual;
}
function revive(battle: Battle): void {
  if (battle.player.hp <= 0 && battleInnate(battle, 'feign') && !battle.feignUsed) {
    battle.feignUsed = true; battle.player.hp = 1;
    log(battle, 'player', 'heal', '装死触发：本场第一次致命伤保留1生命；后续攻击仍会结算。', 1, 'player');
    return;
  }
  if (battle.player.hp <= 0 && battle.reviveArmed) {
    battle.reviveArmed = false;
    battle.player.hp = Math.ceil(battle.player.maxHp / 2);
    log(battle, 'player', 'heal', '续命丹心触发，恢复至50%生命。', battle.player.hp, 'player');
  }
}
function affixBonus(state: DemonTowerEngineState, battle: Battle, key: DemonTowerAffix): number {
  if (!battle.expansionVersion) return 0;
  return [state.loadout.mainHand, state.loadout.artifact].reduce((sum, id) => sum + (id ? (weaponOwned(state, id).affixes ?? []).slice(0, Math.floor(weaponOwned(state, id).quality / 3)).filter(value => value === key).length * DEMON_TOWER_AFFIXES[key].value : 0), 0);
}
function divineWeapon(state: DemonTowerEngineState, battle: Battle, id: DemonTowerWeaponId): boolean {
  return Boolean(battle.expansionVersion && hasWeapon(state, id) && (weaponOwned(state, id).star ?? 1) >= 5);
}
function directHit(state: DemonTowerEngineState, battle: Battle, source: Fighter, target: Fighter, base: number, label: string, forcedCritical = false): number {
  if (source.hp <= 0 || target.hp <= 0) return 0;
  const playerSource = source.id === 'player', attributes = dimensions(source), defensive = dimensions(target);
  const illusion = effect(target, 'illusion')?.magnitude ?? 0;
  const confuse = hasWeapon(state, 'w17') ? 0.15 * weaponScale(state, 'w17') : 0;
  const evade = bound(defensive.AGI * 0.0015 + illusion * 0.8 - (playerSource ? confuse : 0) + (!playerSource ? affixBonus(state, battle, 'dodge') : 0), 0, 0.6);
  const accuracy = bound(0.96 + attributes.SPD * 0.0005 - (playerSource ? 0 : confuse), 0.55, 0.99);
  const guaranteed = playerSource && label === '镇魂钺' && divineWeapon(state, battle, 'w4') && !battle.ultimateUsed;
  if (!guaranteed && (!chance(state, accuracy) || chance(state, evade))) {
    log(battle, playerSource ? 'player' : 'enemy', 'dodge', `${target.name}避开了${label}。`, 0, target.id);
    if (!playerSource && hasWeapon(state, 'w7') && target.hp > 0) damage(battle, source, defensive.AGI * weaponScale(state, 'w7'), 'player', '残影反击');
    return 0;
  }
  if (!playerSource && divineWeapon(state, battle, 'w16') && !battle.divineGuardUsed) {
    battle.divineGuardUsed = true; log(battle, 'player', 'shield', '真·不动金身完全抵消首次直接攻击。', 0, 'player'); return 0;
  }
  if (!playerSource && hasWeapon(state, 'w16') && chance(state, 0.1 * weaponScale(state, 'w16'))) {
    log(battle, 'player', 'shield', '绝对防御完全抵消此次攻击。', 0, 'player');
    return 0;
  }
  const penetration = playerSource ? Math.min(0.75, (hasWeapon(state, 'w11') ? 0.25 * weaponScale(state, 'w11') : 0) + affixBonus(state, battle, 'penetration')) : 0;
  let value = Math.max(1, base - defensive.DEF * 0.45 * (1 - penetration));
  if (playerSource && hasWeapon(state, 'w1') && defensive.DEF >= attributes.STR) value *= 1 + 0.15 * weaponScale(state, 'w1');
  const critical = forcedCritical || chance(state, Math.min(0.75, 0.05 + attributes.LUCK * 0.001 + (effect(source, 'illusion')?.magnitude ?? 0) + (playerSource && battleInnate(battle, 'agility') ? 0.05 : 0) + (playerSource ? affixBonus(state, battle, 'critical') : 0)));
  value *= (0.95 + random(state) * 0.1) * (critical ? 1.6 : 1);
  if (!playerSource && hasWeapon(state, 'w13')) value *= 1 - Math.min(0.6, 0.2 * weaponScale(state, 'w13'));
  if (!playerSource && battleInnate(battle, 'defense')) value *= 0.9;
  if (playerSource && target.boss) value *= 1 + affixBonus(state, battle, 'boss_damage');
  const actual = damage(battle, target, value, playerSource ? 'player' : 'enemy', `${label}${critical ? '·暴击' : ''}`);
  if (playerSource) battle.landedPlayerHits += 1;
  if (playerSource && actual > 0) {
    if (affixBonus(state, battle, 'leech')) heal(battle, source, actual * affixBonus(state, battle, 'leech'), '汲取词条');
    if (hasWeapon(state, 'w4')) heal(battle, source, actual * Math.min(0.6, 0.2 * weaponScale(state, 'w4')), '镇魂钺');
    if (hasWeapon(state, 'w2') && target.hp > 0 && chance(state, 0.2 * weaponScale(state, 'w2'))) {
      putEffect(target, 'stun', 1, 2);
      log(battle, 'player', 'effect', `${target.name}受到震慑。`, undefined, target.id);
    }
  }
  if (!playerSource && actual > 0 && hasWeapon(state, 'w14')) damage(battle, source, actual * Math.min(0.75, 0.25 * weaponScale(state, 'w14')), 'player', '反震');
  revive(battle);
  return actual;
}
function mainAttack(state: DemonTowerEngineState, battle: Battle, target: Fighter, playerFirst: boolean): void {
  const player = battle.player, attributes = dimensions(player), main = weaponDefinition(state.loadout.mainHand);
  let base = attributes[main.attribute] * 0.85 + attributes.STR * 0.3 + state.level * 0.3;
  const mastery = battle.rulesVersion === 2 ? (1 + ((weaponOwned(state, main.id).star ?? 1) - 1) * 0.1) * (battleInnate(battle, 'master') ? 1.2 : 1) : 1;
  base *= mastery;
  if (hasWeapon(state, 'w3') && battle.untouchedTurns >= 3) {
    base *= 1 + 0.4 * weaponScale(state, 'w3'); battle.untouchedTurns = 0;
    log(battle, 'player', 'effect', '裂岳斧蓄力完成。');
  }
  const forced = hasWeapon(state, 'w5') && battle.firstAttack && playerFirst;
  const priorHits = battle.landedPlayerHits;
  battle.firstAttack = false;
  const targets = hasWeapon(state, 'w10') ? battle.enemies.filter((enemy) => enemy.hp > 0) : [target];
  for (const enemy of targets) {
    if (hasWeapon(state, 'w8')) {
      directHit(state, battle, player, enemy, base * 0.65, '双匕一式', forced);
      directHit(state, battle, player, enemy, base * 0.65, '双匕二式');
    } else directHit(state, battle, player, enemy, base, main.name, forced);
  }
  if (hasWeapon(state, 'w6') && battle.landedPlayerHits > priorHits && target.hp > 0 && chance(state, 0.3 * weaponScale(state, 'w6'))) directHit(state, battle, player, target, attributes.AGI * 0.5 * weaponScale(state, 'w6') * mastery, '秋水连击');
  if (hasWeapon(state, 'w12')) {
    directHit(state, battle, player, target, base * 0.5, '龙吟追击');
    for (const enemy of battle.enemies.filter((candidate) => candidate.id !== target.id && candidate.hp > 0)) directHit(state, battle, player, enemy, base * 0.4 * weaponScale(state, 'w12'), '龙吟溅射');
  }
  if (target.hp > 0 && battleInnate(battle, 'speed') && chance(state, 0.3)) directHit(state, battle, player, target, attributes.SPD * mastery, '疾如雷电·追击');
  if (battle.expansionVersion && !battle.ultimateUsed) {
    battle.ultimateUsed = true;
    for (const id of [state.loadout.mainHand, state.loadout.artifact]) {
      if (!id || (weaponOwned(state, id).star ?? 1) < 5 || !DEMON_TOWER_ULTIMATES[id]) continue;
      const alive = () => battle.enemies.find(enemy => enemy.hp > 0);
      const current = target.hp > 0 ? target : alive();
      log(battle, 'player', 'effect', `${DEMON_TOWER_ULTIMATES[id]!.name}已觉醒，本场仅触发一次。`);
      if (id === 'w4' && current) { const actual = damage(battle, current, attributes.STR, 'player', '真·镇魂归元'); heal(battle, player, actual * 0.3, '真·镇魂归元'); }
      if (id === 'w8') for (let index = 0; index < 3; index += 1) { const foe = alive(); if (foe) damage(battle, foe, attributes.AGI * 0.6, 'player', `真·无影绝式·${index + 1}`); }
      if (id === 'w12') for (const foe of battle.enemies.filter(enemy => enemy.hp > 0)) { damage(battle, foe, attributes.SPD * 1.2, 'player', '真·龙吟万象'); if (foe.hp > 0 && !foe.boss) putEffect(foe, 'stun', 1, 2); }
      if (id === 'w20' && current) { damage(battle, current, attributes.LUCK * 1.5, 'player', '真·混元改命'); if (current.hp > 0) putEffect(current, 'shred', 0.2, 2); }
    }
  }
  if (battle.rulesVersion === 2) {
    // Count normal-attack actions, never individual hits or targets. Attached healing attack counts once.
    for (const id of [state.loadout.mainHand, state.loadout.artifact]) {
      if (!id) continue;
      const owned = weaponOwned(state, id), star = owned.star ?? 1;
      if (star >= 5) continue;
      owned.star = star; owned.favor = (owned.favor ?? 0) + 1;
      if (owned.favor >= star * 15) {
        owned.star += 1; owned.favor = 0;
        log(battle, 'player', 'reward', `${weaponDefinition(id).name}熟练度达标，免费升至${owned.star}星；品质+${owned.quality}保留。`);
      }
    }
  }
}
function cooldown(state: DemonTowerEngineState, id: DemonTowerSkillId): number {
  const definition = skillDefinition(id);
  return definition.cooldown === 0 ? 0 : Math.max(1, definition.cooldown - Math.floor(combatSkillOwned(state, id).quality / 3));
}
function usableSkill(state: DemonTowerEngineState, battle: Battle, id: DemonTowerSkillId): boolean {
  return (state.loadout.activeSkills.includes(id) || Boolean(battle.expansionVersion && boundSkills(state).includes(id))) && (battle.cooldowns[id] ?? 0) === 0 && !(id === 's13' && battle.usedRevive);
}
function boundSkills(state: DemonTowerEngineState): DemonTowerSkillId[] {
  const bindings: Partial<Record<DemonTowerWeaponId, DemonTowerSkillId>> = { w3: 's16', w4: 's10', w7: 's7', w8: 's5', w11: 's2', w12: 's5', w15: 's3', w16: 's3', w19: 's4', w20: 's15' };
  return [...new Set([state.loadout.mainHand, state.loadout.artifact].flatMap(id => {
    if (!id) return [];
    const definition = weaponDefinition(id), rarity = demonTowerItemRarity(definition.rarity, weaponOwned(state, id).breakthrough);
    if (DEMON_TOWER_RARITY_ORDER.indexOf(rarity) < 3) return [];
    return [bindings[id] ?? ({ STR: 's16', SPD: 's5', AGI: 's7', DEF: 's3', LUCK: 's15' } as const)[definition.attribute]];
  }))];
}
function combatActiveSkills(state: DemonTowerEngineState, battle: Battle): DemonTowerSkillId[] {
  return [...new Set([...state.loadout.activeSkills, ...(battle.expansionVersion ? boundSkills(state) : [])])];
}
function castSkill(state: DemonTowerEngineState, battle: Battle, id: DemonTowerSkillId, target: Fighter): void {
  if (!usableSkill(state, battle, id)) fail('SKILL_NOT_READY');
  const attributes = dimensions(battle.player), scale = skillScale(state, id), player = battle.player;
  battle.cooldowns[id] = cooldown(state, id) + 1;
  log(battle, 'player', 'info', `施展${skillDefinition(id).name}。`);
  if (battle.expansionVersion) {
    const owned = combatSkillOwned(state, id);
    if ((owned.star ?? 1) < 5) {
      owned.favor = (owned.favor ?? 0) + 1;
      if (owned.favor >= (owned.star ?? 1) * 15) { owned.star = (owned.star ?? 1) + 1; owned.favor = 0; log(battle, 'player', 'reward', `${skillDefinition(id).name}免费熟练度升至${owned.star}星。`); }
    }
  }
  switch (id) {
    case 's1': heal(battle, player, (20 + 2 * attributes.LUCK) * scale, '回春术'); break;
    case 's2': {
      const actual = directHit(state, battle, player, target, 2 * attributes.STR * scale, '裂地斩');
      if (battle.rulesVersion === 2 && actual > 0 && target.hp > 0 && !target.boss && chance(state, 0.2)) {
        putEffect(target, 'stun', 1, 2); log(battle, 'player', 'effect', '裂地斩震慑目标一次。', undefined, target.id);
      }
      putEffect(player, 'slow', 0.25, 2); break;
    }
    case 's3': {
      const shield = Math.round((1.5 + (battle.expansionVersion && combatSkillOwned(state, id).quality >= 6 ? 0.5 : 0)) * attributes.DEF * scale);
      player.shield += shield; putEffect(player, 'shield', shield, 2);
      log(battle, 'player', 'shield', `铁壁获得${shield}护盾，持续2回合。`, shield, 'player'); break;
    }
    case 's4': putEffect(player, 'strength', Math.round(10 * scale), 3); break;
    case 's5': for (let i = 0; i < 3; i += 1) directHit(state, battle, player, target, 0.6 * attributes.SPD * scale, `疾影连刺·${i + 1}`); break;
    case 's6': directHit(state, battle, player, target, 0.5 * attributes.AGI * scale, '毒刃'); if (target.hp > 0) putEffect(target, 'poison', Math.round(0.3 * attributes.AGI * scale), 2); break;
    case 's7': putEffect(player, 'illusion', Math.min(0.5, 0.25 * scale), 2); break;
    case 's10': directHit(state, battle, player, target, 1.5 * attributes.STR * scale * (target.elite || target.boss ? 1.5 : 1), '灭却斩'); break;
    case 's13': {
      battle.usedRevive = true; battle.reviveArmed = true;
      heal(battle, player, Math.max(0, Math.round(player.maxHp * Math.min(0.9, 0.5 * scale)) - player.hp), '续命丹心'); break;
    }
    case 's14': putEffect(player, 'all', Math.round(5 * scale), 2); break;
    case 's15': {
      if (battle.rulesVersion === 2 && !target.boss && target.hp > 1 && chance(state, 0.08)) {
        const actual = target.hp - 1; target.hp = 1; battle.totalDamage += actual;
        log(battle, 'player', 'damage', '气运一击逆转：非首领目标生命降至1，护盾保留。', actual, target.id);
      } else {
        if (battle.rulesVersion === 2 && target.boss) log(battle, 'system', 'info', '共享首领免疫压血，气运一击按正常幸运伤害结算。');
        directHit(state, battle, player, target, (1 + random(state) * 3) * attributes.LUCK * scale, '气运一击');
      }
      break;
    }
    case 's16': directHit(state, battle, player, target, 3 * attributes.STR * scale, '崩山击'); if (target.hp > 0) putEffect(target, 'shred', Math.min(0.6, 0.3 * scale), 2); break;
    default: fail('PASSIVE_SKILL');
  }
}
function guardAmount(fighter: Fighter, floor: number): number {
  // A shared boss can have hundreds of thousands of HP: never scale its personal-run shield from that pool.
  return fighter.boss ? Math.max(6, Math.round((8 + floorDefinition(floor).requiredLevel * 0.65) * 0.6)) : Math.max(1, Math.round(fighter.maxHp * 0.18));
}
function enemyTurn(state: DemonTowerEngineState, battle: Battle, actor: Fighter): void {
  const enraged = actor.boss && actor.hp <= actor.maxHp / 2;
  const attributes = dimensions(actor);
  const base = (attributes.STR * 0.95 + battle.floor * 2) * (enraged ? 1.3 : 1);
  if (actor.mechanic === 'guard' && battle.turn === 4) {
    const amount = guardAmount(actor, battle.floor);
    const granted = Math.max(0, Math.min(amount, amount * 2 - actor.shield));
    actor.shield += granted;
    log(battle, 'enemy', 'shield', `${actor.name}举起护势，增加${granted}护盾，本次不攻击。`, granted, actor.id);
    return;
  }
  if (actor.mechanic === 'charge') {
    const charged = effect(actor, 'charge_ready');
    if (charged) {
      actor.effects = actor.effects.filter((item) => item.id !== 'charge_ready');
      directHit(state, battle, actor, battle.player, base * charged.magnitude, '蓄力重击');
      return;
    }
    if (battle.turn % 3 === 1) {
      const multiplier = battle.floor === 1 ? 1.35 : 1.8;
      putEffect(actor, 'charge_ready', multiplier, 2);
      log(battle, 'enemy', 'effect', `${actor.name}正在蓄力，本次不攻击；下次行动重击，可提前防护或以震慑打断。`, undefined, actor.id);
      return;
    }
  }
  if (actor.mechanic === 'venom') {
    const ready = effect(actor, 'venom_ready');
    if (ready) {
      actor.effects = actor.effects.filter((item) => item.id !== 'venom_ready');
      const actual = directHit(state, battle, actor, battle.player, base * 0.75, '毒雾侵袭');
      if (actual > 0 && battle.player.hp > 0) {
        putEffect(battle.player, 'poison', ready.magnitude, 2);
        log(battle, 'enemy', 'effect', `毒雾穿透防护，每回合末${ready.magnitude}毒伤，持续2回合；不叠层，可由护盾吸收。`, ready.magnitude, 'player');
      }
      return;
    }
    if (battle.turn % 3 === 1) {
      const dose = Math.min(45, Math.max(2, Math.round((4 + floorDefinition(battle.floor).requiredLevel * 0.3) * (actor.boss ? 1.1 : 1))));
      putEffect(actor, 'venom_ready', dose, 2);
      log(battle, 'enemy', 'effect', `${actor.name}散出毒雾预兆，下次弱攻击若穿透护盾将附带短时毒伤。`, undefined, actor.id);
    }
  }
  directHit(state, battle, actor, battle.player, base, actor.name);
}
function resolveTurn(state: DemonTowerEngineState, battle: Battle, selected: { skillId?: DemonTowerSkillId; targetId: string }): void {
  const target = battle.enemies.find((enemy) => enemy.id === selected.targetId && enemy.hp > 0) ?? fail('INVALID_TARGET');
  if (selected.skillId && !usableSkill(state, battle, selected.skillId)) fail('SKILL_NOT_READY');
  const playerDamageTaken = battle.playerDamageTaken;
  battle.turn += 1;
  const actors = [battle.player, ...battle.enemies.filter((enemy) => enemy.hp > 0)].sort((a, b) => {
    const initiative = (fighter: Fighter) => dimensions(fighter).SPD + (fighter.id === 'player' && hasWeapon(state, 'w9') ? 15 * weaponScale(state, 'w9') : 0);
    return initiative(b) - initiative(a) || (a.id === 'player' ? -1 : b.id === 'player' ? 1 : a.id.localeCompare(b.id));
  });
  const playerFirst = actors[0].id === 'player';
  for (const actor of actors) {
    if (actor.hp <= 0 || battle.player.hp <= 0 || battle.enemies.every((enemy) => enemy.hp <= 0)) continue;
    if (effect(actor, 'stun')) {
      const interrupted = effect(actor, 'charge_ready') || effect(actor, 'venom_ready');
      actor.effects = actor.effects.filter((item) => !['stun', 'charge_ready', 'venom_ready'].includes(item.id));
      log(battle, actor.id === 'player' ? 'player' : 'enemy', 'effect', `${actor.name}受到震慑，本次无法行动${interrupted ? '，预备招式已被打断' : ''}。`); continue;
    }
    if (actor.id === 'player') {
      const liveTarget = target.hp > 0 ? target : battle.enemies.find((enemy) => enemy.hp > 0)!;
      if (selected.skillId) {
        castSkill(state, battle, selected.skillId, liveTarget);
        if (selected.skillId === 's1' && battle.rulesVersion === 2 && liveTarget.hp > 0) mainAttack(state, battle, liveTarget, playerFirst);
      }
      else mainAttack(state, battle, liveTarget, playerFirst);
    } else enemyTurn(state, battle, actor);
  }
  for (const enemy of battle.enemies) {
    const poison = effect(enemy, 'poison');
    if (poison && enemy.hp > 0) damage(battle, enemy, poison.magnitude, 'player', '毒伤');
  }
  const playerPoison = effect(battle.player, 'poison');
  if (playerPoison && battle.player.hp > 0) {
    damage(battle, battle.player, playerPoison.magnitude, 'enemy', '毒雾余毒');
    revive(battle);
  }
  if (battle.player.hp > 0 && hasWeapon(state, 'w18') && battle.turn % 2 === 0) {
    const enemy = battle.enemies.find((item) => item.hp > 0);
    if (enemy) damage(battle, enemy, dimensions(battle.player).LUCK * 0.5 * weaponScale(state, 'w18'), 'player', '召灵');
  }
  if (battle.player.hp > 0 && hasPassive(state, 's9')) heal(battle, battle.player, dimensions(battle.player).LUCK * 0.5 * skillScale(state, 's9'), '疗伤真气');
  if (battle.expansionVersion && battle.player.hp > 0) for (const id of state.loadout.passiveSkills) {
    const owned = skillOwned(state, id), star = owned.star ?? 1;
    if (star >= 5) continue;
    owned.favor = (owned.favor ?? 0) + 1;
    if (owned.favor >= star * 15) { owned.star = star + 1; owned.favor = 0; log(battle, 'player', 'reward', `${skillDefinition(id).name}被动熟练度升至${owned.star}星。`); }
  }
  battle.untouchedTurns = battle.playerDamageTaken === playerDamageTaken ? battle.untouchedTurns + 1 : 0;
  for (const fighter of [battle.player, ...battle.enemies]) {
    for (const item of fighter.effects) {
      item.turns -= 1;
      if (item.turns <= 0 && item.id === 'shield') fighter.shield = Math.max(0, fighter.shield - item.magnitude);
    }
    fighter.effects = fighter.effects.filter((item) => item.turns > 0);
  }
  for (const id of Object.keys(battle.cooldowns) as DemonTowerSkillId[]) battle.cooldowns[id] = Math.max(0, (battle.cooldowns[id] ?? 0) - 1);
}
function newBattle(state: DemonTowerEngineState, kind: Battle['kind'], floor: number, world: DemonTowerWorldView, economyEnabled: boolean): Battle {
  const definition = floorDefinition(floor), lv = definition.requiredLevel;
  const hp = demonTowerMaxHp(state, economyEnabled), attributes = demonTowerEffectiveAttributes(state, economyEnabled);
  const player: Fighter = { id: 'player', name: '我', hp: Math.min(state.hp, hp), maxHp: hp, shield: 0, attributes, effects: [], elite: false, boss: false };
  if (hasWeapon(state, 'w15')) player.shield = Math.round(1.5 * attributes.DEF * weaponScale(state, 'w15'));
  if (state.growth?.innates.includes('shield')) player.shield += attributes.DEF;
  if (state.expansion && hasWeapon(state, 'w16') && (weaponOwned(state, 'w16').star ?? 1) >= 5) player.shield += attributes.DEF * 2;
  const count = kind === 'boss' ? 1 : random(state) < 0.22 && floor > 1 ? 2 : 1;
  const enemies: Fighter[] = [];
  for (let i = 0; i < count; i += 1) {
    const boss = kind === 'boss', elite = boss || random(state) < 0.15;
    const base = Math.round(boss ? 8 + lv * 0.65 : 10 + lv * 0.8);
    const maxHp = boss ? world.boss.hp : Math.round((66 + lv * 10 + floor * 8) * (elite ? 1.35 : 1) * (count > 1 ? 0.75 : 1));
    const mechanic: EnemyMechanic | undefined = elite ? (['charge', 'venom', 'guard', 'venom', 'charge', 'guard', 'charge', 'venom', 'guard'] as const)[floor - 1] : undefined;
    const enemy: Fighter = { id: boss ? 'boss' : `enemy-${i + 1}`, name: boss ? definition.bossName : `${elite ? '精英·' : ''}${definition.enemyNames[Math.floor(random(state) * definition.enemyNames.length)]}`,
      hp: maxHp, maxHp: boss ? world.boss.maxHp : maxHp, shield: 0,
      attributes: { STR: Math.round(base * (boss ? 1.4 : elite ? 1.38 : 1.2)), SPD: base, AGI: Math.round(base * 0.75), DEF: Math.round(base * (boss ? 1 : 0.8)), LUCK: Math.round(base * 0.5) },
      effects: [], elite, boss, ...(mechanic ? { mechanic } : {}) };
    if (mechanic === 'charge') putEffect(enemy, 'charge_warning', floor === 1 ? 1.35 : 1.8, 1);
    if (mechanic === 'venom') putEffect(enemy, 'venom_warning', 2, 1);
    if (mechanic === 'guard') {
      enemy.shield = guardAmount(enemy, floor);
      putEffect(enemy, 'guard_warning', enemy.shield, 4);
    }
    enemies.push(enemy);
  }
  return { id: identifier(state, 'battle'), kind, floor, turn: 0, roundLimit: kind === 'boss' ? RULES.bossRoundLimit : RULES.combatRoundLimit,
    ...(economyEnabled && state.economy ? { economyVersion: 1 as const } : {}),
    ...(state.expansion ? { expansionVersion: 1 as const, ultimateUsed: false, divineGuardUsed: false } : {}),
    ...(state.growth ? { rulesVersion: 2 as const, innates: [...state.growth.innates], feignUsed: false } : {}),
    player, enemies, cooldowns: {}, usedRevive: false, reviveArmed: false, firstAttack: true, untouchedTurns: 0,
    totalDamage: 0, bossDamage: 0, playerDamageTaken: 0, landedPlayerHits: 0, log: [] };
}
function weighted<T extends { weight: number }>(items: readonly T[], roll: number): T {
  if (!items.length || !Number.isFinite(roll) || roll < 0 || roll >= 1) fail('INVALID_LOOT_POOL');
  let point = roll * items.reduce((sum, item) => sum + item.weight, 0);
  for (const item of items) { point -= item.weight; if (point < 0) return item; }
  return items[items.length - 1];
}
/** Pure two-stage draw shared by the engine's real loot path and frequency/eligibility tests. */
export function demonTowerWeightedLoot(kind: 'weapon' | 'skill', level: number, minimum: DemonTowerRarity, rarityRoll: number, itemRoll: number, unowned?: readonly string[], source: DemonTowerLootSource = 'normal') {
  const group = weighted(demonTowerLootPool(kind, level, minimum, source), rarityRoll);
  const missing = unowned ? group.items.filter(item => unowned.includes(item.id)) : [];
  return weighted(missing.length ? missing : group.items, itemRoll);
}
function expansionWeek(date: string): string {
  const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() - (value.getUTCDay() + 6) % 7);
  return value.toISOString().slice(0, 10);
}
function ensureAffixes(state: DemonTowerEngineState, owned: DemonTowerOwnedWeapon): void {
  owned.affixes ??= [];
  const choices = Object.keys(DEMON_TOWER_AFFIXES) as DemonTowerAffix[];
  while (owned.affixes.length < Math.min(3, Math.floor(owned.quality / 3))) {
    const missing = choices.filter(key => !owned.affixes!.includes(key));
    owned.affixes.push(missing[Math.floor(random(state) * missing.length)]);
  }
}
function settleQualityExperience(state: DemonTowerEngineState, events: string[]): void {
  if (!state.expansion || state.battle) return;
  for (const [kind, items] of [['weapon', state.weapons], ['skill', state.skills]] as const) for (const owned of items) {
    const definition = kind === 'weapon' ? weaponDefinition(owned.id) : skillDefinition(owned.id);
    const rarity = kind === 'weapon' ? demonTowerItemRarity(definition.rarity, (owned as DemonTowerOwnedWeapon).breakthrough) : definition.rarity;
    const cap = demonTowerQualityLimit(rarity, state.level), before = owned.quality;
    const gained = Math.min(owned.qualityExperience ?? 0, Math.max(0, cap - owned.quality));
    owned.quality += gained; owned.qualityExperience = (owned.qualityExperience ?? 0) - gained;
    if (owned.quality > before) events.push(`${definition.name}已兑现${gained}品质经验，提升至+${owned.quality}。`);
    if (kind === 'weapon') ensureAffixes(state, owned as DemonTowerOwnedWeapon);
  }
}
function enableExpansion(state: DemonTowerEngineState, events: string[]): void {
  if (state.battle || state.expansion) return;
  state.expansion = { version: 1, skillPages: 0, essences: 0, weaponBoxes: 0, weaponBoxPity: 0, riftsToday: 0, meditationsToday: 0,
    weeklyBossAttempts: 0, week: expansionWeek(state.daily.serviceDate), claimedBossFloors: [], passageTokens: 0, titles: [], skin: 'field', unlockedSkins: ['field', 'ledger', 'memo'] };
  for (const owned of [...state.weapons, ...state.skills]) {
    owned.qualityExperience = Math.min(MAX_RESOURCE, (owned.qualityExperience ?? 0) + owned.spareCopies);
    owned.spareCopies = 0; owned.star ??= 1; owned.favor ??= 0;
  }
  settleQualityExperience(state, events);
  events.push('免费扩展已开启：旧副本完整转存为品质经验，符合境界时自动兑现；既有强化和星级不降低。');
}
function grantLootItem(state: DemonTowerEngineState, kind: 'weapon' | 'skill', id: string, events: string[]): void {
  const definition = kind === 'weapon' ? weaponDefinition(id) : skillDefinition(id);
  const owned = (kind === 'weapon' ? state.weapons : state.skills).find(item => item.id === id);
  if (owned) {
    if (state.expansion) owned.qualityExperience = Math.min(MAX_RESOURCE, (owned.qualityExperience ?? 0) + 1);
    else owned.spareCopies = Math.min(MAX_RESOURCE, owned.spareCopies + 1);
  } else if (kind === 'weapon') state.weapons.push({ id: definition.id as DemonTowerWeaponId, quality: 0, spareCopies: 0, star: 1, favor: 0, qualityExperience: 0, breakthrough: 0, affixes: [] });
  else state.skills.push({ id: definition.id as DemonTowerSkillId, quality: 0, spareCopies: 0, star: 1, favor: 0, qualityExperience: 0 });
  events.push(`获得${definition.rarity}·${definition.name}${owned ? state.expansion ? '，同名转为品质经验（超境界暂存，不丢失）' : '副本' : ''}。`);
  settleQualityExperience(state, events);
}
function sourceLoot(state: DemonTowerEngineState, source: DemonTowerLootSource, kind: 'weapon' | 'skill', events: string[], minimum: DemonTowerRarity = '凡'): void {
  if (!demonTowerLootPool(kind, state.level, minimum, source).length) fail('LOOT_LEVEL_REQUIRED');
  const item = demonTowerWeightedLoot(kind, state.level, minimum, random(state), random(state), undefined, source);
  grantLootItem(state, kind, item.id, events);
}
/** Only call after the locked world/contribution check; all grants are bound to this persisted character. */
export function grantDemonTowerBossClear(state: DemonTowerEngineState, floor: number, events: string[]): void {
  const expansion = state.expansion;
  if (!expansion || expansion.claimedBossFloors.includes(floor)) return;
  expansion.claimedBossFloors.push(floor); expansion.passageTokens = Math.min(MAX_RESOURCE, expansion.passageTokens + 1);
  expansion.essences = Math.min(MAX_RESOURCE, expansion.essences + 2);
  const title = `${floorDefinition(floor).name}先锋`;
  if (!expansion.titles.includes(title)) expansion.titles.push(title);
  const guaranteed = DEMON_TOWER_WEAPONS.filter(item => item.rarity === '精');
  grantLootItem(state, 'weapon', guaranteed[Math.floor(random(state) * guaranteed.length)].id, events);
  if (demonTowerLootPool('weapon', state.level, '灵', 'boss_first').length) sourceLoot(state, 'boss_first', 'weapon', events, '灵');
  else { expansion.essences = Math.min(MAX_RESOURCE, expansion.essences + 1); events.push('未达灵武器获取等级，额外奖励保留为精魄×1，可用于突破。'); }
  events.push(`本层首杀贡献奖励：通行凭证×1、精魄×2及称号「${title}」，每层每账号仅领取一次。`);
}
function growthLoot(state: DemonTowerEngineState, events: string[], economyEnabled: boolean): void {
  const growth = state.growth!, misses = growth.misses;
  const lingEligible = state.level >= 16, xianEligible = state.level >= 31;
  const minimum: DemonTowerRarity = xianEligible && misses.xian >= 50 ? '仙' : lingEligible && misses.ling >= 20 ? '灵' : '凡';
  state.lootPity.stepsSinceGuarantee += 1;
  const scheduled = state.lootPity.stepsSinceGuarantee >= RULES.lootGuaranteeEvery;
  const forced = minimum !== '凡' || scheduled;
  const probability = Math.min(0.7, 0.2 + demonTowerEffectiveAttributes(state, economyEnabled).LUCK * 0.001 + (hasWeapon(state, 'w20') ? 0.1 * weaponScale(state, 'w20') : 0));
  let rank = -1;
  if (forced || chance(state, probability)) {
    let kind: 'weapon' | 'skill' = scheduled ? state.lootPity.nextKind : random(state) < 0.5 ? 'weapon' : 'skill';
    // A guarantee may need the other kind: Lv16 weapons can be 灵 while skills cannot until Lv31.
    if (!demonTowerLootPool(kind, state.level, minimum).length) kind = kind === 'weapon' ? 'skill' : 'weapon';
    const owned = kind === 'weapon' ? state.weapons : state.skills;
    const definitions = kind === 'weapon' ? DEMON_TOWER_WEAPONS : DEMON_TOWER_SKILLS;
    const missing = definitions.filter(item => !owned.some(existing => existing.id === item.id)).map(item => item.id);
    const item = demonTowerWeightedLoot(kind, state.level, minimum, random(state), random(state), scheduled ? missing : undefined);
    grantLootItem(state, kind, item.id, events);
    rank = DEMON_TOWER_RARITY_ORDER.indexOf(item.rarity);
    if (minimum !== '凡') events.push(`已兑现${minimum}以上免费保底（仅统计达到获取等级后的探索结算）。`);
    if (scheduled) {
      state.lootPity.stepsSinceGuarantee = 0; state.lootPity.nextKind = kind === 'weapon' ? 'skill' : 'weapon';
      events.push('已触发每4次探索物品保底，所抽稀有度内优先未收录。');
    }
  }
  if (lingEligible) misses.ling = rank >= 2 ? 0 : Math.min(20, misses.ling + 1);
  if (xianEligible) misses.xian = rank >= 3 ? 0 : Math.min(50, misses.xian + 1);
}
function loot(state: DemonTowerEngineState, events: string[], economyEnabled: boolean): void {
  if (state.growth) { growthLoot(state, events, economyEnabled); return; }
  const lucky = demonTowerEffectiveAttributes(state, economyEnabled).LUCK;
  const probability = Math.min(0.7, 0.2 + lucky * 0.001 + (hasWeapon(state, 'w20') ? 0.1 * weaponScale(state, 'w20') : 0));
  state.lootPity.stepsSinceGuarantee += 1;
  const guaranteed = state.lootPity.stepsSinceGuarantee >= RULES.lootGuaranteeEvery;
  if (!guaranteed && !chance(state, probability)) return;
  const missingWeapons = DEMON_TOWER_WEAPONS.filter((item) => item.legacyRequiredLevel <= state.level && !state.weapons.some((owned) => owned.id === item.id));
  const missingSkills = DEMON_TOWER_SKILLS.filter((item) => item.legacyRequiredLevel <= state.level && !state.skills.some((owned) => owned.id === item.id));
  const kind = guaranteed ? (state.lootPity.nextKind === 'weapon' ? missingWeapons.length > 0 || missingSkills.length === 0 ? 'weapon' : 'skill' : missingSkills.length > 0 || missingWeapons.length === 0 ? 'skill' : 'weapon') : random(state) < 0.5 ? 'weapon' : 'skill';
  if (kind === 'weapon') {
    const available = DEMON_TOWER_WEAPONS.filter((item) => item.legacyRequiredLevel <= state.level);
    const item = guaranteed && missingWeapons.length > 0 ? missingWeapons[0] : available[Math.floor(random(state) * available.length)];
    const existing = state.weapons.find((owned) => owned.id === item.id);
    if (existing) existing.spareCopies = Math.min(MAX_RESOURCE, existing.spareCopies + 1);
    else state.weapons.push({ id: item.id, quality: 0, spareCopies: 0 });
    events.push(`获得${item.name}${existing ? '副本，已保留用于升阶' : ''}。`);
  } else {
    const available = DEMON_TOWER_SKILLS.filter((item) => item.legacyRequiredLevel <= state.level);
    const item = guaranteed && missingSkills.length > 0 ? missingSkills[0] : available[Math.floor(random(state) * available.length)];
    const existing = state.skills.find((owned) => owned.id === item.id);
    if (existing) existing.spareCopies = Math.min(MAX_RESOURCE, existing.spareCopies + 1);
    else state.skills.push({ id: item.id, quality: 0, spareCopies: 0 });
    events.push(`获得${item.name}${existing ? '副本，已保留用于升阶' : ''}。`);
  }
  if (guaranteed) {
    state.lootPity.stepsSinceGuarantee = 0;
    state.lootPity.nextKind = kind === 'weapon' ? 'skill' : 'weapon';
    events.push('已触发免费探索掉落保底。');
  }
}
function finishBattle(state: DemonTowerEngineState, battle: Battle, outcome: DemonTowerBattleReport['outcome'], now: number, events: string[], economyEnabled: boolean): number {
  state.hp = bound(battle.player.hp, 0, demonTowerMaxHp(state, economyEnabled));
  state.healingAt = now;
  let experience = 0, materials = emptyMaterials(), coins = 0;
  if (outcome === 'victory' && battle.kind === 'explore') {
    experience = gainXp(state, 32 + battle.floor * 13, events);
    materials = gainMaterials(state, { ore: 2 + battle.floor, herb: 1, soul: 1 + Math.floor(battle.floor / 3), clue: random(state) < 0.25 ? 1 : 0 });
    coins = 3 + Math.floor(battle.floor / 3);
    if (economyEnabled && battle.economyVersion && battle.source !== 'weekly_boss') {
      const rift = battle.source === 'rift';
      grantSpirit(state, economyRoll(state, `settlement:${battle.id}`, rift ? 20 : 2, rift ? 40 : 4), now, rift ? '小秘境通关' : '探索战斗胜利', events);
    }
    if (battle.expansionVersion && battle.source && state.expansion) {
      sourceLoot(state, battle.source === 'rift' ? 'rift' : 'boss_weekly', 'weapon', events);
      sourceLoot(state, battle.source === 'rift' ? 'rift' : 'boss_weekly', 'skill', events);
      state.expansion.skillPages = Math.min(MAX_RESOURCE, state.expansion.skillPages + (battle.source === 'rift' ? 2 : 3));
      state.expansion.essences = Math.min(MAX_RESOURCE, state.expansion.essences + (battle.source === 'rift' ? 1 : 3));
      events.push(battle.source === 'rift' ? '小秘境通关：独立偏高稀有池各得武器/技能×1、残页×2、精魄×1。' : '周常讨伐通关：独立首领池武器/技能各×1、残页×3、精魄×3；不影响共享血池。');
    } else loot(state, events, economyEnabled);
    activity(state);
  } else if (battle.kind === 'boss' && battle.bossDamage > 0) {
    experience = gainXp(state, 20 + battle.floor * 8, events);
    materials = gainMaterials(state, { soul: 2 + battle.floor, ore: 2, clue: 1 });
    coins = 5; activity(state);
  }
  state.lastReport = { id: battle.id, kind: battle.kind, floor: battle.floor, outcome, turns: battle.turn,
    ...(battle.source ? { source: battle.source } : {}),
    damage: battle.kind === 'boss' ? battle.bossDamage : battle.totalDamage, experience, materials,
    log: clone(battle.log), completedAt: now };
  state.battle = null;
  settleQualityExperience(state, events);
  events.push(outcome === 'victory' ? '本次探索获胜。' : outcome === 'contributed' ? '本次讨伐已完成，伤害将计入共享进度。' : outcome === 'fled' ? '已安全撤离，未获得战斗奖励。' : '本次战斗结束，可以休整后再出发。');
  return coins;
}
const EXPANSION_ACTIONS = ['expedition', 'market', 'star_up', 'breakthrough', 'select_skin', 'claim_boss_loot', 'arena_enroll', 'arena_learn', 'arena_equip', 'arena_challenge', 'honor_exchange'] as const;
const SQUAD_ACTIONS = ['squad_create', 'squad_join', 'squad_leave', 'squad_ready', 'squad_step', 'squad_claim'] as const;
function expansionAction(state: DemonTowerEngineState, kind: string, raw: unknown, context: DemonTowerEngineContext, events: string[]): void {
  if (!context.expansionEnabled || !state.expansion) fail('EXPANSION_DISABLED');
  const expansion = state.expansion, rules = DEMON_TOWER_EXPANSION_RULES;
  const spendSoul = (amount: number) => { if (state.materials.soul < amount) fail('NOT_ENOUGH_MATERIALS'); state.materials.soul -= amount; };
  if (kind === 'arena_enroll') {
    const value = exact(raw, ['enabled']); if (typeof value.enabled !== 'boolean') fail('INVALID_ARENA');
    if (expansion.arena?.enabled === value.enabled) fail('ARENA_UNCHANGED');
    expansion.arena ??= { enabled: false, rating: 0, rank: '青铜', honor: 0, skillPoints: 3, learned: [], loadout: [], attemptsToday: 0, winsToday: 0, lastReport: null, skinUnlocked: false };
    expansion.arena.enabled = value.enabled;
    events.push(value.enabled ? '已自愿加入异步论道池：公开昵称/等级/段位，其他人仅与当前配装快照切磋，不改变你的血量或资产。' : '已退出论道对手池，段位/技能/荣誉保留。'); return;
  }
  if (kind === 'arena_learn' || kind === 'arena_equip' || kind === 'arena_challenge' || kind === 'honor_exchange') {
    const arena = expansion.arena; if (!arena) fail('ARENA_ENROLL_REQUIRED');
    if (kind === 'arena_learn') {
      const value = exact(raw, ['skillId']);
      const skill = DEMON_TOWER_ARENA_SKILLS.find(item => item.id === value.skillId) ?? fail('INVALID_ARENA_SKILL');
      if (arena.learned.includes(skill.id)) fail('ARENA_SKILL_OWNED');
      if (state.level < skill.requiredLevel) fail('SKILL_LEVEL_REQUIRED');
      const previous = `${skill.id.slice(0, -1)}${Number(skill.id.at(-1)) - 1}`;
      if (!skill.id.endsWith('1') && !arena.learned.includes(previous as DemonTowerArenaSkillId)) fail('ARENA_PREREQUISITE_REQUIRED');
      if (arena.skillPoints < skill.cost) fail('ARENA_SP_REQUIRED');
      arena.skillPoints -= skill.cost; arena.learned.push(skill.id); events.push(`已用${skill.cost}SP领悟${skill.name}；不会自动更换配装。`); return;
    }
    if (kind === 'arena_equip') {
      const value = exact(raw, ['skills']);
      if (!Array.isArray(value.skills) || value.skills.length > 4 || new Set(value.skills).size !== value.skills.length || value.skills.some(id => !arena.learned.includes(id as DemonTowerArenaSkillId))) fail('INVALID_ARENA_LOADOUT');
      const skills = value.skills.map(id => DEMON_TOWER_ARENA_SKILLS.find(item => item.id === id)!);
      if (skills.filter(item => item.kind === 'ultimate').length > 1 || skills.filter(item => item.kind === 'active').length > 2 || skills.filter(item => item.kind === 'passive').length > 1) fail('INVALID_ARENA_LOADOUT');
      if (JSON.stringify(value.skills) === JSON.stringify(arena.loadout)) fail('LOADOUT_UNCHANGED');
      arena.loadout = value.skills as DemonTowerArenaSkillId[]; events.push('论道配装已保存：最多1终极、2主动、1被动，按排列优先施放。'); return;
    }
    if (kind === 'honor_exchange') {
      const value = exact(raw, ['offer']); if (!['skin', 'essence', 'materials'].includes(value.offer as string)) fail('INVALID_HONOR_OFFER');
      const cost = value.offer === 'skin' ? 60 : value.offer === 'essence' ? 20 : 10;
      if (value.offer === 'skin' && arena.skinUnlocked) fail('SKIN_ALREADY_OWNED');
      if (arena.honor < cost) fail('ARENA_HONOR_REQUIRED');
      arena.honor -= cost;
      if (value.offer === 'skin') { arena.skinUnlocked = true; expansion.titles.push('论道雅士'); }
      else if (value.offer === 'essence') expansion.essences = Math.min(MAX_RESOURCE, expansion.essences + 1);
      else gainMaterials(state, { ore: 5, herb: 5 });
      events.push(`荣誉兑换完成，消耗${cost}荣誉；${value.offer === 'skin' ? '获得论道外观徽记和「论道雅士」称号' : value.offer === 'essence' ? '获得精魄×1' : '获得矿石/药草各5'}，没有付费货币或扣取对手资源。`); return;
    }
    const value = exact(raw, ['opponentPublicId']);
    if (!arena.enabled || typeof value.opponentPublicId !== 'string' || value.opponentPublicId !== context.arenaOpponent?.publicId) fail('ARENA_OPPONENT_UNAVAILABLE');
    if (arena.attemptsToday >= 5) fail('ARENA_DAILY_LIMIT');
    if (state.arenaOpponentsToday?.includes(value.opponentPublicId)) fail('ARENA_OPPONENT_ALREADY_CHALLENGED');
    const opponent = context.arenaOpponent!;
    const report = simulateDemonTowerDuel(demonTowerSocialBuild(state), opponent.build, () => random(state));
    arena.attemptsToday += 1; (state.arenaOpponentsToday ??= []).push(opponent.publicId);
    arena.lastReport = { opponentPublicId: opponent.publicId, opponentName: opponent.displayName.slice(0, 80), ...report, completedAt: context.now };
    const win = report.outcome === 'victory', firstWin = win && arena.winsToday === 0;
    if (win) arena.winsToday += 1;
    arena.rating = bound(arena.rating + (win ? 20 : report.outcome === 'defeat' ? -10 : 0), 0, 100_000);
    arena.honor = Math.min(MAX_RESOURCE, arena.honor + (win ? 10 : 3) + (firstWin ? 10 : 0));
    arena.skillPoints = Math.min(1000, arena.skillPoints + (win ? 2 : 1) + (firstWin ? 2 : 0));
    arena.rank = demonTowerArenaRank(arena.rating);
    const rankIndex = ['青铜', '白银', '黄金', '妖王'].indexOf(arena.rank);
    if (rankIndex > (state.arenaBestRank ?? 0)) { arena.skillPoints = Math.min(1000, arena.skillPoints + (rankIndex - (state.arenaBestRank ?? 0)) * 3); state.arenaBestRank = rankIndex; }
    events.push(`论道${win ? '获胜' : report.outcome === 'draw' ? '平局' : '落败'}，${report.rounds}回合；荣誉/SP已到账，对手原始档案未被修改。每天最多5位不同对手。`); return;
  }
  if (kind === 'expedition') {
    const value = exact(raw, ['mode']);
    if (!['rift', 'meditate', 'weekly_boss'].includes(value.mode as string)) fail('INVALID_EXPEDITION');
    if (state.selectedFloor > context.world.unlockedFloor || state.selectedFloor > demonTowerPersonalUnlockedFloor(state.level)) fail('FLOOR_LOCKED');
    if (value.mode === 'meditate') {
      if (expansion.meditationsToday >= rules.meditationsPerDay) fail('EXPEDITION_DAILY_LIMIT');
      spendStamina(state, rules.meditationCost, context.now); expansion.meditationsToday += 1;
      expansion.skillPages = Math.min(MAX_RESOURCE, expansion.skillPages + 1 + Math.floor(random(state) * 3));
      sourceLoot(state, 'meditation', 'skill', events); gainXp(state, 20 + state.selectedFloor * 8, events); activity(state);
      events.push('灵气点修炼：专属技能池×1、残页1—3张，不掉武器；不动普通探索保底。'); return;
    }
    if (state.hp <= 0) fail('REST_REQUIRED');
    if (value.mode === 'rift' && expansion.riftsToday >= rules.riftsPerDay) fail('EXPEDITION_DAILY_LIMIT');
    if (value.mode === 'weekly_boss' && expansion.weeklyBossAttempts >= rules.weeklyBossPerWeek) fail('EXPEDITION_WEEKLY_LIMIT');
    spendStamina(state, value.mode === 'rift' ? rules.riftCost : rules.weeklyBossCost, context.now);
    if (value.mode === 'rift') expansion.riftsToday += 1; else expansion.weeklyBossAttempts += 1;
    const battle = newBattle(state, 'explore', state.selectedFloor, context.world, context.expansionEnabled === true);
    battle.source = value.mode as 'rift' | 'weekly_boss';
    for (const enemy of battle.enemies) {
      enemy.hp = enemy.maxHp = Math.round(enemy.maxHp * (value.mode === 'rift' ? 1.35 : 2));
      enemy.attributes.STR = Math.round(enemy.attributes.STR * 1.15); enemy.elite = true;
      enemy.mechanic = 'charge'; enemy.name = `${value.mode === 'rift' ? '秘境' : '周常守关'}·${enemy.name}`;
      enemy.boss = value.mode === 'weekly_boss';
    }
    if (value.mode === 'rift' && battle.enemies.length < 2) {
      const minion = clone(battle.enemies[0]); minion.id = 'rift-minion'; minion.name = '秘境助灵';
      minion.hp = minion.maxHp = Math.ceil(minion.maxHp * 0.45); minion.attributes.STR = Math.ceil(minion.attributes.STR * 0.5);
      minion.elite = false; delete minion.mechanic; battle.enemies.push(minion);
    }
    state.battle = battle; events.push(`${value.mode === 'rift' ? '小秘境' : '周常讨伐'}已开启，战斗保存到账号；只有胜利发放装备，撤离不退次数。`); return;
  }
  if (kind === 'market') {
    const value = record(raw, ['offer', 'itemId']);
    if (!['weapon_box', 'skill_box', 'enlightenment', 'skill_selection', 'recycle_quality'].includes(value.offer as string)) fail('INVALID_MARKET_OFFER');
    if (value.offer === 'weapon_box' || value.offer === 'skill_box') {
      exact(raw, ['offer']);
      if (value.offer === 'weapon_box') {
        // Buying a guaranteed 灵 box at Lv1 would create an empty pool. Wait rather than consume the guarantee.
        if (state.level < 16) fail('LOOT_LEVEL_REQUIRED');
        spendSoul(rules.weaponBoxSoul);
        const minimum = expansion.weaponBoxPity >= 9 ? '灵' : '凡';
        sourceLoot(state, 'weapon_box', 'weapon', events, minimum);
        expansion.weaponBoxes = Math.min(MAX_RESOURCE, expansion.weaponBoxes + 1);
        expansion.weaponBoxPity = expansion.weaponBoxPity >= 9 ? 0 : expansion.weaponBoxPity + 1;
        if (minimum === '灵') events.push('第10个武器箱保底已兑现：灵或以上。');
      } else { spendSoul(rules.skillBoxSoul); sourceLoot(state, 'skill_box', 'skill', events); expansion.skillPages = Math.min(MAX_RESOURCE, expansion.skillPages + 1); }
      return;
    }
    if (value.offer === 'enlightenment') {
      exact(raw, ['offer']);
      const missing = DEMON_TOWER_SKILLS.filter(item => item.requiredLevel <= state.level && !state.skills.some(owned => owned.id === item.id));
      if (!missing.length) fail('ALL_ELIGIBLE_SKILLS_OWNED');
      spendSoul(rules.enlightenmentSoul); grantLootItem(state, 'skill', missing[Math.floor(random(state) * missing.length)].id, events); return;
    }
    exact(raw, ['offer', 'itemId']); if (typeof value.itemId !== 'string') fail('INVALID_ITEM');
    if (value.offer === 'skill_selection') {
      const definition = skillDefinition(value.itemId);
      if (definition.rarity !== '仙' || definition.requiredLevel > state.level) fail('SKILL_LEVEL_REQUIRED');
      if (expansion.skillPages < rules.selectionPages) fail('NOT_ENOUGH_SKILL_PAGES');
      expansion.skillPages -= rules.selectionPages; grantLootItem(state, 'skill', definition.id, events); events.push('30张残页已兑换指定仙级技能；没有随机选项。'); return;
    }
    const owned = [...state.weapons, ...state.skills].find(item => item.id === value.itemId) ?? fail('ITEM_NOT_OWNED');
    if ((owned.qualityExperience ?? 0) < 1) fail('NOT_ENOUGH_QUALITY_EXPERIENCE');
    if (state.materials.soul > MAX_RESOURCE - 3) fail('RESOURCE_FULL');
    owned.qualityExperience = (owned.qualityExperience ?? 0) - 1; state.materials.soul += 3;
    events.push('自愿将1点暂存品质经验兑换残魂×3，装备与已强化品质保留。'); return;
  }
  if (kind === 'star_up') {
    const value = exact(raw, ['itemType', 'itemId']);
    if (!['weapon', 'skill'].includes(value.itemType as string) || typeof value.itemId !== 'string') fail('INVALID_ITEM');
    const owned = value.itemType === 'weapon' ? weaponOwned(state, weaponDefinition(value.itemId).id) : skillOwned(state, skillDefinition(value.itemId).id);
    const star = owned.star ?? 1; if (star >= 5) fail('STAR_MAXIMUM');
    spendSoul(rules.starCharmSoul);
    if (chance(state, rules.starSuccess[star - 1])) { owned.star = star + 1; owned.favor = 0; events.push(`升星符成功：${value.itemId}提升至${owned.star}星。`); }
    else events.push('免费残魂升星符未触发升星；保留原星级、熟练度和品质，不降星。');
    return;
  }
  if (kind === 'breakthrough') {
    const value = exact(raw, ['itemId']); if (typeof value.itemId !== 'string') fail('INVALID_WEAPON');
    const definition = weaponDefinition(value.itemId), owned = weaponOwned(state, definition.id), current = demonTowerItemRarity(definition.rarity, owned.breakthrough);
    if (current === '神') fail('BREAKTHROUGH_MAXIMUM');
    const nextRank = DEMON_TOWER_RARITY_ORDER.indexOf(current) + 1, requiredLevel = nextRank * 15 + 1;
    if (state.level < requiredLevel) fail('BREAKTHROUGH_LEVEL_REQUIRED');
    if (owned.quality < Math.min(5, demonTowerQualityLimit(current, state.level))) fail('BREAKTHROUGH_QUALITY_REQUIRED');
    const cost = nextRank * 2;
    if (expansion.essences < cost || state.materials.ore < nextRank * 10) fail('NOT_ENOUGH_MATERIALS');
    expansion.essences -= cost; state.materials.ore -= nextRank * 10; owned.breakthrough = (owned.breakthrough ?? 0) + 1;
    settleQualityExperience(state, events); events.push(`${definition.name}突破至${DEMON_TOWER_RARITY_ORDER[nextRank]}，品质上限提高；主维+3，第二主维+4。`); return;
  }
  if (kind === 'select_skin') {
    const value = exact(raw, ['skin']); if (!expansion.unlockedSkins.includes(value.skin as DemonTowerSkin)) fail('INVALID_SKIN');
    if (expansion.skin === value.skin) fail('SKIN_UNCHANGED'); expansion.skin = value.skin as DemonTowerSkin; events.push('伪装皮肤已保存；仅改变界面，不改变角色战力。'); return;
  }
  if (kind === 'claim_boss_loot') {
    const value = exact(raw, ['floor']); if (!integer(value.floor, 1, 9)) fail('INVALID_FLOOR');
    if (expansion.claimedBossFloors.includes(value.floor)) fail('BOSS_LOOT_CLAIMED');
    const defeated = value.floor < context.world.currentFloor || value.floor === context.world.currentFloor && context.world.phase !== 'boss';
    if (!defeated || !context.contributedFloors?.includes(value.floor)) fail('BOSS_CONTRIBUTION_REQUIRED');
    grantDemonTowerBossClear(state, value.floor, events); return;
  }
  fail('INVALID_ACTION');
}
function validateWorld(world: DemonTowerWorldView): void {
  if (!world || !integer(world.currentFloor, 1, 9) || !integer(world.unlockedFloor, 1, 9) || world.currentFloor > world.unlockedFloor ||
    !['boss', 'passage', 'complete'].includes(world.phase) || !world.boss || !integer(world.boss.hp, 0, 1_000_000_000) ||
    !integer(world.boss.maxHp, 1, 1_000_000_000) || world.boss.hp > world.boss.maxHp || !world.passage ||
    !integer(world.passage.current, 0, 1_000_000_000) || !integer(world.passage.required, 1, 1_000_000_000) || world.passage.current > world.passage.required) fail('INVALID_WORLD');
}
function validateLoadout(state: DemonTowerEngineState, payload: unknown): DemonTowerLoadout {
  const value = exact(payload, ['mainHand', 'artifact', 'activeSkills', 'passiveSkills']);
  if (typeof value.mainHand !== 'string' || (value.artifact !== null && typeof value.artifact !== 'string') ||
    !Array.isArray(value.activeSkills) || !Array.isArray(value.passiveSkills) || value.activeSkills.length > RULES.activeSkillSlots || value.passiveSkills.length > RULES.passiveSkillSlots) fail('INVALID_LOADOUT');
  const main = weaponDefinition(value.mainHand);
  if (main.requiredLevel > state.level && !weaponOwned(state, main.id).levelExempt) fail('WEAPON_LEVEL_REQUIRED');
  weaponOwned(state, main.id);
  if (value.artifact !== null) {
    const artifact = weaponDefinition(value.artifact as string);
    if (artifact.type !== '法器' || (artifact.requiredLevel > state.level && !weaponOwned(state, artifact.id).levelExempt)) fail('WEAPON_LEVEL_REQUIRED');
    if (artifact.id === main.id) fail('DUPLICATE_EQUIPMENT');
    weaponOwned(state, artifact.id);
  }
  const seen = new Set<string>();
  for (const [values, kind] of [[value.activeSkills, 'active'], [value.passiveSkills, 'passive']] as const) {
    for (const id of values) {
      if (typeof id !== 'string' || seen.has(id)) fail('INVALID_LOADOUT');
      const definition = skillDefinition(id);
      if (definition.kind !== kind || (definition.requiredLevel > state.level && !skillOwned(state, definition.id).levelExempt)) fail('SKILL_LEVEL_REQUIRED');
      skillOwned(state, definition.id); seen.add(id);
    }
  }
  return clone(value) as unknown as DemonTowerLoadout;
}
/** Pure, deterministic policy; it does not spend resources, advance RNG or bypass actDemonTower. */
export function demonTowerAutomaticAction(state: DemonTowerEngineState): DemonTowerAction {
  if (!state.battle) return { kind: 'explore', payload: {} };
  const battle = state.battle;
  if (battle.kind !== 'explore') fail('INVALID_BATTLE');
  const targetId = battle.enemies.find(enemy => enemy.hp > 0)?.id ?? fail('INVALID_TARGET');
  const skillId = combatActiveSkills(state, battle).find(id => usableSkill(state, battle, id) &&
    (id !== 's1' || battle.player.hp < battle.player.maxHp * 0.75) &&
    (id !== 's13' || battle.player.hp < battle.player.maxHp * 0.5) &&
    (id !== 's4' || !effect(battle.player, 'strength')) && (id !== 's7' || !effect(battle.player, 'illusion')));
  return skillId ? { kind: 'skill', payload: { skillId, targetId } } : { kind: 'attack', payload: { targetId } };
}
export function actDemonTower(input: DemonTowerEngineState, raw: unknown, context: DemonTowerEngineContext): DemonTowerEngineResult {
  const root = exact(raw, ['kind', 'payload']);
  if (typeof root.kind !== 'string') fail('INVALID_ACTION');
  const allowed: DemonTowerActionKind[] = ['enroll', 'explore', 'attack', 'skill', 'flee', 'train', 'rest', 'equip', 'allocate', 'reset_attributes', 'choose_innate', 'upgrade', 'select_floor', 'challenge_boss', 'donate', 'claim_reward', 'shop_purchase', 'use_rune', ...EXPANSION_ACTIONS, ...SQUAD_ACTIONS];
  if (!allowed.includes(root.kind as DemonTowerActionKind)) fail('INVALID_ACTION');
  validateWorld(context.world);
  const state = advanceDemonTowerState(input, context.now, context.serviceDate), events: string[] = [];
  enableGrowth(state);
  const hadExpansion = Boolean(state.expansion);
  if (context.expansionEnabled) enableExpansion(state, events);
  if (context.expansionEnabled) state.economy ??= initialEconomy(context.serviceDate);
  const result: DemonTowerEngineResult = { state, events, worldEffect: null, officeCoinIntent: 0 };
  if (root.kind === 'enroll') fail('ALREADY_ENROLLED');
  if (state.battle && !['attack', 'skill', 'flee'].includes(root.kind)) fail('BATTLE_IN_PROGRESS');
  if (!state.battle && ['attack', 'skill', 'flee'].includes(root.kind)) fail('NO_BATTLE');
  if (['explore', 'train', 'rest', 'flee', 'claim_reward', 'reset_attributes'].includes(root.kind)) exact(root.payload, []);
  switch (root.kind as DemonTowerAction['kind']) {
    case 'explore': {
      if (state.hp <= 0) fail('REST_REQUIRED');
      if (state.selectedFloor > context.world.unlockedFloor || state.selectedFloor > demonTowerPersonalUnlockedFloor(state.level)) fail('FLOOR_LOCKED');
      spendStamina(state, RULES.exploreCost, context.now);
      const roll = random(state), floor = state.selectedFloor;
      if (roll < 0.7) {
        gainXp(state, 6 + floor * 2, events);
        state.battle = newBattle(state, 'explore', floor, context.world, context.expansionEnabled === true);
        events.push(`进入${floorDefinition(floor).name}，遭遇${state.battle.enemies.map((enemy) => enemy.name).join('、')}。`);
      } else {
        const blessing = hasPassive(state, 's8') ? 1 + 0.2 * skillScale(state, 's8') : 1;
        gainXp(state, (20 + floor * 10) * blessing, events);
        gainMaterials(state, { ore: Math.round((3 + floor) * blessing), herb: 2, clue: roll > 0.92 ? 1 : 0 });
        loot(state, events, context.expansionEnabled === true); activity(state); result.officeCoinIntent = 2;
        events.push(roll < 0.85 ? '找到旧日宝匣，收集了经验与材料。' : '循着灵脉修行，获得了经验与材料。');
        if (context.expansionEnabled) grantSpirit(state, economyRoll(state, 'exploration-event', 5, 15), context.now, '探索奇遇', events);
      }
      break;
    }
    case 'attack':
    case 'skill': {
      const value = root.kind === 'attack' ? exact(root.payload, ['targetId']) : record(root.payload, ['skillId', 'targetId']);
      if (root.kind === 'skill' && (!own(value, 'skillId') || typeof value.skillId !== 'string')) fail('INVALID_ACTION');
      if (root.kind === 'attack' && typeof value.targetId !== 'string') fail('INVALID_ACTION');
      if (own(value, 'targetId') && (typeof value.targetId !== 'string' || value.targetId.length > 32)) fail('INVALID_TARGET');
      const battle = state.battle!;
      const skillId = root.kind === 'skill' ? skillDefinition(value.skillId as string).id : undefined;
      const targetId = value.targetId as string | undefined ?? battle.enemies.find((enemy) => enemy.hp > 0)?.id ?? fail('INVALID_TARGET');
      resolveTurn(state, battle, { targetId, ...(skillId ? { skillId } : {}) });
      state.hp = battle.player.hp;
      if (battle.player.hp <= 0) finishBattle(state, battle, 'defeat', context.now, events, context.expansionEnabled === true);
      else if (battle.enemies.every((enemy) => enemy.hp <= 0)) result.officeCoinIntent = finishBattle(state, battle, 'victory', context.now, events, context.expansionEnabled === true);
      else if (battle.turn >= battle.roundLimit) finishBattle(state, battle, 'timeout', context.now, events, context.expansionEnabled === true);
      break;
    }
    case 'flee': finishBattle(state, state.battle!, 'fled', context.now, events, context.expansionEnabled === true); break;
    case 'train': {
      spendStamina(state, RULES.trainCost, context.now);
      const worldLevel = floorDefinition(context.world.unlockedFloor).requiredLevel;
      const catchup = 1 + bound((worldLevel - state.level) / 50, 0, 1.5);
      const weaponBonus = hasWeapon(state, 'w19') ? 1 + 0.3 * weaponScale(state, 'w19') : 1;
      const xp = gainXp(state, (25 + state.selectedFloor * 12) * catchup * weaponBonus, events);
      gainMaterials(state, { herb: 1 }); activity(state); events.push(`静心修炼，获得${xp}妖塔经验${catchup > 1 ? '（已含世界进度追赶加成）' : ''}。`); break;
    }
    case 'rest': {
      if (state.hp >= demonTowerMaxHp(state, context.expansionEnabled === true)) fail('HEALTH_ALREADY_FULL');
      spendStamina(state, RULES.restCost, context.now);
      const before = state.hp;
      const maxHp = demonTowerMaxHp(state, context.expansionEnabled === true);
      state.hp = Math.min(maxHp, state.hp + Math.ceil(maxHp * RULES.restHealingPercent / 100));
      state.healingAt = context.now; events.push(`休整恢复${state.hp - before}生命。`); break;
    }
    case 'equip': {
      const next = validateLoadout(state, root.payload);
      const sameOrder = (left: readonly string[], right: readonly string[]) => left.length === right.length && left.every((id, index) => id === right[index]);
      if (next.mainHand === state.loadout.mainHand && next.artifact === state.loadout.artifact &&
        sameOrder(next.activeSkills, state.loadout.activeSkills) && sameOrder(next.passiveSkills, state.loadout.passiveSkills)) fail('LOADOUT_UNCHANGED');
      state.loadout = next;
      state.hp = Math.min(state.hp, demonTowerMaxHp(state)); state.healingAt = context.now;
      events.push('配装已更新；首领讨伐按主动技能排列顺序使用可用技能。'); break;
    }
    case 'allocate': {
      const value = exact(root.payload, ['attribute', 'points']);
      if (typeof value.attribute !== 'string' || !DEMON_TOWER_ATTRIBUTE_KEYS.includes(value.attribute as DemonTowerAttribute) || !integer(value.points, 1, 1000)) fail('INVALID_ALLOCATION');
      if (state.unspentPoints < value.points) fail('NOT_ENOUGH_ATTRIBUTE_POINTS');
      state.attributes[value.attribute as DemonTowerAttribute] += value.points; state.unspentPoints -= value.points;
      events.push(`已分配${value.points}点${DEMON_TOWER_CATALOG.attributes[value.attribute as DemonTowerAttribute]}。`); break;
    }
    case 'choose_innate': {
      const value = exact(root.payload, ['attribute']);
      if (typeof value.attribute !== 'string' || !DEMON_TOWER_ATTRIBUTE_KEYS.includes(value.attribute as DemonTowerAttribute)) fail('INVALID_INNATE');
      if (!state.growth || state.growth.chosenAttribute !== null) fail('INNATE_ALREADY_CHOSEN');
      state.growth.chosenAttribute = value.attribute as DemonTowerAttribute; unlockInnates(state);
      state.hp = Math.min(state.hp, demonTowerMaxHp(state)); state.healingAt = context.now;
      events.push(`心性已确定，永久命格${state.growth.innates.length}/8已生效；不消耗资源、不额外恢复生命。`); break;
    }
    case 'reset_attributes': {
      const inherent = inherentAttributes(state.level), earnedFreePoints = 3 + 2 * (state.level - 1);
      if (!integer(state.unspentPoints, 0, earnedFreePoints)) fail('INVALID_STATE');
      let allocated = 0;
      for (const key of DEMON_TOWER_ATTRIBUTE_KEYS) {
        if (!integer(state.attributes[key], inherent[key], inherent[key] + earnedFreePoints)) fail('INVALID_STATE');
        allocated += state.attributes[key] - inherent[key];
      }
      // Validate the actual saved attributes, never equipment bonuses or a client-supplied refund.
      if (allocated + state.unspentPoints !== earnedFreePoints ||
        (state.lastAttributeResetAt != null && !integer(state.lastAttributeResetAt, state.createdAt, context.now))) fail('INVALID_STATE');
      if (allocated === 0) fail('ATTRIBUTES_UNCHANGED');
      if (state.lastAttributeResetAt != null && context.now < state.lastAttributeResetAt + RULES.attributeResetCooldownMs) fail('ATTRIBUTE_RESET_COOLDOWN');
      state.attributes = inherent; state.unspentPoints += allocated;
      state.hp = Math.min(state.hp, demonTowerMaxHp(state)); state.healingAt = context.now;
      state.lastAttributeResetAt = context.now;
      events.push(`已免费返还${allocated}点自由属性，固有属性保留；未提供治疗或额外资源，24小时后可再次重置。`); break;
    }
    case 'upgrade': {
      const value = exact(root.payload, ['itemType', 'itemId']);
      if (!['weapon', 'skill'].includes(value.itemType as string) || typeof value.itemId !== 'string') fail('INVALID_ACTION');
      const type = value.itemType as 'weapon' | 'skill';
      const owned = type === 'weapon' ? weaponOwned(state, weaponDefinition(value.itemId).id) : skillOwned(state, skillDefinition(value.itemId).id);
      const previousOwned = (type === 'weapon' ? input.weapons : input.skills).find(item => item.id === owned.id);
      if (!hadExpansion && state.expansion && previousOwned && owned.quality > previousOwned.quality) {
        events.push('本次请求所需的升阶已由旧副本免费兑现，不再额外消耗材料继续升下一阶。'); break;
      }
      const definition = type === 'weapon' ? weaponDefinition(owned.id) : skillDefinition(owned.id);
      const cost = demonTowerUpgradeCost(type, owned.id, owned.quality, owned.spareCopies, state.level, owned.levelExempt, state.expansion ? type === 'weapon' ? demonTowerItemRarity(definition.rarity, (owned as DemonTowerOwnedWeapon).breakthrough) : definition.rarity : undefined);
      if (!cost.available) fail(cost.reason === 'max_quality' ? 'QUALITY_MAXIMUM' : 'UPGRADE_LEVEL_REQUIRED');
      for (const key of Object.keys(cost.materials) as Array<keyof DemonTowerMaterials>) if (state.materials[key] < cost.materials[key]) fail('NOT_ENOUGH_MATERIALS');
      owned.spareCopies -= cost.spareCopies;
      for (const key of Object.keys(cost.materials) as Array<keyof DemonTowerMaterials>) state.materials[key] -= cost.materials[key];
      owned.quality += 1; if (state.expansion && type === 'weapon') ensureAffixes(state, owned as DemonTowerOwnedWeapon);
      events.push(`升阶成功，品质提升至+${owned.quality}；没有随机失败或副本丢失。`); break;
    }
    case 'select_floor': {
      const value = exact(root.payload, ['floor']);
      if (!integer(value.floor, 1, 9)) fail('INVALID_FLOOR');
      if (value.floor > context.world.unlockedFloor || floorDefinition(value.floor).requiredLevel > state.level) fail('FLOOR_LOCKED');
      if (value.floor === state.selectedFloor) fail('FLOOR_UNCHANGED');
      state.selectedFloor = value.floor; events.push(`已前往${floorDefinition(value.floor).name}。`); break;
    }
    case 'challenge_boss': {
      const value = exact(root.payload, ['floor']);
      if (!integer(value.floor, 1, 9)) fail('INVALID_FLOOR');
      if (value.floor !== context.world.currentFloor) fail('WORLD_FLOOR_CHANGED');
      if (context.world.phase !== 'boss' || context.world.boss.hp <= 0) fail('BOSS_UNAVAILABLE');
      const floor = context.world.currentFloor;
      if (floorDefinition(floor).requiredLevel > state.level) fail('FLOOR_LOCKED');
      if (state.hp <= 0) fail('REST_REQUIRED');
      if (state.daily.bossAttempts >= RULES.bossAttemptsPerDay) fail('BOSS_DAILY_LIMIT');
      spendStamina(state, RULES.bossCost, context.now); state.daily.bossAttempts += 1;
      const battle = newBattle(state, 'boss', floor, context.world, context.expansionEnabled === true);
      while (battle.turn < battle.roundLimit && battle.player.hp > 0 && battle.enemies.some((enemy) => enemy.hp > 0)) {
        const skillId = combatActiveSkills(state, battle).find((id) => usableSkill(state, battle, id) &&
          (id !== 's1' || battle.player.hp < battle.player.maxHp * 0.75) &&
          (id !== 's13' || battle.player.hp < battle.player.maxHp * 0.5) &&
          (id !== 's4' || !effect(battle.player, 'strength')) && (id !== 's7' || !effect(battle.player, 'illusion')));
        resolveTurn(state, battle, { targetId: battle.enemies.find((enemy) => enemy.hp > 0)!.id, ...(skillId ? { skillId } : {}) });
      }
      result.officeCoinIntent = finishBattle(state, battle, battle.player.hp <= 0 ? 'defeat' : 'contributed', context.now, events, context.expansionEnabled === true);
      result.worldEffect = { kind: 'boss_damage', floor, amount: Math.min(context.world.boss.hp, battle.bossDamage) };
      break;
    }
    case 'donate': {
      const value = exact(root.payload, ['floor', 'material', 'amount']);
      if (!integer(value.floor, 1, 9)) fail('INVALID_FLOOR');
      if (value.floor !== context.world.currentFloor) fail('WORLD_FLOOR_CHANGED');
      if (!['ore', 'clue'].includes(value.material as string) || !integer(value.amount, 1, 1000)) fail('INVALID_DONATION');
      if (context.world.phase !== 'passage' || context.world.passage.current >= context.world.passage.required) fail('PASSAGE_UNAVAILABLE');
      if (floorDefinition(context.world.currentFloor).requiredLevel > state.level) fail('FLOOR_LOCKED');
      const material = value.material as 'ore' | 'clue', ratio = RULES.donationValues[material];
      const progress = Math.min(context.world.passage.required - context.world.passage.current, value.amount * ratio);
      const consumed = Math.ceil(progress / ratio);
      if (state.materials[material] < consumed) fail('NOT_ENOUGH_MATERIALS');
      state.materials[material] -= consumed;
      result.worldEffect = { kind: 'construction', floor: context.world.currentFloor, amount: progress };
      events.push(`投入${consumed}${DEMON_TOWER_CATALOG.materials[material]}，增加${progress}通道进度；建设不计讨伐奖金榜。`); break;
    }
    case 'claim_reward': {
      if (state.daily.rewardClaimed) fail('DAILY_REWARD_CLAIMED');
      if (state.daily.activity < RULES.dailyActivityTarget) fail('DAILY_REWARD_NOT_READY');
      state.daily.rewardClaimed = true; result.officeCoinIntent = RULES.dailyActivityCoins;
      events.push('每日修行奖励已申请，由统一钱包按妖塔日常上限结算。'); break;
    }
    case 'shop_purchase': case 'use_rune':
      economyAction(state, root.kind as 'shop_purchase' | 'use_rune', root.payload, context, events); break;
    case 'expedition': case 'market': case 'star_up': case 'breakthrough': case 'select_skin': case 'claim_boss_loot':
    case 'arena_enroll': case 'arena_learn': case 'arena_equip': case 'arena_challenge': case 'honor_exchange':
      expansionAction(state, root.kind, root.payload, context, events); break;
    case 'squad_create': case 'squad_join': case 'squad_leave': case 'squad_ready': case 'squad_step': case 'squad_claim':
      if (!context.expansionEnabled || !state.expansion) fail('EXPANSION_DISABLED');
      if (root.kind === 'squad_create') { const value = exact(root.payload, ['floor']); if (!integer(value.floor, 1, 9)) fail('INVALID_FLOOR'); }
      else if (root.kind === 'squad_join') { const value = exact(root.payload, ['squadId']); if (typeof value.squadId !== 'string' || !/^[0-9a-f-]{36}$/i.test(value.squadId)) fail('INVALID_SQUAD'); }
      else exact(root.payload, []);
      // The service resolves membership/locks and applies the private squad row in this SAME action transaction.
      break;
    default: fail('INVALID_ACTION');
  }
  state.lastActionAt = context.now;
  state.hp = Math.min(state.hp, state.battle?.player.maxHp ?? demonTowerMaxHp(state, context.expansionEnabled === true));
  return result;
}
const effectNames: Record<EffectId, string> = { strength: '力量祝福', all: '全维淬炼', illusion: '幻身', slow: '蓄势迟缓', poison: '毒伤', shred: '破防', stun: '震慑', shield: '铁壁护盾',
  charge_warning: '即将蓄力（随后重击）', charge_ready: '下次行动重击（可震慑打断）', venom_warning: '即将预备毒雾', venom_ready: '下次攻击带毒（护盾可阻止）', guard_warning: '第4回合举盾并放弃攻击' };
function logView(entries: DemonTowerCombatLog[]): DemonTowerCombatLog[] {
  return entries.slice(-MAX_LOG).map((entry) => ({ turn: entry.turn, actor: entry.actor, kind: entry.kind, text: entry.text,
    ...(entry.amount !== undefined ? { amount: entry.amount } : {}), ...(entry.targetId !== undefined ? { targetId: entry.targetId } : {}) }));
}
function reportView(report: DemonTowerBattleReport): DemonTowerBattleReport {
  return { id: report.id, kind: report.kind, floor: report.floor, outcome: report.outcome, turns: report.turns,
    ...(report.source ? { source: report.source } : {}),
    damage: report.damage, experience: report.experience, materials: copyMaterials(report.materials),
    log: logView(report.log), completedAt: report.completedAt };
}
function fighterView(fighter: Fighter): DemonTowerCombatantView {
  return { id: fighter.id, name: fighter.name, hp: fighter.hp, maxHp: fighter.maxHp, shield: fighter.shield,
    attributes: dimensions(fighter), effects: fighter.effects.map((item): DemonTowerEffectView => ({ id: item.id, name: effectNames[item.id], remainingTurns: item.turns, magnitude: item.magnitude })) };
}
function battleView(state: DemonTowerEngineState): DemonTowerBattleView | null {
  const battle = state.battle;
  if (!battle) return null;
  return { id: battle.id, kind: 'explore', floor: battle.floor, turn: battle.turn, roundLimit: battle.roundLimit,
    ...(battle.source ? { source: battle.source } : {}),
    player: fighterView(battle.player), enemies: battle.enemies.map(fighterView),
    availableSkills: combatActiveSkills(state, battle).map((id) => ({ id, cooldownRemaining: battle.cooldowns[id] ?? 0, usable: usableSkill(state, battle, id) })), log: logView(battle.log) };
}
export function demonTowerProfileView(state: DemonTowerEngineState, now: number, version: number, officeCoinsEarned = 0, expansionEnabled = false): DemonTowerProfileView {
  clock(now);
  if (!integer(version, 0, Number.MAX_SAFE_INTEGER) || !integer(officeCoinsEarned, 0, RULES.dailyOfficeCoinCap)) fail('INVALID_VIEW_CONTEXT');
  // Maintenance GET freezes timers rather than advancing the save. Expired drugs
  // must still disappear from displayed idle stats, without mutating that save.
  const serviceDate = new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);
  const statState = state.economy && (!expansionEnabled || state.economy.serviceDate < serviceDate) ? { ...state, economy: { ...state.economy, buffs: zeroAttributes() } } : state;
  const displayedMaxHp = state.battle?.player.maxHp ?? demonTowerMaxHp(statState);
  const availableActions: DemonTowerActionKind[] = state.battle ? ['attack', 'skill', 'flee'] : ['explore', 'train', 'rest', 'equip', 'allocate', 'reset_attributes', 'upgrade', 'select_floor', 'challenge_boss', 'donate', 'claim_reward'];
  if (!state.battle && !state.growth?.chosenAttribute) availableActions.push('choose_innate');
  if (expansionEnabled && !state.battle) availableActions.push(...EXPANSION_ACTIONS, ...SQUAD_ACTIONS);
  if (expansionEnabled && !state.battle) availableActions.push('shop_purchase', 'use_rune');
  return {
    ...(expansionEnabled ? { economy: economyView(state, now) } : {}),
    ...(expansionEnabled ? { expansion: expansionView(state) } : {}),
    growth: { rulesVersion: 2, pendingLegacyBattle: Boolean(state.battle && state.battle.rulesVersion !== 2),
      chosenAttribute: state.growth?.chosenAttribute ?? null, innates: [...(state.growth?.innates ?? [])],
      unlockedCount: Math.min(8, 1 + Math.floor((state.level - 1) / 15)), nextInnateLevel: state.level >= 106 ? null : (Math.floor((state.level - 1) / 15) + 1) * 15 + 1,
      misses: { ling: state.growth?.misses.ling ?? 0, xian: state.growth?.misses.xian ?? 0 }, eligible: { ling: state.level >= 16, xian: state.level >= 31 } },
    version, level: state.level, experience: state.experience, experienceToNext: demonTowerExperienceToNext(state.level), totalExperience: state.totalExperience,
    attributes: copyAttributes(state.attributes), effectiveAttributes: state.battle ? copyAttributes(state.battle.player.attributes) : demonTowerEffectiveAttributes(statState), unspentPoints: state.unspentPoints,
    attributeReset: { allocatedPoints: bound(3 + 2 * (state.level - 1) - state.unspentPoints, 0, 3 + 2 * (state.level - 1)),
      eligibleAt: state.lastAttributeResetAt == null ? null : state.lastAttributeResetAt + RULES.attributeResetCooldownMs },
    hp: Math.min(state.hp, displayedMaxHp), maxHp: displayedMaxHp, stamina: state.stamina, staminaMax: RULES.staminaCap,
    nextStaminaAt: state.stamina >= RULES.staminaCap ? null : state.staminaAt + RULES.staminaRestoreMs,
    materials: copyMaterials(state.materials), weapons: state.weapons.map((item) => ({ id: item.id, quality: item.quality, spareCopies: item.spareCopies,
      star: item.star ?? 1, favor: item.favor ?? 0, levelExempt: !state.growth || item.levelExempt === true,
      ...(expansionEnabled ? { qualityExperience: item.qualityExperience ?? item.spareCopies, breakthrough: item.breakthrough ?? 0, affixes: [...(item.affixes ?? [])] } : {}) })),
    skills: state.skills.map((item) => ({ id: item.id, quality: item.quality, spareCopies: item.spareCopies, levelExempt: !state.growth || item.levelExempt === true,
      ...(expansionEnabled ? { qualityExperience: item.qualityExperience ?? item.spareCopies, star: item.star ?? 1, favor: item.favor ?? 0 } : {}) })),
    loadout: { mainHand: state.loadout.mainHand, artifact: state.loadout.artifact, activeSkills: [...state.loadout.activeSkills], passiveSkills: [...state.loadout.passiveSkills] },
    selectedFloor: state.selectedFloor, personalUnlockedFloor: demonTowerPersonalUnlockedFloor(state.level),
    daily: { serviceDate: state.daily.serviceDate, activity: state.daily.activity, activityTarget: RULES.dailyActivityTarget,
      rewardClaimed: state.daily.rewardClaimed, bossAttempts: state.daily.bossAttempts, bossAttemptsMax: RULES.bossAttemptsPerDay,
      officeCoinsEarned, officeCoinCap: RULES.dailyOfficeCoinCap },
    battle: battleView(state), lastReport: state.lastReport ? reportView(state.lastReport) : null, availableActions, createdAt: state.createdAt,
  };
}
function expansionView(state: DemonTowerEngineState): DemonTowerExpansionView {
  const value = state.expansion;
  return { version: 1, skillPages: value?.skillPages ?? 0, essences: value?.essences ?? 0, weaponBoxes: value?.weaponBoxes ?? 0,
    weaponBoxPity: value?.weaponBoxPity ?? 0, riftsToday: value?.riftsToday ?? 0, meditationsToday: value?.meditationsToday ?? 0,
    weeklyBossAttempts: value?.weeklyBossAttempts ?? 0, week: value?.week ?? expansionWeek(state.daily.serviceDate),
    claimedBossFloors: [...(value?.claimedBossFloors ?? [])], passageTokens: value?.passageTokens ?? 0, titles: [...(value?.titles ?? [])],
    skin: value?.skin ?? 'field', unlockedSkins: [...(value?.unlockedSkins ?? ['field', 'ledger', 'memo'])],
    ...(value?.arena ? { arena: { enabled: value.arena.enabled, rating: value.arena.rating, rank: demonTowerArenaRank(value.arena.rating), honor: value.arena.honor, skillPoints: value.arena.skillPoints,
      learned: [...value.arena.learned], loadout: [...value.arena.loadout], attemptsToday: value.arena.attemptsToday, winsToday: value.arena.winsToday, skinUnlocked: value.arena.skinUnlocked,
      lastReport: value.arena.lastReport ? { opponentPublicId: value.arena.lastReport.opponentPublicId, opponentName: value.arena.lastReport.opponentName, outcome: value.arena.lastReport.outcome,
        rounds: value.arena.lastReport.rounds, log: value.arena.lastReport.log.slice(-100), completedAt: value.arena.lastReport.completedAt } : null } } : {}),
    squadId: value?.squadId ?? null, squadReadyToday: value?.squadReadyToday ?? 0 };
}
export function demonTowerSocialBuild(state: DemonTowerEngineState): DemonTowerSocialBuild {
  return { level: state.level, maxHp: demonTowerMaxHp(state, false), attributes: demonTowerEffectiveAttributes(state, false),
    weapons: [state.loadout.mainHand, state.loadout.artifact].flatMap(id => id ? [clone(weaponOwned(state, id))] : []),
    active: [...state.loadout.activeSkills], passive: [...state.loadout.passiveSkills], innates: [...(state.growth?.innates ?? [])], arenaSkills: [...(state.expansion?.arena?.loadout ?? [])] };
}
