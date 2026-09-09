export const TOWER_DEFENSE_WIDTH = 12;
export const TOWER_DEFENSE_HEIGHT = 8;
export const TOWER_DEFENSE_WAVES = 2;
export const TOWER_DEFENSE_CORE_HP = 10;
export const TOWER_DEFENSE_TICK_MS = 280;
export const HERO_MAX_LEVEL = 5;
export const TOWER_MAX_LEVEL = 3;
export const TOWER_INVENTORY_CAPACITY = 12;
export const TOWER_SHOP_SIZE = 5;
export const TOWER_SHOP_REFRESH_COST = 10;
export const TOWER_FOCUSED_ORDER_INDEX = TOWER_SHOP_SIZE - 1;
export const TOWER_FOCUSED_ORDER_PREMIUM_RATE = 1.25;
// Covers five mandatory restocks when assembling two extra tier-two defenses.
export const TOWER_INTERMISSION_CREDIT_BONUS = 100;
export const TOWER_SWARM_SINGLE_TARGET_DAMAGE_CAP = 2;
export const TOWER_PRINTER_ARMOR_PIERCE = 2;
export const TOWER_PLANT_MAX_LEVEL = 3;
export const TOWER_PLANT_INCOME_INTERVAL = 12;
export const TOWER_PLANT_UPGRADE_COSTS = [30, 50, 80] as const;

const TOWER_PLANT_INCOMES = [0, 4, 7, 11] as const;
const TOWER_SELL_REFUND_RATE = 0.6;
const DEFAULT_RNG_SEED = 0x5eed_1234;

export type TowerDefenseStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'intermission'
  | 'won'
  | 'lost';
export type TowerDefenseDirection = 'up' | 'down' | 'left' | 'right';
export type TowerType = 'single' | 'slow' | 'splash' | 'push' | 'shred';
export type TowerTier = 1 | 2 | 3;
export type TowerEnemyArchetype = 'basic' | 'fast' | 'swarm' | 'elite' | 'midboss';
export type TowerShopOfferSource = 'random' | 'guaranteed' | 'focused';
export type TowerCombatSource = 'hero' | 'pulse' | TowerType;
export type TowerCombatTechnique = 'pierce' | 'freeze' | 'root' | 'stun' | 'taunt' | 'true-damage' | 'execute' | 'vulnerable';
export type TowerDefenseActionCode =
  | 'ok'
  | 'invalid_status'
  | 'insufficient_credits'
  | 'plant_max_level'
  | 'shop_offer_missing'
  | 'invalid_tower_type'
  | 'inventory_full'
  | 'inventory_item_missing'
  | 'tier_not_deployable'
  | 'invalid_slot'
  | 'slot_occupied'
  | 'hero_blocking'
  | 'tower_missing'
  | 'tower_max_level'
  | 'merge_materials_missing';

export interface TowerDefensePoint {
  x: number;
  y: number;
}

export interface TowerDefenseHero extends TowerDefensePoint {
  direction: TowerDefenseDirection;
  level: number;
  attack: number;
  range: number;
  autoCooldown: number;
  pulseCooldown: number;
  lastPulseTick: number | null;
}

export interface TowerDefenseEnemy {
  id: string;
  name: string;
  pathIndex: number;
  hp: number;
  maxHp: number;
  speedTicks: number;
  slowTicks: number;
  shredTicks: number;
  shredStacks: number;
  archetype: TowerEnemyArchetype;
  armor: number;
  singleTargetDamageCap: number | null;
  reward: number;
  score: number;
  coreDamage: number;
  boss: boolean;
  armorBreakTicks?: number;
  armorBreakPoints?: number;
  freezeTicks?: number;
  rootTicks?: number;
  stunTicks?: number;
  controlImmunityTicks?: number;
}

export interface TowerDefenseTower {
  id: string;
  slotIndex: number;
  type: TowerType;
  level: TowerTier;
  cooldown: number;
  invested: number;
}

export interface TowerInventoryItem {
  id: string;
  type: TowerType;
  tier: TowerTier;
  invested: number;
}

export interface TowerShopOffer {
  id: string;
  type: TowerType;
  tier: 1;
  cost: number;
  source?: TowerShopOfferSource;
  /** A bought offer keeps its slot and identity until an explicitly paid refresh. */
  soldOut?: boolean;
}

export interface TowerCombatEffect {
  id: string;
  tick: number;
  source: TowerCombatSource;
  from: TowerDefensePoint;
  to: TowerDefensePoint;
  targetEnemyIds: string[];
  technique?: TowerCombatTechnique;
}

export interface TowerDefenseActionFeedback {
  ok: boolean;
  code: TowerDefenseActionCode;
  message: string;
  tick: number;
}

export interface TowerRoundEnemySpawn {
  name: string;
  archetype: TowerEnemyArchetype;
  hp: number;
  speedTicks: number;
  armor: number;
  singleTargetDamageCap: number | null;
  reward: number;
  score: number;
  coreDamage: number;
  boss?: boolean;
  spawnDelayTicks?: number;
}

export interface TowerRoundConfig {
  wave: 1 | 2;
  name: string;
  description: string;
  spawnIntervalTicks: number;
  targetCountMultiplier: number;
  targetHpMultiplier: number;
  spawns: readonly TowerRoundEnemySpawn[];
}

export interface TowerRoundSummary {
  wave: 1 | 2;
  name: string;
  description: string;
  enemyCount: number;
  totalHp: number;
  countMultiplier: number;
  totalHpMultiplier: number;
  archetypes: TowerEnemyArchetype[];
  hasMidboss: boolean;
}

export interface TowerDefenseState {
  status: TowerDefenseStatus;
  resumeStatus: 'running' | 'intermission' | null;
  wave: number;
  tick: number;
  coreHp: number;
  breached: number;
  credits: number;
  score: number;
  defeated: number;
  hero: TowerDefenseHero;
  enemies: TowerDefenseEnemy[];
  towers: TowerDefenseTower[];
  spawnQueue: TowerRoundEnemySpawn[];
  nextSpawnAt: number;
  nextEnemyId: number;
  plantLevel: number;
  plantIncomeTick: number;
  shop: TowerShopOffer[];
  shopFocus: TowerType;
  inventory: TowerInventoryItem[];
  rngSeed: number;
  nextItemId: number;
  nextOfferId: number;
  lastAction: TowerDefenseActionFeedback | null;
  effects: TowerCombatEffect[];
}

export interface TowerDefenseActionResult {
  state: TowerDefenseState;
  ok: boolean;
  code: TowerDefenseActionCode;
  message: string;
}

