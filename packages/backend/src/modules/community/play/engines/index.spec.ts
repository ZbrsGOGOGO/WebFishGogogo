import type { ArcadeGameKey } from '@stealth-reader/shared';
import { act, advance, ArcadeEngineError, ArcadeEngineState, create, forfeit, result, view } from './index';
import { DRAW_WORDS } from './word-bank';

const NOW = 2_000_000;
const SEED = 'server-only-cryptographic-seed-0123456789';
const PLAYERS = Array.from({ length: 8 }, (_, i) => ({ id: `player-${i + 1}`, displayName: `成员 ${i + 1}` }));
const copy = (state: ArcadeEngineState): ArcadeEngineState => JSON.parse(JSON.stringify(state)) as ArcadeEngineState;
const make = (key: ArcadeGameKey, count = 1): ArcadeEngineState => create(key, PLAYERS.slice(0, count), count === 1 ? 'solo' : 'room', NOW, SEED);
function error(fn: () => unknown, code: string): void {
  try { fn(); throw new Error('Expected rejection'); } catch (caught) { expect(caught).toBeInstanceOf(ArcadeEngineError); expect((caught as ArcadeEngineError).code).toBe(code); }
}

describe('authoritative arcade engines', () => {
  it.each<ArcadeGameKey>(['snake', 'tetris', 'tank', 'zhesi', 'draw', 'undercover'])('serializes %s, caps duration and resolves unattended matches without awarding AFK points', (key) => {
    const initial = make(key);
    expect(initial.endsAt - NOW).toBeLessThanOrEqual(180_000);
    expect(initial.endsAt - NOW).toBeGreaterThanOrEqual(60_000);
    const restored = copy(initial);
    const finished = advance(restored, initial.endsAt + 10_000);
    expect(initial.phase).toBe('running');
    expect(finished.phase).toBe('finished');
    expect(result(finished)?.scores).toEqual([{ userId: PLAYERS[0].id, score: 0 }]);
    expect(result(finished)?.finishedAt).toBeLessThanOrEqual(initial.endsAt);
    expect(advance(finished, initial.endsAt + 11_000)).toEqual(finished);
    expect(JSON.stringify(view(finished, PLAYERS[0].id, initial.endsAt + 10_000))).not.toMatch(/rng|wordIndex|pairIndex|usedWords|"queue"/);
  });

  it.each<ArcadeGameKey>(['snake', 'tetris', 'tank', 'zhesi'])('%s has identical server seeds, starting boards and score rules for solo and rooms', (key) => {
    const solo = make(key); const room = make(key, 2);
    expect(view(solo, PLAYERS[0].id, NOW).board).toEqual(view(room, PLAYERS[0].id, NOW).board);
    expect(view(room, PLAYERS[0].id, NOW).board).toEqual(view(room, PLAYERS[1].id, NOW).board);
    const action = key === 'snake' || key === 'tank' ? ['direction', { direction: 'up' }] as const : key === 'tetris' ? ['tetris', { move: 'hardDrop' }] as const : ['choice', { turn: 1, choice: 'train' }] as const;
    const a = act(solo, PLAYERS[0].id, action[0], action[1], NOW + 100);
    const b = act(room, PLAYERS[0].id, action[0], action[1], NOW + 100);
    expect(view(a, PLAYERS[0].id, NOW + 100).board).toEqual(view(b, PLAYERS[0].id, NOW + 100).board);
    expect(a.players[0].score).toEqual(b.players[0].score);
    expect(room.players[1]).toEqual(make(key, 2).players[1]);
  });

  it('rejects invalid modes, identities, counts, forged score fields and foreign players without mutating state', () => {
    error(() => create('undercover', PLAYERS.slice(0, 2), 'room', NOW, SEED), 'INVALID_PLAYER_COUNT');
    error(() => create('snake', PLAYERS.slice(0, 2), 'solo', NOW, SEED), 'INVALID_PLAYER_COUNT');
    error(() => create('draw', [PLAYERS[0], PLAYERS[0]], 'room', NOW, SEED), 'INVALID_PLAYER');
    error(() => create('undercover', [{ id: '__proto__', displayName: 'x' }], 'solo', NOW, SEED), 'INVALID_PLAYER');
    error(() => create('tank', PLAYERS.slice(0, 1), 'solo', NaN, SEED), 'INVALID_TIME');
    const state = make('snake'); const before = copy(state);
    error(() => act(state, 'stranger', 'direction', { direction: 'up' }, NOW), 'NOT_A_PLAYER');
    error(() => view(state, 'stranger', NOW), 'NOT_A_PLAYER');
    error(() => act(state, PLAYERS[0].id, 'direction', { direction: 'up', score: 1e9 }, NOW), 'INVALID_ACTION');
    error(() => act(state, PLAYERS[0].id, 'tick', {}, NOW), 'INVALID_ACTION');
    error(() => act(state, PLAYERS[0].id, 'direction', { direction: 'diagonal' }, NOW), 'INVALID_DIRECTION');
    expect(state).toEqual(before);
  });

  it('owns time progression, rejects reversed time, bounds catch-up, and throttles accepted actions', () => {
    let state = make('snake');
    state = act(state, PLAYERS[0].id, 'direction', { direction: 'up' }, NOW);
    error(() => act(state, PLAYERS[0].id, 'direction', { direction: 'left' }, NOW + 1), 'ACTION_TOO_FAST');
    error(() => advance(state, NOW - 1), 'TIME_REVERSED');
    expect(state.players[0].snake?.snake[0]).toEqual({ x: 10, y: 10 });
    state = advance(state, NOW + 250);
    expect(state.players[0].snake?.snake[0]).toEqual({ x: 10, y: 9 });
    const over = advance(state, NOW + 10 ** 12);
    expect(over.phase).toBe('finished');
    expect(over.players[0].lastTickAt).toBeLessThanOrEqual(state.endsAt);
    error(() => act(over, PLAYERS[0].id, 'direction', { direction: 'left' }, NOW + 10 ** 12), 'GAME_FINISHED');
  });

  it('enforces per-player action budget independent from score and returns detached public views', () => {
    const state = make('tetris', 2);
    state.players[0].actionCount = 2400;
    error(() => act(state, PLAYERS[0].id, 'tetris', { move: 'left' }, NOW), 'ACTION_LIMIT');
    const scoped = view(state, PLAYERS[0].id, NOW);
    if (scoped.gameKey !== 'tetris') throw new Error('wrong board');
    scoped.board.board[19][0] = 'I'; scoped.players[1].score = 999999;
    expect(state.players[0].tetris?.board[19][0]).toBeNull();
    expect(state.players[1].score).toBe(0);
    expect(JSON.stringify(scoped)).not.toContain('queue');
    expect(JSON.stringify(scoped)).not.toContain(SEED);
  });

  it.each<ArcadeGameKey>(['snake', 'tetris', 'tank', 'zhesi', 'draw', 'undercover'])('%s rejects malformed payload containers before accessing any action fields', (key) => {
    const state = make(key);
    for (const payload of [null, undefined, [], 'value', 3, false]) {
      error(() => act(state, PLAYERS[0].id, 'guess', payload as unknown as Record<string, unknown>, NOW), 'INVALID_ACTION');
    }
  });

  it('awards snake food only from server collision and does not accept a 180-degree reversal', () => {
    let state = make('snake');
    state.players[0].snake = { ...state.players[0].snake!, food: { x: 11, y: 10 } };
    state = act(state, PLAYERS[0].id, 'direction', { direction: 'left' }, NOW);
    state = advance(state, NOW + 250);
    expect(state.players[0].score).toBe(10);
    expect(state.players[0].snake?.direction).toBe('right');
    expect(state.players[0].snake?.snake).toHaveLength(4);
  });

  it('tetris progresses identically whether server clock catches up once or polls frequently', () => {
    const state = make('tetris');
    const once = advance(state, NOW + 30_000);
    let many = state;
    for (let at = NOW + 100; at <= NOW + 30_000; at += 100) many = advance(many, at);
    expect(once.players).toEqual(many.players);
    error(() => act(state, PLAYERS[0].id, 'tetris', { move: ['hardDrop'] }, NOW), 'INVALID_MOVE');
  });

  it('tank movement and fire are server-owned and capped at one active player bullet', () => {
    let state = make('tank');
    state = act(state, PLAYERS[0].id, 'direction', { direction: 'up' }, NOW);
    expect(state.players[0].tank?.player.y).toBe(9);
    state = act(state, PLAYERS[0].id, 'fire', {}, NOW + 250);
    state = act(state, PLAYERS[0].id, 'fire', {}, NOW + 500);
    expect(state.players[0].tank?.bullets.filter((b) => b.owner === 'player')).toHaveLength(1);
    error(() => act(state, PLAYERS[0].id, 'fire', { score: 100 }, NOW + 800), 'INVALID_ACTION');
  });

  it('zhesi is a fresh fixed-stat challenge, accepts one choice per turn, and rejects stale turns', () => {
    let state = make('zhesi', 2);
    expect(state.players[0].zhesi?.health).toBe(100);
    error(() => act(state, PLAYERS[0].id, 'choice', { choice: ['train'], turn: 1 }, NOW), 'INVALID_CHOICE');
    state = act(state, PLAYERS[0].id, 'choice', { choice: 'train', turn: 1 }, NOW + 100);
    error(() => act(state, PLAYERS[0].id, 'choice', { choice: 'strike', turn: 1 }, NOW + 200), 'ALREADY_CHOSEN');
    state = advance(state, NOW + 8000);
    expect(state.players[0].zhesi?.power).toBe(17);
    expect(state.players[0].zhesi?.health).toBe(92);
    expect(state.players[1].zhesi?.health).toBe(86);
    error(() => act(state, PLAYERS[0].id, 'choice', { choice: 'strike', turn: 1 }, NOW + 8100), 'STALE_TURN');
    state = act(state, PLAYERS[0].id, 'choice', { choice: 'strike', turn: 2 }, NOW + 8200);
    state = advance(state, NOW + 16_000);
    expect(state.players[0].zhesi?.enemyHealth).toBeLessThan(200);
    const finished = advance(state, state.endsAt);
    expect(result(finished)?.scores[0].score).toBeGreaterThan(0);
    expect(result(finished)?.scores[0].score).toBeLessThanOrEqual(1000);
  });

  it('zhesi can be won by an actual mixed training/defense/attack strategy without client combat stats', () => {
    let state = make('zhesi');
    const choices = ['train', 'train', 'strike', 'guard', 'strike', 'strike', 'strike', 'strike', 'strike'];
    for (const choice of choices) {
      const z = state.players[0].zhesi!;
      state = act(state, PLAYERS[0].id, 'choice', { choice, turn: z.turn }, state.advancedAt + 100);
      state = advance(state, z.turnEndsAt);
    }
    expect(state.phase).toBe('finished');
    expect(state.players[0].zhesi?.enemyHealth).toBe(0);
    expect(result(state)?.scores[0].score).toBe(970);
  });

  it.each<ArcadeGameKey>(['snake', 'tetris', 'tank', 'zhesi'])('%s forfeits remove only the exiting player from ranking eligibility', (key) => {
    let state = make(key, 2);
    state = forfeit(state, PLAYERS[0].id, NOW + 100);
    expect(state.players[0].forfeited).toBe(true);
    expect(state.phase).toBe('running');
    const finished = advance(state, state.endsAt);
    expect(result(finished)?.scores.map((p) => p.userId)).toEqual([PLAYERS[1].id]);
    expect(forfeit(finished, PLAYERS[0].id, finished.endsAt)).toEqual(finished);
  });
});

