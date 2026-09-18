import type { WordFrontMode, WordFrontStatus } from './word-front-engine';

/**
 * Rebuilt Zhao Yun ruleset. V1-V3 stay immutable so old ranked traces remain replayable.
 * This engine is deterministic and shared by browser play, ranked replay and room servers.
 */
export type WordFrontV4UnitKind = 'spear' | 'blade' | 'cavalry' | 'bow' |
  'zhaoyun' | 'zhangfei' | 'guanyu' | 'huangzhong' | 'machao' | 'liubei' |
  'guanping' | 'guanxing' | 'zhangbao' | 'zhangyi' | 'huangzu' | 'huanggai';
export type WordFrontV4EnemyKind = 'bandit' | 'blade' | 'spear' | 'bow' | 'cavalry' | 'shield' | 'elite' | 'boss';
export type WordFrontV4Gear = 'silver_spear' | 'serpent_spear' | 'crescent_blade' | 'sunset_bow' | 'gentleman_sword';
export type WordFrontV4Action =
  | { tick: number; type: 'recruit' | 'start' }
  | { tick: number; type: 'deploy_basic'; card: number; slot: number }
  | { tick: number; type: 'deploy_hero'; first: number; second: number; slot: number }
  | { tick: number; type: 'merge'; from: number; to: number }
  | { tick: number; type: 'unlock'; slot: number }
  | { tick: number; type: 'buy_boost'; boost: 'attack' | 'heal' | 'hero_rate' }
  | { tick: number; type: 'equip_gear'; gear: WordFrontV4Gear };

export interface WordFrontV4Unit { slot: number; kind: WordFrontV4UnitKind; level: number; gear: WordFrontV4Gear | null }
export interface WordFrontV4Enemy { id: number; kind: WordFrontV4EnemyKind; pathIndex: number; hp: number; maxHp: number; moveEvery: number; damage: number }
export interface WordFrontV4Map { id: number; key: string; name: string; description: string; path: readonly number[]; obstacles: readonly number[]; grass: readonly number[]; buffs: readonly number[] }
export interface WordFrontV4State {
  version: 4; mode: WordFrontMode; chapter: number; mapId: number; status: WordFrontStatus;
  coreHp: number; wave: number; completedWaves: number; kills: number; score: number;
  buns: number; gold: number; drawCount: number; shovels: number; attackBoost: number; heroRateBoost: boolean;
  hand: string[]; pool: Record<string, number>; unlocked: number[]; units: WordFrontV4Unit[];
  enemies: WordFrontV4Enemy[]; pendingSpawns: number; tick: number; seed: number; nextEnemyId: number;
  message: string; gear: WordFrontV4Gear[];
}

export const WORD_FRONT_V4_WIDTH = 8;
export const WORD_FRONT_V4_HEIGHT = 10;
export const WORD_FRONT_V4_MAPS: readonly WordFrontV4Map[] = [
  { id: 1, key: 'changban', name: '长坂坡回廊', description: '原型十行双阵布局，弯道密集，适合贯穿与范围单位。',
    path: [72,64,56,48,49,50,51,52,44,45,46,47,55,63,71,79], obstacles: [1,2,3,4,5,6,57,61,62,73,74,75,76,77,78], grass: [58,59,60,65,69,70], buffs: [53] },
  { id: 2, key: 'dangyang', name: '当阳桥', description: '前段双折返、末段长直线，远程单位有更稳定的输出窗口。',
    path: [72,64,56,48,40,41,42,34,26,27,28,29,30,38,46,47,55,63,71,79], obstacles: [8,9,10,17,18,33,43,57,58,66,67,73,74], grass: [49,50,51,59,60,61], buffs: [35,54] },
  { id: 3, key: 'cao-camp', name: '曹营突围', description: '路线横贯中央后急转，近战与射手需要交叉配置。',
    path: [72,73,74,66,58,50,42,34,35,36,37,29,21,22,23,31,39,47,55,63,71,79], obstacles: [1,2,8,9,16,24,32,40,48,56,64], grass: [10,11,18,19,26,27,67,68,75,76], buffs: [28,46] },
] as const;

