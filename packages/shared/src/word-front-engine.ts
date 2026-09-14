export type WordFrontMode = 'story' | 'endless';
export type WordFrontStatus = 'ready' | 'running' | 'won' | 'lost';
export type WordFrontHero = 'zhaoyun' | 'guanyu' | 'zhangfei' | 'zhuge';
export type WordFrontAction =
  | { tick: number; type: 'recruit' }
  | { tick: number; type: 'start' }
  | { tick: number; type: 'deploy'; first: number; second: number; slot: number }
  | { tick: number; type: 'merge'; from: number; to: number };

export interface WordFrontUnit { slot: number; kind: WordFrontHero; level: number }
export interface WordFrontEnemy { id: number; pathIndex: number; hp: number; maxHp: number; speed: number }
export interface WordFrontState {
  version: 1;
  mode: WordFrontMode;
  chapter: number;
  status: WordFrontStatus;
  coreHp: number;
  wave: number;
  completedWaves: number;
  kills: number;
  score: number;
  credits: number;
  drawCount: number;
  hand: string[];
  units: WordFrontUnit[];
  enemies: WordFrontEnemy[];
  pendingSpawns: number;
  tick: number;
  seed: number;
  nextEnemyId: number;
  message: string;
}

export const WORD_FRONT_WIDTH = 8;
export const WORD_FRONT_HEIGHT = 6;
export const WORD_FRONT_PATH = [8, 9, 10, 11, 12, 20, 28, 27, 26, 25, 33, 34, 35, 36, 37, 38, 39] as const;
const PATH_SET = new Set<number>(WORD_FRONT_PATH);
export const WORD_FRONT_HEROES: Record<WordFrontHero, { name: string; letters: readonly [string, string]; role: string; damage: number; range: number; color: string }> = {
  zhaoyun: { name: '赵云', letters: ['赵', '云'], role: '机动救援', damage: 4, range: 2, color: 'blue' },
  guanyu: { name: '关羽', letters: ['关', '羽'], role: '精准审校', damage: 6, range: 2, color: 'green' },
  zhangfei: { name: '张飞', letters: ['张', '飞'], role: '加急催办', damage: 3, range: 3, color: 'orange' },
  zhuge: { name: '诸葛', letters: ['诸', '葛'], role: '统筹调度', damage: 2, range: 3, color: 'purple' },
};
const HERO_KEYS = Object.keys(WORD_FRONT_HEROES) as WordFrontHero[];
const ALL_LETTERS = HERO_KEYS.flatMap(key => WORD_FRONT_HEROES[key].letters);

function random(seed: number): [number, number] {
  const next = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return [next, next / 0x1_0000_0000];
}
function drawCards(seed: number): [number, string[]] {
  let current = seed;
  let value: number;
  [current, value] = random(current);
  const pair = WORD_FRONT_HEROES[HERO_KEYS[Math.floor(value * HERO_KEYS.length)]!].letters;
  const cards = [...pair];
  for (let index = 0; index < 3; index += 1) {
    [current, value] = random(current);
    cards.push(ALL_LETTERS[Math.floor(value * ALL_LETTERS.length)]!);
  }
  for (let index = cards.length - 1; index > 0; index -= 1) {
    [current, value] = random(current);
    const swap = Math.floor(value * (index + 1));
    [cards[index], cards[swap]] = [cards[swap]!, cards[index]!];
  }
  return [current, cards];
}

