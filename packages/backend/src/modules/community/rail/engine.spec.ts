import type { RailActionKind, RailParticipant, RailTrack } from '@stealth-reader/shared';
import { act, advance, create, leave, RailEngineError, RailEngineState, RAIL_BOT_DELAY_MS, RAIL_PHASE_MS, result, view } from './engine';
import { RAIL_CARDS } from './cards';

const NOW = 2_000_000;
const SEED = 'rail-server-only-cryptographic-seed-0123456789';
const HUMANS: RailParticipant[] = Array.from({ length: 9 }, (_, index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, displayName: `成员 ${index + 1}`, isBot: false,
}));
const BOTS: RailParticipant[] = Array.from({ length: 8 }, (_, index) => ({ id: `AI0${index + 1}`, displayName: `AI0${index + 1}`, isBot: true }));
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const make = (count = 3): RailEngineState => create(HUMANS.slice(0, count), NOW, SEED);
function rejects(fn: () => unknown, code: string): void {
  let caught: unknown;
  try { fn(); } catch (exception) { caught = exception; }
  expect(caught).toBeInstanceOf(RailEngineError);
  expect((caught as RailEngineError).code).toBe(code);
}
function action(state: RailEngineState, id: string, kind: RailActionKind, fields: Record<string, unknown> = {}): RailEngineState {
  return act(state, id, kind, { roundToken: state.roundToken, ...fields }, state.advancedAt + 10);
}
function placeAll(input: RailEngineState): RailEngineState {
  let state = input;
  for (const player of input.players.filter((candidate) => candidate.team)) {
    for (const kind of ['good', 'bad'] as const) state = action(state, player.id, kind === 'good' ? 'place_good' : 'place_bad', { cardId: player.hand[kind][0].id });
  }
  expect(state.phase).toBe('buff');
  return state;
}
function buffAll(input: RailEngineState): RailEngineState {
  let state = input;
  for (const player of input.players.filter((candidate) => candidate.team)) {
    const target = [...state.tracks.A, ...state.tracks.B].find((character) => !character.buff)!;
    state = action(state, player.id, 'place_buff', { cardId: player.hand.buff[0].id, targetId: target.id });
  }
  expect(state.phase).toBe('decision');
  return state;
}
function completeRound(input: RailEngineState, rating = 5, chosenTrack: RailTrack = 'A'): RailEngineState {
  let state = buffAll(placeAll(input));
  state = action(state, state.conductorId, 'choose_track', { track: chosenTrack });
  expect(state.phase).toBe('rating');
  for (const player of state.players.filter((candidate) => candidate.team)) state = action(state, player.id, 'rate', { value: rating });
  expect(state.phase).toBe('round_end');
  return state;
}
function completeGame(count = 3): RailEngineState {
  let state = make(count);
  for (let round = 0; round < count; round += 1) {
    state = completeRound(state);
    state = action(state, state.conductorId, 'next_round');
  }
  return state;
}
function practiceWithManualHuman(botCount: number): RailEngineState {
  let state = create([HUMANS[0], ...BOTS.slice(0, botCount)], NOW, SEED);
  for (let step = 0; step < 200 && state.phase !== 'finished'; step += 1) {
    const me = view(state, HUMANS[0].id, state.advancedAt).me!;
    const kind = me.availableActions[0];
    if (!kind) {
      state = advance(state, state.botsActed ? state.deadlineAt : state.phaseStartedAt + RAIL_BOT_DELAY_MS);
      continue;
    }
    if (kind === 'place_good') state = action(state, me.id, kind, { cardId: me.hand.good[0].id });
    else if (kind === 'place_bad') state = action(state, me.id, kind, { cardId: me.hand.bad[0].id });
    else if (kind === 'place_buff') state = action(state, me.id, kind, { cardId: me.hand.buff[0].id, targetId: [...state.tracks.A, ...state.tracks.B].find((card) => !card.buff)!.id });
    else if (kind === 'choose_track') state = action(state, me.id, kind, { track: 'A' });
    else if (kind === 'rate') state = action(state, me.id, kind, { value: 6 });
    else state = action(state, me.id, kind);
  }
  return state;
}