export const WORD_FRONT_V4_UNITS: Record<WordFrontV4UnitKind, { name: string; glyph: string; grade: '蓝' | '紫' | '金' | '兵'; role: string; damage: number; range: number; interval: number; targets: number }> = {
  spear: { name: '枪兵', glyph: '枪', grade: '兵', role: '直线贯穿', damage: 7, range: 4, interval: 2, targets: 2 },
  blade: { name: '刀兵', glyph: '刀', grade: '兵', role: '近战重击', damage: 10, range: 2, interval: 2, targets: 1 },
  cavalry: { name: '骑兵', glyph: '骑', grade: '兵', role: '范围突进', damage: 7, range: 2, interval: 2, targets: 3 },
  bow: { name: '弓兵', glyph: '弓', grade: '兵', role: '远程点杀', damage: 7, range: 6, interval: 2, targets: 1 },
  zhaoyun: { name: '赵云', glyph: '赵云', grade: '金', role: '七进七出·贯穿', damage: 15, range: 4, interval: 1, targets: 3 },
  zhangfei: { name: '张飞', glyph: '张飞', grade: '金', role: '咆哮·群攻', damage: 17, range: 3, interval: 2, targets: 4 },
  guanyu: { name: '关羽', glyph: '关羽', grade: '金', role: '跳劈·首领克制', damage: 20, range: 3, interval: 2, targets: 2 },
  huangzhong: { name: '黄忠', glyph: '黄忠', grade: '金', role: '箭雨·超远程', damage: 14, range: 7, interval: 2, targets: 3 },
  machao: { name: '马超', glyph: '马超', grade: '金', role: '西凉突击', damage: 16, range: 4, interval: 1, targets: 2 },
  liubei: { name: '刘备', glyph: '刘备', grade: '金', role: '仁德·全队增益', damage: 10, range: 4, interval: 2, targets: 1 },
  guanping: { name: '关平', glyph: '关平', grade: '紫', role: '小范围震慑', damage: 11, range: 3, interval: 2, targets: 2 },
  guanxing: { name: '关兴', glyph: '关兴', grade: '紫', role: '溅射击退', damage: 12, range: 3, interval: 2, targets: 2 },
  zhangbao: { name: '张苞', glyph: '张苞', grade: '紫', role: '直线穿透', damage: 11, range: 4, interval: 2, targets: 2 },
  zhangyi: { name: '张翼', glyph: '张翼', grade: '紫', role: '过渡群攻', damage: 10, range: 3, interval: 2, targets: 3 },
  huangzu: { name: '黄祖', glyph: '黄祖', grade: '蓝', role: '远程过渡', damage: 8, range: 5, interval: 2, targets: 1 },
  huanggai: { name: '黄盖', glyph: '黄盖', grade: '蓝', role: '前排群攻', damage: 9, range: 3, interval: 2, targets: 2 },
};

export const WORD_FRONT_V4_GEARS: Record<WordFrontV4Gear, { name: string; hero: WordFrontV4UnitKind; description: string }> = {
  silver_spear: { name: '龙胆亮银枪', hero: 'zhaoyun', description: '赵云攻击额外贯穿两个目标。' },
  serpent_spear: { name: '丈八蛇矛', hero: 'zhangfei', description: '张飞攻击提高 25%。' },
  crescent_blade: { name: '青龙偃月刀', hero: 'guanyu', description: '关羽对首领伤害再提高 50%。' },
  sunset_bow: { name: '落日弓', hero: 'huangzhong', description: '黄忠射程与目标数各 +1。' },
  gentleman_sword: { name: '君子剑', hero: 'liubei', description: '刘备在场时全队伤害再提高 10%。' },
};

