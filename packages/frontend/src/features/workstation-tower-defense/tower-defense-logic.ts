export const TOWER_DEFENSE_WIDTH = 12;
export const TOWER_DEFENSE_HEIGHT = 8;
export const TOWER_DEFENSE_WAVES = 3;
export const TOWER_DEFENSE_CORE_HP = 10;
export const TOWER_DEFENSE_TICK_MS = 280;
export const HERO_MAX_LEVEL = 5;
export const TOWER_MAX_LEVEL = 3;
export const TOWER_INVENTORY_CAPACITY = 12;
export const TOWER_SHOP_SIZE = 5;
export const TOWER_SHOP_REFRESH_COST = 10;
export const TOWER_PLANT_MAX_LEVEL = 3;
export const TOWER_PLANT_INCOME_INTERVAL = 12;
export const TOWER_PLANT_UPGRADE_COSTS = [30, 50, 80] as const;

const TOWER_PLANT_INCOMES = [0, 4, 7, 11] as const;
const TOWER_SELL_REFUND_RATE = 0.6;
const DEFAULT_RNG_SEED = 0x5eed_1234;
const ENEMY_SPAWN_INTERVAL = 11;

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
export type TowerCombatSource = 'hero' | 'pulse' | TowerType;
export type TowerDefenseActionCode =
  | 'ok'
  | 'invalid_status'
  | 'insufficient_credits'
  | 'plant_max_level'
  | 'shop_offer_missing'
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
  reward: number;
  score: number;
  coreDamage: number;
  boss: boolean;
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
}

export interface TowerCombatEffect {
  id: string;
  tick: number;
  source: TowerCombatSource;
  from: TowerDefensePoint;
  to: TowerDefensePoint;
  targetEnemyIds: string[];
}

export interface TowerDefenseActionFeedback {
  ok: boolean;
  code: TowerDefenseActionCode;
  message: string;
  tick: number;
}

interface EnemySpawn {
  name: string;
  hp: number;
  speedTicks: number;
  reward: number;
  score: number;
  coreDamage: number;
  boss?: boolean;
}

export interface TowerDefenseState {
  status: TowerDefenseStatus;
  resumeStatus: 'running' | 'intermission' | null;
  wave: number;
  tick: number;
  coreHp: number;
  credits: number;
  score: number;
  defeated: number;
  hero: TowerDefenseHero;
  enemies: TowerDefenseEnemy[];
  towers: TowerDefenseTower[];
  spawnQueue: EnemySpawn[];
  nextSpawnAt: number;
  nextEnemyId: number;
  plantLevel: number;
  plantIncomeTick: number;
  shop: TowerShopOffer[];
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
    description: '高频锁定最靠近核心的单个目标。',
    cost: 18,
    partCost: 18,
    range: 3,
  },
  slow: {
    type: 'slow',
    name: '咖啡机',
    mark: '咖',
    description: '泼洒咖啡，伤害一小片待办并减慢移动。',
    cost: 20,
    partCost: 20,
    range: 3,
  },
  splash: {
    type: 'splash',
    name: '打印机',
    mark: '印',
    description: '打印风暴同时处理相邻的拥堵待办。',
    cost: 22,
    partCost: 22,
    range: 3,
  },
  push: {
    type: 'push',
    name: '转椅',
    mark: '椅',
    description: '把单个待办推回走廊前段，争取处理时间。',
    cost: 22,
    partCost: 22,
    range: 2,
  },
  shred: {
    type: 'shred',
    name: '碎纸机',
    mark: '碎',
    description: '留下易伤标记，让后续每次攻击造成额外伤害。',
    cost: 24,
    partCost: 24,
    range: 2,
  },
};

const TOWER_TYPES = Object.keys(TOWER_DEFINITIONS) as TowerType[];

export const WAVE_NAMES = ['零散待办', '催办邮件', '会议风暴'] as const;

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

