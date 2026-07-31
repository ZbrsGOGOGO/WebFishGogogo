export const GRID_SIZE = 20;
export const SCORE_PER_FOOD = 10;

export type Direction = 'up' | 'down' | 'left' | 'right';
export type GameStatus = 'idle' | 'running' | 'paused' | 'game-over' | 'won';
export type EndReason = 'wall' | 'self' | 'board-filled' | null;

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface SnakeGameState {
  readonly snake: readonly Point[];
  readonly direction: Direction;
  readonly queuedDirection: Direction;
  readonly food: Point | null;
  readonly score: number;
  readonly status: GameStatus;
  readonly endReason: EndReason;
}

const DIRECTION_VECTORS: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPPOSITE_DIRECTIONS: Record<Direction, Direction> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

export function pointKey(point: Point): string {
  return `${point.x}:${point.y}`;
}

export function pointsEqual(first: Point, second: Point): boolean {
  return first.x === second.x && first.y === second.y;
}

/**
 * Selects an open square without retry loops, so food placement also works when
 * only one square remains. Injecting `random` keeps the engine deterministic in
 * tests.
 */
export function placeFood(
  snake: readonly Point[],
  random: () => number = Math.random,
  gridSize = GRID_SIZE,
): Point | null {
  const occupied = new Set(snake.map(pointKey));
  const openCells: Point[] = [];

  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      const point = { x, y };
      if (!occupied.has(pointKey(point))) {
        openCells.push(point);
      }
    }
  }

  if (openCells.length === 0) {
    return null;
  }

  const randomValue = random();
  const normalizedRandom = Number.isFinite(randomValue)
    ? Math.min(Math.max(randomValue, 0), 1 - Number.EPSILON)
    : 0;

  return openCells[Math.floor(normalizedRandom * openCells.length)] ?? null;
}

export function createInitialGame(
  random: () => number = Math.random,
): SnakeGameState {
  const snake: readonly Point[] = [
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 },
  ];

  return {
    snake,
    direction: 'right',
    queuedDirection: 'right',
    food: placeFood(snake, random),
    score: 0,
    status: 'idle',
    endReason: null,
  };
}

/**
 * Queues at most one turn for the next tick. Checking against the direction of
 * the last completed move prevents rapid key presses from creating a 180° turn.
 */
export function queueDirection(
  state: SnakeGameState,
  direction: Direction,
): SnakeGameState {
  if (
    state.status === 'game-over' ||
    state.status === 'won' ||
    OPPOSITE_DIRECTIONS[state.direction] === direction
  ) {
    return state;
  }

  if (state.queuedDirection === direction) {
    return state;
  }

  return {
    ...state,
    queuedDirection: direction,
  };
}

function isOutsideBoard(point: Point): boolean {
  return (
    point.x < 0 ||
    point.y < 0 ||
    point.x >= GRID_SIZE ||
    point.y >= GRID_SIZE
  );
}

export function advanceGame(
  state: SnakeGameState,
  random: () => number = Math.random,
): SnakeGameState {
  if (state.status !== 'running') {
    return state;
  }

  const movement = DIRECTION_VECTORS[state.queuedDirection];
  const currentHead = state.snake[0];

  if (!currentHead) {
    return {
      ...createInitialGame(random),
      status: 'game-over',
      endReason: 'self',
    };
  }

  const nextHead: Point = {
    x: currentHead.x + movement.x,
    y: currentHead.y + movement.y,
  };

  if (isOutsideBoard(nextHead)) {
    return {
      ...state,
      direction: state.queuedDirection,
      status: 'game-over',
      endReason: 'wall',
    };
  }

  const ateFood = state.food != null && pointsEqual(nextHead, state.food);
  // The tail leaves its square on a normal move, so that square is safe to enter.
  const collisionBody = ateFood ? state.snake : state.snake.slice(0, -1);

  if (collisionBody.some((segment) => pointsEqual(segment, nextHead))) {
    return {
      ...state,
      direction: state.queuedDirection,
      status: 'game-over',
      endReason: 'self',
    };
  }

  const nextSnake = [
    nextHead,
    ...(ateFood ? state.snake : state.snake.slice(0, -1)),
  ];

  if (!ateFood) {
    return {
      ...state,
      snake: nextSnake,
      direction: state.queuedDirection,
      queuedDirection: state.queuedDirection,
      endReason: null,
    };
  }

  const nextFood = placeFood(nextSnake, random);

  return {
    ...state,
    snake: nextSnake,
    direction: state.queuedDirection,
    queuedDirection: state.queuedDirection,
    food: nextFood,
    score: state.score + SCORE_PER_FOOD,
    status: nextFood == null ? 'won' : 'running',
    endReason: nextFood == null ? 'board-filled' : null,
  };
}