export interface TowerDefinition {
  type: TowerType;
  name: string;
  mark: string;
  description: string;
  /** Compatibility alias for the price of one tier-one part. */
  cost: number;
  partCost: number;
  range: number;
}

export const TOWER_DEFINITIONS: Record<TowerType, TowerDefinition> = {
  single: {
    type: 'single',
    name: '订书机',
    mark: '订',
    description: '高频单体碎甲：2 阶削减 1 点护甲，3 阶削减 2 点护甲，帮助全队处理精英。',
    cost: 18,
    partCost: 18,
    range: 3,
  },
  slow: {
    type: 'slow',
    name: '咖啡机',
    mark: '咖',
    description: '冰美式短暂冰冻主目标、周围减速；3 阶浓缩喷射定身更久。控场有抗性间隔，不能无限定住。',
    cost: 20,
    partCost: 20,
    range: 3,
  },
  splash: {
    type: 'splash',
    name: '打印机',
    mark: '印',
    description: `2 阶激光处理同一直线目标，穿透 ${TOWER_PRINTER_ARMOR_PIERCE} 点护甲；3 阶 3D 打印炮台对邻近敌群造成真伤。`,
    cost: 22,
    partCost: 22,
    range: 3,
  },
  push: {
    type: 'push',
    name: '转椅',
    mark: '椅',
    description: '2 阶人体工学椅推退并短暂眩晕；3 阶老板椅嘲讽附近最多 3 个目标，向后聚拢。Boss 抵抗聚怪。',
    cost: 22,
    partCost: 22,
    range: 2,
  },
  shred: {
    type: 'shred',
    name: '碎纸机',
    mark: '碎',
    description: '普通文书类目标受真伤，其他目标叠易伤；2 阶吞噬残血普通敌人，3 阶碎纸风暴扩大范围。Boss 不会被吞噬。',
    cost: 24,
    partCost: 24,
    range: 2,
  },
};

export const TOWER_EVOLUTIONS: Record<TowerType, Record<2 | 3, { name: string; description: string }>> = {
  single: {
    2: { name: '碎甲订书机', description: '单体 4 伤害，每 3 拍攻击；削甲 1 点持续 6 拍。' },
    3: { name: '重型订书机', description: '单体 7 伤害，每 2 拍攻击；削甲 2 点持续 9 拍。' },
  },
  slow: {
    2: { name: '冰美式', description: '主目标冰冻 2 拍，相邻目标减速；控制间隔至少 12 拍。' },
    3: { name: '浓缩喷射', description: '主目标定身 3 拍，范围伤害和减速提高；Boss 只停 1 拍。' },
  },
  splash: {
    2: { name: '激光打印机', description: '沿主目标所在直线穿透，最多延伸 2 格；穿甲 2 点。' },
    3: { name: '3D 打印炮台', description: '主目标及路径相邻敌人受到 6 点范围真伤，忽略护甲。' },
  },
  push: {
    2: { name: '人体工学椅', description: '单体推退 1 格并眩晕 1 拍，每 8 拍攻击一次。' },
    3: { name: '老板椅', description: '嘲讽附近最多 3 个目标，向后聚拢并眩晕 2 拍；Boss 不被聚拢。' },
  },
  shred: {
    2: { name: '工业碎纸机', description: '普通文书受真伤，叠易伤；命中后生命不高于 15% 的非 Boss 会被吞噬。' },
    3: { name: '碎纸风暴', description: '处理路径相邻最多 3 个敌人，吞噬线提高到 25%；Boss 仅承受正常伤害/易伤。' },
  },
};

const TOWER_TYPES = Object.keys(TOWER_DEFINITIONS) as TowerType[];

const ROUND_TWO_TEMPLATES: Record<
  TowerEnemyArchetype,
  Omit<TowerRoundEnemySpawn, 'spawnDelayTicks'>
> = {
  basic: {
    name: '常规任务', archetype: 'basic', hp: 16, speedTicks: 5, armor: 0,
    singleTargetDamageCap: null, reward: 7, score: 115, coreDamage: 1,
  },
  fast: {
    name: '紧急消息', archetype: 'fast', hp: 10, speedTicks: 2, armor: 0,
    singleTargetDamageCap: null, reward: 5, score: 90, coreDamage: 1,
  },
  swarm: {
    name: '群聊轰炸', archetype: 'swarm', hp: 8, speedTicks: 5, armor: 2,
    singleTargetDamageCap: TOWER_SWARM_SINGLE_TARGET_DAMAGE_CAP,
    reward: 4, score: 70, coreDamage: 3,
  },
  elite: {
    name: '重点催办', archetype: 'elite', hp: 30, speedTicks: 6, armor: 3,
    singleTargetDamageCap: null, reward: 16, score: 220, coreDamage: 2,
  },
  midboss: {
    name: '临时加班通知', archetype: 'midboss', hp: 80, speedTicks: 6, armor: 4,
    singleTargetDamageCap: null, reward: 30, score: 500, coreDamage: 4, boss: true,
  },
};

function roundTwoSpawn(
  archetype: TowerEnemyArchetype,
  spawnDelayTicks: number,
): TowerRoundEnemySpawn {
  return { ...ROUND_TWO_TEMPLATES[archetype], spawnDelayTicks };
}

const ROUND_ONE_SPAWNS: readonly TowerRoundEnemySpawn[] = Array.from({ length: 6 }, () => ({
  name: '待办便签',
  archetype: 'basic' as const,
  hp: 12,
  speedTicks: 5,
  armor: 0,
  singleTargetDamageCap: null,
  reward: 8,
  score: 100,
  coreDamage: 1,
}));

const ROUND_TWO_SPAWNS: readonly TowerRoundEnemySpawn[] = [
  roundTwoSpawn('swarm', 1),
  roundTwoSpawn('swarm', 1),
  roundTwoSpawn('swarm', 1),
  roundTwoSpawn('swarm', 1),
  roundTwoSpawn('swarm', 20),
  roundTwoSpawn('fast', 6),
  roundTwoSpawn('fast', 8),
  roundTwoSpawn('basic', 12),
  roundTwoSpawn('elite', 14),
  roundTwoSpawn('basic', 12),
  roundTwoSpawn('midboss', 18),
  roundTwoSpawn('swarm', 1),
  roundTwoSpawn('swarm', 1),
  roundTwoSpawn('swarm', 1),
  roundTwoSpawn('swarm', 1),
  roundTwoSpawn('swarm', 20),
  roundTwoSpawn('fast', 6),
  roundTwoSpawn('fast', 8),
  roundTwoSpawn('basic', 12),
  roundTwoSpawn('elite', 14),
  roundTwoSpawn('fast', 6),
  roundTwoSpawn('basic', 12),
  roundTwoSpawn('fast', 8),
  roundTwoSpawn('basic', 10),
];

