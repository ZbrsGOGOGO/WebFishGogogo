import { createHash, createHmac } from 'node:crypto';
import type {
  RailActionKind, RailCard, RailCardKind, RailEngineResult, RailGameView, RailHand,
  RailParticipant, RailPhase, RailPlayedCharacter, RailPlayerStats, RailRoundRating,
  RailRoundResult, RailTrack,
} from '@stealth-reader/shared';
import { RAIL_CARDS, RAIL_DECK_VERSION } from './cards';

export class RailEngineError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'RailEngineError'; }
}
export const RAIL_PHASE_MS = { placement: 60_000, buff: 45_000, decision: 45_000, rating: 30_000, round_end: 15_000 } as const;
export const RAIL_BOT_DELAY_MS = 1_500;
const ROUND_MAX_MS = Object.values(RAIL_PHASE_MS).reduce((sum, value) => sum + value, 0);
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const BOT_ID = /^AI0[1-8]$/;
const RULES = '3–9 席，按座次各任列车长一次。善牌放己方，恶牌放对方，再为任意未加特性的角色加一张特性牌。列车经过的一队本轮不计生存，另一队计 1 轮；列车长轮不计分母。其余成员给当轮列车长评 1–10 恶魔值，禁止自评；超时弃评不加分。最高恶魔值仅作展示。机器人、退出或任一必要操作超时的玩家不具备排行榜资格。';

interface RailEnginePlayer extends RailParticipant {
  seat: number;
  team: RailTrack | null;
  left: boolean;
  missedRequired: boolean;
  manualActions: number;
  hand: RailHand;
  placedGood: boolean;
  placedBad: boolean;
  placedBuff: boolean;
  rating: RailRoundRating | null;
  survived: number;
  eligibleRounds: number;
  demonTotal: number;
}
/** Private persisted JSON. Never spread this object (or a player) into an API response. */
export interface RailEngineState {
  version: 1;
  /** Missing on legacy persisted rounds; stamped only when a new round is dealt. */
  deckVersion?: string;
  phase: RailPhase;
  round: number;
  roundToken: string;
  startedAt: number;
  phaseStartedAt: number;
  deadlineAt: number;
  endsAt: number;
  advancedAt: number;
  finishedAt: number | null;
  rngSeed: string;
  rngCounter: number;
  botsActed: boolean;
  conductorId: string;
  players: RailEnginePlayer[];
  tracks: Record<RailTrack, RailPlayedCharacter[]>;
  chosenTrack: RailTrack | null;
  automaticDecision: boolean;
  history: RailRoundResult[];
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function fail(code: string): never { throw new RailEngineError(code); }
const opposite = (track: RailTrack): RailTrack => track === 'A' ? 'B' : 'A';
const emptyHand = (): RailHand => ({ good: [], bad: [], buff: [] });
function validateNow(now: number): void {
  if (!Number.isSafeInteger(now) || now < 0 || now > 8_640_000_000_000_000 - 3_600_000) fail('INVALID_TIME');
}
function random(state: RailEngineState): number {
  // A public round token or played card must not expose a reversible xorshift seed.
  const digest = createHmac('sha256', state.rngSeed).update(`shuffle:${state.rngCounter++}`).digest();
  return digest.readUInt32BE(0) / 0x1_0000_0000;
}
function shuffle<T>(state: RailEngineState, input: readonly T[]): T[] {
  const items = [...input];
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random(state) * (index + 1));
    [items[index], items[swap]] = [items[swap], items[index]];
  }
  return items;
}
function phase(state: RailEngineState, value: Exclude<RailPhase, 'finished'>, at: number): void {
  state.phase = value;
  state.phaseStartedAt = at;
  state.deadlineAt = at + RAIL_PHASE_MS[value];
  state.botsActed = false;
}
function startRound(state: RailEngineState, at: number): void {
  state.deckVersion = RAIL_DECK_VERSION;
  state.conductorId = state.players[state.round - 1].id;
  state.roundToken = createHmac('sha256', state.rngSeed).update(`round:${state.round}`).digest('hex').slice(0, 32);
  state.tracks = { A: [], B: [] };
  state.chosenTrack = null;
  state.automaticDecision = false;
  for (const player of state.players) {
    player.team = null;
    player.hand = emptyHand();
    player.placedGood = false;
    player.placedBad = false;
    player.placedBuff = false;
    player.rating = null;
  }
  const teams = shuffle(state, state.players.filter((player) => player.id !== state.conductorId));
  const first: RailTrack = random(state) < 0.5 ? 'A' : 'B';
  teams.forEach((player, index) => {
    player.team = index % 2 === 0 ? first : opposite(first);
    for (const kind of ['good', 'bad', 'buff'] as const) {
      player.hand[kind] = shuffle(state, RAIL_CARDS[kind]).slice(0, 3).map((template, cardIndex) => ({
        ...template, id: `r${state.round}:p${player.seat}:${kind}:${cardIndex}`, kind, deckVersion: RAIL_DECK_VERSION,
      }));
    }
  });
  phase(state, 'placement', at);
}

