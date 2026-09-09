import { createHash } from 'node:crypto';
import { act, advance, create, result, view, type ArcadeEngineState } from './index';
import { DRAW_WORDS, practiceStrokes, UNDERCOVER_WORDS, WORD_BANK_VERSION } from './word-bank';

const NOW = 1_800_000_000_000;
const PEOPLE = Array.from({ length: 8 }, (_, index) => ({ id: `word-fixture-${index}`, displayName: `合成词库玩家${index + 1}` }));
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const roundtrip = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Find ordinary creation seeds, not injected RNG/score/balance or client-selected answers. */
function coveringSeeds(key: 'draw' | 'undercover', size: number): Map<number, string> {
  const seeds = new Map<number, string>();
  for (let i = 0; i < 2048 && seeds.size < size; i += 1) {
    const seed = `office-bank-natural-${i}`;
    const state = create(key, PEOPLE.slice(0, 1), 'solo', NOW, seed);
    seeds.set(key === 'draw' ? state.draw!.wordIndex : state.undercover!.pairIndex, seed);
  }
  expect(seeds.size).toBe(size);
  return seeds;
}

describe('append-only office/life word bank', () => {
  it('has 64 distinct drawable words and 48 distinct, comparable everyday word pairs', () => {
    expect(WORD_BANK_VERSION).toBe('office-life-20260909-v2');
    expect(DRAW_WORDS).toHaveLength(64);
    expect(UNDERCOVER_WORDS).toHaveLength(48);
    expect(new Set(DRAW_WORDS.map(({ word }) => word)).size).toBe(64);
    expect(new Set(UNDERCOVER_WORDS.map(({ words }) => [...words].sort().join('|'))).size).toBe(48);
    for (const { word } of DRAW_WORDS) expect(word).toMatch(/^[\p{Script=Han}]{1,4}$/u);
    for (const { words, clues } of UNDERCOVER_WORDS) {
      expect(words).toHaveLength(2); expect(clues).toHaveLength(2);
      expect(words[0]).not.toBe(words[1]);
      expect(Math.abs(words[0].length - words[1].length)).toBeLessThanOrEqual(2);
      for (const word of words) expect(word).toMatch(/^[\p{Script=Han}]{1,4}$/u);
      for (const clue of clues) {
        expect(clue.length).toBeGreaterThanOrEqual(4); expect(clue.length).toBeLessThanOrEqual(32);
        // A practice partner describes an object; it never prints either exact answer.
        for (const word of words) expect(clue).not.toContain(word);
      }
    }
  });

  it('preserves all original numeric IDs, words, points and bot clues byte-for-byte', () => {
    expect(DRAW_WORDS.slice(0, 8).map(({ word }) => word)).toEqual(['房子', '太阳', '雨伞', '小鱼', '杯子', '苹果', '铅笔', '自行车']);
    // Fingerprints from the previous committed bank, not generated from the candidate in this test.
    expect(digest(DRAW_WORDS.slice(0, 8))).toBe('e8494b58c20af2d63f3734fbb247f260977f7379aeaa13ca502099edd7b7674a');
    expect(digest(UNDERCOVER_WORDS.slice(0, 12))).toBe('9ebdbaadea103dc16a73cdf3ca6ef925e3f02604e69199c8b84b8e09b1032d06');
    expect(DRAW_WORDS[8].word).toBe('电脑'); expect(DRAW_WORDS[63].word).toBe('西瓜');
    expect(UNDERCOVER_WORDS[12].words).toEqual(['订书机', '打孔器']);
    expect(UNDERCOVER_WORDS[47].words).toEqual(['帐篷', '睡袋']);
  });

  it('gives every word a distinct bounded line drawing, not an empty fallback or answer text', () => {
    const drawings = new Set<string>();
    for (let index = 0; index < DRAW_WORDS.length; index += 1) {
      const strokes = practiceStrokes(index);
      expect(strokes.length).toBeGreaterThanOrEqual(2); expect(strokes.length).toBeLessThanOrEqual(240);
      drawings.add(digest(strokes));
      for (const stroke of strokes) {
        expect(Object.keys(stroke).sort()).toEqual(['color', 'points', 'width']);
        expect(stroke.color).toBe('#334155'); expect(stroke.width).toBe(4);
        expect(stroke.points.length).toBeGreaterThanOrEqual(2); expect(stroke.points.length).toBeLessThanOrEqual(64);
        expect(new Set(stroke.points.map(({ x, y }) => `${x}:${y}`)).size).toBeGreaterThanOrEqual(2);
        for (const { x, y } of stroke.points) for (const coordinate of [x, y]) {
          expect(Number.isInteger(coordinate)).toBe(true);
          expect(coordinate).toBeGreaterThanOrEqual(0); expect(coordinate).toBeLessThanOrEqual(1000);
        }
      }
    }
    expect(drawings.size).toBe(64);
  });

  it('returns detached points so modifying one practice board cannot corrupt the bank or another room', () => {
    for (let index = 0; index < DRAW_WORDS.length; index += 1) {
      const before = digest(DRAW_WORDS[index]); const first = practiceStrokes(index); const second = practiceStrokes(index);
      first[0].points[0].x = -999; first.push({ points: [], color: '#dc2626', width: 8 });
      expect(digest(DRAW_WORDS[index])).toBe(before);
      expect(practiceStrokes(index)).toEqual(second);
    }
  });
});

