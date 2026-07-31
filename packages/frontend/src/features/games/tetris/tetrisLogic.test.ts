import { describe, expect, it } from 'vitest';

import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  TETROMINO_TYPES,
  clearCompletedLines,
  createEmptyBoard,
  createInitialGame,
  createPiece,
  createShuffledBag,
  dropIntervalForLevel,
  hardDropPiece,
  levelForLines,
  rotatePiece,
  rotateShapeClockwise,
  scoreForLineClear,
  tetrisGameReducer,
  type Cell,
  type TetrisGameState,
} from './tetrisLogic';

describe('tetris logic', () => {
  it('creates a 10 × 20 board and a bag containing all seven tetrominoes', () => {
    const board = createEmptyBoard();
    const bag = createShuffledBag(() => 0);
    const initial = createInitialGame(['T', 'O']);

    expect(board).toHaveLength(BOARD_HEIGHT);
    expect(board.every((row) => row.length === BOARD_WIDTH)).toBe(true);
    expect(board.flat().every((cell) => cell === null)).toBe(true);
    expect(bag).toHaveLength(7);
    expect(new Set(bag)).toEqual(new Set(TETROMINO_TYPES));
    expect(initial.status).toBe('idle');
  });

  it('rotates clockwise and applies a wall kick near the right edge', () => {
    const board = createEmptyBoard();
    const horizontalI = createPiece('I');
    const verticalI = {
      ...horizontalI,
      shape: rotateShapeClockwise(horizontalI.shape),
      column: 8,
    };

    const rotated = rotatePiece(board, verticalI);

    expect(rotated.shape).toEqual(horizontalI.shape);
    expect(rotated.column).toBe(6);
  });

  it('hard-drops a piece to the lowest valid row', () => {
    const result = hardDropPiece(createEmptyBoard(), createPiece('O'));

    expect(result.distance).toBe(18);
    expect(result.piece.row).toBe(18);
  });

  it('clears complete rows while preserving the rows above them', () => {
    const board = createEmptyBoard();
    board[17][0] = 'T';
    board[18] = Array<Cell>(BOARD_WIDTH).fill('I');
    board[19] = Array<Cell>(BOARD_WIDTH).fill('Z');

    const result = clearCompletedLines(board);

    expect(result.linesCleared).toBe(2);
    expect(result.board).toHaveLength(BOARD_HEIGHT);
    expect(result.board[19][0]).toBe('T');
    expect(result.board[0].every((cell) => cell === null)).toBe(true);
    expect(result.board[1].every((cell) => cell === null)).toBe(true);
  });

  it('uses classic line-clear scoring and accelerates every ten lines', () => {
    expect(scoreForLineClear(1, 1)).toBe(100);
    expect(scoreForLineClear(4, 2)).toBe(1600);
    expect(levelForLines(9)).toBe(1);
    expect(levelForLines(10)).toBe(2);
    expect(dropIntervalForLevel(2)).toBeLessThan(dropIntervalForLevel(1));
    expect(dropIntervalForLevel(99)).toBe(100);
  });

  it('locks pieces, clears a line, scores it, and advances the queue', () => {
    const board = createEmptyBoard();
    board[19] = Array<Cell>(BOARD_WIDTH).fill('J');
    board[19][4] = null;
    board[19][5] = null;

    const state: TetrisGameState = {
      ...createInitialGame(['O', 'I', 'T']),
      status: 'running',
      board,
      activePiece: { ...createPiece('O'), row: 18, column: 4 },
    };

    const nextState = tetrisGameReducer(state, { type: 'hardDrop' });

    expect(nextState.lines).toBe(1);
    expect(nextState.score).toBe(100);
    expect(nextState.activePiece.type).toBe('I');
    expect(nextState.queue[0]).toBe('T');
    expect(nextState.board[19][4]).toBe('O');
    expect(nextState.board[19][5]).toBe('O');
  });

  it('starts explicitly, does not move while paused, and resets to ready', () => {
    const initial = createInitialGame(['T', 'O']);
    const running = tetrisGameReducer(initial, { type: 'start' });
    const paused = tetrisGameReducer(running, { type: 'togglePause' });
    const ignoredMove = tetrisGameReducer(paused, {
      type: 'move',
      columnDelta: -1,
    });
    const reset = tetrisGameReducer(
      { ...ignoredMove, score: 900, lines: 4 },
      { type: 'reset', pieces: ['Z', 'S'] },
    );

    expect(ignoredMove.activePiece).toBe(paused.activePiece);
    expect(running.status).toBe('running');
    expect(reset.status).toBe('idle');
    expect(reset.score).toBe(0);
    expect(reset.lines).toBe(0);
    expect(reset.activePiece.type).toBe('Z');
  });
});