export function create(participants: RailParticipant[], now: number, seed: string): RailEngineState {
  validateNow(now);
  if (!Array.isArray(participants) || participants.length < 3 || participants.length > 9) fail('INVALID_PLAYER_COUNT');
  if (participants.some((player) => !player || typeof player !== 'object' ||
    typeof player.id !== 'string' || typeof player.isBot !== 'boolean' ||
    !(player.isBot ? BOT_ID : UUID).test(player.id) ||
    typeof player.displayName !== 'string' || !player.displayName.trim() || player.displayName.length > 80 ||
    /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2060-\u206f]/u.test(player.displayName)) ||
    new Set(participants.map((player) => player.id.toLowerCase())).size !== participants.length ||
    participants.filter((player) => player.isBot).length > 8 || participants.every((player) => player.isBot)) fail('INVALID_PLAYER');
  if (typeof seed !== 'string' || seed.length < 16 || seed.length > 512) fail('INVALID_SEED');
  const players: RailEnginePlayer[] = participants.map((player, seat) => ({
    id: player.id, displayName: player.displayName, isBot: player.isBot, seat: seat + 1,
    team: null, left: false, missedRequired: false, manualActions: 0, hand: emptyHand(),
    placedGood: false, placedBad: false, placedBuff: false, rating: null,
    survived: 0, eligibleRounds: 0, demonTotal: 0,
  }));
  const state: RailEngineState = {
    version: 1, phase: 'placement', round: 1, roundToken: '', startedAt: now,
    phaseStartedAt: now, deadlineAt: now, endsAt: now + players.length * ROUND_MAX_MS,
    advancedAt: now, finishedAt: null, rngSeed: createHash('sha256').update(seed).digest('hex'),
    rngCounter: 0, botsActed: false, conductorId: players[0].id, players,
    tracks: { A: [], B: [] }, chosenTrack: null, automaticDecision: false, history: [],
  };
  startRound(state, now);
  return state;
}

