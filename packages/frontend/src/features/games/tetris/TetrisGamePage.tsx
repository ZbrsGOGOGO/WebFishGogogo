import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type JSX,
} from 'react';

import { Button, Card, PageHeader, Tag } from '../../../components/ui';
import { GameBackLink } from '../GameBackLink';
import { shouldIgnoreGameKeyboard } from '../game-input';
import styles from './TetrisGamePage.module.css';
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  TETROMINO_SHAPES,
  createInitialGame,
  createShuffledBag,
  dropIntervalForLevel,
  getPieceCells,
  tetrisGameReducer,
  type GameStatus,
  type TetrominoType,
} from './tetrisLogic';

const numberFormatter = new Intl.NumberFormat('zh-CN');

const STATUS_META: Record<
  GameStatus,
  { label: string; color: 'success' | 'neutral' | 'danger' }
> = {
  idle: { label: '等待开始', color: 'neutral' },
  running: { label: '进行中', color: 'success' },
  paused: { label: '已暂停', color: 'neutral' },
  gameOver: { label: '游戏结束', color: 'danger' },
};

function createPieceSequence(): TetrominoType[] {
  return [...createShuffledBag(), ...createShuffledBag()];
}

interface ScreenControlProps {
  label: string;
  symbol: string;
  hint: string;
  onPress: () => void;
  disabled: boolean;
  className?: string;
}

function ScreenControl({
  label,
  symbol,
  hint,
  onPress,
  disabled,
  className,
}: ScreenControlProps): JSX.Element {
  return (
    <button
      type="button"
      className={`${styles.controlButton} ${className ?? ''}`}
      aria-label={label}
      title={`${label}（${hint}）`}
      disabled={disabled}
      onClick={onPress}
    >
      <span aria-hidden="true">{symbol}</span>
      <small>{hint}</small>
    </button>
  );
}