function waveSpawns(wave: number): EnemySpawn[] {
  if (wave === 1) {
    return Array.from({ length: 6 }, () => ({
      name: '待办便签', hp: 12, speedTicks: 5, reward: 8, score: 100, coreDamage: 1,
    }));
  }
  if (wave === 2) {
    return Array.from({ length: 8 }, (_, index) => ({
      name: index % 3 === 2 ? '加急邮件' : '催办邮件',
      hp: index % 3 === 2 ? 44 : 36,
      speedTicks: index % 3 === 2 ? 4 : 5,
      reward: index % 3 === 2 ? 12 : 9,
      score: index % 3 === 2 ? 150 : 115,
      coreDamage: 1,
    }));
  }
  return [
    ...Array.from({ length: 10 }, (_, index) => ({
      name: index % 2 === 0 ? '临时会议' : '重点议题',
      hp: index % 2 === 0 ? 58 : 72,
      speedTicks: 5,
      reward: index % 2 === 0 ? 12 : 15,
      score: index % 2 === 0 ? 130 : 165,
      coreDamage: 1,
    })),
    {
      name: '终审会议', hp: 180, speedTicks: 6, reward: 30, score: 500, coreDamage: 3, boss: true,
    },
  ];
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
    },
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
  }));
  let nextSeed = seed;
  for (let id = 4; id <= TOWER_SHOP_SIZE; id += 1) {
    const generated = randomOffer(nextSeed, id);
    nextSeed = generated.seed;
    shop.push(generated.offer);
  }
  return { shop, seed: nextSeed, nextOfferId: TOWER_SHOP_SIZE + 1 };
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
): { shop: TowerShopOffer[]; seed: number; nextOfferId: number } {
  const shop: TowerShopOffer[] = [];
  let nextSeed = seed;
  let nextOfferId = firstOfferId;
  while (shop.length < TOWER_SHOP_SIZE) {
    const generated = randomOffer(nextSeed, nextOfferId);
    shop.push(generated.offer);
    nextSeed = generated.seed;
    nextOfferId += 1;
  }
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
  const generated = createRandomShop(state.rngSeed, state.nextOfferId);
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
  if (!offer) return makeFeedback(state, false, 'shop_offer_missing', '这个零件已经不在商店里了。');
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

  const replacement = randomOffer(state.rngSeed, state.nextOfferId);
  const shop = state.shop.map((entry, index) => index === offerIndex ? replacement.offer : entry);
  const didMerge = merged.finalItem.tier > offer.tier;
  return makeFeedback(
    {
      ...state,
      credits: state.credits - offer.cost,
      inventory: merged.inventory,
      shop,
      rngSeed: replacement.seed,
      nextItemId: state.nextItemId + 1,
      nextOfferId: state.nextOfferId + 1,
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

function damageEnemy(enemy: TowerDefenseEnemy, damage: number): TowerDefenseEnemy {
  const vulnerability = enemy.shredTicks > 0 ? enemy.shredStacks : 0;
  return { ...enemy, hp: enemy.hp - damage - vulnerability };
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
): TowerCombatEffect {
  return {
    id: `effect-${tick}-${index}`,
    tick,
    source,
    from: { x: from.x, y: from.y },
    to: { x: to.x, y: to.y },
    targetEnemyIds,
  };
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
      targetIds.has(enemy.id) ? damageEnemy(enemy, state.hero.attack * 2) : enemy,
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
      effects.push(makeEffect(state.tick, effects.length, tower.type, origin, enemyPoint(target), [target.id]));
      enemies[index] = damageEnemy(target, tower.level === 3 ? 7 : 4);
      return { ...nextTower, cooldown: tower.level === 3 ? 2 : 3 };
    }

    if (tower.type === 'push') {
      effects.push(makeEffect(state.tick, effects.length, tower.type, origin, enemyPoint(target), [target.id]));
      const pushed = Math.max(0, target.pathIndex - (target.boss ? 1 : tower.level === 3 ? 2 : 1));
      enemies[index] = { ...damageEnemy(target, tower.level === 3 ? 4 : 2), pathIndex: pushed };
      return { ...nextTower, cooldown: 6 };
    }

    if (tower.type === 'shred') {
      effects.push(makeEffect(state.tick, effects.length, tower.type, origin, enemyPoint(target), [target.id]));
      const damaged = damageEnemy(target, tower.level === 3 ? 4 : 2);
      enemies[index] = {
        ...damaged,
        shredTicks: Math.max(damaged.shredTicks, tower.level === 3 ? 14 : 10),
        shredStacks: Math.min(5, damaged.shredStacks + (tower.level === 3 ? 2 : 1)),
      };
      return { ...nextTower, cooldown: 4 };
    }

    const targetPathIndex = target.pathIndex;
    const affectedIndexes: number[] = [];
    for (let enemyIndex = 0; enemyIndex < enemies.length; enemyIndex += 1) {
      const enemy = enemies[enemyIndex];
      if (enemy.hp > 0 && Math.abs(enemy.pathIndex - targetPathIndex) <= 1) {
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
    ));
    if (tower.type === 'slow') {
      for (const enemyIndex of affectedIndexes) {
        const damaged = damageEnemy(enemies[enemyIndex], tower.level === 3 ? 4 : 2);
        enemies[enemyIndex] = {
          ...damaged,
          slowTicks: Math.max(damaged.slowTicks, tower.level === 3 ? 9 : 7),
        };
      }
      return { ...nextTower, cooldown: 4 };
    }
    for (const enemyIndex of affectedIndexes) {
      enemies[enemyIndex] = damageEnemy(enemies[enemyIndex], tower.level === 3 ? 6 : 3);
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
    nextSpawnAt: tick + ENEMY_SPAWN_INTERVAL,
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
  const enemies: TowerDefenseEnemy[] = [];
  for (const enemy of state.enemies) {
    const slowed = enemy.slowTicks > 0;
    const slowTicks = Math.max(0, enemy.slowTicks - 1);
    const shredTicks = Math.max(0, enemy.shredTicks - 1);
    const nextEnemy = {
      ...enemy,
      slowTicks,
      shredTicks,
      shredStacks: shredTicks > 0 ? enemy.shredStacks : 0,
    };
    const movementInterval = enemy.speedTicks + (slowed ? 2 : 0);
    if (tick % movementInterval !== 0) {
      enemies.push(nextEnemy);
      continue;
    }
    if (enemy.pathIndex >= TOWER_DEFENSE_PATH.length - 1) {
      coreDamage += enemy.coreDamage;
      continue;
    }
    enemies.push({ ...nextEnemy, pathIndex: enemy.pathIndex + 1 });
  }
  return { ...state, enemies, coreHp: Math.max(0, state.coreHp - coreDamage) };
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
      : { ...next, status: 'intermission', score: next.score + waveBonus };
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
    credits: state.credits + 45,
    spawnQueue: waveSpawns(wave),
    nextSpawnAt: state.tick + 1,
    effects: [],
  };
}
