export const TANK_BOARD_WIDTH = 15;
export const TANK_BOARD_HEIGHT = 11;

export type TankDirection = 'up' | 'down' | 'left' | 'right';
export type TankGameStatus = 'idle' | 'running' | 'paused' | 'won' | 'lost';

export interface TankPoint {
  x: number;
  y: number;
}

export interface TankUnit extends TankPoint {
  id: string;
  direction: TankDirection;
  lives: number;
  invulnerableUntilTick?: number;
}

export interface TankBullet extends TankPoint {
  id: string;
  owner: 'player' | 'enemy';
  direction: TankDirection;
}

export interface TankGameState {
  status: TankGameStatus;
  player: TankUnit;
  enemies: TankUnit[];
  bullets: TankBullet[];
  walls: TankPoint[];
  score: number;
  tick: number;
}

const INITIAL_WALLS: TankPoint[] = [
  { x: 3, y: 2 },
  { x: 4, y: 2 },
  { x: 10, y: 2 },
  { x: 11, y: 2 },
  { x: 2, y: 4 },
  { x: 3, y: 4 },
  { x: 6, y: 4 },
  { x: 8, y: 4 },
  { x: 11, y: 4 },
  { x: 12, y: 4 },
  { x: 5, y: 6 },
  { x: 6, y: 6 },
  { x: 8, y: 6 },
  { x: 9, y: 6 },
  { x: 2, y: 8 },
  { x: 3, y: 8 },
  { x: 11, y: 8 },
  { x: 12, y: 8 },
];

const DIRECTIONS: TankDirection[] = ['up', 'right', 'down', 'left'];
const ENEMY_FIRE_CHANCE = 0.018;
const PLAYER_INVULNERABLE_TICKS = 24;

function pointKey(point: TankPoint): string {
  return `${point.x}:${point.y}`;
}

export function nextTankPoint(
  point: TankPoint,
  direction: TankDirection,
): TankPoint {
  if (direction === 'up') return { x: point.x, y: point.y - 1 };
  if (direction === 'down') return { x: point.x, y: point.y + 1 };
  if (direction === 'left') return { x: point.x - 1, y: point.y };
  return { x: point.x + 1, y: point.y };
}

export function isTankPointInside(point: TankPoint): boolean {
  return (
    point.x >= 0 &&
    point.x < TANK_BOARD_WIDTH &&
    point.y >= 0 &&
    point.y < TANK_BOARD_HEIGHT
  );
}

export function createTankGameState(): TankGameState {
  return {
    status: 'idle',
    player: {
      id: 'player',
      x: Math.floor(TANK_BOARD_WIDTH / 2),
      y: TANK_BOARD_HEIGHT - 1,
      direction: 'up',
      lives: 3,
    },
    enemies: [
      { id: 'enemy-1', x: 1, y: 0, direction: 'down', lives: 1 },
      {
        id: 'enemy-2',
        x: Math.floor(TANK_BOARD_WIDTH / 2),
        y: 0,
        direction: 'down',
        lives: 1,
      },
      {
        id: 'enemy-3',
        x: TANK_BOARD_WIDTH - 2,
        y: 0,
        direction: 'down',
        lives: 1,
      },
    ],
    bullets: [],
    walls: INITIAL_WALLS.map((wall) => ({ ...wall })),
    score: 0,
    tick: 0,
  };
}

function isOccupied(
  point: TankPoint,
  state: TankGameState,
  ignoredTankId?: string,
): boolean {
  if (state.walls.some((wall) => pointKey(wall) === pointKey(point))) {
    return true;
  }
  if (
    state.player.id !== ignoredTankId &&
    pointKey(state.player) === pointKey(point)
  ) {
    return true;
  }
  return state.enemies.some(
    (enemy) =>
      enemy.id !== ignoredTankId && pointKey(enemy) === pointKey(point),
  );
}

export function movePlayerTank(
  state: TankGameState,
  direction: TankDirection,
): TankGameState {
  if (state.status !== 'running') return state;
  const target = nextTankPoint(state.player, direction);
  return {
    ...state,
    player: {
      ...state.player,
      direction,
      ...(isTankPointInside(target) &&
      !isOccupied(target, state, state.player.id)
        ? target
        : {}),
    },
  };
}

function bulletFromTank(
  tank: TankUnit,
  owner: TankBullet['owner'],
  id: string,
): TankBullet | null {
  const muzzle = nextTankPoint(tank, tank.direction);
  if (!isTankPointInside(muzzle)) return null;
  return {
    x: tank.x,
    y: tank.y,
    id,
    owner,
    direction: tank.direction,
  };
}

export function firePlayerTank(state: TankGameState): TankGameState {
  if (state.status !== 'running') return state;
  if (state.bullets.some((bullet) => bullet.owner === 'player')) {
    return state;
  }
  const bullet = bulletFromTank(
    state.player,
    'player',
    `player-shot-${state.tick}`,
  );
  return bullet
    ? { ...state, bullets: [...state.bullets, bullet] }
    : state;
}