describe('rail engine creation and privacy', () => {
  it.each([3, 4, 5, 6, 7, 8, 9])('creates %i seats with balanced randomized teams and exactly three cards of each kind', (count) => {
    const state = make(count);
    expect(state.players).toHaveLength(count);
    expect(state.players[0].team).toBeNull();
    expect(state.players[0].hand).toEqual({ good: [], bad: [], buff: [] });
    const lengths = ['A', 'B'].map((team) => state.players.filter((player) => player.team === team).length);
    expect(Math.abs(lengths[0] - lengths[1])).toBeLessThanOrEqual(1);
    for (const player of state.players.slice(1)) {
      for (const kind of ['good', 'bad', 'buff'] as const) {
        expect(player.hand[kind]).toHaveLength(3);
        expect(new Set(player.hand[kind].map((card) => card.title)).size).toBe(3);
        expect(player.hand[kind].every((card) => card.kind === kind)).toBe(true);
      }
    }
    expect(state.endsAt - NOW).toBe(count * 195_000);
    expect(state.endsAt - NOW).toBeLessThan(30 * 60_000);
    expect(state.deadlineAt).toBe(NOW + 60_000);
  });

  it('is deterministic, JSON round-trippable, and uses a server seed not exposed by public tokens', () => {
    const first = make(9);
    expect(first).toEqual(make(9));
    expect(copy(first)).toEqual(first);
    expect(create(HUMANS, NOW, `${SEED}-other`).players).not.toEqual(first.players);
    expect(first.roundToken).toMatch(/^[a-f0-9]{32}$/);
    const publicJson = JSON.stringify(view(first, null, NOW));
    for (const secret of [SEED, first.rngSeed, 'rngSeed', 'rngCounter', 'manualActions', 'missedRequired']) expect(publicJson).not.toContain(secret);
    expect(HUMANS[0]).not.toHaveProperty('hand');
  });

  it('limits practice to at least one human and at most eight explicit AI seats', () => {
    expect(create([HUMANS[0], ...BOTS], NOW, SEED).players.filter((player) => player.isBot)).toHaveLength(8);
    expect(create([{ ...HUMANS[0], displayName: 'AI01' }, ...HUMANS.slice(1, 3)], NOW, SEED).players[0].isBot).toBe(false);
    rejects(() => create(BOTS.slice(0, 3), NOW, SEED), 'INVALID_PLAYER');
    rejects(() => create([HUMANS[0], HUMANS[1]], NOW, SEED), 'INVALID_PLAYER_COUNT');
    rejects(() => create([...HUMANS, BOTS[0]], NOW, SEED), 'INVALID_PLAYER_COUNT');
    rejects(() => create([HUMANS[0], BOTS[0], { ...BOTS[1], id: 'AI09' }], NOW, SEED), 'INVALID_PLAYER');
    rejects(() => create([{ ...HUMANS[0], isBot: true }, ...HUMANS.slice(1, 3)], NOW, SEED), 'INVALID_PLAYER');
    rejects(() => create([HUMANS[0], { ...BOTS[0], isBot: false }, BOTS[1]], NOW, SEED), 'INVALID_PLAYER');
  });

  it('validates identities, duplicate seats, names, seed and server time', () => {
    rejects(() => create([HUMANS[0], HUMANS[0], HUMANS[2]], NOW, SEED), 'INVALID_PLAYER');
    rejects(() => create([{ ...HUMANS[0], id: '__proto__' }, ...HUMANS.slice(1, 3)], NOW, SEED), 'INVALID_PLAYER');
    rejects(() => create([{ ...HUMANS[0], displayName: 'x'.repeat(81) }, ...HUMANS.slice(1, 3)], NOW, SEED), 'INVALID_PLAYER');
    rejects(() => create([{ ...HUMANS[0], displayName: 'x\u202ey' }, ...HUMANS.slice(1, 3)], NOW, SEED), 'INVALID_PLAYER');
    rejects(() => create(HUMANS.slice(0, 3), NOW, 'short'), 'INVALID_SEED');
    for (const now of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER]) rejects(() => create(HUMANS.slice(0, 3), now, SEED), 'INVALID_TIME');
  });

  it('projects only the own hand, never unplayed cards of peers, conductor, bots, or spectators', () => {
    const state = make(9);
    for (const viewerId of [null, HUMANS[0].id, HUMANS[1].id, 'stranger', 'AI01']) {
      const projected = view(state, viewerId, NOW);
      expect(projected.players.every((player) => !('hand' in player))).toBe(true);
      for (const player of state.players.filter((candidate) => candidate.id !== viewerId)) {
        for (const card of Object.values(player.hand).flat()) expect(JSON.stringify(projected)).not.toContain(card.id);
      }
      if (viewerId === HUMANS[1].id) expect(projected.me?.hand.good).toHaveLength(3);
      if (viewerId === HUMANS[0].id) expect(projected.me?.hand.good).toHaveLength(0);
      if ([null, 'stranger', 'AI01'].includes(viewerId)) expect(projected).toMatchObject({ viewerRole: 'spectator', me: null });
    }
    const projected = view(state, HUMANS[1].id, NOW);
    projected.me!.hand.good[0].title = 'tampered';
    projected.players[0].survived = 9;
    expect(state.players[1].hand.good[0].title).not.toBe('tampered');
    expect(state.players[0].survived).toBe(0);
  });

  it('uses an original, bounded and well-formed card bank with no markup assets', () => {
    for (const kind of ['good', 'bad', 'buff'] as const) {
      expect(RAIL_CARDS[kind].length).toBeGreaterThanOrEqual(24);
      expect(new Set(RAIL_CARDS[kind].map((card) => card.title)).size).toBe(RAIL_CARDS[kind].length);
      expect(RAIL_CARDS[kind].every((card) => card.title.length <= 20 && card.description.length <= 100 && !/[<>]/.test(card.description))).toBe(true);
    }
  });
});

