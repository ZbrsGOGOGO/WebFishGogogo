export const TOWER_DEFENSE_WIDTH = 12;
export const TOWER_DEFENSE_HEIGHT = 8;
export const TOWER_DEFENSE_WAVES = 3;
export const TOWER_DEFENSE_CORE_HP = 10;
export const HERO_MAX_LEVEL = 5;
export const TOWER_MAX_LEVEL = 3;

export type TowerDefenseStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'intermission'
  | 'won'
  | 'lost';
export type TowerDefenseDirection = 'up' | 'down' | 'left' | 'right';
export type TowerType = 'single' | 'slow' | 'splash';

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
  reward: number;
  score: number;
  coreDamage: number;
  boss: boolean;
}

export interface TowerDefenseTower {
  id: string;
  slotIndex: number;
  type: TowerType;
  level: number;
  cooldown: number;
  invested: number;
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
}

export interface TowerDefinition {
  type: TowerType;
  name: string;
  mark: string;
  description: string;
  cost: number;
  range: number;
}

export const TOWER_DEFINITIONS: Record<TowerType, TowerDefinition> = {
  single: {
    type: 'single',
    name: '订书机',
    mark: '订',
    description: '高频锁定最靠近核心的单个目标。',
    cost: 60,
    range: 3,
  },
  slow: {
    type: 'slow',
    name: '咖啡机',
    mark: '咖',
    description: '范围泼洒热咖啡，让附近目标在走廊里慢下来。',
    cost: 75,
    range: 3,
  },
  splash: {
    type: 'splash',
    name: '打印机',
    mark: '印',
    description: '攻击目标与附近的待办，适合处理拥堵。',
    cost: 90,
    range: 2,
  },
};

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
    return Array.from({ length: 5 }, () => ({
      name: '待办便签', hp: 7, speedTicks: 4, reward: 18, score: 100, coreDamage: 1,
    }));
  }
  if (wave === 2) {
    return Array.from({ length: 7 }, (_, index) => ({
      name: index % 3 === 2 ? '加急邮件' : '催办邮件',
      hp: index % 3 === 2 ? 12 : 9,
      speedTicks: index % 3 === 2 ? 3 : 4,
      reward: index % 3 === 2 ? 28 : 21,
      score: index % 3 === 2 ? 140 : 110,
      coreDamage: 1,
    }));
  }
  return [
    ...Array.from({ length: 8 }, (_, index) => ({
      name: index % 2 === 0 ? '临时会议' : '重点议题',
      hp: index % 2 === 0 ? 12 : 15,
      speedTicks: 4,
      reward: index % 2 === 0 ? 24 : 30,
      score: index % 2 === 0 ? 120 : 150,
      coreDamage: 1,
    })),
    {
      name: '终审会议', hp: 36, speedTicks: 5, reward: 80, score: 400, coreDamage: 3, boss: true,
    },
  ];
}

function pointKey(point: TowerDefensePoint): string {
  return `${point.x}:${point.y}`;
}