export function wordFrontDrawCost(drawCount: number): number { return 10 + 2 * drawCount; }
export function wordFrontHeroForLetters(first: string, second: string): WordFrontHero | null {
  return HERO_KEYS.find(key => WORD_FRONT_HEROES[key].letters.includes(first) &&
    WORD_FRONT_HEROES[key].letters.includes(second) && first !== second) ?? null;
}
export function isWordFrontPath(slot: number): boolean { return PATH_SET.has(slot); }
export function createWordFrontState(mode: WordFrontMode = 'story', chapter = 1, seed = 20260914): WordFrontState {
  return { version: 1, mode, chapter: Math.max(1, Math.min(3, Math.floor(chapter))), status: 'ready', coreHp: 5,
    wave: 0, completedWaves: 0, kills: 0, score: 0, credits: 30, drawCount: 0, hand: [], units: [], enemies: [], pendingSpawns: 0,
    tick: 0, seed: seed >>> 0, nextEnemyId: 1, message: '先招募五张字卡，双字组队，再部署到路线旁。' };
}
export function recruitWordFrontCards(state: WordFrontState): WordFrontState {
  if (state.status === 'won' || state.status === 'lost') return state;
  const cost = wordFrontDrawCost(state.drawCount);
  if (state.credits < cost) return { ...state, message: `局内经费不足，还需要 ${cost - state.credits} 点。` };
  const [seed, cards] = drawCards(state.seed);
  return { ...state, seed, credits: state.credits - cost, drawCount: state.drawCount + 1,
    hand: [...state.hand, ...cards], message: `补入五张字卡，消耗 ${cost} 点局内经费。` };
}
export function deployWordFrontUnit(state: WordFrontState, first: number, second: number, slot: number): WordFrontState {
  if (state.status === 'won' || state.status === 'lost') return state;
  const kind = wordFrontHeroForLetters(state.hand[first] ?? '', state.hand[second] ?? '');
  if (first === second || !kind) return { ...state, message: '请选择能组成一位角色的两张不同字卡。' };
  if (!Number.isInteger(slot) || slot < 0 || slot >= WORD_FRONT_WIDTH * WORD_FRONT_HEIGHT || PATH_SET.has(slot) || state.units.some(unit => unit.slot === slot)) {
    return { ...state, message: '请放在路线旁的空白工位。' };
  }
  const hand = state.hand.filter((_, index) => index !== first && index !== second);
  return { ...state, hand, units: [...state.units, { slot, kind, level: 1 }], message: `${WORD_FRONT_HEROES[kind].name}已就位。两名同级同角色可合并升阶。` };
}
export function mergeWordFrontUnits(state: WordFrontState, from: number, to: number): WordFrontState {
  if (state.status === 'won' || state.status === 'lost' || from === to) return state;
  const source = state.units.find(unit => unit.slot === from), target = state.units.find(unit => unit.slot === to);
  if (!source || !target || source.kind !== target.kind || source.level !== target.level || target.level >= 3) {
    return { ...state, message: '只有两位同角色、同阶级的成员能二合一，最高三阶。' };
  }
  return { ...state, units: state.units.filter(unit => unit.slot !== from).map(unit => unit.slot === to ? { ...unit, level: unit.level + 1 } : unit),
    message: `${WORD_FRONT_HEROES[target.kind].name}合成 ${target.level + 1} 阶。` };
}
function waveLimit(state: WordFrontState): number { return state.mode === 'endless' ? 30 : state.chapter + 2; }
function spawnCount(state: WordFrontState, wave: number): number { return Math.min(18, 2 + wave + (state.mode === 'story' ? state.chapter - 1 : 0)); }
export function startWordFront(state: WordFrontState): WordFrontState {
  if (state.status !== 'ready') return state;
  if (!state.units.length) return { ...state, message: '先组队并部署至少一位成员，再开始防守。' };
  return { ...state, status: 'running', wave: 1, pendingSpawns: spawnCount(state, 1), tick: 0, message: '第一波来袭，成员会自动攻击路线上的来客。' };
}
function distance(first: number, second: number): number {
  return Math.abs(first % WORD_FRONT_WIDTH - second % WORD_FRONT_WIDTH) +
    Math.abs(Math.floor(first / WORD_FRONT_WIDTH) - Math.floor(second / WORD_FRONT_WIDTH));
}
export function stepWordFront(state: WordFrontState): WordFrontState {
  if (state.status !== 'running') return state;
  const tick = state.tick + 1;
  let nextId = state.nextEnemyId;
  let pendingSpawns = state.pendingSpawns;
  let enemies = state.enemies.map(enemy => ({ ...enemy }));
  let coreHp = state.coreHp, credits = state.credits;
  if (pendingSpawns > 0 && tick % 2 === 1) {
    const hp = 5 + state.wave * 2 + (state.mode === 'story' ? state.chapter - 1 : 0);
    enemies.push({ id: nextId++, pathIndex: 0, hp, maxHp: hp, speed: Math.max(1, 4 - Math.floor(state.wave / 5)) });
    pendingSpawns -= 1;
  }
  for (const unit of state.units) {
    const hero = WORD_FRONT_HEROES[unit.kind];
    const target = enemies.filter(enemy => enemy.hp > 0 && distance(unit.slot, WORD_FRONT_PATH[enemy.pathIndex]!) <= hero.range)
      .sort((a, b) => b.pathIndex - a.pathIndex || a.id - b.id)[0];
    if (target) target.hp -= hero.damage * (2 ** (unit.level - 1));
  }
  const defeated = enemies.filter(enemy => enemy.hp <= 0).length;
  const kills = state.kills + defeated;
  credits += defeated * 3;
  enemies = enemies.filter(enemy => enemy.hp > 0);
  if (tick % 2 === 0) {
    enemies = enemies.map(enemy => ({ ...enemy, pathIndex: enemy.pathIndex + (tick % enemy.speed === 0 ? 1 : 0) }));
    const escaped = enemies.filter(enemy => enemy.pathIndex >= WORD_FRONT_PATH.length).length;
    coreHp = Math.max(0, coreHp - escaped);
    enemies = enemies.filter(enemy => enemy.pathIndex < WORD_FRONT_PATH.length);
  }
  if (coreHp === 0) return { ...state, status: 'lost', tick, enemies, pendingSpawns, coreHp, kills,
    score: state.completedWaves * 100 + kills * 10, credits, nextEnemyId: nextId, message: '五点核心生命耗尽，本局结束。' };
  if (pendingSpawns === 0 && enemies.length === 0) {
    credits += 8;
    const completedWaves = state.wave;
    const score = completedWaves * 100 + kills * 10 + coreHp * 20;
    if (state.wave >= waveLimit(state)) return { ...state, status: 'won', tick, enemies, pendingSpawns, coreHp, kills, completedWaves, score, credits, nextEnemyId: nextId, message: '路线守住了！这一局已完成。' };
    const wave = state.wave + 1;
    return { ...state, tick, enemies, wave, pendingSpawns: spawnCount(state, wave), coreHp, kills, completedWaves, score, credits, nextEnemyId: nextId,
      message: `第 ${state.wave} 波完成，获得 8 点局内经费；第 ${wave} 波即将到来。` };
  }
  return { ...state, tick, enemies, pendingSpawns, coreHp, kills, score: state.completedWaves * 100 + kills * 10 + coreHp * 20, credits, nextEnemyId: nextId };
}

