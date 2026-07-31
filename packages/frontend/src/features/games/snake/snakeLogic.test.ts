import { describe, expect, it } from 'vitest';

import {
  GRID_SIZE,
  SCORE_PER_FOOD,
  advanceGame,
  createInitialGame,
  placeFood,
  pointKey,
  queueDirection,
  type SnakeGameState,
} from './snakeLogic';

function runningState(
  overrides: Partial<SnakeGameState> = {},
): SnakeGameState {
  return {
    ...createInitialGame(() => 0),
    status: 'running',
    ...overrides,
  };
}

describe('snakeLogic', () => {
  it('creates a 20 × 20 game with food outside the snake', () => {
    const state = createInitialGame(() => 0);
    const occupied = new Set(state.snake.map(pointKey));

    expect(GRID_SIZE).toBe(20);
    expect(state.snake).toHaveLength(3);
    expect(state.food).not.toBeNull();
    expect(occupied.has(pointKey(state.food!))).toBe(false);
    expect(state.status).toBe('idle');
  });

  it('places food deterministically and returns null for a full board', () => {
    expect(placeFood([{ x: 0, y: 0 }], () => 0, 2)).toEqual({
      x: 1,
      y: 0,
    });
    expect(
      placeFood(
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 0, y: 1 },
          { x: 1, y: 1 },
        ],
        () => 0.5,
        2,
      ),
    ).toBeNull();
  });

  it('queues a turn but rejects reversals and rapid two-step reversals', () => {
    const initial = runningState();
    const turnedUp = queueDirection(initial, 'up');

    expect(turnedUp.queuedDirection).toBe('up');
    expect(queueDirection(turnedUp, 'left').queuedDirection).toBe('up');
    expect(queueDirection(initial, 'left')).toBe(initial);
  });

  it('moves one square and releases the previous tail square', () => {
    const state = runningState({
      snake: [
        { x: 2, y: 1 },
        { x: 2, y: 2 },
        { x: 1, y: 2 },
        { x: 1, y: 1 },
      ],
      direction: 'up',
      queuedDirection: 'left',
      food: { x: 9, y: 9 },
    });

    const next = advanceGame(state);

    expect(next.status).toBe('running');
    expect(next.snake).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 1, y: 2 },
    ]);
  });

  it('grows, scores, and places new food after eating', () => {
    const state = runningState({
      food: { x: 11, y: 10 },
    });

    const next = advanceGame(state, () => 0);

    expect(next.snake).toHaveLength(state.snake.length + 1);
    expect(next.snake[0]).toEqual({ x: 11, y: 10 });
    expect(next.score).toBe(SCORE_PER_FOOD);
    expect(next.food).toEqual({ x: 0, y: 0 });
  });

  it('ends the game on wall and body collisions', () => {
    const wallCollision = advanceGame(
      runningState({
        snake: [{ x: 19, y: 5 }],
        direction: 'right',
        queuedDirection: 'right',
      }),
    );
    const selfCollision = advanceGame(
      runningState({
        snake: [
          { x: 2, y: 2 },
          { x: 2, y: 1 },
          { x: 1, y: 1 },
          { x: 1, y: 2 },
          { x: 1, y: 3 },
        ],
        direction: 'down',
        queuedDirection: 'left',
        food: { x: 9, y: 9 },
      }),
    );

    expect(wallCollision).toMatchObject({
      status: 'game-over',
      endReason: 'wall',
    });
    expect(selfCollision).toMatchObject({
      status: 'game-over',
      endReason: 'self',
    });
  });
});