export const TOWER_ROUND_CONFIGS: readonly TowerRoundConfig[] = [
  {
    wave: 1,
    name: '摸鱼热身',
    description: '低压待办依次到来，用有效战斗时间积累绿植收入并完成基础合成。',
    spawnIntervalTicks: 16,
    targetCountMultiplier: 1,
    targetHpMultiplier: 1,
    spawns: ROUND_ONE_SPAWNS,
  },
  {
    wave: 2,
    name: '加班风暴',
    description: '快速消息、突破时冲击 3 点的成团群聊与护甲催办交错来袭，中段还有临时加班通知。',
    spawnIntervalTicks: 8,
    targetCountMultiplier: 4,
    targetHpMultiplier: 5,
    spawns: ROUND_TWO_SPAWNS,
  },
] as const;

export function getTowerRoundSummary(wave: number): TowerRoundSummary {
  const first = TOWER_ROUND_CONFIGS[0];
  if (!first) throw new Error('Tower defense requires at least one round configuration.');
  const config = TOWER_ROUND_CONFIGS.find((entry) => entry.wave === wave) ?? first;
  const enemyCount = config.spawns.length;
  const totalHp = config.spawns.reduce((sum, spawn) => sum + spawn.hp, 0);
  const firstTotalHp = first.spawns.reduce((sum, spawn) => sum + spawn.hp, 0);
  return {
    wave: config.wave,
    name: config.name,
    description: config.description,
    enemyCount,
    totalHp,
    countMultiplier: Number((enemyCount / first.spawns.length).toFixed(2)),
    totalHpMultiplier: Number((totalHp / firstTotalHp).toFixed(2)),
    archetypes: [...new Set(config.spawns.map((spawn) => spawn.archetype))],
    hasMidboss: config.spawns.some((spawn) => spawn.archetype === 'midboss'),
  };
}

export const WAVE_NAMES = ['摸鱼热身', '加班风暴'] as const;

export const TOWER_DEFENSE_PATH: readonly TowerDefensePoint[] = [
  { x: 0, y: 2 },
  { x: 1, y: 2 },
  { x: 2, y: 2 },
  { x: 3, y: 2 },
  { x: 4, y: 2 },
  { x: 5, y: 2 },
  { x: 5, y: 3 },
  { x: 5, y: 4 },
  { x: 5, y: 5 },
  { x: 6, y: 5 },
  { x: 7, y: 5 },
  { x: 8, y: 5 },
  { x: 9, y: 5 },
  { x: 10, y: 5 },
  { x: 11, y: 5 },
] as const;

export const TOWER_SLOTS: readonly TowerDefensePoint[] = [
  { x: 1, y: 1 },
  { x: 3, y: 1 },
  { x: 5, y: 1 },
  { x: 2, y: 3 },
  { x: 7, y: 4 },
  { x: 9, y: 4 },
  { x: 6, y: 6 },
  { x: 8, y: 6 },
  { x: 10, y: 6 },
] as const;

function waveSpawns(wave: number): TowerRoundEnemySpawn[] {
  const config = TOWER_ROUND_CONFIGS.find((entry) => entry.wave === wave);
  return config ? config.spawns.map((spawn) => ({ ...spawn })) : [];
}

function pointKey(point: TowerDefensePoint): string {
  return `${point.x}:${point.y}`;
}

function distance(a: TowerDefensePoint, b: TowerDefensePoint): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function nextRandom(seed: number): { seed: number; value: number } {
  const nextSeed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
  return { seed: nextSeed, value: nextSeed / 0x1_0000_0000 };
}

function randomOffer(
  seed: number,
  offerId: number,
): { offer: TowerShopOffer; seed: number } {
  const random = nextRandom(seed);
  const type = TOWER_TYPES[Math.floor(random.value * TOWER_TYPES.length)] ?? 'single';
  return {
    seed: random.seed,
    offer: {
      id: `offer-${offerId}`,
      type,
      tier: 1,
      cost: TOWER_DEFINITIONS[type].partCost,
      source: 'random',
    },
  };
}

export function focusedTowerPartCost(type: TowerType): number {
  return Math.ceil(TOWER_DEFINITIONS[type].partCost * TOWER_FOCUSED_ORDER_PREMIUM_RATE);
}

function focusedOffer(type: TowerType, offerId: number): TowerShopOffer {
  return {
    id: `offer-${offerId}`,
    type,
    tier: 1,
    cost: focusedTowerPartCost(type),
    source: 'focused',
  };
}

function createInitialShop(seed: number): {
  shop: TowerShopOffer[];
  seed: number;
  nextOfferId: number;
} {
  const shop: TowerShopOffer[] = [1, 2, 3].map((id) => ({
    id: `offer-${id}`,
    type: 'single',
    tier: 1,
    cost: TOWER_DEFINITIONS.single.partCost,
    source: 'guaranteed',
  }));
  const random = randomOffer(seed, 4);
  shop.push(random.offer, focusedOffer('single', 5));
  return { shop, seed: random.seed, nextOfferId: TOWER_SHOP_SIZE + 1 };
}

function makeFeedback(
  state: TowerDefenseState,
  ok: boolean,
  code: TowerDefenseActionCode,
  message: string,
): TowerDefenseActionResult {
  const feedback: TowerDefenseActionFeedback = { ok, code, message, tick: state.tick };
  return { state: { ...state, lastAction: feedback }, ok, code, message };
}

function canManage(state: TowerDefenseState): boolean {
  return state.status === 'idle' || state.status === 'running' || state.status === 'intermission';
}

export function plantUpgradeCost(level: number): number {
  if (!Number.isInteger(level) || level < 0 || level >= TOWER_PLANT_MAX_LEVEL) return 0;
  return TOWER_PLANT_UPGRADE_COSTS[level] ?? 0;
}

export function plantIncomePerPayout(level: number): number {
  if (!Number.isInteger(level) || level < 0 || level > TOWER_PLANT_MAX_LEVEL) return 0;
  return TOWER_PLANT_INCOMES[level] ?? 0;
}