describe('draw and guess privacy and real multiplayer', () => {
  it('shows the answer only to the current drawer, never to other guessers or in correct guess chat', () => {
    let state = make('draw', 3);
    const answer = DRAW_WORDS[state.draw!.wordIndex].word;
    const drawer = view(state, PLAYERS[0].id, NOW);
    const guesser = view(state, PLAYERS[1].id, NOW);
    if (drawer.gameKey !== 'draw' || guesser.gameKey !== 'draw') throw new Error('wrong board');
    expect(drawer.board.word).toBe(answer); expect(guesser.board.word).toBeNull();
    state = act(state, PLAYERS[1].id, 'guess', { round: 1, text: answer }, NOW + 1000);
    expect(state.players[1].score).toBeGreaterThan(100);
    expect(state.players[0].score).toBe(200);
    expect(JSON.stringify(view(state, PLAYERS[2].id, NOW + 1000))).not.toContain(answer);
    expect(state.draw!.messages[0]).toMatchObject({ text: '猜中了', correct: true });
    error(() => act(state, PLAYERS[1].id, 'guess', { round: 1, text: answer }, NOW + 2000), 'ALREADY_GUESSED');
    error(() => act(state, PLAYERS[0].id, 'guess', { round: 1, text: answer }, NOW + 2000), 'DRAWER_CANNOT_GUESS');
  });

  it('bounds strokes and forbids spectators, incorrect types, invalid coordinates, and client scores', () => {
    let state = make('draw', 2);
    const payload = { round: 1, points: [{ x: 0, y: 0 }, { x: 1000, y: 1000 }], color: '#334155', width: 4 };
    error(() => act(state, PLAYERS[1].id, 'stroke', payload, NOW), 'NOT_THE_DRAWER');
    error(() => act(state, PLAYERS[0].id, 'stroke', { ...payload, width: '4' }, NOW), 'INVALID_STROKE');
    error(() => act(state, PLAYERS[0].id, 'stroke', { ...payload, points: [{ x: NaN, y: 0 }, { x: 10, y: 10 }] }, NOW), 'INVALID_STROKE');
    error(() => act(state, PLAYERS[0].id, 'stroke', { ...payload, points: Array(65).fill({ x: 0, y: 0 }) }, NOW), 'INVALID_STROKE');
    error(() => act(state, PLAYERS[0].id, 'stroke', { ...payload, score: 999 }, NOW), 'INVALID_ACTION');
    state = act(state, PLAYERS[0].id, 'stroke', payload, NOW);
    expect(state.draw?.strokes).toHaveLength(1);
    state = act(state, PLAYERS[0].id, 'clear', { round: 1 }, NOW + 100);
    expect(state.draw?.strokes).toHaveLength(0);
    state.draw!.strokes = Array(240).fill({ points: payload.points, color: '#334155', width: 4 });
    error(() => act(state, PLAYERS[0].id, 'stroke', payload, NOW + 200), 'CANVAS_FULL');
  });

  it('uses round tokens, rotates actual human drawers, and never repeats a word within eight rounds', () => {
    let state = make('draw', 8); const words = [state.draw!.wordIndex];
    for (let round = 2; round <= 8; round += 1) {
      state = advance(state, state.draw!.roundEndsAt);
      expect(state.draw!.drawerId).toBe(PLAYERS[round - 1].id);
      expect(state.draw!.round).toBe(round); words.push(state.draw!.wordIndex);
    }
    expect(new Set(words).size).toBe(8);
    error(() => act(state, PLAYERS[0].id, 'guess', { round: 1, text: '答案' }, state.advancedAt + 100), 'STALE_ROUND');
    expect(advance(state, state.endsAt).phase).toBe('finished');
  });

  it('labels a real system drawing partner for solo practice and scores only the human', () => {
    let state = make('draw');
    const scoped = view(state, PLAYERS[0].id, NOW);
    expect(scoped.players[1]).toMatchObject({ isBot: true, displayName: '系统练习搭档 1' });
    if (scoped.gameKey !== 'draw') throw new Error('wrong board');
    expect(scoped.board.practicePartner).toBe(true); expect(scoped.board.word).toBeNull(); expect(scoped.board.strokes.length).toBeGreaterThan(0);
    for (let round = 1; round <= 3; round += 1) {
      state = act(state, PLAYERS[0].id, 'guess', { round, text: DRAW_WORDS[state.draw!.wordIndex].word }, state.draw!.roundStartedAt + 1000);
      state = advance(state, state.draw!.roundEndsAt);
    }
    expect(result(state)?.scores).toHaveLength(1);
    expect(result(state)?.scores[0].score).toBeGreaterThan(900);
    expect(result(state)?.scores[0].score).toBeLessThanOrEqual(1000);
  });

  it('advances when a drawer leaves and skips future forfeited drawers without ranking them', () => {
    let state = make('draw', 3);
    state = forfeit(state, PLAYERS[1].id, NOW + 100);
    state = forfeit(state, PLAYERS[0].id, NOW + 200);
    expect(state.draw?.drawerId).toBe(PLAYERS[2].id);
    const finished = advance(state, state.draw!.roundEndsAt);
    expect(finished.phase).toBe('finished');
    expect(result(finished)?.scores.map((p) => p.userId)).toEqual([PLAYERS[2].id]);
  });
});