function takeCard(player: RailEnginePlayer, kind: RailCardKind, cardId: string): RailCard {
  const index = player.hand[kind].findIndex((card) => card.id === cardId);
  if (index < 0) return fail('CARD_NOT_OWNED');
  return player.hand[kind].splice(index, 1)[0];
}
function placed(state: RailEngineState, player: RailEnginePlayer, kind: 'good' | 'bad', cardId: string, automatic: boolean): void {
  if (!player.team) fail('CONDUCTOR_CANNOT_PLACE');
  if (kind === 'good' ? player.placedGood : player.placedBad) fail('ALREADY_PLACED');
  const card = takeCard(player, kind, cardId);
  const track = kind === 'good' ? player.team! : opposite(player.team!);
  state.tracks[track].push({ id: card.id, card, ownerId: player.id, track, automatic, buff: null });
  if (kind === 'good') player.placedGood = true;
  else player.placedBad = true;
  completed(player, automatic);
}
function buffed(state: RailEngineState, player: RailEnginePlayer, cardId: string, targetId: string, automatic: boolean): void {
  if (!player.team) fail('CONDUCTOR_CANNOT_PLACE');
  if (player.placedBuff) fail('ALREADY_PLACED');
  const target = [...state.tracks.A, ...state.tracks.B].find((item) => item.id === targetId);
  if (!target) fail('INVALID_TARGET');
  if (target.buff) fail('TARGET_ALREADY_BUFFED');
  const card = takeCard(player, 'buff', cardId);
  target.buff = { card, ownerId: player.id, automatic };
  player.placedBuff = true;
  completed(player, automatic);
}
function completed(player: RailEnginePlayer, automatic: boolean): void {
  if (automatic && !player.isBot) player.missedRequired = true;
  if (!automatic && !player.isBot) player.manualActions += 1;
}
function choose(state: RailEngineState, track: RailTrack, automatic: boolean): void {
  if (state.chosenTrack) fail('ALREADY_CHOSEN');
  state.chosenTrack = track;
  state.automaticDecision = automatic;
  completed(state.players.find((player) => player.id === state.conductorId)!, automatic);
  for (const player of state.players) {
    if (!player.team) continue;
    player.eligibleRounds += 1;
    if (player.team !== track) player.survived += 1;
  }
}
function rated(player: RailEnginePlayer, value: number | null, automatic: boolean): void {
  if (!player.team) fail('CANNOT_RATE_SELF');
  if (player.rating) fail('ALREADY_RATED');
  player.rating = { playerId: player.id, value, automatic };
  completed(player, automatic);
}
function endRound(state: RailEngineState, at: number): void {
  if (!state.chosenTrack) fail('INCOMPLETE_ROUND');
  const ratings = state.players.flatMap((player) => player.rating ? [clone(player.rating)] : []);
  const demonScore = ratings.reduce((sum, rating) => sum + (rating.value ?? 0), 0);
  state.players.find((player) => player.id === state.conductorId)!.demonTotal += demonScore;
  state.history.push({
    round: state.round, conductorId: state.conductorId, chosenTrack: state.chosenTrack,
    automaticDecision: state.automaticDecision,
    survivedPlayerIds: state.players.filter((player) => player.team && player.team !== state.chosenTrack).map((player) => player.id),
    passedPlayerIds: state.players.filter((player) => player.team === state.chosenTrack).map((player) => player.id),
    ratings, demonScore,
  });
  phase(state, 'round_end', at);
}
function nextRound(state: RailEngineState, at: number): void {
  if (state.round >= state.players.length) {
    state.phase = 'finished';
    state.finishedAt = at;
    state.deadlineAt = at;
    for (const player of state.players) player.hand = emptyHand();
    return;
  }
  state.round += 1;
  startRound(state, at);
}
function progress(state: RailEngineState, at: number): void {
  const participants = state.players.filter((player) => player.team);
  if (state.phase === 'placement' && participants.every((player) => player.placedGood && player.placedBad)) phase(state, 'buff', at);
  else if (state.phase === 'buff' && participants.every((player) => player.placedBuff)) phase(state, 'decision', at);
  else if (state.phase === 'decision' && state.chosenTrack) phase(state, 'rating', at);
  else if (state.phase === 'rating' && participants.every((player) => player.rating)) endRound(state, at);
}
function autoPlayer(state: RailEngineState, player: RailEnginePlayer): void {
  if (state.phase === 'placement' && player.team) {
    for (const kind of ['good', 'bad'] as const) {
      if (kind === 'good' ? player.placedGood : player.placedBad) continue;
      const hand = player.hand[kind];
      placed(state, player, kind, hand[Math.floor(random(state) * hand.length)].id, true);
    }
  } else if (state.phase === 'buff' && player.team && !player.placedBuff) {
    const targets = [...state.tracks.A, ...state.tracks.B].filter((target) => !target.buff);
    const card = player.hand.buff[Math.floor(random(state) * player.hand.buff.length)];
    const target = targets[Math.floor(random(state) * targets.length)];
    if (!card || !target) fail('INCOMPLETE_ROUND');
    buffed(state, player, card.id, target.id, true);
  } else if (state.phase === 'decision' && player.id === state.conductorId && !state.chosenTrack) {
    choose(state, random(state) < 0.5 ? 'A' : 'B', true);
  } else if (state.phase === 'rating' && player.team && !player.rating) {
    // A bot expresses an explicitly automated opinion. A timed-out/left human abstains.
    rated(player, player.isBot ? 1 + Math.floor(random(state) * 10) : null, true);
  }
}
function advanceMutable(state: RailEngineState, now: number): void {
  validateNow(now);
  if (now < state.advancedAt) fail('TIME_REVERSED');
  if (state.phase === 'finished') return;
  // At most 9 rounds * 5 phases * 2 scheduled events, independent of poll frequency.
  for (let events = 0; events < 100; events += 1) {
    if ((state.phase as RailPhase) === 'finished') break;
    const automaticAt = state.phaseStartedAt + RAIL_BOT_DELAY_MS;
    const at = !state.botsActed ? Math.min(automaticAt, state.deadlineAt) : state.deadlineAt;
    if (at > now) break;
    const expired = at >= state.deadlineAt;
    state.botsActed = true;
    if (state.phase === 'round_end') {
      const conductor = state.players.find((player) => player.id === state.conductorId)!;
      if (expired || conductor.isBot || conductor.left) nextRound(state, at);
    } else {
      for (const player of state.players) if (expired || player.isBot || player.left) autoPlayer(state, player);
      progress(state, at);
    }
  }
  state.advancedAt = now;
}
export function advance(state: RailEngineState, now: number): RailEngineState {
  const next = clone(state);
  advanceMutable(next, now);
  return next;
}

