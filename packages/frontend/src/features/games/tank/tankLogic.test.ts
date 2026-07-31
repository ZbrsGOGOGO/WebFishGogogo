import { describe, expect, it } from 'vitest';

import {
  createTankGameState,
  firePlayerTank,
  movePlayerTank,
  nextTankPoint,
  stepTankGame,
} from './tankLogic';

describe('tank battle logic', () => {
  it('calculates the next point by direction', () => {
    expect(nextTankPoint({ x: 3, y: 3 }, 'up')).toEqual({ x: 3, y: 2 });
    expect(nextTankPoint({ x: 3, y: 3 }, 'right')).toEqual({ x: 4, y: 3 });
  });

  it('moves the running player and changes direction', () => {
    const state = { ...createTankGameState(), status: 'running' as const };
    const moved = movePlayerTank(state, 'left');
    expect(moved.player.direction).toBe('left');
    expect(moved.player.x).toBe(state.player.x - 1);
  });

  it('fires at most one player bullet at a time', () => {
    const state = { ...createTankGameState(), status: 'running' as const };
    const fired = firePlayerTank(state);
    expect(fired.bullets).toHaveLength(1);
    expect(firePlayerTank(fired).bullets).toHaveLength(1);
  });

  it('removes a wall hit by a bullet', () => {
    const state = {
      ...createTankGameState(),
      status: 'running' as const,
      walls: [{ x: 5, y: 5 }],
      bullets: [
        {
          id: 'player-shot',
          owner: 'player' as const,
          direction: 'right' as const,
          x: 4,
          y: 5,
        },
      ],
    };
    expect(stepTankGame(state, () => 1).walls).toHaveLength(0);
  });

  it('wins when the final enemy is hit', () => {
    const state = {
      ...createTankGameState(),
      status: 'running' as const,
      walls: [],
      enemies: [
        { id: 'enemy-last', x: 5, y: 5, direction: 'down' as const, lives: 1 },
      ],
      bullets: [
        {
          id: 'player-shot',
          owner: 'player' as const,
          direction: 'right' as const,
          x: 4,
          y: 5,
        },
      ],
    };
    const next = stepTankGame(state, () => 1);
    expect(next.status).toBe('won');
    expect(next.score).toBe(100);
  });

  it('resolves a shot against an adjacent wall instead of skipping over it', () => {
    const state = {
      ...createTankGameState(),
      status: 'running' as const,
      player: {
        ...createTankGameState().player,
        x: 4,
        y: 5,
        direction: 'right' as const,
      },
      walls: [{ x: 5, y: 5 }],
    };

    const next = stepTankGame(firePlayerTank(state), () => 1);

    expect(next.walls).toHaveLength(0);
    expect(next.bullets).toHaveLength(0);
  });

  it('hits an adjacent enemy on the next game step', () => {
    const state = {
      ...createTankGameState(),
      status: 'running' as const,
      player: {
        ...createTankGameState().player,
        x: 4,
        y: 5,
        direction: 'right' as const,
      },
      enemies: [
        { id: 'enemy-last', x: 5, y: 5, direction: 'left' as const, lives: 1 },
      ],
      walls: [],
    };

    const next = stepTankGame(firePlayerTank(state), () => 1);

    expect(next.status).toBe('won');
    expect(next.enemies).toHaveLength(0);
    expect(next.score).toBe(100);
  });

  it('keeps enemy tanks in distinct cells while they move', () => {
    const base = createTankGameState();
    const state = {
      ...base,
      status: 'running' as const,
      player: { ...base.player, x: 1, y: 2 },
      walls: [],
      enemies: [
        { id: 'enemy-1', x: 0, y: 1, direction: 'right' as const, lives: 1 },
        { id: 'enemy-2', x: 1, y: 0, direction: 'down' as const, lives: 1 },
      ],
    };

    const next = stepTankGame(state, () => 0);
    const occupied = next.enemies.map((enemy) => `${enemy.x}:${enemy.y}`);

    expect(new Set(occupied).size).toBe(next.enemies.length);
  });

  it('gives the player a short grace period after taking damage', () => {
    const base = createTankGameState();
    const state = {
      ...base,
      status: 'running' as const,
      player: { ...base.player, x: 5, y: 5 },
      walls: [],
      bullets: [
        {
          id: 'enemy-shot-1',
          owner: 'enemy' as const,
          direction: 'down' as const,
          x: 5,
          y: 4,
        },
      ],
    };

    const afterFirstHit = stepTankGame(state, () => 1);
    const secondShotState = {
      ...afterFirstHit,
      status: 'running' as const,
      bullets: [
        {
          id: 'enemy-shot-2',
          owner: 'enemy' as const,
          direction: 'down' as const,
          x: afterFirstHit.player.x,
          y: afterFirstHit.player.y - 1,
        },
      ],
    };
    const afterSecondHit = stepTankGame(secondShotState, () => 1);

    expect(afterFirstHit.player.lives).toBe(2);
    expect(afterSecondHit.player.lives).toBe(2);
  });
});