const BASIC: Record<string, WordFrontV4UnitKind> = { '枪': 'spear', '刀': 'blade', '骑': 'cavalry', '弓': 'bow' };
const HEROES: ReadonlyArray<[string, string, WordFrontV4UnitKind]> = [
  ['赵','云','zhaoyun'], ['张','飞','zhangfei'], ['关','羽','guanyu'], ['黄','忠','huangzhong'], ['马','超','machao'], ['刘','备','liubei'],
  ['关','平','guanping'], ['关','兴','guanxing'], ['张','苞','zhangbao'], ['张','翼','zhangyi'], ['黄','祖','huangzu'], ['黄','盖','huanggai'],
];
const INITIAL_POOL: ReadonlyArray<[string, number, number]> = [
  ['刀',19,18], ['枪',18,17], ['骑',17,17], ['弓',17,17],
  ['赵',2,1.5], ['云',2,1.5], ['张',2,1], ['飞',2,1], ['黄',2,1], ['忠',2,1], ['关',2,1], ['羽',2,1],
  ['刘',1,1], ['备',1,1], ['马',2,1], ['超',2,1], ['平',1,.5], ['兴',1,.5], ['苞',1,.5], ['翼',1,.5], ['祖',1,.5], ['盖',1,.5],
];
const BOSS_NAMES = ['张宝','张角','张良','华雄','甄姬','孙尚香','貂蝉','董卓','吕布','夏侯惇','曹操'] as const;
const validSlot = (slot: number) => Number.isSafeInteger(slot) && slot >= 0 && slot < 80;
const mapFor = (id: number) => WORD_FRONT_V4_MAPS.find(map => map.id === id) ?? WORD_FRONT_V4_MAPS[0]!;
const dist = (a: number, b: number) => Math.abs(a % 8 - b % 8) + Math.abs(Math.floor(a / 8) - Math.floor(b / 8));
function random(seed: number): [number, number] { const next = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return [next, next / 0x1_0000_0000]; }
function initialPool(): Record<string, number> { return Object.fromEntries(INITIAL_POOL.map(([ch,count]) => [ch,count])); }
function pick(state: WordFrontV4State): [number, string | null] {
  const weighted = INITIAL_POOL.filter(([ch]) => (state.pool[ch] ?? 0) > 0).map(([ch,,weight]) => [ch, weight * (state.heroRateBoost && !BASIC[ch] ? 2 : 1)] as const);
  const total = weighted.reduce((sum, [,weight]) => sum + weight, 0); if (!total) return [state.seed, null];
  let seed: number, roll: number; [seed, roll] = random(state.seed); let left = roll * total;
  for (const [ch, weight] of weighted) { left -= weight; if (left < 0) return [seed, ch]; }
  return [seed, weighted.at(-1)![0]];
}
export function wordFrontV4DrawCost(drawCount: number): number { return 10 + drawCount * 2; }
export function wordFrontV4UnitForLetter(letter: string): WordFrontV4UnitKind | null { return BASIC[letter] ?? null; }
export function wordFrontV4HeroForLetters(a: string, b: string): WordFrontV4UnitKind | null { return HEROES.find(([x,y]) => x === a && y === b || x === b && y === a)?.[2] ?? null; }
export function wordFrontV4Terrain(state: Pick<WordFrontV4State, 'mapId' | 'unlocked'>, slot: number): 'path' | 'obstacle' | 'grass' | 'buff' | 'open' {
  const map = mapFor(state.mapId); if (map.path.includes(slot)) return 'path'; if (map.obstacles.includes(slot)) return 'obstacle';
  if (map.grass.includes(slot) && !state.unlocked.includes(slot)) return 'grass'; if (map.buffs.includes(slot)) return 'buff'; return 'open';
}
export function createWordFrontV4State(mode: WordFrontMode = 'story', mapId = 1, seed = 20260918): WordFrontV4State {
  return { version: 4, mode, chapter: Math.max(1, Math.min(3, Math.floor(mapId))), mapId: Math.max(1, Math.min(3, Math.floor(mapId))), status: 'ready',
    coreHp: 20, wave: 0, completedWaves: 0, kills: 0, score: 0, buns: 20, gold: 0, drawCount: 0, shovels: 1, attackBoost: 0,
    heroRateBoost: false, hand: [], pool: initialPool(), unlocked: [], units: [], enemies: [], pendingSpawns: 0, tick: 0,
    seed: seed >>> 0, nextEnemyId: 1, message: '消耗型卡池已就绪：首抽保底赵云双字之一，抽走的字本局不回池。', gear: [] };
}