export function createTowerDefenseState(seed = DEFAULT_RNG_SEED): TowerDefenseState {
  const normalizedSeed = Number.isFinite(seed) ? (Math.trunc(seed) >>> 0) : DEFAULT_RNG_SEED;
  const initialShop = createInitialShop(normalizedSeed);
  return {
    status: 'idle',
    resumeStatus: null,
    wave: 1,
    tick: 0,
    coreHp: TOWER_DEFENSE_CORE_HP,
    breached: 0,
    credits: 110,
    score: 0,
    defeated: 0,
    hero: {
      x: 7,
      y: 6,
      direction: 'right',
      level: 1,
      attack: 3,
      range: 3,
      autoCooldown: 0,
      pulseCooldown: 0,
      lastPulseTick: null,
    },
    enemies: [],
    towers: [],
    spawnQueue: waveSpawns(1),
    nextSpawnAt: 1,
    nextEnemyId: 1,
    plantLevel: 0,
    plantIncomeTick: 0,
    shop: initialShop.shop,
    shopFocus: 'single',
    inventory: [],
    rngSeed: initialShop.seed,
    nextItemId: 1,
    nextOfferId: initialShop.nextOfferId,
    lastAction: null,
    effects: [],
  };
}

export function startTowerDefense(state: TowerDefenseState): TowerDefenseState {
  if (state.status !== 'idle') return state;
  return { ...state, status: 'running', lastAction: null };
}

function nextPoint(
  point: TowerDefensePoint,
  direction: TowerDefenseDirection,
): TowerDefensePoint {
  if (direction === 'up') return { x: point.x, y: point.y - 1 };
  if (direction === 'down') return { x: point.x, y: point.y + 1 };
  if (direction === 'left') return { x: point.x - 1, y: point.y };
  return { x: point.x + 1, y: point.y };
}

function heroPointBlocked(point: TowerDefensePoint, state: TowerDefenseState): boolean {
  if (
    point.x < 0 || point.x >= TOWER_DEFENSE_WIDTH ||
    point.y < 0 || point.y >= TOWER_DEFENSE_HEIGHT
  ) return true;
  if (TOWER_DEFENSE_PATH.some((entry) => pointKey(entry) === pointKey(point))) return true;
  return state.towers.some((tower) => {
    const slot = TOWER_SLOTS[tower.slotIndex];
    return slot ? pointKey(slot) === pointKey(point) : false;
  });
}

export function moveTowerDefenseHero(
  state: TowerDefenseState,
  direction: TowerDefenseDirection,
): TowerDefenseState {
  if (!canManage(state)) return state;
  const target = nextPoint(state.hero, direction);
  return {
    ...state,
    hero: {
      ...state.hero,
      direction,
      ...(heroPointBlocked(target, state) ? {} : target),
    },
  };
}

export function pauseTowerDefense(state: TowerDefenseState): TowerDefenseState {
  if (state.status !== 'running' && state.status !== 'intermission') return state;
  return { ...state, status: 'paused', resumeStatus: state.status };
}

export function resumeTowerDefense(state: TowerDefenseState): TowerDefenseState {
  if (state.status !== 'paused') return state;
  return { ...state, status: state.resumeStatus ?? 'running', resumeStatus: null };
}

export function heroUpgradeCost(level: number): number {
  return level >= HERO_MAX_LEVEL ? 0 : 80 * level;
}

export function upgradeTowerDefenseHero(state: TowerDefenseState): TowerDefenseState {
  const cost = heroUpgradeCost(state.hero.level);
  if (!cost || state.credits < cost || !canManage(state)) return state;
  const level = state.hero.level + 1;
  return {
    ...state,
    credits: state.credits - cost,
    hero: {
      ...state.hero,
      level,
      attack: state.hero.attack + 2,
      range: state.hero.range + (level === 3 || level === 5 ? 1 : 0),
    },
  };
}

export function upgradeTowerDefensePlant(state: TowerDefenseState): TowerDefenseActionResult {
  if (!canManage(state)) {
    return makeFeedback(state, false, 'invalid_status', '当前状态不能购买或升级绿植。');
  }
  const cost = plantUpgradeCost(state.plantLevel);
  if (!cost) return makeFeedback(state, false, 'plant_max_level', '绿植已经升到最高等级。');
  if (state.credits < cost) {
    return makeFeedback(state, false, 'insufficient_credits', `还差 ${cost - state.credits} 金币才能升级绿植。`);
  }
  const level = state.plantLevel + 1;
  return makeFeedback(
    { ...state, credits: state.credits - cost, plantLevel: level },
    true,
    'ok',
    `绿植升到 ${level} 级，每次产出 ${plantIncomePerPayout(level)} 金币。`,
  );
}

function createRandomShop(
  seed: number,
  firstOfferId: number,
  focus: TowerType,
): { shop: TowerShopOffer[]; seed: number; nextOfferId: number } {
  const shop: TowerShopOffer[] = [];
  let nextSeed = seed;
  let nextOfferId = firstOfferId;
  while (shop.length < TOWER_FOCUSED_ORDER_INDEX) {
    const generated = randomOffer(nextSeed, nextOfferId);
    shop.push(generated.offer);
    nextSeed = generated.seed;
    nextOfferId += 1;
  }
  shop.push(focusedOffer(focus, nextOfferId));
  nextOfferId += 1;
  return { shop, seed: nextSeed, nextOfferId };
}

export function refreshTowerDefenseShop(state: TowerDefenseState): TowerDefenseActionResult {
  if (!canManage(state)) {
    return makeFeedback(state, false, 'invalid_status', '当前状态不能刷新零件商店。');
  }
  if (state.credits < TOWER_SHOP_REFRESH_COST) {
    return makeFeedback(
      state,
      false,
      'insufficient_credits',
      `刷新商店需要 ${TOWER_SHOP_REFRESH_COST} 金币。`,
    );
  }
  const generated = createRandomShop(state.rngSeed, state.nextOfferId, state.shopFocus);
  return makeFeedback(
    {
      ...state,
      credits: state.credits - TOWER_SHOP_REFRESH_COST,
      shop: generated.shop,
      rngSeed: generated.seed,
      nextOfferId: generated.nextOfferId,
    },
    true,
    'ok',
    `已花费 ${TOWER_SHOP_REFRESH_COST} 金币刷新零件。`,
  );
}