describe('expanded word bank through the real play engine', () => {
  it('naturally draws all 64 practice pictures and keeps all three rounds playable and privately scored', () => {
    for (const [index, seed] of coveringSeeds('draw', 64)) {
      let state = create('draw', PEOPLE.slice(0, 1), 'solo', NOW, seed);
      expect(state.draw!.wordIndex).toBe(index);
      const used = new Set<number>();
      for (let round = 1; round <= 3; round += 1) {
        const d = state.draw!; used.add(d.wordIndex);
        expect(d.strokes).toEqual(practiceStrokes(d.wordIndex));
        const scoped = view(state, PEOPLE[0].id, state.advancedAt);
        if (scoped.gameKey !== 'draw') throw new Error('wrong board');
        expect(scoped.board.word).toBeNull(); expect(scoped.board.practicePartner).toBe(true);
        expect(JSON.stringify(scoped)).not.toMatch(/wordIndex|usedWords|wordBank|"rng"|"lines"/);
        state = act(state, PEOPLE[0].id, 'guess', { round, text: DRAW_WORDS[d.wordIndex].word }, d.roundStartedAt + 1000);
        expect(state.draw!.messages.at(-1)).toMatchObject({ correct: true, text: '猜中了' });
        state = advance(state, d.roundEndsAt);
      }
      expect(used.size).toBe(3); expect(state.phase).toBe('finished');
      expect(result(state)?.scores).toEqual([{ userId: PEOPLE[0].id, score: 985 }]);
    }
  });

  it.each([2, 3, 4, 5, 6, 7, 8])('keeps %i-player draw rooms deterministic, nonrepeating and private', (count) => {
    for (let seedIndex = 0; seedIndex < 32; seedIndex += 1) {
      const seed = `office-room-${count}-${seedIndex}`;
      let state = create('draw', PEOPLE.slice(0, count), 'room', NOW, seed);
      expect(state).toEqual(create('draw', PEOPLE.slice(0, count), 'room', NOW, seed));
      const used = new Set<number>();
      for (let round = 1; round <= count; round += 1) {
        const d = state.draw!; used.add(d.wordIndex);
        expect(d.drawerId).toBe(PEOPLE[round - 1].id); expect(d.strokes).toEqual([]);
        for (const person of PEOPLE.slice(0, count)) {
          const scoped = view(state, person.id, state.advancedAt);
          if (scoped.gameKey !== 'draw') throw new Error('wrong board');
          expect(scoped.board.word).toBe(person.id === d.drawerId ? DRAW_WORDS[d.wordIndex].word : null);
          expect(scoped.board.wordLength).toBe(DRAW_WORDS[d.wordIndex].word.length);
        }
        state = advance(state, d.roundEndsAt);
      }
      expect(used.size).toBe(count); expect(state.phase).toBe('finished');
      expect(result(state)?.scores.every(({ score }) => score === 0)).toBe(true);
    }
  });

  it('naturally selects all 48 pairs for 3–8 people with exactly one private undercover and no new settlement rule', () => {
    for (const [pairIndex, seed] of coveringSeeds('undercover', 48)) {
      for (let count = 3; count <= 8; count += 1) {
        const state = create('undercover', PEOPLE.slice(0, count), 'room', NOW, seed);
        const u = state.undercover!; expect(u.pairIndex).toBe(pairIndex);
        expect(Object.values(u.roles).filter((role) => role === 'undercover')).toHaveLength(1);
        for (const person of PEOPLE.slice(0, count)) {
          const scoped = view(state, person.id, NOW);
          if (scoped.gameKey !== 'undercover') throw new Error('wrong board');
          expect(scoped.board.word).toBe(UNDERCOVER_WORDS[pairIndex].words[u.roles[person.id] === 'undercover' ? 1 : 0]);
          expect(scoped.board.reveals).toEqual([]);
          expect(JSON.stringify(scoped)).not.toMatch(/pairIndex|"roles"|"words"|"rng"|"clues"/);
        }
        expect(result(advance(state, state.endsAt))?.scores.every(({ score }) => score === 0)).toBe(true);
      }
    }
  });

  it('all 48 practice pairs issue matching non-answer clues and finish with only the human on the result', () => {
    for (const [pairIndex, seed] of coveringSeeds('undercover', 48)) {
      let state = create('undercover', PEOPLE.slice(0, 1), 'solo', NOW, seed);
      const u = state.undercover!;
      expect(u.pairIndex).toBe(pairIndex); expect(u.descriptions).toHaveLength(3);
      for (const description of u.descriptions) {
        expect(description.text).toBe(UNDERCOVER_WORDS[pairIndex].clues[u.roles[description.playerId] === 'undercover' ? 1 : 0]);
        expect(state.players.find(({ id }) => id === description.playerId)?.isBot).toBe(true);
      }
      state = act(state, PEOPLE[0].id, 'describe', { round: 1, text: '工作或者生活里可能遇见' }, NOW + 100);
      state = advance(state, state.endsAt);
      const scores = result(state)!.scores;
      expect(scores).toHaveLength(1); expect(scores[0].userId).toBe(PEOPLE[0].id);
      expect(scores[0].score).toBeGreaterThanOrEqual(50); expect(scores[0].score).toBeLessThanOrEqual(1000);
      const scoped = view(state, PEOPLE[0].id, state.endsAt);
      if (scoped.gameKey !== 'undercover') throw new Error('wrong board');
      expect(scoped.board.reveals).toHaveLength(4);
    }
  });
});