/** Rejects an invalid/no-op command instead of treating its message as a verified move. */
export function applyWordFrontAction(state: WordFrontState, action: WordFrontAction): WordFrontState | null {
  if (!Number.isSafeInteger(action.tick) || action.tick !== state.tick) return null;
  if (action.type === 'recruit') {
    const next = recruitWordFrontCards(state);
    return next.drawCount === state.drawCount + 1 ? next : null;
  }
  if (action.type === 'start') {
    const next = startWordFront(state);
    return state.status === 'ready' && next.status === 'running' ? next : null;
  }
  if (action.type === 'deploy') {
    if (![action.first, action.second, action.slot].every(Number.isSafeInteger)) return null;
    const next = deployWordFrontUnit(state, action.first, action.second, action.slot);
    return next.units.length === state.units.length + 1 ? next : null;
  }
  if (action.type === 'merge') {
    if (![action.from, action.to].every(Number.isSafeInteger)) return null;
    const next = mergeWordFrontUnits(state, action.from, action.to);
    return next.units.length === state.units.length - 1 ? next : null;
  }
  return null;
}

/** Deterministic replay for service-side score verification; callers still enforce request size and elapsed time. */
export function replayWordFront(mode: WordFrontMode, chapter: number, seed: number, actions: readonly WordFrontAction[], finishTick: number): WordFrontState | null {
  if (!Number.isSafeInteger(finishTick) || finishTick < 0 || finishTick > 100_000 || actions.length > 2_000) return null;
  let state = createWordFrontState(mode, chapter, seed);
  for (const action of actions) {
    if (!Number.isSafeInteger(action.tick) || action.tick < state.tick || action.tick > finishTick) return null;
    while (state.tick < action.tick) {
      if (state.status !== 'running') return null;
      state = stepWordFront(state);
    }
    const next = applyWordFrontAction(state, action);
    if (!next) return null;
    state = next;
  }
  while (state.tick < finishTick) {
    if (state.status !== 'running') return null;
    state = stepWordFront(state);
  }
  return state.status === 'won' || state.status === 'lost' ? state : null;
}