export function TetrisGamePage(): JSX.Element {
  const [state, dispatch] = useReducer(
    tetrisGameReducer,
    undefined,
    () => createInitialGame(createPieceSequence()),
  );
  const [autoPaused, setAutoPaused] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);

  const focusBoard = useCallback((): void => {
    boardRef.current?.focus({ preventScroll: true });
  }, []);

  const resetGame = useCallback((start = false): void => {
    setAutoPaused(false);
    dispatch({ type: 'reset', pieces: createPieceSequence(), start });
    if (start) {
      focusBoard();
    }
  }, [focusBoard]);

  const startGame = useCallback((): void => {
    setAutoPaused(false);
    dispatch({ type: 'start' });
    focusBoard();
  }, [focusBoard]);

  useEffect(() => {
    if (state.queue.length < 7) {
      dispatch({ type: 'appendQueue', pieces: createShuffledBag() });
    }
  }, [state.queue.length]);

  useEffect(() => {
    if (state.status !== 'running') {
      return undefined;
    }

    const timerId = window.setInterval(
      () => dispatch({ type: 'tick' }),
      dropIntervalForLevel(state.level),
    );

    return () => window.clearInterval(timerId);
  }, [state.level, state.status]);

  useEffect(() => {
    if (state.status !== 'running') {
      return undefined;
    }

    const pauseForInterruption = (): void => {
      setAutoPaused(true);
      dispatch({ type: 'pause' });
    };
    const handleVisibilityChange = (): void => {
      if (document.hidden) {
        pauseForInterruption();
      }
    };

    window.addEventListener('blur', pauseForInterruption);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('blur', pauseForInterruption);
      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      );
    };
  }, [state.status]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (shouldIgnoreGameKeyboard(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      let handled = true;

      if (event.code === 'Space') {
        if (state.status === 'idle') {
          startGame();
        } else {
          dispatch({ type: 'hardDrop' });
        }
      } else {
        switch (key) {
          case 'arrowleft':
          case 'a':
            dispatch({ type: 'move', columnDelta: -1 });
            break;
          case 'arrowright':
          case 'd':
            dispatch({ type: 'move', columnDelta: 1 });
            break;
          case 'arrowup':
          case 'w':
            dispatch({ type: 'rotate' });
            break;
          case 'arrowdown':
          case 's':
            dispatch({ type: 'softDrop' });
            break;
          case 'p':
          case 'escape':
            if (!event.repeat) {
              setAutoPaused(false);
              dispatch({ type: 'togglePause' });
            }
            break;
          case 'r':
            if (!event.repeat) {
              resetGame(true);
            }
            break;
          default:
            handled = false;
        }
      }

      if (handled) {
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [resetGame, startGame, state.status]);

  const activeCells = useMemo(
    () =>
      new Map(
        getPieceCells(state.activePiece).map((cell) => [
          `${cell.row}:${cell.column}`,
          cell.type,
        ]),
      ),
    [state.activePiece],
  );

  const nextType = state.queue[0] ?? 'T';
  const nextShape = TETROMINO_SHAPES[nextType];
  const statusMeta = STATUS_META[state.status];
  const controlsDisabled = state.status !== 'running';

  return (
    <section className={styles.page} aria-label="方块消除游戏">
      <GameBackLink />
      <PageHeader
        title="方块消除"
        subtitle="旋转并堆叠七种方块，消除完整横行；每消除 10 行提升一级。"
        actions={
          <div className={styles.headerActions}>
            <Button
              variant="secondary"
              onClick={() => {
                setAutoPaused(false);
                dispatch({ type: 'togglePause' });
                focusBoard();
              }}
              disabled={
                state.status === 'idle' || state.status === 'gameOver'
              }
              aria-keyshortcuts="P Escape"
            >
              {state.status === 'paused' ? '继续' : '暂停'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => resetGame(false)}
              aria-keyshortcuts="R"
            >
              重置本局
            </Button>
          </div>
        }
      />

      <div className={styles.layout}>
        <Card
          className={styles.boardCard}
          bodyClassName={styles.boardCardBody}
          title="游戏区"
          headerActions={<Tag color={statusMeta.color}>{statusMeta.label}</Tag>}
        >
          <div className={styles.gameStage}>
            <div className={styles.boardFrame}>
              <div
                className={styles.board}
                role="grid"
                tabIndex={0}
                ref={boardRef}
                aria-label="方块消除棋盘"
                aria-rowcount={BOARD_HEIGHT}
                aria-colcount={BOARD_WIDTH}
                data-testid="tetris-board"
              >
                {state.board.map((boardRow, rowIndex) => (
                  <div
                    className={styles.boardRow}
                    role="row"
                    aria-rowindex={rowIndex + 1}
                    key={rowIndex}
                  >
                    {boardRow.map((settledType, columnIndex) => {
                      const key = `${rowIndex}:${columnIndex}`;
                      const activeType = activeCells.get(key);
                      const cellType = activeType ?? settledType;

                      return (
                        <span
                          className={`${styles.cell} ${
                            cellType ? styles[`piece${cellType}`] : ''
                          }`}
                          role="gridcell"
                          aria-colindex={columnIndex + 1}
                          aria-label={
                            cellType
                              ? `${activeType ? '活动' : '固定'} ${cellType} 方块`
                              : '空格'
                          }
                          data-active={activeType ? 'true' : undefined}
                          data-cell={cellType ?? 'empty'}
                          key={columnIndex}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>

              {state.status !== 'running' && (
                <div
                  className={styles.overlay}
                  role={state.status === 'gameOver' ? 'alert' : 'status'}
                >
                  <strong>
                    {state.status === 'idle'
                      ? '准备开始'
                      : state.status === 'paused'
                        ? autoPaused
                          ? '已为你自动暂停'
                          : '游戏已暂停'
                        : '游戏结束'}
                  </strong>
                  <span>
                    {state.status === 'idle'
                      ? '准备好后点击开始，方块不会提前下落'
                      : state.status === 'paused'
                        ? autoPaused
                          ? '窗口失去焦点时不会继续下落'
                          : '按 P 或点击“继续”返回游戏'
                        : '按 R 或点击“再来一局”继续挑战'}
                  </span>
                  {state.status === 'idle' && (
                    <Button onClick={startGame}>开始游戏</Button>
                  )}
                  {state.status === 'gameOver' && (
                    <Button onClick={() => resetGame(true)}>再来一局</Button>
                  )}
                </div>
              )}
            </div>

            <div className={styles.screenControls} aria-label="屏幕控制">
              <ScreenControl
                label="向左移动"
                symbol="←"
                hint="A"
                disabled={controlsDisabled}
                onPress={() => {
                  dispatch({ type: 'move', columnDelta: -1 });
                  focusBoard();
                }}
              />
              <ScreenControl
                label="旋转方块"
                symbol="↻"
                hint="W"
                disabled={controlsDisabled}
                onPress={() => {
                  dispatch({ type: 'rotate' });
                  focusBoard();
                }}
              />
              <ScreenControl
                label="向右移动"
                symbol="→"
                hint="D"
                disabled={controlsDisabled}
                onPress={() => {
                  dispatch({ type: 'move', columnDelta: 1 })
                  focusBoard();
                }}
              />
              <ScreenControl
                label="软降"
                symbol="↓"
                hint="S"
                disabled={controlsDisabled}
                onPress={() => {
                  dispatch({ type: 'softDrop' });
                  focusBoard();
                }}
              />
              <ScreenControl
                label="硬降"
                symbol="⤓"
                hint="空格"
                className={styles.hardDropControl}
                disabled={controlsDisabled}
                onPress={() => {
                  dispatch({ type: 'hardDrop' });
                  focusBoard();
                }}
              />
            </div>
          </div>
        </Card>

        <aside className={styles.sidebar} aria-label="本局信息">
          <Card title="本局数据" bodyClassName={styles.statsBody}>
            <dl className={styles.stats}>
              <div>
                <dt>得分</dt>
                <dd data-testid="tetris-score">
                  {numberFormatter.format(state.score)}
                </dd>
              </div>
              <div>
                <dt>消除行</dt>
                <dd>{numberFormatter.format(state.lines)}</dd>
              </div>
              <div>
                <dt>等级</dt>
                <dd>Lv.{state.level}</dd>
              </div>
              <div>
                <dt>下落速度</dt>
                <dd>{dropIntervalForLevel(state.level)} ms</dd>
              </div>
            </dl>
          </Card>

          <Card title="下一块" bodyClassName={styles.previewBody}>
            <div
              className={styles.preview}
              style={{
                gridTemplateColumns: `repeat(${nextShape[0].length}, 1fr)`,
              }}
              aria-label={`下一块：${nextType}`}
              role="img"
            >
              {nextShape.flatMap((row, rowIndex) =>
                row.map((occupied, columnIndex) => (
                  <span
                    className={`${styles.previewCell} ${
                      occupied ? styles[`piece${nextType}`] : ''
                    }`}
                    key={`${rowIndex}:${columnIndex}`}
                  />
                )),
              )}
            </div>
          </Card>

          <Card title="操作方法" bodyClassName={styles.helpBody}>
            <ul className={styles.helpList}>
              <li>
                <kbd>←</kbd>
                <kbd>→</kbd>
                <span>左右移动</span>
              </li>
              <li>
                <kbd>↑</kbd>
                <kbd>W</kbd>
                <span>旋转</span>
              </li>
              <li>
                <kbd>↓</kbd>
                <kbd>S</kbd>
                <span>软降 +1 分</span>
              </li>
              <li>
                <kbd>Space</kbd>
                <span>硬降，每格 +2 分</span>
              </li>
              <li>
                <kbd>P</kbd>
                <span>暂停或继续</span>
              </li>
            </ul>
          </Card>
        </aside>
      </div>
    </section>
  );
}