describe('synthetic legacy JSON compatibility, without rewriting persisted indices', () => {
  it('keeps every old drawing answer through JSON reload, GET projection and a valid guess', () => {
    for (let index = 0; index < 8; index += 1) {
      const fixture = create('draw', PEOPLE.slice(0, 2), 'room', NOW, 'legacy-draw-shape');
      // This is a declared synthetic old-format fixture, not a claim of old seeded RNG output.
      fixture.draw!.wordIndex = index; fixture.draw!.usedWords = [index]; fixture.draw!.strokes = practiceStrokes(index);
      let state: ArcadeEngineState = roundtrip(fixture); const before = roundtrip(state);
      for (let read = 0; read < 3; read += 1) {
        const scoped = view(state, PEOPLE[0].id, NOW + read);
        if (scoped.gameKey !== 'draw') throw new Error('wrong board');
        expect(scoped.board.word).toBe(DRAW_WORDS[index].word);
        expect(scoped.board.strokes).toEqual(before.draw!.strokes);
      }
      expect(state).toEqual(before);
      state = advance(state, NOW + 100); expect(state.draw!.wordIndex).toBe(index);
      state = act(state, PEOPLE[1].id, 'guess', { round: 1, text: DRAW_WORDS[index].word }, NOW + 1000);
      expect(state.draw!.messages.at(-1)?.correct).toBe(true);
      state = advance(state, state.draw!.roundEndsAt);
      expect(state.draw!.wordIndex).not.toBe(index); expect(state.draw!.usedWords[0]).toBe(index);
    }
  });

  it('preserves all twelve saved pair IDs and words, including the next-round bot clue lookup', () => {
    for (let pairIndex = 0; pairIndex < 12; pairIndex += 1) {
      // Select a normal solo vote path that reaches round two; never change votes or outcomes.
      let fixture: ArcadeEngineState | undefined;
      for (let seed = 0; seed < 64; seed += 1) {
        const candidate = create('undercover', PEOPLE.slice(0, 1), 'solo', NOW, `legacy-clue-${seed}`);
        if (advance(candidate, NOW + 50_000).undercover!.round === 2) { fixture = candidate; break; }
      }
      if (!fixture) throw new Error('no ordinary second-round path');
      const u = fixture.undercover!; u.pairIndex = pairIndex;
      for (const player of fixture.players) u.words[player.id] = UNDERCOVER_WORDS[pairIndex].words[u.roles[player.id] === 'undercover' ? 1 : 0];
      u.descriptions = fixture.players.filter(({ isBot }) => isBot).map(({ id }) => ({ playerId: id, round: 1, text: UNDERCOVER_WORDS[pairIndex].clues[u.roles[id] === 'undercover' ? 1 : 0] }));
      const saved = roundtrip(fixture); const before = roundtrip(saved);
      const scoped = view(saved, PEOPLE[0].id, NOW);
      if (scoped.gameKey !== 'undercover') throw new Error('wrong board');
      expect(scoped.board.word).toBe(u.words[PEOPLE[0].id]); expect(saved).toEqual(before);
      const next = advance(saved, NOW + 50_000).undercover!;
      expect(next.pairIndex).toBe(pairIndex); expect(next.words).toEqual(u.words); expect(next.round).toBe(2);
      for (const description of next.descriptions.filter(({ round }) => round === 2)) {
        expect(description.text).toBe(`${UNDERCOVER_WORDS[pairIndex].clues[u.roles[description.playerId] === 'undercover' ? 1 : 0]}，生活里能见到`);
      }
      expect(next.descriptions.some(({ round }) => round === 2)).toBe(true);
    }
  });
});