export function setTowerShopFocus(
  state: TowerDefenseState,
  type: TowerType,
): TowerDefenseActionResult {
  if (!canManage(state)) {
    return makeFeedback(state, false, 'invalid_status', '当前状态不能调整定向订货。');
  }
  if (!TOWER_TYPES.includes(type)) {
    return makeFeedback(state, false, 'invalid_tower_type', '找不到这种办公用品。');
  }
  const currentIndex = state.shop.findIndex((offer) => offer.source === 'focused');
  const focusIndex = currentIndex >= 0 ? currentIndex : TOWER_FOCUSED_ORDER_INDEX;
  if (state.shopFocus === type) {
    return makeFeedback(
      state,
      true,
      'ok',
      `定向订货已经是${TOWER_DEFINITIONS[type].name}。`,
    );
  }
  const shop = state.shop.slice();
  const soldOut = Boolean(shop[focusIndex]?.soldOut);
  // A free preference change must never refill a bought slot. The last offer
  // stays as a receipt; the new type is applied by createRandomShop on refresh.
  if (!soldOut) shop[focusIndex] = focusedOffer(type, state.nextOfferId);
  return makeFeedback(
    {
      ...state,
      shop,
      shopFocus: type,
      nextOfferId: state.nextOfferId + (soldOut ? 0 : 1),
    },
    true,
    'ok',
    soldOut
      ? `已预约${TOWER_DEFINITIONS[type].name}；此格已售罄，花费 ${TOWER_SHOP_REFRESH_COST} 金币刷新后补货。`
      : `定向订货已切换为${TOWER_DEFINITIONS[type].name}，价格包含加急服务费。`,
  );
}

function addAndAutoMerge(
  inventory: TowerInventoryItem[],
  incoming: TowerInventoryItem,
): { inventory: TowerInventoryItem[]; finalItem: TowerInventoryItem } {
  let nextInventory = inventory.slice();
  let merged = incoming;
  while (merged.tier < TOWER_MAX_LEVEL) {
    const matches = nextInventory
      .filter((item) => item.type === merged.type && item.tier === merged.tier)
      .slice(0, 2);
    if (matches.length < 2) break;
    const removedIds = new Set(matches.map((item) => item.id));
    nextInventory = nextInventory.filter((item) => !removedIds.has(item.id));
    merged = {
      ...merged,
      tier: (merged.tier + 1) as TowerTier,
      invested: merged.invested + matches.reduce((sum, item) => sum + item.invested, 0),
    };
  }
  return { inventory: [...nextInventory, merged], finalItem: merged };
}

export function buyTowerShopOffer(
  state: TowerDefenseState,
  offerId: string,
): TowerDefenseActionResult {
  if (!canManage(state)) {
    return makeFeedback(state, false, 'invalid_status', '当前状态不能购买零件。');
  }
  const offerIndex = state.shop.findIndex((offer) => offer.id === offerId);
  const offer = state.shop[offerIndex];
  if (!offer || offer.soldOut) {
    return makeFeedback(state, false, 'shop_offer_missing', '这个零件已经不在商店里了。');
  }
  if (state.credits < offer.cost) {
    return makeFeedback(state, false, 'insufficient_credits', `还差 ${offer.cost - state.credits} 金币。`);
  }

  const item: TowerInventoryItem = {
    id: `item-${state.nextItemId}`,
    type: offer.type,
    tier: offer.tier,
    invested: offer.cost,
  };
  const merged = addAndAutoMerge(state.inventory, item);
  if (merged.inventory.length > TOWER_INVENTORY_CAPACITY) {
    return makeFeedback(state, false, 'inventory_full', '背包已满，请部署、合成或出售后再购买。');
  }

  const shop = state.shop.map((entry, index) => index === offerIndex ? { ...entry, soldOut: true } : entry);
  const didMerge = merged.finalItem.tier > offer.tier;
  return makeFeedback(
    {
      ...state,
      credits: state.credits - offer.cost,
      inventory: merged.inventory,
      shop,
      nextItemId: state.nextItemId + 1,
    },
    true,
    'ok',
    didMerge
      ? `${TOWER_DEFINITIONS[offer.type].name}零件自动合成为 ${merged.finalItem.tier} 阶。`
      : `已购买 1 阶${TOWER_DEFINITIONS[offer.type].name}零件。`,
  );
}

export function deployInventoryTower(
  state: TowerDefenseState,
  itemId: string,
  slotIndex: number,
): TowerDefenseActionResult {
  if (!canManage(state)) {
    return makeFeedback(state, false, 'invalid_status', '当前状态不能部署工位塔。');
  }
  const slot = TOWER_SLOTS[slotIndex];
  if (!slot) return makeFeedback(state, false, 'invalid_slot', '这个工位不能部署。');
  if (state.towers.some((tower) => tower.slotIndex === slotIndex)) {
    return makeFeedback(state, false, 'slot_occupied', '这个工位已经放置了办公用品。');
  }
  if (pointKey(state.hero) === pointKey(slot)) {
    return makeFeedback(state, false, 'hero_blocking', '角色正站在这个工位，请先移动。');
  }
  const item = state.inventory.find((entry) => entry.id === itemId);
  if (!item) return makeFeedback(state, false, 'inventory_item_missing', '背包里找不到这个零件。');
  if (item.tier < 2) {
    return makeFeedback(state, false, 'tier_not_deployable', '1 阶只是零件，三个同类零件合成到 2 阶后才能部署。');
  }
  return makeFeedback(
    {
      ...state,
      inventory: state.inventory.filter((entry) => entry.id !== itemId),
      towers: [
        ...state.towers,
        {
          id: `tower-${item.id}`,
          slotIndex,
          type: item.type,
          level: item.tier,
          cooldown: 0,
          invested: item.invested,
        },
      ],
    },
    true,
    'ok',
    `${item.tier} 阶${TOWER_DEFINITIONS[item.type].name}已部署。`,
  );
}

export function mergeDeployedTower(
  state: TowerDefenseState,
  slotIndex: number,
): TowerDefenseActionResult {
  if (!canManage(state)) {
    return makeFeedback(state, false, 'invalid_status', '当前状态不能合成场上的工位塔。');
  }
  const tower = state.towers.find((entry) => entry.slotIndex === slotIndex);
  if (!tower) return makeFeedback(state, false, 'tower_missing', '这个工位没有可合成的塔。');
  if (tower.level >= TOWER_MAX_LEVEL) {
    return makeFeedback(state, false, 'tower_max_level', '这座工位塔已经升到最高阶。');
  }
  const materials = state.inventory
    .filter((item) => item.type === tower.type && item.tier === tower.level)
    .slice(0, 2);
  if (materials.length < 2) {
    return makeFeedback(
      state,
      false,
      'merge_materials_missing',
      `还需要 ${2 - materials.length} 个同类 ${tower.level} 阶办公用品才能合成。`,
    );
  }
  const materialIds = new Set(materials.map((item) => item.id));
  const level = (tower.level + 1) as TowerTier;
  return makeFeedback(
    {
      ...state,
      inventory: state.inventory.filter((item) => !materialIds.has(item.id)),
      towers: state.towers.map((entry) => entry.slotIndex === slotIndex
        ? {
          ...entry,
          level,
          cooldown: 0,
          invested: entry.invested + materials.reduce((sum, item) => sum + item.invested, 0),
        }
        : entry),
    },
    true,
    'ok',
    `${TOWER_DEFINITIONS[tower.type].name}合成为 ${level} 阶。`,
  );
}

