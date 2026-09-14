import type { WordFrontMode, WordFrontStatus } from './word-front-engine';

/** Versioned rules: old server-seeded v1 runs remain replayable after a release. */
export type WordFrontV3UnitKind = 'stapler' | 'coffee' | 'printer' | 'chair' | 'shredder' | 'zhaoyun' | 'guanyu' | 'zhangfei' | 'huangzhong' | 'machao';
export type WordFrontV3EnemyKind = 'routine' | 'mail' | 'approval' | 'bug' | 'boss';
export type WordFrontV3GearSlot = 'weapon' | 'armor' | 'mount';
export type WordFrontV3Rarity = 'white' | 'green' | 'blue' | 'purple' | 'gold';
export interface WordFrontV3Loot { id: number; slot: WordFrontV3GearSlot; rarity: WordFrontV3Rarity }
export interface WordFrontV3Interference { kind: 'stun' | 'fog'; untilTick: number; targetSlot: number | null }
export type WordFrontV3Action =
  | { tick: number; type: 'recruit' | 'start' }
  | { tick: number; type: 'deploy_basic'; card: number; slot: number }
  | { tick: number; type: 'deploy_hero'; first: number; second: number; slot: number }
  | { tick: number; type: 'merge'; from: number; to: number }
  | { tick: number; type: 'unlock'; slot: number }
  | { tick: number; type: 'buy_boost'; boost: 'attack' | 'heal' }
  | { tick: number; type: 'equip_loot'; index: number };

export interface WordFrontV3Unit { slot: number; kind: WordFrontV3UnitKind; level: number }
export interface WordFrontV3Enemy { id: number; kind: WordFrontV3EnemyKind; routeId: number; pathIndex: number; hp: number; maxHp: number; moveEvery: number; interfered: boolean }
export interface WordFrontV3State {
  version: 3; mode: WordFrontMode; chapter: number; status: WordFrontStatus;
  coreHp: number; wave: number; completedWaves: number; kills: number; score: number;
  credits: number; gold: number; drawCount: number; shovels: number; attackBoost: number;
  hand: string[]; unlocked: number[]; units: WordFrontV3Unit[]; enemies: WordFrontV3Enemy[];
  pendingSpawns: number; tick: number; seed: number; nextEnemyId: number; message: string;
  loot: WordFrontV3Loot[]; equipped: Partial<Record<WordFrontV3GearSlot, number>>;
  interference: WordFrontV3Interference | null;
  guardRemaining: number; guardClaimedIds: number[];
}

