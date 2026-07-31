import { describe, expect, it } from 'vitest';

import { cardLabel, compareCards, drawCard, playHighLowRound } from './logic';

describe('high-low logic', () => {
  it('draws a card between 1 and 13', () => {
    expect(drawCard(() => 0)).toBe(1);
    expect(drawCard(() => 0.999999)).toBe(13);
  });

  it('compares player and computer cards', () => {
    expect(compareCards(10, 3)).toBe('player');
    expect(compareCards(2, 9)).toBe('computer');
    expect(compareCards(7, 7)).toBe('tie');
  });

  it('settles a prediction deterministically', () => {
    const values = [0.8, 0.1];
    const round = playHighLowRound('player', () => values.shift() ?? 0);
    expect(round.won).toBe(true);
    expect(round.outcome).toBe('player');
  });

  it('formats face cards', () => {
    expect(cardLabel(1)).toBe('A');
    expect(cardLabel(13)).toBe('K');
  });
});