describe('undercover roles, voting and practice', () => {
  it('keeps every other word and all roles private until final reveal', () => {
    const state = make('undercover', 4);
    const scoped = view(state, PLAYERS[0].id, NOW);
    if (scoped.gameKey !== 'undercover') throw new Error('wrong board');
    expect(scoped.board.word).toBe(state.undercover!.words[PLAYERS[0].id]);
    expect(scoped.board.reveals).toEqual([]);
    expect(JSON.stringify(scoped)).not.toMatch(/"roles"|"words"|pairIndex|"role"|"votes"/);
    const final = view(advance(state, state.endsAt), PLAYERS[0].id, state.endsAt);
    if (final.gameKey !== 'undercover') throw new Error('wrong board');
    expect(final.board.reveals).toHaveLength(4);
  });

  it('allows one bounded non-answer description per player/round and no out-of-phase vote', () => {
    let state = make('undercover', 4);
    error(() => act(state, PLAYERS[0].id, 'describe', { round: 1, text: state.undercover!.words[PLAYERS[0].id] }, NOW), 'DO_NOT_REVEAL_WORD');
    error(() => act(state, PLAYERS[0].id, 'describe', { round: 1, text: '字'.repeat(81) }, NOW), 'INVALID_TEXT');
    error(() => act(state, PLAYERS[0].id, 'vote', { round: 1, targetId: PLAYERS[1].id }, NOW), 'WRONG_PHASE');
    state = act(state, PLAYERS[0].id, 'describe', { round: 1, text: '生活中偶尔会看到' }, NOW);
    error(() => act(state, PLAYERS[0].id, 'describe', { round: 1, text: '另一个描述' }, NOW + 100), 'ALREADY_DESCRIBED');
    expect(state.undercover?.descriptions).toHaveLength(1);
  });

  it('counts server votes once, reveals final roles only after an actual majority, and calculates faction scores', () => {
    let state = make('undercover', 4);
    const under = Object.entries(state.undercover!.roles).find(([, role]) => role === 'undercover')![0];
    const civilians = PLAYERS.slice(0, 4).filter((p) => p.id !== under);
    state = advance(state, NOW + 30_000);
    for (const p of civilians) state = act(state, p.id, 'vote', { round: 1, targetId: under }, NOW + 30_100);
    error(() => act(state, civilians[0].id, 'vote', { round: 1, targetId: civilians[1].id }, NOW + 30_200), 'ALREADY_VOTED');
    error(() => act(state, under, 'vote', { round: 1, targetId: under }, NOW + 30_200), 'INVALID_TARGET');
    expect(view(state, civilians[1].id, NOW + 31_000).board).not.toHaveProperty('votes');
    state = advance(state, NOW + 50_000);
    expect(state.undercover?.outcome).toBe('civilian');
    expect(state.phase).toBe('finished');
    expect(result(state)?.scores.find((p) => p.userId === civilians[0].id)?.score).toBe(750);
    expect(result(state)?.scores.find((p) => p.userId === under)?.score).toBe(0);
  });

  it('keeps ties alive, rejects stale next-round actions and keeps all scores within 1000', () => {
    let state = make('undercover', 4);
    state = advance(state, NOW + 30_000);
    state = act(state, PLAYERS[0].id, 'vote', { round: 1, targetId: PLAYERS[1].id }, NOW + 30_100);
    state = act(state, PLAYERS[1].id, 'vote', { round: 1, targetId: PLAYERS[0].id }, NOW + 30_100);
    state = advance(state, NOW + 50_000);
    expect(state.undercover?.round).toBe(2); expect(state.undercover?.alivePlayerIds).toHaveLength(4);
    error(() => act(state, PLAYERS[0].id, 'describe', { round: 1, text: '普通东西' }, NOW + 50_100), 'STALE_ROUND');
    expect(result(advance(state, state.endsAt))?.scores.every((p) => p.score >= 0 && p.score <= 1000)).toBe(true);
  });

  it('marks solo bots explicitly, generates actual descriptions/votes and excludes them from results', () => {
    let state = make('undercover');
    expect(state.players.filter((p) => p.isBot)).toHaveLength(3);
    expect(state.undercover?.descriptions).toHaveLength(3);
    state = act(state, PLAYERS[0].id, 'describe', { round: 1, text: '每天可能碰见' }, NOW + 100);
    state = advance(state, NOW + 30_000);
    expect(Object.keys(state.undercover!.votes)).toHaveLength(3);
    expect(result(advance(state, state.endsAt))?.scores).toHaveLength(1);
  });

  it('treats leaving as elimination and ends immediately without a future finishedAt or leaver reward', () => {
    let state = make('undercover', 4);
    const under = Object.entries(state.undercover!.roles).find(([, role]) => role === 'undercover')![0];
    state = forfeit(state, under, NOW + 100);
    expect(state.phase).toBe('finished'); expect(state.finishedAt).toBe(NOW + 100);
    expect(state.undercover?.outcome).toBe('civilian');
    expect(result(state)?.scores.some((p) => p.userId === under)).toBe(false);
  });

  it('offers the same action-score ceiling to the undercover role and never pays completely idle winners', () => {
    let state = make('undercover', 4);
    const under = Object.entries(state.undercover!.roles).find(([, role]) => role === 'undercover')![0];
    for (let round = 1; round <= 3; round += 1) {
      state = act(state, under, 'describe', { round, text: '身边偶尔能见到的东西' }, NOW + (round - 1) * 50_000 + 100);
      state = advance(state, NOW + round * 50_000);
    }
    expect(state.undercover?.outcome).toBe('undercover');
    expect(result(state)?.scores.find((p) => p.userId === under)?.score).toBe(1000);
    expect(result(state)?.scores.filter((p) => p.userId !== under).every((p) => p.score === 0)).toBe(true);
  });
});
