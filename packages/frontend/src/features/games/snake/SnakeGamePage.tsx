import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from 'react';

import { Button, Card, PageHeader } from '../../../components/ui';
import { GameBackLink } from '../GameBackLink';
import { shouldIgnoreGameKeyboard } from '../game-input';
import {
  GRID_SIZE,
  advanceGame,
  createInitialGame,
  pointKey,
  queueDirection,
  type Direction,
  type EndReason,
  type GameStatus,
} from './snakeLogic';
import styles from './SnakeGamePage.module.css';

export const SNAKE_TICK_MS = 200;

const HIGH_SCORE_STORAGE_KEY = 'zbrs-snake-high-score';

const KEY_DIRECTIONS: Readonly<Record<string, Direction>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  W: 'up',
  s: 'down',
  S: 'down',
  a: 'left',
  A: 'left',
  d: 'right',
  D: 'right',
};

const STATUS_LABELS: Record<GameStatus, string> = {
  idle: '等待开始',
  running: '游戏中',
  paused: '已暂停',
  'game-over': '游戏结束',
  won: '挑战成功',
};

const BOARD_CELLS = Array.from(
  { length: GRID_SIZE * GRID_SIZE },
  (_, index) => ({
    x: index % GRID_SIZE,
    y: Math.floor(index / GRID_SIZE),
  }),
);