describe('rail legal actions and server-owned phases', () => {
  it('places good cards on own track and bad cards on the opposite one and consumes only those choices', () => {
    const original = make();
    const player = original.players[1];
    let state = action(original, player.id, 'place_good', { cardId: player.hand.good[0].id });
    const good = state.tracks[player.team!][0];
    expect(good).toMatchObject({ ownerId: player.id, track: player.team, automatic: false });
    expect(good.card.kind).toBe('good');
    expect(state.players[1].hand.good).toHaveLength(2);
    expect(original.players[1].hand.good).toHaveLength(3);
    state = action(state, player.id, 'place_bad', { cardId: player.hand.bad[1].id });
    expect(state.tracks[player.team === 'A' ? 'B' : 'A'][0].card.kind).toBe('bad');
    expect(view(state, player.id, state.advancedAt).me?.availableActions).toEqual([]);
    rejects(() => action(state, player.id, 'place_good', { cardId: player.hand.good[2].id }), 'ALREADY_PLACED');
  });

  it('forbids foreign, wrong-kind, previous-round, invented cards and conductor placement', () => {
    const state = make();
    rejects(() => action(state, state.conductorId, 'place_good', { cardId: state.players[1].hand.good[0].id }), 'CONDUCTOR_CANNOT_PLACE');
    rejects(() => action(state, HUMANS[1].id, 'place_good', { cardId: state.players[2].hand.good[0].id }), 'CARD_NOT_OWNED');
    rejects(() => action(state, HUMANS[1].id, 'place_good', { cardId: state.players[1].hand.bad[0].id }), 'CARD_NOT_OWNED');
    rejects(() => action(state, HUMANS[1].id, 'place_good', { cardId: 'invented' }), 'CARD_NOT_OWNED');
    const next = action(completeRound(state), state.conductorId, 'next_round');
    rejects(() => action(next, HUMANS[2].id, 'place_good', { cardId: state.players[2].hand.good[0].id }), 'CARD_NOT_OWNED');
  });

  it('allows buffs on either track but rejects a duplicate target before consuming a second card', () => {
    const state = placeAll(make());
    const [first, second] = state.players.filter((player) => player.team);
    const target = state.tracks[first.team === 'A' ? 'B' : 'A'][0];
    const next = action(state, first.id, 'place_buff', { cardId: first.hand.buff[0].id, targetId: target.id });
    expect([...next.tracks.A, ...next.tracks.B].find((card) => card.id === target.id)?.buff?.ownerId).toBe(first.id);
    const before = copy(next);
    rejects(() => action(next, second.id, 'place_buff', { cardId: second.hand.buff[0].id, targetId: target.id }), 'TARGET_ALREADY_BUFFED');
    expect(next).toEqual(before);
    expect(next.players.find((player) => player.id === second.id)?.hand.buff).toHaveLength(3);
    rejects(() => action(next, second.id, 'place_buff', { cardId: second.hand.buff[0].id, targetId: 'unplayed' }), 'INVALID_TARGET');
  });

  it('does not permit early buffs, decisions, ratings or next-round commands', () => {
    const state = make();
    rejects(() => action(state, HUMANS[1].id, 'place_buff', { cardId: state.players[1].hand.buff[0].id, targetId: 'x' }), 'WRONG_PHASE');
    rejects(() => action(state, state.conductorId, 'choose_track', { track: 'A' }), 'WRONG_PHASE');
    rejects(() => action(state, HUMANS[1].id, 'rate', { value: 5 }), 'WRONG_PHASE');
    rejects(() => action(state, state.conductorId, 'next_round'), 'WRONG_PHASE');
  });

  it('reserves decisions and next-round advancement for the current conductor', () => {
    const state = buffAll(placeAll(make()));
    rejects(() => action(state, HUMANS[1].id, 'choose_track', { track: 'A' }), 'NOT_THE_CONDUCTOR');
    rejects(() => action(state, state.conductorId, 'choose_track', { track: 'C' }), 'INVALID_TRACK');
    const selected = action(state, state.conductorId, 'choose_track', { track: 'B' });
    expect(selected.automaticDecision).toBe(false);
    rejects(() => action(selected, state.conductorId, 'choose_track', { track: 'A' }), 'WRONG_PHASE');
    const ended = completeRound(make());
    rejects(() => action(ended, HUMANS[1].id, 'next_round'), 'NOT_THE_CONDUCTOR');
  });

  it('accepts only one integer peer rating from 1 to 10, not a conductor self-rating', () => {
    const state = action(buffAll(placeAll(make())), HUMANS[0].id, 'choose_track', { track: 'A' });
    rejects(() => action(state, HUMANS[0].id, 'rate', { value: 10 }), 'CANNOT_RATE_SELF');
    for (const value of [0, 11, 2.5, '10', null, NaN, Infinity, {}]) rejects(() => action(state, HUMANS[1].id, 'rate', { value }), 'INVALID_RATING');
    const once = action(state, HUMANS[1].id, 'rate', { value: 10 });
    rejects(() => action(once, HUMANS[1].id, 'rate', { value: 1 }), 'ALREADY_RATED');
    // During voting only own value and public completion flags are visible.
    expect(view(once, HUMANS[2].id, once.advancedAt).roundResult).toBeNull();
    expect(view(once, HUMANS[2].id, once.advancedAt).history).toHaveLength(0);
    expect(view(once, HUMANS[1].id, once.advancedAt).me?.myRating).toBe(10);
    const ended = action(once, HUMANS[2].id, 'rate', { value: 1 });
    expect(ended.history[0].demonScore).toBe(11);
    expect(ended.players[0].demonTotal).toBe(11);
  });

  it('rejects stale tokens, client scores/time, inherited properties and getters without changing state', () => {
    const state = make();
    const player = state.players[1];
    const input = { roundToken: state.roundToken, cardId: player.hand.good[0].id };
    rejects(() => act(state, player.id, 'place_good', { ...input, score: 100 }, NOW), 'INVALID_ACTION');
    rejects(() => act(state, player.id, 'place_good', { ...input, now: NOW }, NOW), 'INVALID_ACTION');
    rejects(() => act(state, player.id, 'place_good', { ...input, roundToken: 'old' }, NOW), 'STALE_ROUND');
    rejects(() => act(state, player.id, 'place_good', Object.create(input), NOW), 'INVALID_ACTION');
    const getter = Object.defineProperty({ roundToken: state.roundToken }, 'cardId', { enumerable: true, get: () => { throw new Error('must not invoke getter'); } });
    rejects(() => act(state, player.id, 'place_good', getter, NOW), 'INVALID_ACTION');
    rejects(() => act(state, player.id, 'constructor', {}, NOW), 'INVALID_ACTION');
    for (const value of [null, undefined, [], 'x', 9, true]) rejects(() => act(state, player.id, 'place_good', value, NOW), 'INVALID_ACTION');
    expect(state).toEqual(make());
  });

  it('binds otherwise valid actions to the actual round and permits a safe null-prototype JSON container', () => {
    const initial = make();
    const next = action(completeRound(initial), initial.conductorId, 'next_round');
    const player = next.players.find((candidate) => candidate.team)!;
    rejects(() => act(next, player.id, 'place_good', { roundToken: initial.roundToken, cardId: player.hand.good[0].id }, next.advancedAt), 'STALE_ROUND');
    const payload = Object.assign(Object.create(null) as Record<string, unknown>, { roundToken: next.roundToken, cardId: player.hand.good[0].id });
    expect(act(next, player.id, 'place_good', payload, next.advancedAt).players.find((candidate) => candidate.id === player.id)?.placedGood).toBe(true);
    rejects(() => act(next, player.id, 'place_good', { ...payload, [Symbol('extra')]: true }, next.advancedAt), 'INVALID_ACTION');
  });

  it('rejects spectators, bots acting as humans, reversed time and actions after the deadline', () => {
    const state = make();
    const input = { roundToken: state.roundToken, cardId: state.players[1].hand.good[0].id };
    rejects(() => act(state, 'stranger', 'place_good', input, NOW), 'NOT_A_PLAYER');
    const practice = create([HUMANS[0], ...BOTS.slice(0, 2)], NOW, SEED);
    rejects(() => act(practice, 'AI01', 'place_good', { roundToken: practice.roundToken, cardId: practice.players[1].hand.good[0].id }, NOW), 'NOT_A_PLAYER');
    rejects(() => advance(state, NOW - 1), 'TIME_REVERSED');
    rejects(() => view(state, HUMANS[0].id, NOW - 1), 'TIME_REVERSED');
    rejects(() => act(state, HUMANS[1].id, 'place_good', input, state.deadlineAt), 'WRONG_PHASE');
    expect(view(state, HUMANS[1].id, state.deadlineAt).me?.availableActions).toEqual([]);
    const over = advance(state, state.endsAt);
    rejects(() => act(over, HUMANS[1].id, 'place_good', input, state.endsAt), 'GAME_FINISHED');
  });
});