export const WORD_FRONT_V3_WIDTH = 8;
export const WORD_FRONT_V3_HEIGHT = 6;
export const WORD_FRONT_V3_CHAPTERS = [
  { id: 1, name: '入职第一天', path: [8, 9, 10, 11, 12, 20, 28, 27, 26, 25, 33, 34, 35, 36, 37, 38, 39], waste: [3, 4, 13], obstacles: [7, 16, 46], buff: [], slow: [] },
  { id: 2, name: '周会地狱', path: [0, 1, 2, 10, 18, 17, 16, 24, 32, 33, 34, 26, 27, 28, 36, 37, 38, 39], waste: [4, 11, 25, 35], obstacles: [7, 15, 45], buff: [], slow: [] },
  { id: 3, name: '需求轰炸', path: [8, 9, 10, 18, 26, 25, 24, 32, 33, 34, 35, 27, 19, 20, 21, 29, 37, 38, 39], waste: [2, 11, 28, 36], obstacles: [6, 15, 46], buff: [17], slow: [26] },
  { id: 4, name: '流程审批', path: [16, 17, 18, 10, 2, 3, 4, 12, 20, 28, 27, 26, 34, 42, 43, 44, 45, 46, 47], waste: [1, 9, 25, 35], obstacles: [7, 32, 40], buff: [19, 36], slow: [20] },
  { id: 5, name: '年终考核', path: [0, 8, 16, 17, 18, 19, 11, 3, 4, 5, 13, 21, 29, 28, 27, 35, 43, 44, 45, 46, 47], waste: [2, 10, 26, 36], obstacles: [7, 15, 40], buff: [20, 34], slow: [18, 29] },
  { id: 6, name: '大老板巡场', path: [8, 9, 10, 11, 12, 13, 21, 29, 28, 27, 26, 25, 33, 41, 42, 43, 44, 45, 46, 47], waste: [3, 4, 17, 34, 35], obstacles: [7, 16, 32], buff: [19, 36], slow: [12, 27] },
] as const;
/** Fixed per-chapter routes. V2's shipped maps and replay contract are left untouched. */
const CHAPTER_FORKS: Record<number, readonly (readonly number[])[]> = {
  5: [[8, 9, 17, 25, 33, 41, 42, 43, 44, 45, 46, 47]],
  6: [
    [0, 1, 2, 10, 18, 26, 27, 28, 29, 30, 38, 39, 47],
    [24, 25, 26, 27, 28, 29, 30, 38, 39, 47],
  ],
};
export function wordFrontV3Routes(state: Pick<WordFrontV3State, 'mode' | 'chapter'>): readonly (readonly number[])[] {
  const chapter = state.mode === 'endless' ? 6 : state.chapter;
  return [mapFor(chapter).path, ...(CHAPTER_FORKS[chapter] ?? [])];
}
export const WORD_FRONT_V3_UNITS: Record<WordFrontV3UnitKind, { name: string; glyph: string; role: string; damage: number; range: number; interval: number; color: string }> = {
  stapler: { name: '订书机', glyph: '订', role: '近距拦截', damage: 7, range: 1, interval: 1, color: 'slate' },
  coffee: { name: '咖啡机', glyph: '咖', role: '远程支援', damage: 5, range: 3, interval: 2, color: 'brown' },
  printer: { name: '打印机', glyph: '印', role: '均衡输出', damage: 6, range: 2, interval: 2, color: 'slate' },
  chair: { name: '转椅', glyph: '椅', role: '双目标突进', damage: 5, range: 2, interval: 2, color: 'orange' },
  shredder: { name: '碎纸机', glyph: '碎', role: '重甲克制', damage: 8, range: 1, interval: 2, color: 'slate' },
  zhaoyun: { name: '赵云', glyph: '赵云', role: '救援连击', damage: 10, range: 2, interval: 1, color: 'blue' },
  guanyu: { name: '关羽', glyph: '关羽', role: '首领克制', damage: 13, range: 2, interval: 2, color: 'green' },
  zhangfei: { name: '张飞', glyph: '张飞', role: '双目标喝退', damage: 8, range: 2, interval: 1, color: 'orange' },
  huangzhong: { name: '黄忠', glyph: '黄忠', role: '远距狙击', damage: 12, range: 3, interval: 2, color: 'gold' },
  machao: { name: '马超', glyph: '马超', role: '快速支援', damage: 9, range: 3, interval: 1, color: 'purple' },
};
export const WORD_FRONT_V3_GEAR_SLOTS: Record<WordFrontV3GearSlot, string> = { weapon: '武器', armor: '防具', mount: '坐骑' };
export const WORD_FRONT_V3_RARITIES: Record<WordFrontV3Rarity, { name: string; tier: number }> = {
  white: { name: '白', tier: 1 }, green: { name: '绿', tier: 2 }, blue: { name: '蓝', tier: 3 },
  purple: { name: '紫', tier: 4 }, gold: { name: '金', tier: 5 },
};
const BASIC: Record<string, WordFrontV3UnitKind> = { '订': 'stapler', '咖': 'coffee', '印': 'printer', '椅': 'chair', '碎': 'shredder' };
const HERO_PAIRS: Array<[string, string, WordFrontV3UnitKind]> = [
  ['赵', '云', 'zhaoyun'], ['关', '羽', 'guanyu'], ['张', '飞', 'zhangfei'], ['黄', '忠', 'huangzhong'], ['马', '超', 'machao'],
];
const POOL: ReadonlyArray<[string, number]> = [
  ['订', 28], ['咖', 24], ['印', 18], ['椅', 14], ['碎', 6],
  ...HERO_PAIRS.flatMap(([a, b]) => [[a, 0.8], [b, 0.8]] as Array<[string, number]>), ['铲', 2],
];
const POOL_TOTAL = POOL.reduce((sum, [, weight]) => sum + weight, 0);
const validSlot = (slot: number) => Number.isSafeInteger(slot) && slot >= 0 && slot < WORD_FRONT_V3_WIDTH * WORD_FRONT_V3_HEIGHT;
const mapFor = (chapter: number) => WORD_FRONT_V3_CHAPTERS[Math.max(0, Math.min(5, chapter - 1))]!;
const pathFor = (state: WordFrontV3State, routeId = 0) => wordFrontV3Routes(state)[routeId] ?? wordFrontV3Routes(state)[0]!;
const distance = (a: number, b: number) => Math.abs(a % 8 - b % 8) + Math.abs(Math.floor(a / 8) - Math.floor(b / 8));
function random(seed: number): [number, number] { const next = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return [next, next / 0x1_0000_0000]; }
function pick(seed: number): [number, string] {
  let value: number; [seed, value] = random(seed);
  let left = value * POOL_TOTAL;
  for (const [letter, weight] of POOL) { left -= weight; if (left < 0) return [seed, letter]; }
  return [seed, '订'];
}
function addCard(cards: string[], letter: string): number { if (letter === '铲') return 1; cards.push(letter); return 0; }
export function wordFrontV3DrawCost(drawCount: number): number { return 10 + drawCount * 2; }
export function wordFrontV3UnitForLetter(letter: string): WordFrontV3UnitKind | null { return BASIC[letter] ?? null; }
export function wordFrontV3HeroForLetters(a: string, b: string): WordFrontV3UnitKind | null {
  return HERO_PAIRS.find(([first, second]) => (a === first && b === second) || (a === second && b === first))?.[2] ?? null;
}
export function wordFrontV3Terrain(state: WordFrontV3State, slot: number): 'path' | 'waste' | 'obstacle' | 'buff' | 'slow' | 'open' {
  const map = mapFor(state.mode === 'endless' ? 6 : state.chapter);
  if (wordFrontV3Routes(state).some(path => path.includes(slot))) return (map.slow as readonly number[]).includes(slot) ? 'slow' : 'path';
  if ((map.obstacles as readonly number[]).includes(slot)) return 'obstacle';
  if ((map.waste as readonly number[]).includes(slot) && !state.unlocked.includes(slot)) return 'waste';
  if ((map.buff as readonly number[]).includes(slot)) return 'buff';
  return 'open';
}
export function createWordFrontV3State(mode: WordFrontMode = 'story', chapter = 1, seed = 20260914): WordFrontV3State {
  return { version: 3, mode, chapter: Math.max(1, Math.min(6, Math.floor(chapter))), status: 'ready', coreHp: 5,
    wave: 0, completedWaves: 0, kills: 0, score: 0, credits: 30, gold: 0, drawCount: 0, shovels: 0,
    attackBoost: 0, hand: [], unlocked: [], units: [], enemies: [], pendingSpawns: 0, tick: 0,
    seed: seed >>> 0, nextEnemyId: 1, message: '先招募五张字卡；首抽保底一组职业双字，其余按独立权重抽取。',
    loot: [], equipped: {}, interference: null, guardRemaining: 0, guardClaimedIds: [] };
}
export function applyWordFrontV3Action(state: WordFrontV3State, action: WordFrontV3Action): WordFrontV3State | null {
  if (!Number.isSafeInteger(action.tick) || action.tick !== state.tick || state.status === 'won' || state.status === 'lost') return null;
  if (action.type === 'recruit') {
    const cost = wordFrontV3DrawCost(state.drawCount);
    if (state.credits < cost || state.drawCount >= 100 || state.hand.length + 5 > 150) return null;
    let seed = state.seed, shovels = state.shovels;
    const hand = [...state.hand];
    if (state.drawCount === 0) {
      let value: number; [seed, value] = random(seed);
      const pair = HERO_PAIRS[Math.floor(value * HERO_PAIRS.length)]!;
      hand.push(pair[0], pair[1]);
    }
    for (let i = state.drawCount === 0 ? 2 : 0; i < 5; i += 1) { let letter: string; [seed, letter] = pick(seed); shovels += addCard(hand, letter); }
    return { ...state, seed, shovels, hand, credits: state.credits - cost, drawCount: state.drawCount + 1, message: `五张字卡已补齐，消耗 ${cost} 点局内经费。` };
  }
  if (action.type === 'unlock') {
    if (!validSlot(action.slot) || state.shovels < 1 || wordFrontV3Terrain(state, action.slot) !== 'waste') return null;
    return { ...state, shovels: state.shovels - 1, unlocked: [...state.unlocked, action.slot], message: '铲子已解封一块工位，当前对局内保持开放。' };
  }
  if (action.type === 'deploy_basic' || action.type === 'deploy_hero') {
    if (!validSlot(action.slot) || !['open', 'buff'].includes(wordFrontV3Terrain(state, action.slot)) || state.units.some(unit => unit.slot === action.slot)) return null;
    let kind: WordFrontV3UnitKind | null = null; let indices: number[];
    if (action.type === 'deploy_basic') {
      if (!Number.isSafeInteger(action.card) || action.card < 0 || action.card >= state.hand.length) return null;
      kind = wordFrontV3UnitForLetter(state.hand[action.card]!); indices = [action.card];
    } else {
      if (![action.first, action.second].every(Number.isSafeInteger) || action.first === action.second ||
        action.first < 0 || action.second < 0 || action.first >= state.hand.length || action.second >= state.hand.length) return null;
      kind = wordFrontV3HeroForLetters(state.hand[action.first]!, state.hand[action.second]!); indices = [action.first, action.second];
    }
    if (!kind) return null;
    return { ...state, hand: state.hand.filter((_, index) => !indices.includes(index)), units: [...state.units, { slot: action.slot, kind, level: 1 }], message: `${WORD_FRONT_V3_UNITS[kind].name}已就位。` };
  }
  if (action.type === 'merge') {
    if (!validSlot(action.from) || !validSlot(action.to) || action.from === action.to) return null;
    const source = state.units.find(unit => unit.slot === action.from), target = state.units.find(unit => unit.slot === action.to);
    if (!source || !target || source.kind !== target.kind || source.level !== target.level || target.level >= 3) return null;
    return { ...state, units: state.units.filter(unit => unit.slot !== action.from).map(unit => unit.slot === action.to ? { ...unit, level: unit.level + 1 } : unit), message: `${WORD_FRONT_V3_UNITS[target.kind].name}升为 ${target.level + 1} 阶。` };
  }
  if (action.type === 'buy_boost') {
    if (state.status !== 'running' || state.gold < 12) return null;
    if (action.boost === 'attack' && state.attackBoost < 3) return { ...state, gold: state.gold - 12, attackBoost: state.attackBoost + 1, message: '局内商人：全队输出永久提高 15%。' };
    if (action.boost === 'heal' && state.coreHp < 5) return { ...state, gold: state.gold - 12, coreHp: state.coreHp + 1, message: '局内商人：核心恢复一条命。' };
    return null;
  }
  if (action.type === 'equip_loot') {
    if (!Number.isSafeInteger(action.index) || action.index < 0 || action.index >= state.loot.length) return null;
    const item = state.loot[action.index]!;
    if (state.equipped[item.slot] === item.id) return null;
    const firstArmorEquip = item.slot === 'armor' && !state.guardClaimedIds.includes(item.id);
    return { ...state, equipped: { ...state.equipped, [item.slot]: item.id },
      guardRemaining: firstArmorEquip ? Math.min(9, state.guardRemaining + WORD_FRONT_V3_RARITIES[item.rarity].tier) : state.guardRemaining,
      guardClaimedIds: firstArmorEquip ? [...state.guardClaimedIds, item.id] : state.guardClaimedIds,
      message: `${WORD_FRONT_V3_RARITIES[item.rarity].name}品${WORD_FRONT_V3_GEAR_SLOTS[item.slot]}已在本局装备。` };
  }
  if (action.type === 'start') {
    if (state.status !== 'ready' || state.units.length === 0) return null;
    return { ...state, status: 'running', wave: 1, pendingSpawns: spawnCount(state, 1), tick: 0, message: '第一波来客进入路线。' };
  }
  return null;
}
function waveLimit(state: WordFrontV3State): number { return state.mode === 'endless' ? 30 : state.chapter + 2; }
function spawnCount(state: WordFrontV3State, wave: number): number { return Math.min(18, 3 + wave + (state.mode === 'story' ? Math.floor(state.chapter / 2) : 0)); }
function nextEnemyKind(state: WordFrontV3State, index: number): WordFrontV3EnemyKind {
  if (index === 0 && (state.mode === 'story' && state.wave === waveLimit(state) || state.mode === 'endless' && state.wave % 10 === 0)) return 'boss';
  const difficulty = state.mode === 'story' ? state.chapter : Math.ceil(state.wave / 5);
  if (difficulty >= 4 && index % 5 === 0) return 'approval';
  if (difficulty >= 3 && index % 4 === 0) return 'bug';
  if (difficulty >= 2 && index % 3 === 0) return 'mail';
  return 'routine';
}
function enemyStats(kind: WordFrontV3EnemyKind, wave: number): { hp: number; moveEvery: number; credits: number; gold: number } {
  switch (kind) {
    case 'boss': return { hp: 110 + wave * 20, moveEvery: 4, credits: 10, gold: 6 };
    case 'approval': return { hp: 28 + wave * 6, moveEvery: 4, credits: 2, gold: 2 };
    case 'bug': return { hp: 12 + wave * 3, moveEvery: 2, credits: 2, gold: 1 };
    case 'mail': return { hp: 10 + wave * 3, moveEvery: 3, credits: 1, gold: 1 };
    default: return { hp: 12 + wave * 3, moveEvery: 3, credits: 1, gold: 1 };
  }
}
export function stepWordFrontV3(state: WordFrontV3State): WordFrontV3State {
  if (state.status !== 'running') return state;
  const tick = state.tick + 1, routes = wordFrontV3Routes(state);
  let enemies = state.enemies.map(enemy => ({ ...enemy }));
  let pendingSpawns = state.pendingSpawns, nextEnemyId = state.nextEnemyId;
  let credits = state.credits, gold = state.gold, coreHp = state.coreHp, kills = state.kills;
  let seed = state.seed, guardRemaining = state.guardRemaining;
  const loot = [...state.loot];
  let interference = state.interference && state.interference.untilTick >= tick ? state.interference : null;
  let eventMessage = '';
  if (pendingSpawns > 0 && tick % 2 === 1) {
    const spawnIndex = spawnCount(state, state.wave) - pendingSpawns;
    const kind = nextEnemyKind(state, spawnIndex);
    const stats = enemyStats(kind, state.wave);
    const routeId = kind === 'boss' ? 0 : spawnIndex % routes.length;
    enemies.push({ id: nextEnemyId++, kind, routeId, pathIndex: 0, hp: stats.hp, maxHp: stats.hp, moveEvery: stats.moveEvery, interfered: false });
    pendingSpawns -= 1;
  }
  // A mail or bug disrupts once when it reaches the third tile. The effect is
  // visible, bounded and deterministic; it never hides controls or state from
  // assistive technology.
  if (!interference) {
    const source = enemies.find(enemy => !enemy.interfered && enemy.pathIndex >= 3 &&
      (enemy.kind === 'mail' || enemy.kind === 'bug'));
    if (source) {
      source.interfered = true;
      const target = [...state.units].sort((a, b) => b.level - a.level || a.slot - b.slot)[0];
      interference = { kind: source.kind === 'bug' ? 'stun' : 'fog', untilTick: tick + 2,
        targetSlot: source.kind === 'bug' ? target?.slot ?? null : null };
      eventMessage = source.kind === 'bug' ? '故障干扰：一位成员短暂停手 3 拍。' : '催办干扰：路线视野受限，全队射程短暂 -1。';
    }
  }
  for (const unit of state.units) {
    const def = WORD_FRONT_V3_UNITS[unit.kind];
    if (tick % def.interval !== 0) continue;
    if (interference?.kind === 'stun' && interference.targetSlot === unit.slot) continue;
    const mount = state.loot.find(item => item.id === state.equipped.mount);
    const rangeBonus = mount && WORD_FRONT_V3_RARITIES[mount.rarity].tier >= 3 ? 1 : 0;
    const range = Math.max(1, def.range + rangeBonus - (interference?.kind === 'fog' ? 1 : 0));
    const targets = enemies.filter(enemy => enemy.hp > 0 &&
      distance(unit.slot, pathFor(state, enemy.routeId)[enemy.pathIndex]!) <= range)
      .sort((a, b) => b.pathIndex - a.pathIndex || a.id - b.id)
      .slice(0, unit.kind === 'chair' || unit.kind === 'zhangfei' ? 2 : 1);
    for (const enemy of targets) {
      const terrainBonus = wordFrontV3Terrain(state, unit.slot) === 'buff' ? 1.15 : 1;
      const bossBonus = enemy.kind === 'boss' && (unit.kind === 'guanyu' || unit.kind === 'huangzhong') ? 1.5 : 1;
      const armorBonus = enemy.kind === 'approval' && unit.kind === 'shredder' ? 1.5 : 1;
      const weapon = state.loot.find(item => item.id === state.equipped.weapon);
      const weaponBonus = weapon ? WORD_FRONT_V3_RARITIES[weapon.rarity].tier * 0.05 : 0;
      const mountBonus = mount ? WORD_FRONT_V3_RARITIES[mount.rarity].tier * 0.02 : 0;
      enemy.hp -= Math.max(1, Math.floor(def.damage * 2 ** (unit.level - 1) * terrainBonus * bossBonus * armorBonus *
        (1 + state.attackBoost * 0.15 + weaponBonus + mountBonus)));
    }
  }
  for (const enemy of enemies.filter(item => item.hp <= 0)) {
    const reward = enemyStats(enemy.kind, state.wave);
    credits = Math.min(40, credits + reward.credits); gold += reward.gold; kills += 1;
    if (loot.length < 32 && (enemy.kind === 'boss' || enemy.kind === 'approval' && enemy.id % 2 === 0)) {
      let chance: number; [seed, chance] = random(seed);
      if (enemy.kind === 'boss' || chance < 0.35) {
        let roll: number; [seed, roll] = random(seed);
        const rarity: WordFrontV3Rarity = roll < 0.50 ? 'white' : roll < 0.78 ? 'green' :
          roll < 0.92 ? 'blue' : roll < 0.98 ? 'purple' : 'gold';
        let slotRoll: number; [seed, slotRoll] = random(seed);
        const slot: WordFrontV3GearSlot = (['weapon', 'armor', 'mount'] as const)[Math.floor(slotRoll * 3)]!;
        loot.push({ id: enemy.id, slot, rarity });
        eventMessage = `收获局内战利品：${WORD_FRONT_V3_RARITIES[rarity].name}品${WORD_FRONT_V3_GEAR_SLOTS[slot]}，在右侧装备。`;
      }
    }
  }
  enemies = enemies.filter(enemy => enemy.hp > 0);
  enemies = enemies.map(enemy => {
    const slow = wordFrontV3Terrain(state, pathFor(state, enemy.routeId)[enemy.pathIndex]!) === 'slow';
    return tick % (enemy.moveEvery + (slow ? 2 : 0)) === 0 ? { ...enemy, pathIndex: enemy.pathIndex + 1 } : enemy;
  });
  const escaped = enemies.filter(enemy => enemy.pathIndex >= pathFor(state, enemy.routeId).length).length;
  const blocked = Math.min(guardRemaining, escaped);
  guardRemaining -= blocked;
  coreHp = Math.max(0, coreHp - escaped + blocked);
  enemies = enemies.filter(enemy => enemy.pathIndex < pathFor(state, enemy.routeId).length);
  if (blocked) eventMessage = `防具替核心挡下 ${blocked} 次冲击；剩余护盾 ${guardRemaining}。`;
  const base = { ...state, tick, enemies, pendingSpawns, nextEnemyId, credits, gold, coreHp, kills, seed, loot,
    guardRemaining, interference, message: eventMessage || state.message,
    score: state.completedWaves * 100 + kills * 10 + coreHp * 20 };
  if (coreHp === 0) return { ...base, status: 'lost', message: '核心命条耗尽，护送失败。' };
  if (pendingSpawns === 0 && enemies.length === 0) {
    const completedWaves = state.wave;
    credits = Math.min(40, credits + 8);
    const score = completedWaves * 100 + kills * 10 + coreHp * 20;
    if (completedWaves >= waveLimit(state)) return { ...base, status: 'won', completedWaves, credits, score, message: '全部波次守住，护送成功。' };
    const wave = completedWaves + 1;
    return { ...base, wave, completedWaves, pendingSpawns: spawnCount(state, wave), credits, score, message: `第 ${completedWaves} 波完成；补给 8 点经费（上限 40），第 ${wave} 波即将进入。` };
  }
  return base;
}
export function replayWordFrontV3(mode: WordFrontMode, chapter: number, seed: number, actions: readonly WordFrontV3Action[], finishTick: number): WordFrontV3State | null {
  if (!Number.isSafeInteger(finishTick) || finishTick < 0 || finishTick > 3_000 || actions.length > 400) return null;
  let state = createWordFrontV3State(mode, chapter, seed);
  for (const action of actions) {
    if (!Number.isSafeInteger(action.tick) || action.tick < state.tick || action.tick > finishTick) return null;
    while (state.tick < action.tick) { if (state.status !== 'running') return null; state = stepWordFrontV3(state); }
    const next = applyWordFrontV3Action(state, action); if (!next) return null; state = next;
  }
  while (state.tick < finishTick) { if (state.status !== 'running') return null; state = stepWordFrontV3(state); }
  return state.status === 'won' || state.status === 'lost' ? state : null;
}
