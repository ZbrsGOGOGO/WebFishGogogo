import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from 'react';

import { Button, Card, PageHeader, Tag } from '../../components/ui';
import { shouldIgnoreGameKeyboard } from '../games/game-input';
import {
  HERO_MAX_LEVEL,
  TOWER_DEFINITIONS,
  TOWER_DEFENSE_CORE_HP,
  TOWER_DEFENSE_HEIGHT,
  TOWER_DEFENSE_PATH,
  TOWER_DEFENSE_WAVES,
  TOWER_DEFENSE_WIDTH,
  TOWER_MAX_LEVEL,
  TOWER_SLOTS,
  WAVE_NAMES,
  buildTower,
  createTowerDefenseState,
  heroUpgradeCost,
  moveTowerDefenseHero,
  pauseTowerDefense,
  resumeTowerDefense,
  sellTower,
  startNextTowerDefenseWave,
  startTowerDefense,
  stepTowerDefense,
  towerUpgradeCost,
  triggerFocusPulse,
  upgradeTower,
  upgradeTowerDefenseHero,
  type TowerDefenseDirection,
  type TowerDefenseState,
  type TowerType,
} from './tower-defense-logic';
import styles from './WorkstationTowerDefensePage.module.css';

const GAME_TICK_MS = 280;
const SETTINGS_STORAGE_KEY = 'momo.workstation-tower-defense.settings.v1';

interface LocalSettings {
  bestScore: number;
}

export interface WorkstationTowerDefenseCharacter {
  displayName?: string;
  avatarKey?: string;
  avatarMark?: string;
}

export interface WorkstationTowerDefensePageProps {
  character?: WorkstationTowerDefenseCharacter;
}