function sellRefund(invested: number): number {
  return Math.max(0, Math.floor(invested * TOWER_SELL_REFUND_RATE));
}

export function sellInventoryTower(
  state: TowerDefenseState,
  itemId: string,
): TowerDefenseActionResult {
  if (!canManage(state)) {
    return makeFeedback(state, false, 'invalid_status', '当前状态不能出售背包物品。');
  }
  const item = state.inventory.find((entry) => entry.id === itemId);
  if (!item) return makeFeedback(state, false, 'inventory_item_missing', '这个背包物品已经不存在。');
  const refund = sellRefund(item.invested);
  return makeFeedback(
    {
      ...state,
      credits: state.credits + refund,
      inventory: state.inventory.filter((entry) => entry.id !== itemId),
    },
    true,
    'ok',
    `已出售${TOWER_DEFINITIONS[item.type].name}，返还 ${refund} 金币。`,
  );
}

export function sellDeployedTower(
  state: TowerDefenseState,
  slotIndex: number,
): TowerDefenseActionResult {
  if (!canManage(state)) {
    return makeFeedback(state, false, 'invalid_status', '当前状态不能出售工位塔。');
  }
  const tower = state.towers.find((entry) => entry.slotIndex === slotIndex);
  if (!tower) return makeFeedback(state, false, 'tower_missing', '这个工位塔已经不存在。');
  const refund = sellRefund(tower.invested);
  return makeFeedback(
    {
      ...state,
      credits: state.credits + refund,
      towers: state.towers.filter((entry) => entry.slotIndex !== slotIndex),
    },
    true,
    'ok',
    `已出售${TOWER_DEFINITIONS[tower.type].name}，返还 ${refund} 金币。`,
  );
}

/**
 * Legacy API: building now means deploying a matching merged item. It never buys
 * or upgrades a tower with credits, so old callers cannot bypass the merge loop.
 */
export function buildTower(
  state: TowerDefenseState,
  slotIndex: number,
  type: TowerType,
): TowerDefenseState {
  const item = state.inventory.find((entry) => entry.type === type && entry.tier >= 2);
  if (!item) return state;
  const result = deployInventoryTower(state, item.id, slotIndex);
  return result.ok ? result.state : state;
}

/** Paid tower upgrades were removed; two matching field materials are required. */
export function towerUpgradeCost(_tower: TowerDefenseTower): number {
  return 0;
}

/** Legacy API: upgrades now use the same field merge rule as the new UI. */
export function upgradeTower(
  state: TowerDefenseState,
  slotIndex: number,
): TowerDefenseState {
  const result = mergeDeployedTower(state, slotIndex);
  return result.ok ? result.state : state;
}

/** Legacy API retained as a wrapper around the duplicate-safe field sale. */
export function sellTower(
  state: TowerDefenseState,
  slotIndex: number,
): TowerDefenseState {
  const result = sellDeployedTower(state, slotIndex);
  return result.ok ? result.state : state;
}

function enemyPoint(enemy: TowerDefenseEnemy): TowerDefensePoint {
  return TOWER_DEFENSE_PATH[enemy.pathIndex] ?? TOWER_DEFENSE_PATH[0];
}

function targetIndex(
  enemies: TowerDefenseEnemy[],
  from: TowerDefensePoint,
  range: number,
): number {
  let bestIndex = -1;
  for (let index = 0; index < enemies.length; index += 1) {
    const enemy = enemies[index];
    if (enemy.hp <= 0 || distance(from, enemyPoint(enemy)) > range) continue;
    if (bestIndex < 0 || enemy.pathIndex > enemies[bestIndex].pathIndex) bestIndex = index;
  }
  return bestIndex;
}

interface DamageOptions {
  area?: boolean;
  armorPiercing?: number;
  trueDamage?: boolean;
}

function damageEnemy(
  enemy: TowerDefenseEnemy,
  damage: number,
  options: DamageOptions = {},
): TowerDefenseEnemy {
  const vulnerability = enemy.shredTicks > 0 ? enemy.shredStacks : 0;
  const rawDamage = Math.max(0, damage) + vulnerability;
  const broken = (enemy.armorBreakTicks ?? 0) > 0 ? (enemy.armorBreakPoints ?? 0) : 0;
  const armor = options.trueDamage ? 0 : Math.max(0, enemy.armor - broken - (options.armorPiercing ?? 0));
  let dealt = rawDamage > 0 ? Math.max(1, rawDamage - armor) : 0;
  if (!options.area && enemy.singleTargetDamageCap !== null) {
    dealt = Math.min(dealt, enemy.singleTargetDamageCap);
  }
  return { ...enemy, hp: enemy.hp - dealt };
}

function collectDefeated(state: TowerDefenseState): TowerDefenseState {
  const defeated = state.enemies.filter((enemy) => enemy.hp <= 0);
  if (defeated.length === 0) return state;
  return {
    ...state,
    enemies: state.enemies.filter((enemy) => enemy.hp > 0),
    credits: state.credits + defeated.reduce((sum, enemy) => sum + enemy.reward, 0),
    score: state.score + defeated.reduce((sum, enemy) => sum + enemy.score, 0),
    defeated: state.defeated + defeated.length,
  };
}

function makeEffect(
  tick: number,
  index: number,
  source: TowerCombatSource,
  from: TowerDefensePoint,
  to: TowerDefensePoint,
  targetEnemyIds: string[],
  technique?: TowerCombatTechnique,
): TowerCombatEffect {
  return {
    id: `effect-${tick}-${index}`,
    tick,
    source,
    from: { x: from.x, y: from.y },
    to: { x: to.x, y: to.y },
    targetEnemyIds,
    ...(technique ? { technique } : {}),
  };
}

/** Shared hard-control resistance prevents several towers from permanently locking an enemy. */
function controlEnemy(enemy: TowerDefenseEnemy, kind: 'freezeTicks' | 'rootTicks' | 'stunTicks', ticks: number): TowerDefenseEnemy {
  if ((enemy.controlImmunityTicks ?? 0) > 0 || enemy.hp <= 0) return enemy;
  return { ...enemy, [kind]: enemy.boss ? 1 : ticks, controlImmunityTicks: enemy.boss ? 18 : 12 };
}