function chooseEnemyDirection(
  enemy: TankUnit,
  player: TankUnit,
  random: () => number,
): TankDirection {
  const horizontal =
    player.x < enemy.x ? 'left' : player.x > enemy.x ? 'right' : null;
  const vertical =
    player.y < enemy.y ? 'up' : player.y > enemy.y ? 'down' : null;
  if (horizontal && vertical) {
    return random() < 0.5 ? horizontal : vertical;
  }
  return horizontal ?? vertical ?? DIRECTIONS[Math.floor(random() * 4)] ?? 'down';
}

function moveEnemy(
  enemy: TankUnit,
  state: TankGameState,
  random: () => number,
): TankUnit {
  let direction = chooseEnemyDirection(enemy, state.player, random);
  let target = nextTankPoint(enemy, direction);
  if (
    !isTankPointInside(target) ||
    isOccupied(target, state, enemy.id)
  ) {
    direction = DIRECTIONS[Math.floor(random() * 4)] ?? 'down';
    target = nextTankPoint(enemy, direction);
  }
  return {
    ...enemy,
    direction,
    ...(isTankPointInside(target) &&
    !isOccupied(target, state, enemy.id)
      ? target
      : {}),
  };
}

export function stepTankGame(
  state: TankGameState,
  random: () => number = Math.random,
): TankGameState {
  if (state.status !== 'running') return state;

  let walls = state.walls.map((wall) => ({ ...wall }));
  let enemies = state.enemies.map((enemy) => ({ ...enemy }));
  let player = { ...state.player };
  let score = state.score;
  const movedBullets: TankBullet[] = [];

  for (const bullet of state.bullets) {
    const next = nextTankPoint(bullet, bullet.direction);
    if (!isTankPointInside(next)) continue;

    const wallIndex = walls.findIndex(
      (wall) => pointKey(wall) === pointKey(next),
    );
    if (wallIndex >= 0) {
      walls = walls.filter((_, index) => index !== wallIndex);
      continue;
    }

    if (bullet.owner === 'player') {
      const enemyIndex = enemies.findIndex(
        (enemy) => pointKey(enemy) === pointKey(next),
      );
      if (enemyIndex >= 0) {
        enemies = enemies.filter((_, index) => index !== enemyIndex);
        score += 100;
        continue;
      }
    } else if (pointKey(player) === pointKey(next)) {
      if ((player.invulnerableUntilTick ?? -1) <= state.tick) {
        player = {
          ...player,
          x: Math.floor(TANK_BOARD_WIDTH / 2),
          y: TANK_BOARD_HEIGHT - 1,
          direction: 'up',
          lives: player.lives - 1,
          invulnerableUntilTick: state.tick + PLAYER_INVULNERABLE_TICKS,
        };
      }
      continue;
    }

    movedBullets.push({ ...bullet, ...next });
  }

  if (player.lives <= 0) {
    return {
      ...state,
      status: 'lost',
      player,
      enemies,
      bullets: movedBullets,
      walls,
      score,
      tick: state.tick + 1,
    };
  }

  if (enemies.length === 0) {
    return {
      ...state,
      status: 'won',
      player,
      enemies,
      bullets: movedBullets,
      walls,
      score,
      tick: state.tick + 1,
    };
  }

  const movementState: TankGameState = {
    ...state,
    player,
    enemies,
    bullets: movedBullets,
    walls,
    score,
  };
  const movedEnemies: TankUnit[] = [];
  for (const enemy of enemies) {
    if (state.tick % 3 !== 0) {
      movedEnemies.push(enemy);
      continue;
    }

    const unmovedEnemies = enemies.filter(
      (candidate) =>
        candidate.id !== enemy.id &&
        !movedEnemies.some((moved) => moved.id === candidate.id),
    );
    const currentMovementState: TankGameState = {
      ...movementState,
      enemies: [...movedEnemies, ...unmovedEnemies],
    };
    movedEnemies.push(moveEnemy(enemy, currentMovementState, random));
  }
  enemies = movedEnemies;

  const enemyBullets = [...movedBullets];
  for (const enemy of enemies) {
    const alreadyHasBullet = enemyBullets.some(
      (bullet) => bullet.owner === 'enemy' && bullet.id.startsWith(enemy.id),
    );
    if (!alreadyHasBullet && random() < ENEMY_FIRE_CHANCE) {
      const bullet = bulletFromTank(
        enemy,
        'enemy',
        `${enemy.id}-shot-${state.tick}`,
      );
      if (bullet) {
        enemyBullets.push(bullet);
      }
    }
  }

  return {
    ...state,
    player,
    enemies,
    bullets: enemyBullets,
    walls,
    score,
    tick: state.tick + 1,
  };
}