export function applyWordFrontV4Action(state: WordFrontV4State, action: WordFrontV4Action): WordFrontV4State | null {
  if (!Number.isSafeInteger(action.tick) || action.tick !== state.tick || state.status === 'won' || state.status === 'lost') return null;
  if (action.type === 'recruit') {
    const cost = wordFrontV4DrawCost(state.drawCount); if (state.buns < cost || state.hand.length > 145) return null;
    let next = { ...state, pool: { ...state.pool }, hand: [...state.hand], buns: state.buns - cost, drawCount: state.drawCount + 1 };
    if (state.drawCount === 0) { for (const ch of ['赵','云']) { if ((next.pool[ch] ?? 0) > 0) { next.hand.push(ch); next.pool[ch]!--; } } }
    for (let i = state.drawCount === 0 ? 2 : 0; i < 5; i += 1) {
      let chance: number; [next.seed, chance] = random(next.seed); if (chance < .05) { next.shovels++; continue; }
      const [seed, ch] = pick(next); next.seed = seed; if (!ch) break; next.hand.push(ch); next.pool[ch]!--;
    }
    next.message = `征兵完成，消耗 ${cost} 包子；卡池还剩 ${Object.values(next.pool).reduce((a,b) => a + b, 0)} 张。`; return next;
  }
  if (action.type === 'unlock') {
    if (!validSlot(action.slot) || state.shovels < 1 || wordFrontV4Terrain(state, action.slot) !== 'grass') return null;
    return { ...state, shovels: state.shovels - 1, unlocked: [...state.unlocked, action.slot], message: '草障已开垦为可部署地块。' };
  }
  if (action.type === 'deploy_basic' || action.type === 'deploy_hero') {
    if (!validSlot(action.slot) || !['open','buff'].includes(wordFrontV4Terrain(state, action.slot)) || state.units.some(unit => unit.slot === action.slot)) return null;
    let kind: WordFrontV4UnitKind | null; let used: number[];
    if (action.type === 'deploy_basic') { if (!Number.isSafeInteger(action.card) || action.card < 0 || action.card >= state.hand.length) return null; kind = wordFrontV4UnitForLetter(state.hand[action.card]!); used = [action.card]; }
    else { if (![action.first,action.second].every(Number.isSafeInteger) || action.first === action.second || action.first < 0 || action.second < 0 || action.first >= state.hand.length || action.second >= state.hand.length) return null; kind = wordFrontV4HeroForLetters(state.hand[action.first]!, state.hand[action.second]!); used = [action.first,action.second]; }
    if (!kind) return null; return { ...state, hand: state.hand.filter((_, index) => !used.includes(index)), units: [...state.units, { slot: action.slot, kind, level: 1, gear: null }], message: `${WORD_FRONT_V4_UNITS[kind].name}已部署。` };
  }
  if (action.type === 'merge') {
    const from = state.units.find(unit => unit.slot === action.from), to = state.units.find(unit => unit.slot === action.to);
    if (!from || !to || from.slot === to.slot || from.kind !== to.kind || from.level !== to.level || to.level >= 5) return null;
    return { ...state, units: state.units.filter(unit => unit.slot !== from.slot).map(unit => unit.slot === to.slot ? { ...unit, level: unit.level + 1 } : unit), message: `${WORD_FRONT_V4_UNITS[to.kind].name}升至 ${to.level + 1} 级。` };
  }
  if (action.type === 'buy_boost') {
    const price = action.boost === 'hero_rate' ? 18 : 12; if (state.status !== 'running' || state.gold < price) return null;
    if (action.boost === 'attack' && state.attackBoost < 3) return { ...state, gold: state.gold - price, attackBoost: state.attackBoost + 1, message: '神秘商人：全队攻击 +15%。' };
    if (action.boost === 'heal' && state.coreHp < 20) return { ...state, gold: state.gold - price, coreHp: Math.min(20, state.coreHp + 5), message: '神秘商人：阿斗恢复 5 点生命。' };
    if (action.boost === 'hero_rate' && !state.heroRateBoost) return { ...state, gold: state.gold - price, heroRateBoost: true, message: '招贤榜生效：剩余武将字抽取权重翻倍。' };
    return null;
  }
  if (action.type === 'equip_gear') {
    if (!state.gear.includes(action.gear)) return null; const def = WORD_FRONT_V4_GEARS[action.gear]; const target = state.units.find(unit => unit.kind === def.hero);
    if (!target) return null; return { ...state, units: state.units.map(unit => unit === target ? { ...unit, gear: action.gear } : unit), message: `${def.name}已装备给${WORD_FRONT_V4_UNITS[def.hero].name}。` };
  }
  if (action.type === 'start') { if (state.status !== 'ready' || !state.units.length) return null; return { ...state, status: 'running', wave: 1, pendingSpawns: spawnCount(1), message: '第一波曹军已进入长坂坡。' }; }
  return null;
}

