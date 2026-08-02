import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from 'react';

import { Button, Card, PageHeader, Tag } from '../../../components/ui';
import { GameBackLink } from '../GameBackLink';
import { shouldIgnoreGameKeyboard } from '../game-input';
import {
  TANK_BOARD_HEIGHT,
  TANK_BOARD_WIDTH,
  createTankGameState,
  firePlayerTank,
  movePlayerTank,
  stepTankGame,
  type TankDirection,
  type TankGameState,
} from './tankLogic';
import styles from './TankBattlePage.module.css';

const TANK_TICK_MS = 220;

const DIRECTION_KEYS: Record<string, TankDirection | undefined> = {
  ArrowUp: 'up',
  w: 'up',
  W: 'up',
  ArrowDown: 'down',
  s: 'down',
  S: 'down',
  ArrowLeft: 'left',
  a: 'left',
  A: 'left',
  ArrowRight: 'right',
  d: 'right',
  D: 'right',
};

function pointKey(x: number, y: number): string {
  return `${x}:${y}`;
}

export function TankBattlePage(): JSX.Element {
  const [game, setGame] = useState<TankGameState>(() =>
    createTankGameState(),
  );
  const [autoPaused, setAutoPaused] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);

  const focusBoard = useCallback((): void => {
    boardRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (game.status !== 'running') return undefined;
    const timer = window.setInterval(() => {
      setGame((current) => stepTankGame(current));
    }, TANK_TICK_MS);
    return () => window.clearInterval(timer);
  }, [game.status]);

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

  const move = useCallback((direction: TankDirection): void => {
    setGame((current) => movePlayerTank(current, direction));
  }, []);

  const fire = useCallback((): void => {
    setGame((current) => firePlayerTank(current));
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (shouldIgnoreGameKeyboard(event.target)) {
        return;
      }

      const direction = DIRECTION_KEYS[event.key];
      if (direction) {
        event.preventDefault();
        move(direction);
        return;
      }
      if (event.code === 'Space') {
        event.preventDefault();
        fire();
      }
      if (event.key.toLowerCase() === 'p') {
        event.preventDefault();
        setAutoPaused(false);
        setGame((current) => ({
          ...current,
          status:
            current.status === 'running'
              ? 'paused'
              : current.status === 'paused'
                ? 'running'
                : current.status,
        }));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fire, move]);

  const cells = useMemo(
    () =>
      Array.from(
        { length: TANK_BOARD_WIDTH * TANK_BOARD_HEIGHT },
        (_, index) => ({
          x: index % TANK_BOARD_WIDTH,
          y: Math.floor(index / TANK_BOARD_WIDTH),
        }),
      ),
    [],
  );
  const wallKeys = useMemo(
    () => new Set(game.walls.map((wall) => pointKey(wall.x, wall.y))),
    [game.walls],
  );

  const restart = (): void => {
    setAutoPaused(false);
    setGame({ ...createTankGameState(), status: 'running' });
    focusBoard();
  };

  const toggle = (): void => {
    setAutoPaused(false);
    setGame((current) => ({
      ...current,
      status:
        current.status === 'idle'
          ? 'running'
          : current.status === 'running'
            ? 'paused'
            : current.status === 'paused'
              ? 'running'
              : current.status,
    }));
    focusBoard();
  };

  return (
    <section aria-label="坦克大战">
      <GameBackLink />
      <PageHeader
        title="坦克大战"
        subtitle="穿过障碍、躲避炮弹，击破三辆敌方坦克。"
      />

      <div className={styles.layout}>
        <Card className={styles.boardCard}>
          <div className={styles.statusBar}>
            <span>
              生命 <strong>{'♥'.repeat(Math.max(0, game.player.lives))}</strong>
            </span>
            <span>
              敌人 <strong>{game.enemies.length}</strong>
            </span>
            <span>
              得分 <strong>{game.score}</strong>
            </span>
          </div>

          <div className={styles.boardWrap}>
            <div
              className={styles.board}
              role="img"
              tabIndex={0}
              ref={boardRef}
              aria-label={`坦克战场，剩余 ${game.enemies.length} 个敌人`}
            >
              {cells.map((cell) => {
                const key = pointKey(cell.x, cell.y);
                const isPlayer =
                  game.player.x === cell.x && game.player.y === cell.y;
                const enemy = game.enemies.find(
                  (item) => item.x === cell.x && item.y === cell.y,
                );
                const bullet = game.bullets.find(
                  (item) => item.x === cell.x && item.y === cell.y,
                );
                return (
                  <span
                    key={key}
                    className={`${styles.cell} ${
                      wallKeys.has(key) ? styles.wall : ''
                    }`}
                    aria-hidden="true"
                  >
                    {isPlayer && (
                      <i
                        className={`${styles.tank} ${styles.player} ${
                          styles[game.player.direction]
                        }`}
                      >
                        ▲
                      </i>
                    )}
                    {enemy && (
                      <i
                        className={`${styles.tank} ${styles.enemy} ${
                          styles[enemy.direction]
                        }`}
                      >
                        ▲
                      </i>
                    )}
                    {bullet && (
                      <b
                        className={
                          bullet.owner === 'player'
                            ? styles.playerBullet
                            : styles.enemyBullet
                        }
                      />
                    )}
                  </span>
                );
              })}
            </div>

            {game.status !== 'running' && (
              <div className={styles.overlay}>
                {game.status === 'idle' && (
                  <>
                    <span aria-hidden="true">▣</span>
                    <strong>战斗准备</strong>
                    <p>方向键或 WASD 移动，空格开火。</p>
                    <Button onClick={toggle}>开始战斗</Button>
                  </>
                )}
                {game.status === 'paused' && (
                  <>
                    <strong>
                      {autoPaused ? '已为你自动暂停' : '战斗已暂停'}
                    </strong>
                    {autoPaused && <p>窗口失去焦点时战斗不会继续。</p>}
                    <Button onClick={toggle}>继续战斗</Button>
                  </>
                )}
                {(game.status === 'won' || game.status === 'lost') && (
                  <>
                    <span aria-hidden="true">
                      {game.status === 'won' ? '★' : '×'}
                    </span>
                    <strong>
                      {game.status === 'won' ? '阵地守住了' : '坦克已损毁'}
                    </strong>
                    <p>本局得分 {game.score}</p>
                    <Button onClick={restart}>重新挑战</Button>
                  </>
                )}
              </div>
            )}
          </div>

          <div className={styles.mobileControls} aria-label="坦克控制">
            <span />
            <button
              type="button"
              aria-label="向上"
              disabled={game.status !== 'running'}
              onClick={() => {
                move('up');
                focusBoard();
              }}
            >
              ↑
            </button>
            <span />
            <button
              type="button"
              aria-label="向左"
              disabled={game.status !== 'running'}
              onClick={() => {
                move('left');
                focusBoard();
              }}
            >
              ←
            </button>
            <button
              type="button"
              aria-label="向下"
              disabled={game.status !== 'running'}
              onClick={() => {
                move('down');
                focusBoard();
              }}
            >
              ↓
            </button>
            <button
              type="button"
              aria-label="向右"
              disabled={game.status !== 'running'}
              onClick={() => {
                move('right');
                focusBoard();
              }}
            >
              →
            </button>
            <button
              type="button"
              className={styles.fireButton}
              aria-label="开火"
              disabled={game.status !== 'running'}
              onClick={() => {
                fire();
                focusBoard();
              }}
            >
              ●
            </button>
          </div>
        </Card>

        <aside className={styles.sidePanel}>
          <Card title="战斗控制">
            <dl className={styles.keyList}>
              <div>
                <dt>移动</dt>
                <dd>方向键 / WASD</dd>
              </div>
              <div>
                <dt>开火</dt>
                <dd>空格键</dd>
              </div>
              <div>
                <dt>暂停</dt>
                <dd>P 键</dd>
              </div>
            </dl>
            <div className={styles.actions}>
              <Button
                variant="secondary"
                disabled={game.status === 'won' || game.status === 'lost'}
                onClick={toggle}
              >
                {game.status === 'running'
                  ? '暂停'
                  : game.status === 'paused'
                    ? '继续'
                    : '开始'}
              </Button>
              <Button variant="ghost" onClick={restart}>
                重新开始
              </Button>
            </div>
          </Card>
          <Card title="任务目标">
            <Tag color="brand">单人守卫战</Tag>
            <p className={styles.ruleText}>
              每辆敌方坦克价值 100 分。砖墙会被炮弹击碎；被敌方炮弹命中会损失
              1 点生命，生命归零则挑战失败。
            </p>
          </Card>
        </aside>
      </div>
    </section>
  );
}