export function triggerFocusPulse(state: TowerDefenseState): TowerDefenseState {
  if (state.status !== 'running' || state.hero.pulseCooldown > 0) return state;
  const range = state.hero.range + 1;
  const targets = state.enemies.filter(
    (enemy) => enemy.hp > 0 && distance(state.hero, enemyPoint(enemy)) <= range,
  );
  const primary = targets.reduce<TowerDefenseEnemy | null>(
    (best, enemy) => !best || enemy.pathIndex > best.pathIndex ? enemy : best,
    null,
  );
  if (!primary) return state;
  const targetIds = new Set(targets.map((enemy) => enemy.id));
  return collectDefeated({
    ...state,
    hero: { ...state.hero, pulseCooldown: 20, lastPulseTick: state.tick },
    effects: [makeEffect(
      state.tick,
      0,
      'pulse',
      state.hero,
      enemyPoint(primary),
      targets.map((enemy) => enemy.id),
    )],
    enemies: state.enemies.map((enemy) =>
      targetIds.has(enemy.id) ? damageEnemy(enemy, state.hero.attack * 2, { area: true }) : enemy,
    ),
  });
}

function runAttacks(state: TowerDefenseState): TowerDefenseState {
  let enemies = state.enemies.map((enemy) => ({ ...enemy }));
  const effects: TowerCombatEffect[] = [];
  let hero = {
    ...state.hero,
    autoCooldown: Math.max(0, state.hero.autoCooldown - 1),
    pulseCooldown: Math.max(0, state.hero.pulseCooldown - 1),
  };
  if (hero.autoCooldown === 0) {
    const index = targetIndex(enemies, hero, hero.range);
    const target = enemies[index];
    if (target) {
      effects.push(makeEffect(state.tick, effects.length, 'hero', hero, enemyPoint(target), [target.id]));
      enemies[index] = damageEnemy(target, hero.attack);
      hero = { ...hero, autoCooldown: Math.max(2, 4 - Math.floor(hero.level / 2)) };
    }
  }

  const towers = state.towers.map((tower) => {
    const nextTower = { ...tower, cooldown: Math.max(0, tower.cooldown - 1) };
    if (nextTower.cooldown > 0) return nextTower;
    const definition = TOWER_DEFINITIONS[tower.type];
    const origin = TOWER_SLOTS[tower.slotIndex];
    if (!origin) return nextTower;
    const range = definition.range + Math.floor((tower.level - 1) / 2);
    const index = targetIndex(enemies, origin, range);
    const target = enemies[index];
    if (!target) return nextTower;

    if (tower.type === 'single') {
      effects.push(makeEffect(state.tick, effects.length, tower.type, origin, enemyPoint(target), [target.id], 'pierce'));
      const broken = { ...target,
        armorBreakPoints: Math.max(target.armorBreakPoints ?? 0, tower.level === 3 ? 2 : 1),
        armorBreakTicks: Math.max(target.armorBreakTicks ?? 0, tower.level === 3 ? 9 : 6) };
      enemies[index] = damageEnemy(broken, tower.level === 3 ? 7 : 4);
      return { ...nextTower, cooldown: tower.level === 3 ? 2 : 3 };
    }

    if (tower.type === 'push') {
      const affected = tower.level === 3
        ? [index, ...enemies.map((enemy, candidate) => candidate !== index && enemy.hp > 0 && Math.abs(enemy.pathIndex - target.pathIndex) <= 2 ? candidate : -1).filter((candidate) => candidate >= 0)].slice(0, 3)
        : [index];
      const anchor = Math.max(0, target.pathIndex - (tower.level === 3 ? 2 : 1));
      for (const candidate of affected) {
        const enemy = enemies[candidate];
        const damaged = damageEnemy(enemy, tower.level === 3 ? 4 : 2, { area: tower.level === 3 });
        // Boss cannot be dragged, and no enemy is ever moved forwards by a taunt.
        const pathIndex = enemy.boss ? enemy.pathIndex : Math.min(enemy.pathIndex, anchor);
        enemies[candidate] = controlEnemy({ ...damaged, pathIndex }, 'stunTicks', tower.level === 3 ? 2 : 1);
      }
      effects.push(makeEffect(state.tick, effects.length, tower.type, origin, enemyPoint(target), affected.map((candidate) => enemies[candidate].id), tower.level === 3 ? 'taunt' : 'stun'));
      return { ...nextTower, cooldown: 8 };
    }

    if (tower.type === 'shred') {
      const affected = tower.level === 3
        ? [index, ...enemies.map((enemy, candidate) => candidate !== index && enemy.hp > 0 && Math.abs(enemy.pathIndex - target.pathIndex) <= 1 ? candidate : -1).filter((candidate) => candidate >= 0)].slice(0, 3)
        : [index];
      let executed = false;
      for (const candidate of affected) {
        const enemy = enemies[candidate];
        const damaged = damageEnemy(enemy, tower.level === 3 ? 4 : 2, { area: tower.level === 3, trueDamage: enemy.archetype === 'basic' });
        const execute = !enemy.boss && damaged.hp > 0 && damaged.hp <= enemy.maxHp * (tower.level === 3 ? .25 : .15);
        executed ||= execute;
        enemies[candidate] = { ...damaged, hp: execute ? 0 : damaged.hp,
          shredTicks: Math.max(damaged.shredTicks, tower.level === 3 ? 14 : 10),
          shredStacks: Math.min(5, damaged.shredStacks + (tower.level === 3 ? 2 : 1)) };
      }
      effects.push(makeEffect(state.tick, effects.length, tower.type, origin, enemyPoint(target), affected.map((candidate) => enemies[candidate].id), executed ? 'execute' : 'vulnerable'));
      return { ...nextTower, cooldown: 4 };
    }

    const targetPathIndex = target.pathIndex;
    const affectedIndexes: number[] = [];
    for (let enemyIndex = 0; enemyIndex < enemies.length; enemyIndex += 1) {
      const enemy = enemies[enemyIndex];
      const point = enemyPoint(enemy);
      const center = enemyPoint(target);
      const previousPoint = TOWER_DEFENSE_PATH[target.pathIndex > 0 ? target.pathIndex - 1 : 1];
      const sameLaserLine = previousPoint?.y === center.y ? point.y === center.y : point.x === center.x;
      const inArea = tower.type === 'splash' && tower.level === 2
        ? sameLaserLine && distance(point, center) <= 2
        : Math.abs(enemy.pathIndex - targetPathIndex) <= 1;
      if (enemy.hp > 0 && inArea) {
        affectedIndexes.push(enemyIndex);
      }
    }
    effects.push(makeEffect(
      state.tick,
      effects.length,
      tower.type,
      origin,
      enemyPoint(target),
      affectedIndexes.map((enemyIndex) => enemies[enemyIndex].id),
      tower.type === 'slow'
        ? ((target.controlImmunityTicks ?? 0) === 0 ? (tower.level === 3 ? 'root' : 'freeze') : undefined)
        : (tower.level === 3 ? 'true-damage' : 'pierce'),
    ));
    if (tower.type === 'slow') {
      for (const enemyIndex of affectedIndexes) {
        const damaged = damageEnemy(
          enemies[enemyIndex],
          tower.level === 3 ? 4 : 2,
          { area: true },
        );
        enemies[enemyIndex] = {
          ...damaged,
          slowTicks: Math.max(damaged.slowTicks, tower.level === 3 ? 9 : 7),
        };
      }
      enemies[index] = controlEnemy(enemies[index], tower.level === 3 ? 'rootTicks' : 'freezeTicks', tower.level === 3 ? 3 : 2);
      return { ...nextTower, cooldown: 4 };
    }
    for (const enemyIndex of affectedIndexes) {
      enemies[enemyIndex] = damageEnemy(
        enemies[enemyIndex],
        tower.level === 3 ? 6 : 3,
        { area: true, armorPiercing: TOWER_PRINTER_ARMOR_PIERCE, trueDamage: tower.level === 3 },
      );
    }
    return { ...nextTower, cooldown: 5 };
  });
  return collectDefeated({ ...state, hero, towers, enemies, effects });
}

