import { describe, expect, it } from 'vitest';
import {
  applyWordFrontV2Action, createWordFrontV2State, replayWordFrontV2, stepWordFrontV2,
  wordFrontV2DrawCost, wordFrontV2HeroForLetters, wordFrontV2Terrain, wordFrontV2UnitForLetter,
  WORD_FRONT_V2_CHAPTERS, WORD_FRONT_V2_UNITS,
  type WordFrontV2Action,
} from '@stealth-reader/shared';

type WithoutTick<T> = T extends { tick: number } ? Omit<T, 'tick'> : never;

describe('word front v2 deterministic campaign', () => {
  it('has six valid contiguous maps with exclusive terrain and chapter names', () => {
    expect(WORD_FRONT_V2_CHAPTERS).toHaveLength(6);
    for (const chapter of WORD_FRONT_V2_CHAPTERS) {
      const state = createWordFrontV2State('story', chapter.id);
      expect(new Set(chapter.path).size).toBe(chapter.path.length);
      expect(chapter.path.length).toBeGreaterThan(15);
      for (const slot of chapter.path) expect(wordFrontV2Terrain(state, slot)).toMatch(/path|slow/);
      for (let index = 1; index < chapter.path.length; index += 1) {
        const first = chapter.path[index - 1]!, second = chapter.path[index]!;
        expect(Math.abs(first % 8 - second % 8) + Math.abs(Math.floor(first / 8) - Math.floor(second / 8))).toBe(1);
      }
      for (const slot of chapter.waste) expect(wordFrontV2Terrain(state, slot)).toBe('waste');
      for (const slot of chapter.obstacles) expect(wordFrontV2Terrain(state, slot)).toBe('obstacle');
      for (const slot of chapter.buff) expect(wordFrontV2Terrain(state, slot)).toBe('buff');
    }
  });

  it('uses 10+2n recruitment, a safe opening pair, and capped non-passive currency', () => {
    let state = createWordFrontV2State('story', 1, 77);
    expect(wordFrontV2DrawCost(0)).toBe(10);
    expect(wordFrontV2DrawCost(3)).toBe(16);
    state = applyWordFrontV2Action(state, { type: 'recruit', tick: 0 })!;
    expect(state.credits).toBe(20);
    expect(state.hand.slice(0, 2).join('')).toMatch(/^(赵云|关羽|张飞|黄忠|马超)$/);
    expect(state.hand.length + state.shovels).toBe(5);
    expect(applyWordFrontV2Action(state, { type: 'recruit', tick: 0 })?.credits).toBe(8);
    const still = stepWordFrontV2(state);
    expect(still.credits).toBe(state.credits);
    expect(still.tick).toBe(0);
    expect(applyWordFrontV2Action({ ...state, credits: 40, hand: Array(146).fill('订') }, { type: 'recruit', tick: 0 })).toBeNull();
    expect(applyWordFrontV2Action({ ...state, credits: 40, hand: Array(145).fill('订') }, { type: 'recruit', tick: 0 })?.hand.length).toBeLessThanOrEqual(150);
  });

  it('supports basic glyphs, hero pairs, shovels, local merchant and replayed outcomes', () => {
    let state = createWordFrontV2State('story', 1, 77);
    const actions: WordFrontV2Action[] = [{ type: 'recruit', tick: 0 }];
    state = applyWordFrontV2Action(state, actions[0]!)!;
    actions.push({ type: 'deploy_hero', first: 0, second: 1, slot: 0, tick: 0 });
    state = applyWordFrontV2Action(state, actions[1]!)!;
    expect(state.units[0]?.kind).toBeTruthy();
    const basicIndex = state.hand.findIndex(letter => ['订', '咖', '印', '椅', '碎'].includes(letter));
    if (basicIndex >= 0) {
      actions.push({ type: 'deploy_basic', card: basicIndex, slot: 1, tick: 0 });
      state = applyWordFrontV2Action(state, actions.at(-1)!)!;
      expect(state.units).toHaveLength(2);
    }
    expect(applyWordFrontV2Action(state, { type: 'unlock', slot: 3, tick: 0 })).toBeNull();
    const shovelState = { ...state, shovels: 1 };
    const unlocked = applyWordFrontV2Action(shovelState, { type: 'unlock', slot: 3, tick: 0 })!;
    expect(wordFrontV2Terrain(unlocked, 3)).toBe('open');
    expect(unlocked.shovels).toBe(0);
    expect(applyWordFrontV2Action(unlocked, { type: 'unlock', slot: 3, tick: 0 })).toBeNull();
    expect(applyWordFrontV2Action(state, { type: 'buy_boost', boost: 'attack', tick: 0 })).toBeNull();
    const merchantState = applyWordFrontV2Action({ ...state, status: 'running' as const, gold: 12 }, { type: 'buy_boost', boost: 'attack', tick: 0 })!;
    expect(merchantState.attackBoost).toBe(1);
    expect(merchantState.gold).toBe(0);

    actions.push({ type: 'start', tick: 0 });
    state = applyWordFrontV2Action(state, actions.at(-1)!)!;
    while (state.status === 'running' && state.tick < 3000) state = stepWordFrontV2(state);
    expect(['won', 'lost']).toContain(state.status);
    expect(replayWordFrontV2('story', 1, 77, actions, state.tick)).toEqual(state);
    expect(replayWordFrontV2('story', 1, 78, actions, state.tick)?.score).not.toBe(state.score);
    expect(replayWordFrontV2('story', 1, 77, [...actions, { type: 'buy_boost', boost: 'attack', tick: 0 }], state.tick)).toBeNull();
  });

  it('has a legal, replayable winning route for every chapter and the 30-wave challenge', () => {
    for (const [mode, chapter] of [
      ...WORD_FRONT_V2_CHAPTERS.map(item => ['story', item.id] as const), ['endless', 1] as const,
    ]) {
      const seed = 77;
      let state = createWordFrontV2State(mode, chapter, seed);
      const actions: WordFrontV2Action[] = [];
      const path = WORD_FRONT_V2_CHAPTERS[(mode === 'endless' ? 6 : chapter) - 1]!.path as readonly number[];
      const distance = (a: number, b: number) => Math.abs(a % 8 - b % 8) + Math.abs(Math.floor(a / 8) - Math.floor(b / 8));
      function act(action: WithoutTick<WordFrontV2Action>): boolean {
        const move = { ...action, tick: state.tick } as WordFrontV2Action;
        const next = applyWordFrontV2Action(state, move);
        if (!next) return false;
        state = next; actions.push(move); return true;
      }
      function deployHand(): void {
        let changed = true;
        while (changed) {
          changed = false;
          for (let index = 0; index < state.hand.length; index += 1) {
            let kind = wordFrontV2UnitForLetter(state.hand[index]!);
            let second = -1;
            if (!kind) for (let other = index + 1; other < state.hand.length; other += 1) {
              const hero = wordFrontV2HeroForLetters(state.hand[index]!, state.hand[other]!);
              if (hero) { kind = hero; second = other; break; }
            }
            if (!kind) continue;
            const range = WORD_FRONT_V2_UNITS[kind].range;
            const free = Array.from({ length: 48 }, (_, slot) => slot)
              .filter(slot => ['open', 'buff'].includes(wordFrontV2Terrain(state, slot)) && !state.units.some(unit => unit.slot === slot))
              .sort((a, b) => path.filter(slot => distance(b, slot) <= range).length - path.filter(slot => distance(a, slot) <= range).length);
            if (!free.length) return;
            const action = second >= 0
              ? { type: 'deploy_hero' as const, first: index, second, slot: free[0]! }
              : { type: 'deploy_basic' as const, card: index, slot: free[0]! };
            if (act(action)) { changed = true; break; }
          }
        }
      }
      expect(act({ type: 'recruit' })).toBe(true);
      expect(act({ type: 'recruit' })).toBe(true);
      deployHand();
      expect(state.units.length).toBeGreaterThanOrEqual(2);
      expect(act({ type: 'start' })).toBe(true);
      while (state.status === 'running' && state.tick < 3_000) {
        state = stepWordFrontV2(state);
        if (state.tick % 8 !== 0) continue;
        if (state.credits >= wordFrontV2DrawCost(state.drawCount)) act({ type: 'recruit' });
        deployHand();
        if (state.gold >= 12 && state.attackBoost < 3) act({ type: 'buy_boost', boost: 'attack' });
        else if (state.gold >= 12 && state.coreHp < 5) act({ type: 'buy_boost', boost: 'heal' });
      }
      expect(state.status, `${mode} chapter ${chapter}`).toBe('won');
      expect(state.completedWaves).toBe(mode === 'endless' ? 30 : chapter + 2);
      expect(replayWordFrontV2(mode, chapter, seed, actions, state.tick)).toEqual(state);
      expect(actions.length).toBeLessThanOrEqual(400);
    }
  });
});