function readHighScore(): number {
  if (typeof window === 'undefined') {
    return 0;
  }

  try {
    const value = Number.parseInt(
      window.localStorage.getItem(HIGH_SCORE_STORAGE_KEY) ?? '',
      10,
    );
    return Number.isFinite(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

function persistHighScore(score: number): void {
  try {
    window.localStorage.setItem(HIGH_SCORE_STORAGE_KEY, String(score));
  } catch {
    // Storage can be unavailable in privacy modes; the in-memory record remains.
  }
}

function overlayCopy(
  status: GameStatus,
  endReason: EndReason,
): { title: string; detail: string } | null {
  if (status === 'running') {
    return null;
  }

  if (status === 'idle') {
    return {
      title: '准备出发',
      detail: '点击“开始游戏”，再用方向键或屏幕按钮控制小蛇。',
    };
  }

  if (status === 'paused') {
    return {
      title: '游戏已暂停',
      detail: '点击“继续游戏”或按空格键回到棋盘。',
    };
  }

  if (status === 'won') {
    return {
      title: '棋盘已吃满',
      detail: '太厉害了！重置后可以再次挑战。',
    };
  }

  return {
    title: endReason === 'self' ? '撞到身体了' : '撞到边界了',
    detail: '本局结束，点击“再来一局”继续挑战。',
  };
}

export function SnakeGamePage(): JSX.Element {
  const [game, setGame] = useState(createInitialGame);
  const [highScore, setHighScore] = useState(readHighScore);
  const [autoPaused, setAutoPaused] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);

  const focusBoard = useCallback((): void => {
    boardRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (game.score <= highScore) {
      return;
    }

    setHighScore(game.score);
    persistHighScore(game.score);
  }, [game.score, highScore]);

  useEffect(() => {
    if (game.status !== 'running') {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setGame((current) => advanceGame(current));
    }, SNAKE_TICK_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [game.status]);

  const changeDirection = useCallback((direction: Direction): void => {
    setGame((current) => queueDirection(current, direction));
  }, []);

  const togglePause = useCallback((): void => {
    setAutoPaused(false);
    setGame((current) => {
      if (current.status === 'running') {
        return { ...current, status: 'paused' };
      }
      if (current.status === 'idle' || current.status === 'paused') {
        return { ...current, status: 'running' };
      }
      return current;
    });
  }, []);

  useEffect(() => {
    if (game.status !== 'running') {
      return undefined;
    }

    const pauseForInterruption = (): void => {
      setAutoPaused(true);
      setGame((current) =>
        current.status === 'running'
          ? { ...current, status: 'paused' }
          : current,
      );
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
  }, [game.status]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (shouldIgnoreGameKeyboard(event.target)) {
        return;
      }

      const direction = KEY_DIRECTIONS[event.key];
      if (direction) {
        event.preventDefault();
        changeDirection(direction);
        return;
      }

      if (event.code === 'Space' || event.key === ' ') {
        event.preventDefault();
        togglePause();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [changeDirection, togglePause]);

  const startGame = (): void => {
    setAutoPaused(false);
    setGame((current) => {
      if (current.status === 'game-over' || current.status === 'won') {
        return {
          ...createInitialGame(),
          status: 'running',
        };
      }

      if (current.status === 'idle' || current.status === 'paused') {
        return {
          ...current,
          status: 'running',
          endReason: null,
        };
      }

      return current;
    });
    focusBoard();
  };

  const pauseGame = (): void => {
    setAutoPaused(false);
    setGame((current) =>
      current.status === 'running'
        ? { ...current, status: 'paused' }
        : current,
    );
    focusBoard();
  };

  const resetGame = (): void => {
    setAutoPaused(false);
    setGame(createInitialGame());
  };

  const occupiedCells = useMemo(
    () => new Set(game.snake.map(pointKey)),
    [game.snake],
  );
  const headKey = game.snake[0] ? pointKey(game.snake[0]) : '';
  const foodKey = game.food ? pointKey(game.food) : '';
  const baseOverlay = overlayCopy(game.status, game.endReason);
  const overlay =
    autoPaused && game.status === 'paused'
      ? {
          title: '已为你自动暂停',
          detail: '窗口失去焦点时游戏不会继续计时，准备好后再继续。',
        }
      : baseOverlay;
  const directionControlsDisabled = game.status !== 'running';

  const startButtonLabel =
    game.status === 'paused'
      ? '继续游戏'
      : game.status === 'game-over' || game.status === 'won'
        ? '再来一局'
        : '开始游戏';

  return (
    <section className={styles.page} aria-label="贪食蛇游戏">
      <GameBackLink />
      <PageHeader
        title="贪食蛇"
        subtitle="吃下能量点让身体变长，避开边界和自己的身体。"
        actions={
          <span
            className={`${styles.statusBadge} ${styles[game.status]}`}
            role="status"
            aria-live="polite"
          >
            <span aria-hidden="true" />
            {STATUS_LABELS[game.status]}
          </span>
        }
      />

      <div className={styles.scoreboard} aria-label="本局数据">
        <div>
          <span>当前得分</span>
          <strong data-testid="current-score">{game.score}</strong>
        </div>
        <div>
          <span>最高分</span>
          <strong data-testid="high-score">{highScore}</strong>
        </div>
        <div>
          <span>蛇身长度</span>
          <strong>{game.snake.length}</strong>
        </div>
      </div>

      <div className={styles.layout}>
        <Card
          className={styles.boardCard}
          bodyClassName={styles.boardCardBody}
        >
          <div className={styles.boardShell}>
            <div
              className={styles.board}
              role="img"
              tabIndex={0}
              ref={boardRef}
              aria-label={`20 乘 20 贪食蛇棋盘，当前得分 ${game.score}，${STATUS_LABELS[game.status]}`}
              data-testid="snake-board"
            >
              {BOARD_CELLS.map((cell) => {
                const key = pointKey(cell);
                const isSnake = occupiedCells.has(key);
                const isHead = key === headKey;
                const isFood = key === foodKey;
                const className = [
                  styles.cell,
                  isSnake ? styles.snake : '',
                  isHead ? styles.head : '',
                  isFood ? styles.food : '',
                ]
                  .filter(Boolean)
                  .join(' ');

                return (
                  <span
                    aria-hidden="true"
                    className={className}
                    data-cell={`${cell.x},${cell.y}`}
                    data-testid={
                      isHead ? 'snake-head' : isFood ? 'snake-food' : undefined
                    }
                    key={key}
                  />
                );
              })}
            </div>

            {overlay && (
              <div className={styles.overlay}>
                <strong>{overlay.title}</strong>
                <span>{overlay.detail}</span>
              </div>
            )}
          </div>
        </Card>

        <Card
          className={styles.controlsCard}
          title="游戏控制"
          bodyClassName={styles.controlsBody}
        >
          <div className={styles.actions}>
            <Button
              onClick={startGame}
              disabled={game.status === 'running'}
            >
              {startButtonLabel}
            </Button>
            <Button
              variant="secondary"
              onClick={pauseGame}
              disabled={game.status !== 'running'}
            >
              暂停
            </Button>
            <Button variant="ghost" onClick={resetGame}>
              重置
            </Button>
          </div>

          <div
            className={styles.directionPad}
            role="group"
            aria-label="屏幕方向控制"
          >
            <button
              className={styles.up}
              type="button"
              aria-label="向上移动"
              disabled={directionControlsDisabled}
              onClick={() => {
                changeDirection('up');
                focusBoard();
              }}
            >
              ↑
            </button>
            <button
              className={styles.left}
              type="button"
              aria-label="向左移动"
              disabled={directionControlsDisabled}
              onClick={() => {
                changeDirection('left');
                focusBoard();
              }}
            >
              ←
            </button>
            <span className={styles.padCenter} aria-hidden="true">
              ●
            </span>
            <button
              className={styles.right}
              type="button"
              aria-label="向右移动"
              disabled={directionControlsDisabled}
              onClick={() => {
                changeDirection('right');
                focusBoard();
              }}
            >
              →
            </button>
            <button
              className={styles.down}
              type="button"
              aria-label="向下移动"
              disabled={directionControlsDisabled}
              onClick={() => {
                changeDirection('down');
                focusBoard();
              }}
            >
              ↓
            </button>
          </div>

          <div className={styles.instructions}>
            <h3>操作说明</h3>
            <p>
              键盘使用方向键或 <kbd>W</kbd>
              <kbd>A</kbd>
              <kbd>S</kbd>
              <kbd>D</kbd> 转向。
            </p>
            <p>
              按 <kbd>空格</kbd> 可以开始、暂停或继续游戏。
            </p>
            <p>每个能量点增加 10 分；小蛇不能直接掉头。</p>
          </div>
        </Card>
      </div>
    </section>
  );
}
