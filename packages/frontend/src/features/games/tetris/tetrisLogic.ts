export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 20;

export const TETROMINO_TYPES = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'] as const;

export type TetrominoType = (typeof TETROMINO_TYPES)[number];
export type Cell = TetrominoType | null;
export type Board = Cell[][];
export type Shape = number[][];

export interface Piece {
  type: TetrominoType;
  shape: Shape;
  row: number;
  column: number;
}

export interface PositionedCell {
  row: number;
  column: number;
  type: TetrominoType;
}

export interface ClearedBoard {
  board: Board;
  linesCleared: number;
}

export type GameStatus = 'idle' | 'running' | 'paused' | 'gameOver';

export interface TetrisGameState {
  board: Board;
  activePiece: Piece;
  queue: TetrominoType[];
  score: number;
  lines: number;
  level: number;
  status: GameStatus;
}

export type TetrisGameAction =
  | { type: 'move'; columnDelta: -1 | 1 }
  | { type: 'rotate' }
  | { type: 'softDrop' }
  | { type: 'hardDrop' }
  | { type: 'tick' }
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'togglePause' }
  | { type: 'reset'; pieces: TetrominoType[]; start?: boolean }
  | { type: 'appendQueue'; pieces: TetrominoType[] };

export const TETROMINO_SHAPES: Record<TetrominoType, Shape> = {
  I: [[1, 1, 1, 1]],
  J: [
    [1, 0, 0],
    [1, 1, 1],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
  ],
};

const LINE_CLEAR_POINTS = [0, 100, 300, 500, 800] as const;

function cloneShape(shape: Shape): Shape {
  return shape.map((row) => [...row]);
}

export function createEmptyBoard(): Board {
  return Array.from({ length: BOARD_HEIGHT }, () =>
    Array<Cell>(BOARD_WIDTH).fill(null),
  );
}

export function createPiece(type: TetrominoType): Piece {
  const shape = cloneShape(TETROMINO_SHAPES[type]);

  return {
    type,
    shape,
    row: 0,
    column: Math.floor((BOARD_WIDTH - shape[0].length) / 2),
  };
}

export function getPieceCells(
  piece: Piece,
  row = piece.row,
  column = piece.column,
  shape = piece.shape,
): PositionedCell[] {
  const cells: PositionedCell[] = [];

  shape.forEach((shapeRow, rowOffset) => {
    shapeRow.forEach((occupied, columnOffset) => {
      if (occupied) {
        cells.push({
          row: row + rowOffset,
          column: column + columnOffset,
          type: piece.type,
        });
      }
    });
  });

  return cells;
}

export function canPlacePiece(
  board: Board,
  piece: Piece,
  row = piece.row,
  column = piece.column,
  shape = piece.shape,
): boolean {
  return getPieceCells(piece, row, column, shape).every(
    (cell) =>
      cell.row >= 0 &&
      cell.row < BOARD_HEIGHT &&
      cell.column >= 0 &&
      cell.column < BOARD_WIDTH &&
      board[cell.row][cell.column] === null,
  );
}

export function movePiece(
  board: Board,
  piece: Piece,
  rowDelta: number,
  columnDelta: number,
): Piece {
  const nextRow = piece.row + rowDelta;
  const nextColumn = piece.column + columnDelta;

  if (!canPlacePiece(board, piece, nextRow, nextColumn)) {
    return piece;
  }

  return { ...piece, row: nextRow, column: nextColumn };
}

export function rotateShapeClockwise(shape: Shape): Shape {
  return shape[0].map((_, columnIndex) =>
    shape.map((row) => row[columnIndex]).reverse(),
  );
}

export function rotatePiece(board: Board, piece: Piece): Piece {
  const rotatedShape = rotateShapeClockwise(piece.shape);
  const wallKicks = [0, -1, 1, -2, 2];

  for (const columnOffset of wallKicks) {
    const nextColumn = piece.column + columnOffset;
    if (
      canPlacePiece(
        board,
        piece,
        piece.row,
        nextColumn,
        rotatedShape,
      )
    ) {
      return {
        ...piece,
        shape: rotatedShape,
        column: nextColumn,
      };
    }
  }

  return piece;
}

export function getDropDistance(board: Board, piece: Piece): number {
  let distance = 0;

  while (canPlacePiece(board, piece, piece.row + distance + 1)) {
    distance += 1;
  }

  return distance;
}

export function hardDropPiece(board: Board, piece: Piece): {
  piece: Piece;
  distance: number;
} {
  const distance = getDropDistance(board, piece);
  return {
    piece: { ...piece, row: piece.row + distance },
    distance,
  };
}

export function mergePiece(board: Board, piece: Piece): Board {
  const mergedBoard = board.map((row) => [...row]);

  getPieceCells(piece).forEach((cell) => {
    if (
      cell.row >= 0 &&
      cell.row < BOARD_HEIGHT &&
      cell.column >= 0 &&
      cell.column < BOARD_WIDTH
    ) {
      mergedBoard[cell.row][cell.column] = cell.type;
    }
  });

  return mergedBoard;
}