function waveLimit(state: WordFrontV4State): number { return state.mode === 'endless' ? 40 : 20; }
function spawnCount(wave: number): number { return Math.min(24, 5 + wave + (wave % 4 === 0 ? 1 : 0)); }
function enemyKind(wave: number, index: number): WordFrontV4EnemyKind {
  if (index === 0 && wave >= 4 && (wave <= 12 ? wave % 4 === 0 : true)) return 'boss';
  if (wave >= 12 && index % 5 === 0) return 'elite'; if (wave >= 9 && index % 4 === 0) return 'shield';
  return (['bandit','blade','spear','bow','cavalry'] as const)[(wave + index) % 5]!;
}
function stats(kind: WordFrontV4EnemyKind, wave: number): { hp: number; moveEvery: number; damage: number; buns: number; gold: number } {
  const scale = 1 + Math.max(0, wave - 1) * .12;
  const base = kind === 'boss' ? [260 + wave * 34, 4, 4, 40, 8] : kind === 'elite' ? [100,4,2,3,2] : kind === 'shield' ? [82,4,2,2,2] : kind === 'cavalry' ? [40,2,1,2,1] : kind === 'blade' ? [32,3,1,1,1] : kind === 'spear' ? [26,2,1,1,1] : kind === 'bow' ? [20,4,1,1,1] : [18,3,1,1,1];
  return { hp: Math.round(base[0]! * scale), moveEvery: base[1]!, damage: base[2]!, buns: base[3]!, gold: base[4]! };
}
export function stepWordFrontV4(state: WordFrontV4State): WordFrontV4State {
  if (state.status !== 'running') return state; const tick = state.tick + 1, map = mapFor(state.mapId);
  let enemies = state.enemies.map(enemy => ({ ...enemy })), pendingSpawns = state.pendingSpawns, nextEnemyId = state.nextEnemyId;
  let buns = state.buns, gold = state.gold, coreHp = state.coreHp, kills = state.kills, seed = state.seed, message = state.message; const gear = [...state.gear];
  if (pendingSpawns > 0 && tick % 2 === 1) { const index = spawnCount(state.wave) - pendingSpawns, kind = enemyKind(state.wave, index), value = stats(kind, state.wave); enemies.push({ id: nextEnemyId++, kind, pathIndex: 0, hp: value.hp, maxHp: value.hp, moveEvery: value.moveEvery, damage: value.damage }); pendingSpawns--; }
  const liubei = state.units.some(unit => unit.kind === 'liubei'), global = 1 + state.attackBoost * .15 + (liubei ? .1 : 0);
  for (const unit of state.units) {
    const def = WORD_FRONT_V4_UNITS[unit.kind]; if (tick % def.interval) continue; const gearDef = unit.gear ? WORD_FRONT_V4_GEARS[unit.gear] : null;
    const range = def.range + (unit.gear === 'sunset_bow' ? 1 : 0), count = def.targets + (unit.gear === 'silver_spear' ? 2 : unit.gear === 'sunset_bow' ? 1 : 0);
    const targets = enemies.filter(enemy => enemy.hp > 0 && dist(unit.slot, map.path[enemy.pathIndex]!) <= range).sort((a,b) => b.pathIndex - a.pathIndex || a.id - b.id).slice(0,count);
    for (const enemy of targets) { const boss = enemy.kind === 'boss' && (unit.kind === 'guanyu' || unit.kind === 'huangzhong') ? 1.5 : 1; const special = gearDef ? unit.gear === 'crescent_blade' && enemy.kind === 'boss' ? 1.5 : 1.25 : 1; const buff = wordFrontV4Terrain(state, unit.slot) === 'buff' ? 1.15 : 1; enemy.hp -= Math.max(1, Math.floor(def.damage * Math.pow(1.72, unit.level - 1) * global * boss * special * buff)); }
  }
  for (const enemy of enemies.filter(item => item.hp <= 0)) { const value = stats(enemy.kind, state.wave); buns = Math.min(80, buns + value.buns); gold += value.gold; kills++; if (enemy.kind === 'boss') { let roll: number; [seed, roll] = random(seed); const item = (Object.keys(WORD_FRONT_V4_GEARS) as WordFrontV4Gear[])[Math.floor(roll * 5)]!; if (!gear.includes(item)) { gear.push(item); message = `击败${BOSS_NAMES[Math.min(BOSS_NAMES.length - 1, Math.max(0, state.wave - 4))]}，获得神兵·${WORD_FRONT_V4_GEARS[item].name}。`; } } }
  enemies = enemies.filter(item => item.hp > 0).map(enemy => tick % enemy.moveEvery ? enemy : { ...enemy, pathIndex: enemy.pathIndex + 1 });
  const escaped = enemies.filter(enemy => enemy.pathIndex >= map.path.length); for (const enemy of escaped) coreHp -= enemy.damage; enemies = enemies.filter(enemy => enemy.pathIndex < map.path.length);
  if (coreHp <= 0) return { ...state, tick, seed, enemies, pendingSpawns, nextEnemyId, buns, gold, kills, coreHp: 0, gear, status: 'lost', score: Math.max(0, state.completedWaves * 1_000 + kills * 25), message: '阿斗失守，本局结束。' };
  if (!enemies.length && pendingSpawns === 0) { const completedWaves = state.wave, score = completedWaves * 1_000 + kills * 25 + coreHp * 30; if (state.wave >= waveLimit(state)) return { ...state, tick, seed, enemies, pendingSpawns, nextEnemyId, buns, gold, kills, coreHp, gear, completedWaves, score, status: 'won', message: state.mode === 'story' ? '二十波曹军已退，赵云成功救出阿斗。' : '无尽四十波演练完成。' }; return { ...state, tick, seed, enemies, nextEnemyId, buns, gold, kills, coreHp, gear, completedWaves, score, wave: state.wave + 1, pendingSpawns: spawnCount(state.wave + 1), message: `第 ${state.wave} 波结束；下一波已接近。` }; }
  return { ...state, tick, seed, enemies, pendingSpawns, nextEnemyId, buns, gold, kills, coreHp, gear, score: state.completedWaves * 1_000 + kills * 25 + coreHp * 30, message };
}

export function replayWordFrontV4(mode: WordFrontMode, mapId: number, seed: number, actions: readonly WordFrontV4Action[], finishTick: number): WordFrontV4State | null {
  if (!Number.isSafeInteger(finishTick) || finishTick < 0 || finishTick > 5_000 || actions.length > 500) return null;
  let state = createWordFrontV4State(mode, mapId, seed), cursor = 0;
  while (state.tick <= finishTick) {
    while (cursor < actions.length && actions[cursor]!.tick === state.tick) { const next = applyWordFrontV4Action(state, actions[cursor]!); if (!next) return null; state = next; cursor++; }
    if (state.tick === finishTick || state.status === 'won' || state.status === 'lost') break; const next = stepWordFrontV4(state); if (next.tick === state.tick) return null; state = next;
  }
  return cursor === actions.length && state.tick === finishTick ? state : null;
}
