import { describe, expect, it } from 'vitest';

import {
  createThreeNumbers,
  isCorrectAnswer,
  randomNumber1To10,
  totalOf,
} from './logic';

describe('three-sum logic', () => {
  it('generates integers between 1 and 10', () => {
    expect(randomNumber1To10(() => 0)).toBe(1);
    expect(randomNumber1To10(() => 0.999999)).toBe(10);
  });

  it('creates three independent numbers', () => {
    const values = [0, 0.45, 0.999];
    expect(createThreeNumbers(() => values.shift() ?? 0)).toEqual([1, 5, 10]);
  });

  it('calculates and checks the total', () => {
    expect(totalOf([3, 7, 10])).toBe(20);
    expect(isCorrectAnswer([3, 7, 10], 20)).toBe(true);
    expect(isCorrectAnswer([3, 7, 10], 19)).toBe(false);
  });
});
