import { createHash } from 'node:crypto';
import type {
  ArcadeDirection, ArcadeDrawBoard, ArcadeEngineResult, ArcadeGameKey, ArcadeGameMode,
  ArcadeGameView, ArcadeParticipant, ArcadeStroke, ArcadeUndercoverBoard, ArcadeZhesiBoard,
} from '@stealth-reader/shared';
import * as snake from './snakeLogic';
import * as tetris from './tetrisLogic';
import * as tank from './tankLogic';
import { DRAW_WORDS, practiceStrokes, UNDERCOVER_WORDS } from './word-bank';

export class ArcadeEngineError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'ArcadeEngineError'; }
}
interface Player extends ArcadeParticipant {
  isBot: boolean; score: number; finished: boolean; forfeited: boolean; rng: number;
  lastActionAt: number; actionCount: number; lastTickAt: number;
  snake?: snake.SnakeGameState; tetris?: tetris.TetrisGameState; tank?: tank.TankGameState;
  zhesi?: ArcadeZhesiBoard & { choice: 'strike' | 'guard' | 'train' | null; damage: number; turnsPlayed: number };
}
interface DrawState extends Omit<ArcadeDrawBoard, 'word' | 'wordLength'> {
  wordIndex: number; order: string[]; correct: string[]; roundStartedAt: number; usedWords: number[];
}
interface UndercoverState extends Omit<ArcadeUndercoverBoard, 'word' | 'myVote' | 'reveals' | 'votedPlayerIds'> {
  words: Record<string, string>; roles: Record<string, 'civilian' | 'undercover'>;
  votes: Record<string, string>; pairIndex: number; correctVotes: Record<string, number>; contributions: Record<string, number>;
}
/** Private database JSON. Never return this object or its seed/RNG fields from an API. */
export interface ArcadeEngineState {
  version: 1; gameKey: ArcadeGameKey; mode: ArcadeGameMode; phase: 'running' | 'finished';
  startedAt: number; endsAt: number; finishedAt: number | null; advancedAt: number;
  rng: number; players: Player[]; draw?: DrawState; undercover?: UndercoverState;
}
const KEYS: ArcadeGameKey[] = ['snake', 'tetris', 'tank', 'zhesi', 'draw', 'undercover'];
const DIRECTIONS: ArcadeDirection[] = ['up', 'down', 'left', 'right'];
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const fail = (code: string): never => { throw new ArcadeEngineError(code); };
function random(holder: { rng: number }): number {
  let value = holder.rng | 0;
  value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
  holder.rng = value >>> 0;
  return holder.rng / 0x100000000;
}
function validateNow(now: number): void { if (!Number.isSafeInteger(now) || now < 0) fail('INVALID_TIME'); }
function fields(payload: Record<string, unknown>, allowed: string[]): void {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).some((key) => !allowed.includes(key))) fail('INVALID_ACTION');
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string') return fail('INVALID_TEXT');
  const clean = value.normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/g, '').trim();
  if (!clean || clean.length > max) return fail('INVALID_TEXT');
  return clean;
}
function normalized(value: string): string { return value.normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase(); }
function refill(player: Player): void {
  if (!player.tetris) return;
  while (player.tetris.queue.length < 14) player.tetris.queue.push(...tetris.createShuffledBag(() => random(player)));
}
function nextWord(state: ArcadeEngineState): number {
  const used = state.draw?.usedWords ?? [];
  const available = DRAW_WORDS.map((_, i) => i).filter((i) => !used.includes(i));
  return available[Math.floor(random(state) * available.length)] ?? 0;
}
function startDrawRound(state: ArcadeEngineState, at: number): void {
  const draw = state.draw!;
  draw.wordIndex = nextWord(state); draw.usedWords.push(draw.wordIndex);
  draw.drawerId = draw.order[draw.round - 1]; draw.roundStartedAt = at;
  draw.roundEndsAt = at + (state.mode === 'solo' ? 40_000 : Math.max(20_000, Math.floor(120_000 / draw.totalRounds)));
  draw.strokes = state.mode === 'solo' ? practiceStrokes(draw.wordIndex) : [];
  draw.correct = []; draw.guessedPlayerIds = []; draw.messages = [];
}
function nextDrawRound(state: ArcadeEngineState, at: number): void {
  const d = state.draw!;
  let next = d.round + 1;
  while (next <= d.totalRounds && state.players.find((p) => p.id === d.order[next - 1])?.forfeited) next += 1;
  if (next > d.totalRounds) { finish(state, at); return; }
  d.round = next; startDrawRound(state, at);
}
export function create(gameKey: ArcadeGameKey, participants: ArcadeParticipant[], mode: ArcadeGameMode, now: number, seed: string): ArcadeEngineState {
  validateNow(now);
  if (!KEYS.includes(gameKey) || !['solo', 'room'].includes(mode)) fail('INVALID_GAME');
  const minimum = mode === 'solo' ? 1 : gameKey === 'undercover' ? 3 : 2;
  if (!Array.isArray(participants) || participants.length < minimum || participants.length > (mode === 'solo' ? 1 : 8)) fail('INVALID_PLAYER_COUNT');
  if (participants.some((p) => !p || typeof p.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(p.id) || typeof p.displayName !== 'string' || !p.displayName.trim() || p.displayName.length > 80) || new Set(participants.map((p) => p.id)).size !== participants.length) fail('INVALID_PLAYER');
  if (typeof seed !== 'string' || !seed || seed.length > 512) fail('INVALID_SEED');
  const rng = createHash('sha256').update(seed).digest().readUInt32LE(0) || 0x9e3779b9;
  const players: Player[] = participants.map((p) => ({ id: p.id, displayName: p.displayName, isBot: false, score: 0, finished: false, forfeited: false, rng, lastActionAt: now - 1000, actionCount: 0, lastTickAt: now }));
  if (mode === 'solo' && ['draw', 'undercover'].includes(gameKey)) {
    const count = gameKey === 'draw' ? 1 : 3;
    for (let i = 0; i < count; i += 1) players.push({ ...players[0], id: `bot:${i + 1}`, displayName: `系统练习搭档 ${i + 1}`, isBot: true });
  }
  const duration = gameKey === 'undercover' ? 150_000 : gameKey === 'zhesi' ? 80_000 : gameKey === 'draw' && mode === 'room' ? players.length * Math.max(20_000, Math.floor(120_000 / players.length)) : 120_000;
  const state: ArcadeEngineState = { version: 1, gameKey, mode, phase: 'running', startedAt: now, endsAt: now + duration, finishedAt: null, advancedAt: now, rng, players };
  for (const p of players) {
    if (gameKey === 'snake') p.snake = { ...snake.createInitialGame(() => random(p)), status: 'running' };
    if (gameKey === 'tetris') { p.tetris = { ...tetris.createInitialGame(tetris.createShuffledBag(() => random(p))), status: 'running' }; refill(p); }
    if (gameKey === 'tank') p.tank = { ...tank.createTankGameState(), status: 'running' };
    if (gameKey === 'zhesi') p.zhesi = { turn: 1, maxTurns: 10, health: 100, energy: 50, power: 12, enemyHealth: 200, enemyIntent: 'charge', chosen: false, turnEndsAt: now + 8000, log: ['试炼开始：蓄势时可修炼，攻击前宜防守。'], status: 'running', choice: null, damage: 0, turnsPlayed: 0 };
  }
  if (gameKey === 'draw') {
    const totalRounds = mode === 'solo' ? 3 : players.length;
    state.draw = { round: 1, totalRounds, drawerId: '', roundEndsAt: now, strokes: [], guessedPlayerIds: [], messages: [], practicePartner: mode === 'solo', wordIndex: 0, order: mode === 'solo' ? ['bot:1', 'bot:1', 'bot:1'] : players.map((p) => p.id), correct: [], roundStartedAt: now, usedWords: [] };
    startDrawRound(state, now);
  }
  if (gameKey === 'undercover') {
    const pairIndex = Math.floor(random(state) * UNDERCOVER_WORDS.length);
    const undercover = Math.floor(random(state) * players.length);
    const words: Record<string, string> = {}; const roles: UndercoverState['roles'] = {};
    players.forEach((p, i) => { roles[p.id] = i === undercover ? 'undercover' : 'civilian'; words[p.id] = UNDERCOVER_WORDS[pairIndex].words[i === undercover ? 1 : 0]; });
    state.undercover = { round: 1, phase: 'describe', phaseEndsAt: now + 30_000, alivePlayerIds: players.map((p) => p.id), descriptions: [], eliminatedPlayerIds: [], outcome: null, practicePartner: mode === 'solo', words, roles, votes: {}, pairIndex, correctVotes: {}, contributions: {} };
    botDescriptions(state);
  }
  return state;
}
function finish(state: ArcadeEngineState, now: number): void {
  if (state.phase === 'finished') return;
  state.phase = 'finished'; state.finishedAt = Math.min(now, state.endsAt);
  if (state.undercover) state.undercover.phase = 'finished';
  for (const p of state.players) {
    p.finished = true;
    if (state.gameKey === 'draw') p.score = Math.min(1000, Math.floor(p.score / (state.draw!.totalRounds * 200) * 1000));
    if (state.gameKey === 'zhesi') p.score = zhesiScore(p);
    if (state.gameKey === 'undercover') {
      const u = state.undercover!;
      p.score = (u.roles[p.id] === u.outcome ? 600 : 0) + Math.min(300, (u.correctVotes[p.id] ?? 0) * 150) + Math.min(100, (u.contributions[p.id] ?? 0) * 50);
    }
    if (p.forfeited || p.actionCount === 0) p.score = 0;
  }
}
function zhesiScore(p: Player): number {
  const z = p.zhesi!;
  return Math.min(1000, z.damage * 3 + (z.enemyHealth <= 0 ? 300 : 0) + (z.turnsPlayed > 0 ? z.health : 0));
}
function tickZhesi(p: Player): void {
  const z = p.zhesi!;
  const choice = z.choice;
  let outgoing = 0; let incoming = z.enemyIntent === 'attack' ? 24 : z.enemyIntent === 'charge' ? 8 : 0;
  if (choice) z.turnsPlayed += 1;
  if (choice === 'strike') {
    outgoing = z.energy >= 12 ? z.power + 12 : Math.floor(z.power / 2);
    z.energy = Math.max(0, z.energy - 12);
  } else if (choice === 'guard') { incoming = Math.floor(incoming / 4); z.energy = Math.min(100, z.energy + 16); }
  else if (choice === 'train') { z.power += 5; z.energy = Math.min(100, z.energy + 8); }
  else incoming += 6;
  const dealt = Math.min(z.enemyHealth, outgoing);
  z.damage += dealt; z.enemyHealth -= dealt; z.health = Math.max(0, z.health - incoming);
  z.log.push(`第 ${z.turn} 回合：${choice === 'strike' ? '出击' : choice === 'guard' ? '防守' : choice === 'train' ? '修炼' : '未行动'}，造成 ${dealt} 伤害，承受 ${incoming} 伤害。`);
  z.log = z.log.slice(-4);
  p.score = zhesiScore(p);
  if (z.health <= 0 || z.enemyHealth <= 0 || z.turn >= z.maxTurns) { z.status = 'finished'; p.finished = true; return; }
  z.turn += 1; z.turnEndsAt += 8000; z.choice = null; z.chosen = false;
  z.enemyIntent = (['attack', 'charge', 'recover'] as const)[Math.floor(random(p) * 3)];
}
function botDescriptions(state: ArcadeEngineState): void {
  const u = state.undercover!;
  for (const p of state.players.filter((p) => p.isBot && u.alivePlayerIds.includes(p.id))) {
    u.descriptions.push({ playerId: p.id, text: `${UNDERCOVER_WORDS[u.pairIndex].clues[u.roles[p.id] === 'undercover' ? 1 : 0]}${u.round > 1 ? '，生活里能见到' : ''}`, round: u.round });
  }
}
function undercoverOutcome(state: ArcadeEngineState, at: number, afterVote = false): void {
  const u = state.undercover!;
  const undercoverCount = u.alivePlayerIds.filter((id) => u.roles[id] === 'undercover').length;
  if (undercoverCount === 0) u.outcome = 'civilian';
  else if (undercoverCount >= u.alivePlayerIds.length - undercoverCount || (afterVote && u.round >= 3)) u.outcome = 'undercover';
  if (u.outcome) { u.phase = 'finished'; finish(state, at); }
}
function advanceUndercover(state: ArcadeEngineState, at: number): void {
  const u = state.undercover!;
  while (state.phase === 'running' && at >= u.phaseEndsAt) {
    if (u.phase === 'describe') {
      u.phase = 'vote'; u.phaseEndsAt += 20_000;
      for (const p of state.players.filter((p) => p.isBot && u.alivePlayerIds.includes(p.id))) {
        const candidates = u.alivePlayerIds.filter((id) => id !== p.id);
        if (candidates.length) u.votes[p.id] = candidates[Math.floor(random(p) * candidates.length)];
      }
    } else {
      const counts = new Map<string, number>();
      for (const [voter, target] of Object.entries(u.votes)) {
        if (!u.alivePlayerIds.includes(voter) || !u.alivePlayerIds.includes(target)) continue;
        counts.set(target, (counts.get(target) ?? 0) + 1);
        if (u.roles[voter] === 'civilian' && u.roles[target] === 'undercover') u.correctVotes[voter] = (u.correctVotes[voter] ?? 0) + 1;
      }
      const ranking = [...counts].sort((a, b) => b[1] - a[1]);
      if (ranking[0] && (!ranking[1] || ranking[0][1] > ranking[1][1])) {
        const eliminated = ranking[0][0];
        u.alivePlayerIds = u.alivePlayerIds.filter((id) => id !== eliminated); u.eliminatedPlayerIds.push(eliminated);
      }
      // Both roles have the same 300-point action ceiling: identify the rival,
      // or survive a completed vote without revealing the private role in-flight.
      for (const id of u.alivePlayerIds.filter((id) => u.roles[id] === 'undercover')) u.correctVotes[id] = (u.correctVotes[id] ?? 0) + 1;
      undercoverOutcome(state, u.phaseEndsAt, true);
      if (u.outcome) break;
      u.round += 1; u.phase = 'describe'; u.phaseEndsAt += 30_000; u.votes = {}; botDescriptions(state);
    }
  }
}
function advanceMutable(state: ArcadeEngineState, now: number): void {
  validateNow(now);
  if (now < state.advancedAt) fail('TIME_REVERSED');
  if (state.phase === 'finished') return;
  const at = Math.min(now, state.endsAt);
  if (state.gameKey === 'draw') {
    const d = state.draw!;
    while (state.phase === 'running' && at >= d.roundEndsAt) nextDrawRound(state, d.roundEndsAt);
  } else if (state.gameKey === 'undercover') advanceUndercover(state, at);
  else for (const p of state.players.filter((p) => !p.finished)) {
    if (state.gameKey === 'zhesi') { while (!p.finished && at >= p.zhesi!.turnEndsAt) tickZhesi(p); continue; }
    while (!p.finished) {
      const interval = state.gameKey === 'snake' ? 250 : state.gameKey === 'tank' ? 150 : tetris.dropIntervalForLevel(p.tetris!.level);
      if (at - p.lastTickAt < interval) break;
      p.lastTickAt += interval;
      if (p.snake) { p.snake = snake.advanceGame(p.snake, () => random(p)); p.score = p.snake.score; p.finished = p.snake.status !== 'running'; }
      if (p.tetris) { refill(p); p.tetris = tetris.tetrisGameReducer(p.tetris, { type: 'tick' }); p.score = p.tetris.score; p.finished = p.tetris.status !== 'running'; }
      if (p.tank) { p.tank = tank.stepTankGame(p.tank, () => random(p)); p.score = p.tank.score; p.finished = p.tank.status !== 'running'; }
    }
  }
  state.advancedAt = now;
  if (state.phase === 'running' && (now >= state.endsAt || state.players.filter((p) => !p.isBot).every((p) => p.finished))) finish(state, at);
}
export function advance(previous: ArcadeEngineState, now: number): ArcadeEngineState { const state = clone(previous); advanceMutable(state, now); return state; }