function spawnEnemy(state: TowerDefenseState, tick: number): TowerDefenseState {
  if (state.spawnQueue.length === 0 || tick < state.nextSpawnAt) return state;
  const [spawn, ...spawnQueue] = state.spawnQueue;
  if (!spawn) return state;
  return {
    ...state,
    spawnQueue,
    nextSpawnAt: tick + (
      spawn.spawnDelayTicks ??
      TOWER_ROUND_CONFIGS.find((round) => round.wave === state.wave)?.spawnIntervalTicks ??
      8
    ),
    nextEnemyId: state.nextEnemyId + 1,
    enemies: [
      ...state.enemies,
      {
        id: `enemy-${state.nextEnemyId}`,
        name: spawn.name,
        pathIndex: 0,
        hp: spawn.hp,
        maxHp: spawn.hp,
        speedTicks: spawn.speedTicks,
        slowTicks: 0,
        shredTicks: 0,
        shredStacks: 0,
        archetype: spawn.archetype,
        armor: spawn.armor,
        singleTargetDamageCap: spawn.singleTargetDamageCap,
        reward: spawn.reward,
        score: spawn.score,
        coreDamage: spawn.coreDamage,
        boss: Boolean(spawn.boss),
      },
    ],
  };
}

function moveEnemies(state: TowerDefenseState, tick: number): TowerDefenseState {
  let coreDamage = 0;
  let breached = state.breached;
  const enemies: TowerDefenseEnemy[] = [];
  for (const enemy of state.enemies) {
    const slowed = enemy.slowTicks > 0;
    const slowTicks = Math.max(0, enemy.slowTicks - 1);
    const shredTicks = Math.max(0, enemy.shredTicks - 1);
    const controlled = (enemy.freezeTicks ?? 0) > 0 || (enemy.rootTicks ?? 0) > 0 || (enemy.stunTicks ?? 0) > 0;
    const armorBreakTicks = Math.max(0, (enemy.armorBreakTicks ?? 0) - 1);
    const nextEnemy = {
      ...enemy,
      slowTicks,
      shredTicks,
      shredStacks: shredTicks > 0 ? enemy.shredStacks : 0,
      armorBreakTicks,
      armorBreakPoints: armorBreakTicks > 0 ? (enemy.armorBreakPoints ?? 0) : 0,
      freezeTicks: Math.max(0, (enemy.freezeTicks ?? 0) - 1),
      rootTicks: Math.max(0, (enemy.rootTicks ?? 0) - 1),
      stunTicks: Math.max(0, (enemy.stunTicks ?? 0) - 1),
      controlImmunityTicks: Math.max(0, (enemy.controlImmunityTicks ?? 0) - 1),
    };
    const movementInterval = enemy.speedTicks + (slowed ? 2 : 0);
    if (controlled || tick % movementInterval !== 0) {
      enemies.push(nextEnemy);
      continue;
    }
    if (enemy.pathIndex >= TOWER_DEFENSE_PATH.length - 1) {
      coreDamage += enemy.coreDamage;
      breached += 1;
      continue;
    }
    enemies.push({ ...nextEnemy, pathIndex: enemy.pathIndex + 1 });
  }
  return { ...state, enemies, breached, coreHp: Math.max(0, state.coreHp - coreDamage) };
}

function applyPlantIncome(state: TowerDefenseState): TowerDefenseState {
  if (state.plantLevel <= 0) return { ...state, plantIncomeTick: 0 };
  const progress = state.plantIncomeTick + 1;
  if (progress < TOWER_PLANT_INCOME_INTERVAL) {
    return { ...state, plantIncomeTick: progress };
  }
  return {
    ...state,
    plantIncomeTick: 0,
    credits: state.credits + plantIncomePerPayout(state.plantLevel),
  };
}

export function stepTowerDefense(state: TowerDefenseState): TowerDefenseState {
  if (state.status !== 'running') return state;
  const tick = state.tick + 1;
  let next = applyPlantIncome({ ...state, tick, effects: [] });
  next = spawnEnemy(next, tick);
  next = runAttacks(next);
  next = moveEnemies(next, tick);
  if (next.coreHp <= 0) return { ...next, status: 'lost' };
  if (next.spawnQueue.length === 0 && next.enemies.length === 0) {
    const waveBonus = next.wave * 300;
    return next.wave >= TOWER_DEFENSE_WAVES
      ? { ...next, status: 'won', score: next.score + waveBonus }
      : {
        ...next,
        status: 'intermission',
        credits: next.credits + TOWER_INTERMISSION_CREDIT_BONUS,
        score: next.score + waveBonus,
      };
  }
  return next;
}

export function startNextTowerDefenseWave(state: TowerDefenseState): TowerDefenseState {
  if (state.status !== 'intermission' || state.wave >= TOWER_DEFENSE_WAVES) return state;
  const wave = state.wave + 1;
  return {
    ...state,
    status: 'running',
    wave,
    spawnQueue: waveSpawns(wave),
    nextSpawnAt: state.tick + 1,
    effects: [],
  };
}