export function clearCompletedLines(board: Board): ClearedBoard {
  const remainingRows = board.filter((row) =>
    row.some((cell) => cell === null),
  );
  const linesCleared = BOARD_HEIGHT - remainingRows.length;
  const emptyRows = Array.from({ length: linesCleared }, () =>
    Array<Cell>(BOARD_WIDTH).fill(null),
  );

  return {
    board: [...emptyRows, ...remainingRows.map((row) => [...row])],
    linesCleared,
  };
}

export function scoreForLineClear(linesCleared: number, level: number): number {
  const safeLineCount = Math.max(
    0,
    Math.min(linesCleared, LINE_CLEAR_POINTS.length - 1),
  );
  return LINE_CLEAR_POINTS[safeLineCount] * Math.max(1, level);
}

export function levelForLines(lines: number): number {
  return Math.floor(Math.max(0, lines) / 10) + 1;
}

export function dropIntervalForLevel(level: number): number {
  return Math.max(100, 850 - (Math.max(1, level) - 1) * 70);
}

export function createShuffledBag(
  random: () => number = Math.random,
): TetrominoType[] {
  const bag = [...TETROMINO_TYPES];

  for (let index = bag.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [bag[index], bag[swapIndex]] = [bag[swapIndex], bag[index]];
  }

  return bag;
}

export function createInitialGame(
  pieces: readonly TetrominoType[] = TETROMINO_TYPES,
): TetrisGameState {
  const [firstPiece = 'T', ...queue] = pieces;

  return {
    board: createEmptyBoard(),
    activePiece: createPiece(firstPiece),
    queue,
    score: 0,
    lines: 0,
    level: 1,
    status: 'idle',
  };
}

function settleActivePiece(state: TetrisGameState): TetrisGameState {
  const mergedBoard = mergePiece(state.board, state.activePiece);
  const { board, linesCleared } = clearCompletedLines(mergedBoard);
  const lines = state.lines + linesCleared;
  const nextType = state.queue[0] ?? 'T';
  const activePiece = createPiece(nextType);
  const status = canPlacePiece(board, activePiece)
    ? state.status
    : 'gameOver';

  return {
    ...state,
    board,
    activePiece,
    queue: state.queue.slice(1),
    score:
      state.score + scoreForLineClear(linesCleared, state.level),
    lines,
    level: levelForLines(lines),
    status,
  };
}

function moveActivePiece(
  state: TetrisGameState,
  rowDelta: number,
  columnDelta: number,
): TetrisGameState {
  const activePiece = movePiece(
    state.board,
    state.activePiece,
    rowDelta,
    columnDelta,
  );

  return activePiece === state.activePiece
    ? state
    : { ...state, activePiece };
}

export function tetrisGameReducer(
  state: TetrisGameState,
  action: TetrisGameAction,
): TetrisGameState {
  if (action.type === 'reset') {
    const initial = createInitialGame(action.pieces);
    return action.start ? { ...initial, status: 'running' } : initial;
  }

  if (action.type === 'appendQueue') {
    return action.pieces.length
      ? { ...state, queue: [...state.queue, ...action.pieces] }
      : state;
  }

  if (action.type === 'start') {
    return state.status === 'idle' ? { ...state, status: 'running' } : state;
  }

  if (action.type === 'pause') {
    return state.status === 'running' ? { ...state, status: 'paused' } : state;
  }

  if (action.type === 'togglePause') {
    if (state.status === 'idle' || state.status === 'gameOver') {
      return state;
    }

    return {
      ...state,
      status: state.status === 'paused' ? 'running' : 'paused',
    };
  }

  if (state.status !== 'running') {
    return state;
  }

  switch (action.type) {
    case 'move':
      return moveActivePiece(state, 0, action.columnDelta);
    case 'rotate': {
      const activePiece = rotatePiece(state.board, state.activePiece);
      return activePiece === state.activePiece
        ? state
        : { ...state, activePiece };
    }
    case 'softDrop': {
      const activePiece = movePiece(
        state.board,
        state.activePiece,
        1,
        0,
      );

      if (activePiece === state.activePiece) {
        return settleActivePiece(state);
      }

      return {
        ...state,
        activePiece,
        score: state.score + 1,
      };
    }
    case 'hardDrop': {
      const dropped = hardDropPiece(state.board, state.activePiece);
      return settleActivePiece({
        ...state,
        activePiece: dropped.piece,
        score: state.score + dropped.distance * 2,
      });
    }
    case 'tick': {
      const movedState = moveActivePiece(state, 1, 0);
      return movedState === state ? settleActivePiece(state) : movedState;
    }
    default:
      return state;
  }
}
