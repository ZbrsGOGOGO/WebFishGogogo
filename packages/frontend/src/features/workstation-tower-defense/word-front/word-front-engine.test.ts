import { describe, expect, it } from 'vitest';
import {
  createWordFrontState, deployWordFrontUnit, mergeWordFrontUnits, recruitWordFrontCards,
  replayWordFront, startWordFront, stepWordFront, wordFrontDrawCost, wordFrontHeroForLetters, WORD_FRONT_PATH,
  type WordFrontAction,
} from '@stealth-reader/shared';

describe('word front independent rules', () => {
  it('starts at five lives and applies one unambiguous five-card recruitment price', () => {
    const initial = createWordFrontState('story', 1, 12);
    expect(initial.coreHp).toBe(5);
    expect(initial.credits).toBe(30);
    expect([0, 1, 2].map(wordFrontDrawCost)).toEqual([10, 12, 14]);
    const recruited = recruitWordFrontCards(initial);
    expect(recruited.hand).toHaveLength(5);
    expect(recruited.credits).toBe(20);
    expect(recruitWordFrontCards(recruited).hand).toHaveLength(10);
  });

  it('guarantees at least one valid two-character hero in each recruitment', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const state = recruitWordFrontCards(createWordFrontState('story', 1, seed));
      expect(state.hand.some((first, i) => state.hand.some((second, j) => i !== j && wordFrontHeroForLetters(first, second)))).toBe(true);
    }
    expect(wordFrontHeroForLetters('赵', '云')).toBe('zhaoyun');
    expect(wordFrontHeroForLetters('云', '赵')).toBe('zhaoyun');
    expect(wordFrontHeroForLetters('赵', '赵')).toBeNull();
  });

  it('prevents path placement and merges two equal heroes into one higher-rank hero', () => {
    const state = { ...createWordFrontState(), hand: ['赵', '云', '赵', '云'] };
    expect(deployWordFrontUnit(state, 0, 1, WORD_FRONT_PATH[0])).toEqual(expect.objectContaining({ units: [] }));
    const first = deployWordFrontUnit(state, 0, 1, 0);
    const second = deployWordFrontUnit(first, 0, 1, 1);
    expect(second.units).toHaveLength(2);
    const merged = mergeWordFrontUnits(second, 0, 1);
    expect(merged.units).toEqual([{ slot: 1, kind: 'zhaoyun', level: 2 }]);
    expect(mergeWordFrontUnits(merged, 0, 1).units).toEqual(merged.units);
  });

  it('requires a deployed hero, runs separate story lengths and uses the fixed score formula', () => {
    const ready = createWordFrontState('story', 1);
    expect(startWordFront(ready).status).toBe('ready');
    let state = startWordFront({ ...ready, units: [{ slot: 16, kind: 'zhaoyun', level: 3 }, { slot: 17, kind: 'guanyu', level: 3 }, { slot: 18, kind: 'zhangfei', level: 3 }] });
    for (let index = 0; index < 600 && state.status === 'running'; index += 1) state = stepWordFront(state);
    expect(state.status).toBe('won');
    expect(state.completedWaves).toBe(3);
    expect(state.score).toBe(state.completedWaves * 100 + state.kills * 10 + state.coreHp * 20);
    expect(createWordFrontState('story', 3).chapter).toBe(3);
    expect(createWordFrontState('endless').mode).toBe('endless');
  });

  it('ends when five enemies leak and never touches the old tower state', () => {
    let state = startWordFront({ ...createWordFrontState(), units: [{ slot: 0, kind: 'zhuge', level: 1 }] });
    state = { ...state, coreHp: 1, pendingSpawns: 0, enemies: [{ id: 1, pathIndex: WORD_FRONT_PATH.length - 1, hp: 100, maxHp: 100, speed: 1 }], tick: 1 };
    state = stepWordFront(state);
    expect(state.status).toBe('lost');
    expect(state.coreHp).toBe(0);
    expect(state.score).toBe(state.completedWaves * 100 + state.kills * 10);
  });

  it('replays only successful ordered actions from the server seed and rejects forged ticks', () => {
    const seed = 17;
    const drawn = recruitWordFrontCards(createWordFrontState('story', 1, seed));
    let first = 0, second = 1;
    outer: for (let i = 0; i < drawn.hand.length; i += 1) for (let j = i + 1; j < drawn.hand.length; j += 1) {
      if (wordFrontHeroForLetters(drawn.hand[i]!, drawn.hand[j]!)) { first = i; second = j; break outer; }
    }
    const actions: WordFrontAction[] = [
      { tick: 0, type: 'recruit' },
      { tick: 0, type: 'deploy', first, second, slot: 16 },
      { tick: 0, type: 'start' },
    ];
    let local = startWordFront(deployWordFrontUnit(drawn, first, second, 16));
    for (let index = 0; index < 1_000 && local.status === 'running'; index += 1) local = stepWordFront(local);
    const replayed = replayWordFront('story', 1, seed, actions, local.tick);
    expect(replayed).toEqual(local);
    expect(replayWordFront('story', 1, seed, [...actions, { tick: local.tick + 1, type: 'recruit' }], local.tick)).toBeNull();
    expect(replayWordFront('story', 1, seed, [{ tick: 0, type: 'start' }, ...actions], local.tick)).toBeNull();
  });
});