function payloadFields(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value) as object | null)) return fail('INVALID_ACTION');
  const keys = Reflect.ownKeys(value);
  if (keys.length !== allowed.length || keys.some((key) => typeof key !== 'string' || !allowed.includes(key)) ||
    allowed.some((key) => !Object.prototype.hasOwnProperty.call(value, key) || !('value' in Object.getOwnPropertyDescriptor(value, key)!))) return fail('INVALID_ACTION');
  return value as Record<string, unknown>;
}
function boundedId(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 80) return fail('INVALID_ACTION');
  return value;
}
export function act(state: RailEngineState, playerId: string, kind: string, payload: unknown, now: number): RailEngineState {
  const allowed: Partial<Record<RailActionKind, readonly string[]>> = {
    place_good: ['roundToken', 'cardId'], place_bad: ['roundToken', 'cardId'],
    place_buff: ['roundToken', 'cardId', 'targetId'], choose_track: ['roundToken', 'track'],
    rate: ['roundToken', 'value'], next_round: ['roundToken'],
  };
  if (!Object.prototype.hasOwnProperty.call(allowed, kind)) return fail('INVALID_ACTION');
  const input = payloadFields(payload, allowed[kind as RailActionKind]!);
  const next = advance(state, now);
  const player = next.players.find((candidate) => candidate.id === playerId);
  if (!player || player.isBot) return fail('NOT_A_PLAYER');
  if (player.left) return fail('PLAYER_LEFT');
  if (next.phase === 'finished') return fail('GAME_FINISHED');
  if (typeof input.roundToken !== 'string' || input.roundToken !== next.roundToken) return fail('STALE_ROUND');
  if (kind === 'place_good' || kind === 'place_bad') {
    if (next.phase !== 'placement') return fail('WRONG_PHASE');
    placed(next, player, kind === 'place_good' ? 'good' : 'bad', boundedId(input.cardId), false);
  } else if (kind === 'place_buff') {
    if (next.phase !== 'buff') return fail('WRONG_PHASE');
    buffed(next, player, boundedId(input.cardId), boundedId(input.targetId), false);
  } else if (kind === 'choose_track') {
    if (next.phase !== 'decision') return fail('WRONG_PHASE');
    if (player.id !== next.conductorId) return fail('NOT_THE_CONDUCTOR');
    if (input.track !== 'A' && input.track !== 'B') return fail('INVALID_TRACK');
    choose(next, input.track, false);
  } else if (kind === 'rate') {
    if (next.phase !== 'rating') return fail('WRONG_PHASE');
    if (!Number.isInteger(input.value) || (input.value as number) < 1 || (input.value as number) > 10) return fail('INVALID_RATING');
    rated(player, input.value as number, false);
  } else if (kind === 'next_round') {
    if (next.phase !== 'round_end') return fail('WRONG_PHASE');
    if (player.id !== next.conductorId) return fail('NOT_THE_CONDUCTOR');
    nextRound(next, now);
    return next;
  }
  progress(next, now);
  return next;
}