export function act(previous: ArcadeEngineState, actorId: string, kind: string, payload: Record<string, unknown>, now: number): ArcadeEngineState {
  const state = advance(previous, now);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail('INVALID_ACTION');
  const p = state.players.find((p) => p.id === actorId && !p.isBot);
  if (!p) return fail('NOT_A_PLAYER');
  if (state.phase !== 'running' || p.finished || p.forfeited) return fail('GAME_FINISHED');
  if (p.actionCount >= 2400) return fail('ACTION_LIMIT');
  const delay = kind === 'guess' ? 700 : kind === 'stroke' ? 50 : kind === 'fire' ? 250 : 65;
  if (now - p.lastActionAt < delay) return fail('ACTION_TOO_FAST');
  if (state.gameKey === 'snake' && kind === 'direction') {
    fields(payload, ['direction']); if (!DIRECTIONS.includes(payload.direction as ArcadeDirection)) fail('INVALID_DIRECTION');
    p.snake = snake.queueDirection(p.snake!, payload.direction as ArcadeDirection);
  } else if (state.gameKey === 'tank' && kind === 'direction') {
    fields(payload, ['direction']); if (!DIRECTIONS.includes(payload.direction as ArcadeDirection)) fail('INVALID_DIRECTION');
    p.tank = tank.movePlayerTank(p.tank!, payload.direction as ArcadeDirection);
  } else if (state.gameKey === 'tank' && kind === 'fire') { fields(payload, []); p.tank = tank.firePlayerTank(p.tank!); }
  else if (state.gameKey === 'tetris' && kind === 'tetris') {
    fields(payload, ['move']); const move = payload.move;
    if (typeof move !== 'string' || !['left', 'right', 'rotate', 'softDrop', 'hardDrop'].includes(move)) fail('INVALID_MOVE');
    refill(p);
    p.tetris = tetris.tetrisGameReducer(p.tetris!, move === 'left' || move === 'right' ? { type: 'move', columnDelta: move === 'left' ? -1 : 1 } : { type: move as 'rotate' | 'softDrop' | 'hardDrop' });
    p.score = p.tetris.score; p.finished = p.tetris.status !== 'running';
  } else if (state.gameKey === 'zhesi' && kind === 'choice') {
    fields(payload, ['choice', 'turn']); const z = p.zhesi!;
    if (payload.turn !== z.turn) fail('STALE_TURN');
    if (z.chosen) fail('ALREADY_CHOSEN');
    if (typeof payload.choice !== 'string' || !['strike', 'guard', 'train'].includes(payload.choice)) fail('INVALID_CHOICE');
    z.choice = payload.choice as 'strike' | 'guard' | 'train'; z.chosen = true;
  } else if (state.gameKey === 'draw') actDraw(state, p, kind, payload, now);
  else if (state.gameKey === 'undercover') actUndercover(state, p, kind, payload);
  else fail('INVALID_ACTION');
  p.lastActionAt = now; p.actionCount += 1;
  if (state.players.filter((p) => !p.isBot).every((p) => p.finished)) finish(state, now);
  return state;
}
function actDraw(state: ArcadeEngineState, p: Player, kind: string, payload: Record<string, unknown>, now: number): void {
  const d = state.draw!;
  if (!['stroke', 'clear', 'guess'].includes(kind)) fail('INVALID_ACTION');
  if (payload.round !== d.round) fail('STALE_ROUND');
  if (kind === 'guess') {
    fields(payload, ['round', 'text']);
    if (p.id === d.drawerId) fail('DRAWER_CANNOT_GUESS');
    if (d.correct.includes(p.id)) fail('ALREADY_GUESSED');
    const guess = text(payload.text, 40); const correct = normalized(guess) === normalized(DRAW_WORDS[d.wordIndex].word);
    d.messages.push({ playerId: p.id, text: correct ? '猜中了' : guess, correct }); d.messages = d.messages.slice(-20);
    if (correct) {
      p.score += 100 + Math.min(100, Math.floor((d.roundEndsAt - now) / (d.roundEndsAt - d.roundStartedAt) * 100));
      const drawer = state.players.find((player) => player.id === d.drawerId)!;
      if (d.correct.length === 0 && !drawer.forfeited && !drawer.isBot) drawer.score += 200;
      d.correct.push(p.id); d.guessedPlayerIds.push(p.id);
    }
  } else {
    if (p.id !== d.drawerId) fail('NOT_THE_DRAWER');
    if (kind === 'clear') { fields(payload, ['round']); d.strokes = []; return; }
    fields(payload, ['round', 'points', 'color', 'width']);
    if (!Array.isArray(payload.points) || payload.points.length < 2 || payload.points.length > 64 || typeof payload.color !== 'string' || !['#334155', '#dc2626', '#2563eb', '#16a34a'].includes(payload.color) || typeof payload.width !== 'number' || ![2, 4, 8].includes(payload.width)) fail('INVALID_STROKE');
    const points = payload.points as unknown[];
    for (const point of points) {
      if (!point || typeof point !== 'object' || Array.isArray(point)) fail('INVALID_STROKE');
      const item = point as Record<string, unknown>;
      fields(item, ['x', 'y']);
      if (typeof item.x !== 'number' || typeof item.y !== 'number' || !Number.isFinite(item.x) || !Number.isFinite(item.y) || item.x < 0 || item.x > 1000 || item.y < 0 || item.y > 1000) fail('INVALID_STROKE');
    }
    if (d.strokes.length >= 240) fail('CANVAS_FULL');
    const boundedPoints = (points as { x: number; y: number }[]).map(({ x, y }) => ({ x: Math.round(x), y: Math.round(y) }));
    d.strokes.push({ points: boundedPoints, color: payload.color as ArcadeStroke['color'], width: payload.width as ArcadeStroke['width'] });
  }
}
function actUndercover(state: ArcadeEngineState, p: Player, kind: string, payload: Record<string, unknown>): void {
  const u = state.undercover!;
  if (!['describe', 'vote'].includes(kind)) fail('INVALID_ACTION');
  if (payload.round !== u.round) fail('STALE_ROUND');
  if (!u.alivePlayerIds.includes(p.id)) fail('PLAYER_ELIMINATED');
  if (kind === 'describe') {
    fields(payload, ['round', 'text']); if (u.phase !== 'describe') fail('WRONG_PHASE');
    if (u.descriptions.some((d) => d.round === u.round && d.playerId === p.id)) fail('ALREADY_DESCRIBED');
    const description = text(payload.text, 80);
    if (normalized(description).includes(normalized(u.words[p.id]))) fail('DO_NOT_REVEAL_WORD');
    u.descriptions.push({ playerId: p.id, text: description, round: u.round });
    u.contributions[p.id] = (u.contributions[p.id] ?? 0) + 1;
  } else {
    fields(payload, ['round', 'targetId']); if (u.phase !== 'vote') fail('WRONG_PHASE');
    if (u.votes[p.id]) fail('ALREADY_VOTED');
    if (typeof payload.targetId !== 'string' || payload.targetId === p.id || !u.alivePlayerIds.includes(payload.targetId)) fail('INVALID_TARGET');
    u.votes[p.id] = payload.targetId as string;
  }
}
export function forfeit(previous: ArcadeEngineState, playerId: string, now: number): ArcadeEngineState {
  const state = advance(previous, now);
  const p = state.players.find((p) => p.id === playerId && !p.isBot);
  if (!p) return fail('NOT_A_PLAYER');
  if (state.phase === 'finished' || p.forfeited) return state;
  p.forfeited = true; p.finished = true; p.score = 0;
  if (state.undercover) {
    const u = state.undercover!;
    u.alivePlayerIds = u.alivePlayerIds.filter((id) => id !== playerId);
    if (!u.eliminatedPlayerIds.includes(playerId)) u.eliminatedPlayerIds.push(playerId);
    delete u.votes[playerId];
    undercoverOutcome(state, now);
  }
  if (state.draw?.drawerId === playerId) {
    nextDrawRound(state, now);
  }
  if (state.players.filter((p) => !p.isBot).every((p) => p.finished)) finish(state, now);
  return state;
}
export function result(state: ArcadeEngineState): ArcadeEngineResult | null {
  return state.phase === 'finished' ? { finishedAt: state.finishedAt!, scores: state.players.filter((p) => !p.isBot && !p.forfeited).map((p) => ({ userId: p.id, score: Math.max(0, Math.floor(p.score)) })) } : null;
}
const INSTRUCTIONS: Record<ArcadeGameKey, string> = {
  snake: '120 秒同题独立棋盘竞速；方向键移动，吃到食物得 10 分。撞墙或自身结束，单人与房间同规则。',
  tetris: '120 秒同题独立棋盘竞速；方向移动、旋转与落下。消行计 100/300/500/800 × 等级分，软降每格 1 分、硬降每格 2 分。',
  tank: '120 秒独立战场竞速；方向移动、点击开火，击毁每辆敌车得 100 分。三条生命，单人与房间同规则。',
  zhesi: '独立短局试炼，不读取长期存档。每回合 8 秒，共 10 回合；造成伤害 × 3，加击败奖励 300 和剩余生命，最高 1000 分。',
  draw: '轮流绘画与猜词，系统按答对及用时计分；画手每轮首次被猜中获 200 分，猜者获 100–200 分，按总轮次折算为 1000 分制。单人是系统绘图练习。',
  undercover: '每轮描述 30 秒、投票 20 秒，共最多 3 轮；平票无人出局。阵营获胜 600 分，平民投中卧底或卧底存活一轮各 150 分（上限 300），描述每次 50 分（上限 100）。单人含明确标注的系统练习搭档。',
};
export function view(state: ArcadeEngineState, viewerId: string, now: number): ArcadeGameView {
  validateNow(now);
  const p = state.players.find((p) => p.id === viewerId && !p.isBot);
  if (!p) return fail('NOT_A_PLAYER');
  const base = { version: 1 as const, gameKey: state.gameKey, mode: state.mode, phase: state.phase, startedAt: state.startedAt, endsAt: state.endsAt, serverNow: now, viewerId, instructions: INSTRUCTIONS[state.gameKey], players: state.players.map(({ id, displayName, score, finished, isBot }) => ({ id, displayName, score: state.gameKey === 'draw' && state.phase === 'running' ? Math.min(1000, Math.floor(score / (state.draw!.totalRounds * 200) * 1000)) : score, finished, isBot })) };
  if (state.gameKey === 'snake') { const b = p.snake!; return clone({ ...base, gameKey: 'snake', board: { snake: [...b.snake], food: b.food, direction: b.direction, status: b.status, width: 20, height: 20 } }); }
  if (state.gameKey === 'tetris') { const b = p.tetris!; return clone({ ...base, gameKey: 'tetris', board: { board: b.board, activePiece: b.activePiece, nextPiece: b.queue[0] ?? 'T', lines: b.lines, level: b.level, status: b.status } }); }
  if (state.gameKey === 'tank') { const b = p.tank!; return clone({ ...base, gameKey: 'tank', board: { player: b.player, enemies: b.enemies, bullets: b.bullets, walls: b.walls, status: b.status, width: 15, height: 11 } }); }
  if (state.gameKey === 'zhesi') { const b = p.zhesi!; const { choice: _choice, damage: _damage, turnsPlayed: _turnsPlayed, ...board } = b; return clone({ ...base, gameKey: 'zhesi', board }); }
  if (state.gameKey === 'draw') {
    const d = state.draw!;
    return clone({ ...base, gameKey: 'draw', board: { round: d.round, totalRounds: d.totalRounds, drawerId: d.drawerId, roundEndsAt: d.roundEndsAt, strokes: d.strokes, wordLength: DRAW_WORDS[d.wordIndex].word.length, word: d.drawerId === viewerId ? DRAW_WORDS[d.wordIndex].word : null, guessedPlayerIds: d.guessedPlayerIds, messages: d.messages, practicePartner: d.practicePartner } });
  }
  const u = state.undercover!;
  return clone({ ...base, gameKey: 'undercover', board: { round: u.round, phase: u.phase, phaseEndsAt: u.phaseEndsAt, word: u.words[viewerId] ?? null, alivePlayerIds: u.alivePlayerIds, descriptions: u.descriptions, votedPlayerIds: Object.keys(u.votes), myVote: u.votes[viewerId] ?? null, eliminatedPlayerIds: u.eliminatedPlayerIds, outcome: u.outcome, reveals: state.phase === 'finished' ? state.players.map((player) => ({ playerId: player.id, word: u.words[player.id], role: u.roles[player.id] })) : [], practicePartner: u.practicePartner } });
}