describe('rail completion, eligibility, timeouts and statistics', () => {
  it('lists every tied survivor and demon MVP without inventing an arbitrary tie winner', () => {
    let state = make();
    for (let round = 1; round <= 3; round += 1) {
      const desiredSurvivor = state.players[round % 3];
      state = completeRound(state, 5, desiredSurvivor.team === 'A' ? 'B' : 'A');
      state = action(state, state.conductorId, 'next_round');
    }
    expect(result(state)?.players.map((player) => player.rateBasisPoints)).toEqual([5000, 5000, 5000]);
    expect(result(state)?.survivorMvpIds).toEqual(HUMANS.slice(0, 3).map((player) => player.id));
    expect(result(state)?.demonMvpIds).toEqual(HUMANS.slice(0, 3).map((player) => player.id));
  });

  it.each([3, 9])('manually completes every one of %i conductor turns and excludes it from the survival denominator', (count) => {
    const state = completeGame(count);
    expect(state.phase).toBe('finished');
    expect(state.history.map((round) => round.conductorId)).toEqual(HUMANS.slice(0, count).map((player) => player.id));
    const final = result(state)!;
    expect(final.players.every((player) => player.eligible && player.eligibleRounds === count - 1)).toBe(true);
    expect(final.players.every((player) => player.rateBasisPoints === Math.floor(player.survived * 10_000 / (count - 1)))).toBe(true);
    expect(final.players.every((player) => player.demonTotal === (count - 1) * 5)).toBe(true);
    expect(final.demonMvpIds).toEqual(HUMANS.slice(0, count).map((player) => player.id));
    expect(final.survivorMvpIds.length).toBeGreaterThan(0);
    expect(final.survivorMvpIds).toEqual(final.players.filter((player) => player.rateBasisPoints === Math.max(...final.players.map((candidate) => candidate.rateBasisPoints))).map((player) => player.id));
    expect(state.players.every((player) => Object.values(player.hand).flat().length === 0)).toBe(true);
    expect(view(state, HUMANS[0].id, state.advancedAt).me?.availableActions).toEqual([]);
  });

  it('counts the safe track exactly once, never the conductor, and does not give mechanical powers to buff text', () => {
    const state = completeRound(make(4));
    const round = state.history[0];
    for (const player of state.players) {
      expect(player.eligibleRounds).toBe(player.team ? 1 : 0);
      expect(player.survived).toBe(player.team === 'B' ? 1 : 0);
    }
    expect(round.survivedPlayerIds).toEqual(state.players.filter((player) => player.team === 'B').map((player) => player.id));
    expect(round.passedPlayerIds).toEqual(state.players.filter((player) => player.team === 'A').map((player) => player.id));
    const before = copy(state.players);
    expect(advance(state, state.phaseStartedAt + 1000).players).toEqual(before);
  });

  it('automatically completes all nine AFK rounds within 29 minutes 15 seconds and gives nobody ranking eligibility', () => {
    const state = make(9);
    const over = advance(state, state.endsAt + 50_000);
    expect(over.phase).toBe('finished');
    expect(over.finishedAt).toBe(state.endsAt);
    expect(over.history).toHaveLength(9);
    expect(over.players.every((player) => player.missedRequired && player.manualActions === 0)).toBe(true);
    expect(result(over)?.players.every((player) => !player.eligible && player.eligibleRounds === 8 && player.demonTotal === 0)).toBe(true);
    expect(result(over)?.survivorMvpIds).toEqual([]);
    expect(result(over)?.demonMvpIds).toEqual([]);
    expect(over.history.every((round) => round.automaticDecision && round.ratings.every((rating) => rating.value === null && rating.automatic))).toBe(true);
    expect(advance(over, state.endsAt + 60_000)).toEqual(over);
  });

  it('gives identical random choices, history and final time with sparse or frequent clock polls', () => {
    const initial = create([HUMANS[0], HUMANS[1], ...BOTS.slice(0, 7)], NOW, SEED);
    const once = advance(initial, initial.endsAt);
    let many = initial;
    for (let now = NOW + 1379; now < initial.endsAt; now += 1379) many = advance(many, now);
    many = advance(many, initial.endsAt);
    expect(many.history).toEqual(once.history);
    expect(many.players).toEqual(once.players);
    expect(many.finishedAt).toEqual(once.finishedAt);
    expect(many.rngCounter).toBe(once.rngCounter);
  });

  it('keeps bounded deck, buff, result and timeout invariants across seeds, seat counts and bot mixtures', () => {
    for (let sample = 0; sample < 28; sample += 1) {
      const seats = 3 + sample % 7;
      const humans = 1 + sample % seats;
      const participants = [...HUMANS.slice(0, humans), ...BOTS.slice(0, seats - humans)];
      const initial = create(participants, NOW, `${SEED}:${sample}`);
      const over = advance(initial, initial.endsAt + 1);
      expect(over.phase).toBe('finished');
      expect(over.history).toHaveLength(seats);
      expect(over.finishedAt).toBeLessThanOrEqual(initial.endsAt);
      expect(over.players.every((player) => player.eligibleRounds === seats - 1 && player.survived >= 0 && player.survived <= seats - 1)).toBe(true);
      const characters = [...over.tracks.A, ...over.tracks.B];
      expect(characters).toHaveLength((seats - 1) * 2);
      expect(new Set(characters.map((card) => card.id)).size).toBe(characters.length);
      expect(characters.filter((character) => character.buff)).toHaveLength(seats - 1);
      expect(new Set(characters.flatMap((character) => character.buff ? [character.buff.ownerId] : [])).size).toBe(seats - 1);
      expect(result(over)?.players.every((player) => !player.eligible)).toBe(true);
      for (const round of over.history) {
        expect(round.ratings).toHaveLength(seats - 1);
        expect(round.survivedPlayerIds.length + round.passedPlayerIds.length).toBe(seats - 1);
        expect(round.survivedPlayerIds).not.toContain(round.conductorId);
        expect(round.passedPlayerIds).not.toContain(round.conductorId);
      }
    }
  });

  it.each([2, 8])('allows a human to finish practice with %i legally auto-playing bots without inventing peer input', (botCount) => {
    const state = practiceWithManualHuman(botCount);
    expect(state.phase).toBe('finished');
    expect(state.history).toHaveLength(botCount + 1);
    expect(result(state)?.players[0]).toMatchObject({ isBot: false, eligible: true, eligibleRounds: botCount });
    expect(result(state)?.players.slice(1).every((player) => player.isBot && !player.eligible)).toBe(true);
    expect(state.players.slice(1).every((player) => player.manualActions === 0)).toBe(true);
    for (const round of state.history) {
      expect(round.ratings).toHaveLength(botCount);
      for (const rating of round.ratings) {
        if (rating.playerId.startsWith('AI')) expect(rating).toMatchObject({ automatic: true, value: expect.any(Number) });
        else expect(rating).toMatchObject({ automatic: false, value: 6 });
        expect(rating.playerId).not.toBe(round.conductorId);
      }
    }
  });

  it('makes a single timed-out required action permanently ineligible, but optional next-round timeout is harmless', () => {
    let state = completeRound(make());
    state = advance(state, state.deadlineAt);
    expect(state.round).toBe(2);
    expect(state.players.every((player) => !player.missedRequired)).toBe(true);
    const human = state.players.find((player) => player.team)!;
    const other = state.players.find((player) => player.team && player.id !== human.id)!;
    state = action(state, human.id, 'place_good', { cardId: human.hand.good[0].id });
    state = action(state, other.id, 'place_good', { cardId: other.hand.good[0].id });
    state = action(state, other.id, 'place_bad', { cardId: other.hand.bad[0].id });
    state = advance(state, state.deadlineAt);
    expect(state.phase).toBe('buff');
    expect(state.players.find((player) => player.id === human.id)?.missedRequired).toBe(true);
    expect(state.players.find((player) => player.id === other.id)?.missedRequired).toBe(false);
    expect(view(state, human.id, state.advancedAt).players.find((player) => player.id === human.id)?.eligible).toBe(false);
  });

  it('continues an exited participant through every seat automatically but removes hand visibility and ranking eligibility', () => {
    const original = make();
    const state = leave(original, HUMANS[1].id, NOW + 20);
    expect(original.players[1].left).toBe(false);
    expect(state.players[1]).toMatchObject({ left: true, placedGood: true, placedBad: true });
    expect(view(state, HUMANS[1].id, NOW + 20)).toMatchObject({ viewerRole: 'spectator', me: null });
    rejects(() => action(state, HUMANS[1].id, 'place_good', { cardId: original.players[1].hand.good[0].id }), 'PLAYER_LEFT');
    const over = advance(state, state.endsAt);
    expect(over.history).toHaveLength(3);
    expect(result(over)?.players[1]).toMatchObject({ left: true, eligible: false, eligibleRounds: 2 });
    expect(over.history.find((round) => round.conductorId === HUMANS[1].id)?.automaticDecision).toBe(true);
    expect(leave(over, HUMANS[1].id, state.endsAt + 1)).toEqual(over);
  });

  it('does not retroactively alter results when a player leaves after the game is finished', () => {
    const over = completeGame();
    const before = result(over);
    const exited = leave(over, HUMANS[0].id, over.advancedAt + 100);
    expect(result(exited)).toEqual(before);
    expect(exited.players[0].left).toBe(false);
  });

  it('returns no incomplete result and detached final stats, history and played-card views', () => {
    expect(result(make())).toBeNull();
    const over = completeGame();
    const final = result(over)!;
    final.players[0].demonTotal = 99999;
    final.survivorMvpIds.push('forged');
    const publicView = view(over, null, over.advancedAt);
    publicView.history[0].ratings[0].value = 10;
    publicView.tracks.A[0].card.title = 'changed';
    expect(over.players[0].demonTotal).toBe(10);
    expect(over.history[0].ratings[0].value).toBe(5);
    expect(over.tracks.A[0].card.title).not.toBe('changed');
  });
});