export function leave(state: RailEngineState, playerId: string, now: number): RailEngineState {
  const next = advance(state, now);
  const player = next.players.find((candidate) => candidate.id === playerId);
  if (!player || player.isBot) return fail('NOT_A_PLAYER');
  // Leaving a completed room cannot retroactively change an already settled match.
  if (next.phase === 'finished' || player.left) return next;
  player.left = true;
  autoPlayer(next, player);
  if (next.phase === 'round_end' && player.id === next.conductorId) nextRound(next, now);
  else progress(next, now);
  return next;
}
function stats(state: RailEngineState, player: RailEnginePlayer): RailPlayerStats {
  const required = (state.players.length - 1) * 4 + 1;
  return {
    survived: player.survived, eligibleRounds: player.eligibleRounds,
    rateBasisPoints: player.eligibleRounds > 0 ? Math.floor(player.survived * 10_000 / player.eligibleRounds) : 0,
    demonTotal: player.demonTotal,
    eligible: !player.isBot && !player.left && !player.missedRequired && (state.phase !== 'finished' || player.manualActions === required),
  };
}
export function result(state: RailEngineState): RailEngineResult | null {
  if (state.phase !== 'finished' || state.finishedAt === null) return null;
  const players = state.players.map((player) => ({
    id: player.id, displayName: player.displayName, isBot: player.isBot, left: player.left, ...stats(state, player),
  }));
  const eligible = players.filter((player) => player.eligible);
  const bestSurvival = Math.max(0, ...eligible.map((player) => player.rateBasisPoints));
  const demons = players.filter((player) => !player.isBot && !player.left && player.demonTotal > 0);
  const bestDemon = Math.max(0, ...demons.map((player) => player.demonTotal));
  return {
    finishedAt: state.finishedAt, players,
    survivorMvpIds: eligible.filter((player) => player.rateBasisPoints === bestSurvival).map((player) => player.id),
    demonMvpIds: demons.filter((player) => player.demonTotal === bestDemon).map((player) => player.id),
  };
}
function actions(state: RailEngineState, player: RailEnginePlayer): RailActionKind[] {
  if (player.left || player.isBot || state.phase === 'finished') return [];
  if (state.phase === 'placement' && player.team) return [
    ...(!player.placedGood ? ['place_good' as const] : []), ...(!player.placedBad ? ['place_bad' as const] : []),
  ];
  if (state.phase === 'buff' && player.team && !player.placedBuff) return ['place_buff'];
  if (state.phase === 'decision' && player.id === state.conductorId) return ['choose_track'];
  if (state.phase === 'rating' && player.team && !player.rating) return ['rate'];
  if (state.phase === 'round_end' && player.id === state.conductorId) return ['next_round'];
  return [];
}
/** Read-only projection. The caller persists advance(state, now) before projecting it. */
export function view(state: RailEngineState, viewerId: string | null, now: number): RailGameView {
  validateNow(now);
  if (now < state.advancedAt) fail('TIME_REVERSED');
  const player = state.players.find((candidate) => candidate.id === viewerId && !candidate.left && !candidate.isBot);
  return {
    gameKey: 'rail', phase: state.phase, round: state.round, totalRounds: state.players.length,
    ...(state.deckVersion ? { deckVersion: state.deckVersion } : {}),
    roundToken: state.roundToken, startedAt: state.startedAt, deadlineAt: state.deadlineAt,
    endsAt: state.endsAt, serverNow: now, conductorId: state.conductorId,
    viewerRole: player ? 'participant' : 'spectator',
    players: state.players.map((candidate) => ({
      id: candidate.id, displayName: candidate.displayName, isBot: candidate.isBot, seat: candidate.seat,
      team: candidate.team, left: candidate.left, placedGood: candidate.placedGood,
      placedBad: candidate.placedBad, placedBuff: candidate.placedBuff, rated: candidate.rating !== null,
      ...stats(state, candidate),
    })),
    tracks: clone(state.tracks), chosenTrack: state.chosenTrack, automaticDecision: state.automaticDecision,
    me: player ? {
      id: player.id, team: player.team, hand: clone(player.hand),
      availableActions: now >= state.deadlineAt ? [] : actions(state, player), myRating: player.rating?.value ?? null,
    } : null,
    roundResult: clone(state.history.find((round) => round.round === state.round) ?? null),
    history: clone(state.history), result: result(state), rules: RULES,
  };
}