const DIRECTION_KEYS: Record<string, TowerDefenseDirection | undefined> = {
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

function loadLocalSettings(): LocalSettings {
  try {
    const raw = globalThis.localStorage?.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { bestScore: 0 };
    const parsed = JSON.parse(raw) as Partial<LocalSettings>;
    if (
      !Number.isInteger(parsed.bestScore) ||
      (parsed.bestScore ?? -1) < 0 ||
      (parsed.bestScore ?? 0) > 10_000_000
    ) throw new Error('invalid tower-defense settings');
    return { bestScore: parsed.bestScore ?? 0 };
  } catch {
    try {
      globalThis.localStorage?.removeItem(SETTINGS_STORAGE_KEY);
    } catch {
      // Storage is optional; the current run remains playable.
    }
    return { bestScore: 0 };
  }
}

function saveLocalSettings(settings: LocalSettings): void {
  try {
    globalThis.localStorage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // A blocked quota must not stop an in-progress local game.
  }
}

function pointKey(x: number, y: number): string {
  return `${x}:${y}`;
}

function statusLabel(state: TowerDefenseState): string {
  if (state.status === 'idle') return '等待开局';
  if (state.status === 'paused') return '已暂停';
  if (state.status === 'intermission') return '波次间歇';
  if (state.status === 'won') return '守卫成功';
  if (state.status === 'lost') return '核心失守';
  return '防守中';
}

function enemyCountLabel(count: number): string {
  return `${count} 个目标`;
}

export function WorkstationTowerDefensePage({
  character,
}: WorkstationTowerDefensePageProps = {}): JSX.Element {
  const [game, setGame] = useState<TowerDefenseState>(createTowerDefenseState);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState('准备好后开始第一波。');
  const [autoPaused, setAutoPaused] = useState(false);
  const [settings, setSettings] = useState<LocalSettings>(loadLocalSettings);
  const boardRef = useRef<HTMLDivElement>(null);
  const previousGameRef = useRef(game);

  const displayName = character?.displayName?.trim() || '游客同事';
  const avatarMark = character?.avatarMark?.trim() || '守';
  const avatarKey = character?.avatarKey?.trim() || 'guest';

  const cells = useMemo(
    () => Array.from(
      { length: TOWER_DEFENSE_WIDTH * TOWER_DEFENSE_HEIGHT },
      (_, index) => ({
        x: index % TOWER_DEFENSE_WIDTH,
        y: Math.floor(index / TOWER_DEFENSE_WIDTH),
      }),
    ),
    [],
  );
  const pathIndexes = useMemo(
    () => new Map(TOWER_DEFENSE_PATH.map((point, index) => [pointKey(point.x, point.y), index])),
    [],
  );
  const slotIndexes = useMemo(
    () => new Map(TOWER_SLOTS.map((point, index) => [pointKey(point.x, point.y), index])),
    [],
  );
  const selectedTower = selectedSlot == null
    ? undefined
    : game.towers.find((tower) => tower.slotIndex === selectedSlot);

  const focusBoard = useCallback(() => {
    boardRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (game.status !== 'running') return undefined;
    const timer = window.setInterval(() => {
      setGame((current) => stepTowerDefense(current));
    }, GAME_TICK_MS);
    return () => window.clearInterval(timer);
  }, [game.status]);

  useEffect(() => {
    const previous = previousGameRef.current;
    if (game.coreHp < previous.coreHp) {
      setAnnouncement(`核心工位受到冲击，剩余 ${game.coreHp} 点耐久。`);
    }
    if (game.status !== previous.status) {
      if (game.status === 'intermission') setAnnouncement(`第 ${game.wave} 波已守住，可以布置后续防线。`);
      if (game.status === 'won') setAnnouncement('三波工位攻势全部化解，守卫成功。');
      if (game.status === 'lost') setAnnouncement('核心工位失守，可以重新挑战。');
    }
    previousGameRef.current = game;
  }, [game]);

  useEffect(() => {
    if (game.status !== 'won' && game.status !== 'lost') return;
    if (game.score <= settings.bestScore) return;
    const next = { bestScore: game.score };
    setSettings(next);
    saveLocalSettings(next);
  }, [game.score, game.status, settings.bestScore]);

  useEffect(() => {
    if (game.status !== 'running') return undefined;
    const pauseForInterruption = () => {
      setAutoPaused(true);
      setGame((current) => pauseTowerDefense(current));
    };
    const handleVisibilityChange = () => {
      if (document.hidden) pauseForInterruption();
    };
    window.addEventListener('blur', pauseForInterruption);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('blur', pauseForInterruption);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [game.status]);

  const moveHero = useCallback((direction: TowerDefenseDirection) => {
    setGame((current) => moveTowerDefenseHero(current, direction));
  }, []);

  const activatePulse = useCallback(() => {
    setGame((current) => {
      const next = triggerFocusPulse(current);
      if (next !== current) setAnnouncement('工位守卫释放了专注脉冲。');
      return next;
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreGameKeyboard(event.target)) return;
      const direction = DIRECTION_KEYS[event.key];
      if (direction && ['idle', 'running', 'intermission'].includes(game.status)) {
        event.preventDefault();
        moveHero(direction);
        return;
      }
      if (event.code === 'Space' && game.status === 'running') {
        event.preventDefault();
        activatePulse();
        return;
      }
      if (
        (event.key.toLowerCase() === 'p' || event.key === 'Escape') &&
        ['running', 'paused', 'intermission'].includes(game.status)
      ) {
        event.preventDefault();
        setAutoPaused(false);
        setGame((current) => current.status === 'paused'
          ? resumeTowerDefense(current)
          : pauseTowerDefense(current));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activatePulse, game.status, moveHero]);

  const start = () => {
    setAutoPaused(false);
    setGame((current) => startTowerDefense(current));
    setAnnouncement('第 1 波“零散待办”开始。');
    focusBoard();
  };

  const restart = () => {
    setAutoPaused(false);
    setSelectedSlot(null);
    setGame(createTowerDefenseState());
    setAnnouncement('新的防线已重置，请先布置办公用品塔。');
    focusBoard();
  };

  const togglePause = () => {
    setAutoPaused(false);
    setGame((current) => current.status === 'paused'
      ? resumeTowerDefense(current)
      : pauseTowerDefense(current));
    focusBoard();
  };

  const nextWave = () => {
    setGame((current) => {
      const next = startNextTowerDefenseWave(current);
      if (next !== current) setAnnouncement(`第 ${next.wave} 波“${WAVE_NAMES[next.wave - 1]}”开始。`);
      return next;
    });
    focusBoard();
  };

  const build = (type: TowerType) => {
    if (selectedSlot == null) return;
    setGame((current) => {
      const next = buildTower(current, selectedSlot, type);
      setAnnouncement(next === current
        ? '资源不足，或工位守卫正站在该塔位。'
        : `${TOWER_DEFINITIONS[type].name}已安装。`);
      return next;
    });
    focusBoard();
  };

  const improveTower = () => {
    if (selectedSlot == null) return;
    setGame((current) => {
      const next = upgradeTower(current, selectedSlot);
      setAnnouncement(next === current ? '当前无法升级这座塔。' : '办公用品塔已升级。');
      return next;
    });
    focusBoard();
  };

  const removeTower = () => {
    if (selectedSlot == null) return;
    setGame((current) => {
      const next = sellTower(current, selectedSlot);
      if (next !== current) setAnnouncement('已卖出该塔，返还 60% 投入资源。');
      return next;
    });
    focusBoard();
  };

  const improveHero = () => {
    setGame((current) => {
      const next = upgradeTowerDefenseHero(current);
      setAnnouncement(next === current ? '角色已满级或当前资源不足。' : `工位守卫升到 ${next.hero.level} 级。`);
      return next;
    });
    focusBoard();
  };

  const activeEnemyCount = game.enemies.filter((enemy) => enemy.hp > 0).length;
  const waitingEnemyCount = game.spawnQueue.length;
  const boardLabel = `工位塔防地图，第 ${game.wave} 波，核心耐久 ${game.coreHp}，${enemyCountLabel(activeEnemyCount)}，角色 ${game.hero.level} 级`;

  return (
    <main className={styles.page}>
      <PageHeader
        title="摸鱼升职记"
        subtitle="工位塔防 · 移动你的唯一守卫，布置办公用品塔，挡住三波工作洪流。"
        actions={<Tag color={game.status === 'running' ? 'success' : 'neutral'}>{statusLabel(game)}</Tag>}
      />

      <p className={styles.srStatus} role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>

      <section className={styles.layout} aria-label="工位塔防游戏">
        <Card className={styles.boardCard}>
          <div className={styles.statusBar} aria-label="当前战局">
            <span>核心 <strong>{game.coreHp}/{TOWER_DEFENSE_CORE_HP}</strong></span>
            <span>波次 <strong>{game.wave}/{TOWER_DEFENSE_WAVES}</strong></span>
            <span>资源 <strong>{game.credits}</strong></span>
            <span>得分 <strong>{game.score}</strong></span>
          </div>

          <div className={styles.boardWrap}>
            <div
              className={styles.board}
              ref={boardRef}
              role="group"
              tabIndex={0}
              aria-label={boardLabel}
            >
              {cells.map((cell) => {
                const key = pointKey(cell.x, cell.y);
                const pathIndex = pathIndexes.get(key);
                const slotIndex = slotIndexes.get(key);
                const tower = slotIndex == null
                  ? undefined
                  : game.towers.find((entry) => entry.slotIndex === slotIndex);
                const enemies = pathIndex == null
                  ? []
                  : game.enemies.filter((enemy) => enemy.pathIndex === pathIndex && enemy.hp > 0);
                const heroHere = game.hero.x === cell.x && game.hero.y === cell.y;
                const isCore = pathIndex === TOWER_DEFENSE_PATH.length - 1;
                const isEntrance = pathIndex === 0;
                return (
                  <span
                    className={`${styles.cell} ${pathIndex == null ? styles.floor : styles.path} ${isCore ? styles.core : ''}`}
                    key={key}
                    aria-hidden={slotIndex == null ? 'true' : undefined}
                  >
                    {isEntrance ? <i className={styles.entrance} aria-hidden="true">IN</i> : null}
                    {isCore ? <i className={styles.coreMark} aria-hidden="true">核</i> : null}
                    {slotIndex != null ? (
                      <button
                        type="button"
                        className={`${styles.towerSlot} ${tower ? styles.hasTower : ''}`}
                        data-selected={selectedSlot === slotIndex}
                        aria-label={tower
                          ? `塔位 ${slotIndex + 1}，${TOWER_DEFINITIONS[tower.type].name} ${tower.level} 级`
                          : `空塔位 ${slotIndex + 1}`}
                        aria-pressed={selectedSlot === slotIndex}
                        onClick={() => setSelectedSlot(slotIndex)}
                      >
                        {tower ? (
                          <><b>{TOWER_DEFINITIONS[tower.type].mark}</b><small>Lv.{tower.level}</small></>
                        ) : <b>+</b>}
                      </button>
                    ) : null}
                    {enemies.slice(0, 2).map((enemy, index) => (
                      <i
                        key={enemy.id}
                        className={`${styles.enemy} ${enemy.boss ? styles.boss : ''}`}
                        data-stack={index}
                        aria-hidden="true"
                        title={enemy.name}
                      >
                        {enemy.boss ? '会' : '待'}
                        <span style={{ '--hp': `${Math.max(0, enemy.hp) / enemy.maxHp * 100}%` } as React.CSSProperties} />
                      </i>
                    ))}
                    {enemies.length > 2 ? <b className={styles.enemyCount} aria-hidden="true">+{enemies.length - 2}</b> : null}
                    {heroHere ? (
                      <i
                        className={`${styles.hero} ${styles[game.hero.direction]}`}
                        data-avatar={avatarKey}
                        data-pulsing={game.hero.lastPulseTick === game.tick}
                        aria-hidden="true"
                      >
                        <b>{avatarMark}</b>
                      </i>
                    ) : null}
                  </span>
                );
              })}
            </div>

            {['paused', 'won', 'lost'].includes(game.status) ? (
              <div className={styles.overlay}>
                {game.status === 'paused' ? (
                  <>
                    <strong>{autoPaused ? '已为你自动暂停' : '工位塔防已暂停'}</strong>
                    <p>{autoPaused ? '窗口失去焦点时，敌人不会继续前进。' : '可以看清防线后再继续。'}</p>
                    <Button onClick={togglePause}>继续防守</Button>
                  </>
                ) : null}
                {game.status === 'won' || game.status === 'lost' ? (
                  <>
                    <span aria-hidden="true">{game.status === 'won' ? '★' : '×'}</span>
                    <strong>{game.status === 'won' ? '核心工位守住了' : '工作洪流冲进了核心'}</strong>
                    <p>本局 {game.score} 分，化解 {game.defeated} 个目标 · 本机最高分 {Math.max(settings.bestScore, game.score)}</p>
                    <Button onClick={restart}>重新挑战</Button>
                  </>
                ) : null}
              </div>
            ) : null}
            {game.status === 'idle' ? (
              <div className={styles.prepareBar} role="status">
                <div><strong>工位防线准备中</strong><small>先点击“+”塔位安装办公用品塔，再明确开波</small></div>
                <Button onClick={start}>开始工位塔防</Button>
              </div>
            ) : null}
            {game.status === 'intermission' ? (
              <div className={styles.intermissionBar} role="status">
                <div><strong>第 {game.wave} 波已守住</strong><small>可移动角色、建造和升级防御塔</small></div>
                <Button onClick={nextWave}>开始第 {game.wave + 1} 波</Button>
              </div>
            ) : null}
          </div>

          <div className={styles.mobileControls} aria-label="工位守卫控制">
            <span />
            <button type="button" aria-label="向上移动" disabled={!['idle', 'running', 'intermission'].includes(game.status)} onClick={() => { moveHero('up'); focusBoard(); }}>↑</button>
            <span />
            <button type="button" aria-label="向左移动" disabled={!['idle', 'running', 'intermission'].includes(game.status)} onClick={() => { moveHero('left'); focusBoard(); }}>←</button>
            <button type="button" aria-label="向下移动" disabled={!['idle', 'running', 'intermission'].includes(game.status)} onClick={() => { moveHero('down'); focusBoard(); }}>↓</button>
            <button type="button" aria-label="向右移动" disabled={!['idle', 'running', 'intermission'].includes(game.status)} onClick={() => { moveHero('right'); focusBoard(); }}>→</button>
            <button
              type="button"
              className={styles.pulseButton}
              aria-label="释放专注脉冲"
              disabled={game.status !== 'running' || game.hero.pulseCooldown > 0}
              onClick={() => { activatePulse(); focusBoard(); }}
            >
              <b>脉冲</b>
              <small>{game.hero.pulseCooldown > 0 ? `${Math.ceil(game.hero.pulseCooldown * GAME_TICK_MS / 1000)}s` : '空格'}</small>
            </button>
          </div>
        </Card>

        <aside className={styles.sidePanel}>
          <Card title="唯一角色" headerActions={<Tag color="brand">Lv.{game.hero.level}</Tag>}>
            <div className={styles.heroProfile}>
              <span data-avatar={avatarKey}>{avatarMark}</span>
              <div><strong>{displayName} · 工位守卫</strong><p>自动攻击范围内最靠前的目标。</p></div>
            </div>
            <dl className={styles.heroStats}>
              <div><dt>执行力</dt><dd>{game.hero.attack}</dd></div>
              <div><dt>范围</dt><dd>{game.hero.range}</dd></div>
              <div><dt>脉冲</dt><dd>{game.hero.pulseCooldown > 0 ? '冷却中' : '已就绪'}</dd></div>
            </dl>
            <Button
              variant="secondary"
              disabled={game.hero.level >= HERO_MAX_LEVEL || game.credits < heroUpgradeCost(game.hero.level) || !['idle', 'running', 'intermission'].includes(game.status)}
              onClick={improveHero}
            >
              {game.hero.level >= HERO_MAX_LEVEL ? '角色已满级' : `升级角色 · ${heroUpgradeCost(game.hero.level)} 资源`}
            </Button>
          </Card>

          <Card title="塔位工具箱" headerActions={selectedSlot == null ? undefined : <Tag>塔位 {selectedSlot + 1}</Tag>}>
            {selectedSlot == null ? (
              <p className={styles.hint}>点击地图中的“+”塔位，然后选择一种办公用品塔。</p>
            ) : selectedTower ? (
              <div className={styles.towerActions}>
                <div className={styles.selectedTower}>
                  <span>{TOWER_DEFINITIONS[selectedTower.type].mark}</span>
                  <div><strong>{TOWER_DEFINITIONS[selectedTower.type].name}</strong><small>Lv.{selectedTower.level} · 已投入 {selectedTower.invested}</small></div>
                </div>
                <Button
                  variant="secondary"
                  disabled={selectedTower.level >= TOWER_MAX_LEVEL || game.credits < towerUpgradeCost(selectedTower) || !['idle', 'running', 'intermission'].includes(game.status)}
                  onClick={improveTower}
                >
                  {selectedTower.level >= TOWER_MAX_LEVEL ? '已满级' : `升级 · ${towerUpgradeCost(selectedTower)} 资源`}
                </Button>
                <Button variant="ghost" disabled={!['idle', 'running', 'intermission'].includes(game.status)} onClick={removeTower}>
                  卖出 · 返还 {Math.floor(selectedTower.invested * 0.6)}
                </Button>
              </div>
            ) : (
              <div className={styles.buildList}>
                {(Object.keys(TOWER_DEFINITIONS) as TowerType[]).map((type) => {
                  const tower = TOWER_DEFINITIONS[type];
                  return (
                    <button type="button" key={type} disabled={game.credits < tower.cost || !['idle', 'running', 'intermission'].includes(game.status)} onClick={() => build(type)}>
                      <span>{tower.mark}</span>
                      <div><strong>{tower.name}</strong><small>{tower.description}</small></div>
                      <b>{tower.cost}</b>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          <Card title="防守说明">
            <dl className={styles.keyList}>
              <div><dt>移动角色</dt><dd>方向键 / WASD</dd></div>
              <div><dt>专注脉冲</dt><dd>空格键</dd></div>
              <div><dt>暂停 / 继续</dt><dd>P / Esc</dd></div>
              <div><dt>本机最高分</dt><dd>{Math.max(settings.bestScore, game.score)}</dd></div>
            </dl>
            <p className={styles.ruleText}>
              本版是纯本地三波短局；只保存本机最高分，不上传进度、不提供正式奖励。
            </p>
            <div className={styles.gameActions}>
              <Button
                variant="secondary"
                disabled={!['running', 'paused', 'intermission'].includes(game.status)}
                onClick={togglePause}
              >
                {game.status === 'paused' ? '继续' : '暂停'}
              </Button>
              <Button variant="ghost" onClick={restart}>重新开局</Button>
            </div>
            <small className={styles.waveHint}>
              当前波次：{WAVE_NAMES[game.wave - 1]} · 场上 {activeEnemyCount} · 待进入 {waitingEnemyCount}
            </small>
          </Card>
        </aside>
      </section>
    </main>
  );
}

export default WorkstationTowerDefensePage;