function distance(a: TowerDefensePoint, b: TowerDefensePoint): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function createTowerDefenseState(): TowerDefenseState {
  return {
    status: 'idle',
    resumeStatus: null,
    wave: 1,
    tick: 0,
    coreHp: TOWER_DEFENSE_CORE_HP,
    credits: 180,
    score: 0,
    defeated: 0,
    hero: {
      x: 1,
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
  };
}

export function startTowerDefense(state: TowerDefenseState): TowerDefenseState {
  if (state.status !== 'idle') return state;
  return { ...state, status: 'running' };
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
  return state.towers.some((tower) => pointKey(TOWER_SLOTS[tower.slotIndex]) === pointKey(point));
}

export function moveTowerDefenseHero(
  state: TowerDefenseState,
  direction: TowerDefenseDirection,
): TowerDefenseState {
  if (!['idle', 'running', 'intermission'].includes(state.status)) return state;
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
  if (
    !cost || state.credits < cost ||
    !['idle', 'running', 'intermission'].includes(state.status)
  ) return state;
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

export function buildTower(
  state: TowerDefenseState,
  slotIndex: number,
  type: TowerType,
): TowerDefenseState {
  const definition = TOWER_DEFINITIONS[type];
  if (
    !definition || !TOWER_SLOTS[slotIndex] ||
    state.towers.some((tower) => tower.slotIndex === slotIndex) ||
    pointKey(state.hero) === pointKey(TOWER_SLOTS[slotIndex]) ||
    state.credits < definition.cost ||
    !['idle', 'running', 'intermission'].includes(state.status)
  ) return state;
  return {
    ...state,
    credits: state.credits - definition.cost,
    towers: [
      ...state.towers,
      {
        id: `tower-${slotIndex}`,
        slotIndex,
        type,
        level: 1,
        cooldown: 0,
        invested: definition.cost,
      },
    ],
  };
}

export function towerUpgradeCost(tower: TowerDefenseTower): number {
  return tower.level >= TOWER_MAX_LEVEL
    ? 0
    : TOWER_DEFINITIONS[tower.type].cost * tower.level;
}

export function upgradeTower(
  state: TowerDefenseState,
  slotIndex: number,
): TowerDefenseState {
  const tower = state.towers.find((entry) => entry.slotIndex === slotIndex);
  if (!tower || !['idle', 'running', 'intermission'].includes(state.status)) return state;
  const cost = towerUpgradeCost(tower);
  if (!cost || state.credits < cost) return state;
  return {
    ...state,
    credits: state.credits - cost,
    towers: state.towers.map((entry) => entry.slotIndex === slotIndex
      ? { ...entry, level: entry.level + 1, invested: entry.invested + cost }
      : entry),
  };
}

export function sellTower(
  state: TowerDefenseState,
  slotIndex: number,
): TowerDefenseState {
  const tower = state.towers.find((entry) => entry.slotIndex === slotIndex);
  if (!tower || !['idle', 'running', 'intermission'].includes(state.status)) return state;
  return {
    ...state,
    credits: state.credits + Math.floor(tower.invested * 0.6),
    towers: state.towers.filter((entry) => entry.slotIndex !== slotIndex),
  };
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

export function triggerFocusPulse(state: TowerDefenseState): TowerDefenseState {
  if (state.status !== 'running' || state.hero.pulseCooldown > 0) return state;
  const range = state.hero.range + 1;
  const hasTarget = state.enemies.some(
    (enemy) => enemy.hp > 0 && distance(state.hero, enemyPoint(enemy)) <= range,
  );
  if (!hasTarget) return state;
  return collectDefeated({
    ...state,
    hero: { ...state.hero, pulseCooldown: 20, lastPulseTick: state.tick },
    enemies: state.enemies.map((enemy) =>
      distance(state.hero, enemyPoint(enemy)) <= range
        ? { ...enemy, hp: enemy.hp - state.hero.attack * 2 }
        : enemy,
    ),
  });
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

function runAttacks(state: TowerDefenseState): TowerDefenseState {
  let enemies = state.enemies.map((enemy) => ({ ...enemy }));
  let hero = {
    ...state.hero,
    autoCooldown: Math.max(0, state.hero.autoCooldown - 1),
    pulseCooldown: Math.max(0, state.hero.pulseCooldown - 1),
  };
  if (hero.autoCooldown === 0) {
    const index = targetIndex(enemies, hero, hero.range);
    if (index >= 0) {
      enemies[index] = { ...enemies[index], hp: enemies[index].hp - hero.attack };
      hero = { ...hero, autoCooldown: Math.max(2, 4 - Math.floor(hero.level / 2)) };
    }
  }

  const towers = state.towers.map((tower) => {
    const nextTower = { ...tower, cooldown: Math.max(0, tower.cooldown - 1) };
    if (nextTower.cooldown > 0) return nextTower;
    const definition = TOWER_DEFINITIONS[tower.type];
    const origin = TOWER_SLOTS[tower.slotIndex];
    const index = targetIndex(enemies, origin, definition.range + Math.floor((tower.level - 1) / 2));
    if (index < 0) return nextTower;
    if (tower.type === 'single') {
      enemies[index] = { ...enemies[index], hp: enemies[index].hp - (3 + tower.level * 2) };
      return { ...nextTower, cooldown: 2 };
    }
    if (tower.type === 'slow') {
      const targetPathIndex = enemies[index].pathIndex;
      enemies = enemies.map((enemy) =>
        Math.abs(enemy.pathIndex - targetPathIndex) <= 1
          ? {
            ...enemy,
            hp: enemy.hp - (1 + tower.level),
            slowTicks: Math.max(enemy.slowTicks, 5 + tower.level),
          }
          : enemy,
      );
      return { ...nextTower, cooldown: 3 };
    }
    const targetPathIndex = enemies[index].pathIndex;
    enemies = enemies.map((enemy) =>
      Math.abs(enemy.pathIndex - targetPathIndex) <= 1
        ? { ...enemy, hp: enemy.hp - (1 + tower.level * 2) }
        : enemy,
    );
    return { ...nextTower, cooldown: 4 };
  });
  return collectDefeated({ ...state, hero, towers, enemies });
}

function spawnEnemy(state: TowerDefenseState, tick: number): TowerDefenseState {
  if (state.spawnQueue.length === 0 || tick < state.nextSpawnAt) return state;
  const [spawn, ...spawnQueue] = state.spawnQueue;
  return {
    ...state,
    spawnQueue,
    nextSpawnAt: tick + 5,
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
    const nextEnemy = { ...enemy, slowTicks: Math.max(0, enemy.slowTicks - 1) };
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

export function stepTowerDefense(state: TowerDefenseState): TowerDefenseState {
  if (state.status !== 'running') return state;
  const tick = state.tick + 1;
  let next = spawnEnemy({ ...state, tick }, tick);
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
  };
}
