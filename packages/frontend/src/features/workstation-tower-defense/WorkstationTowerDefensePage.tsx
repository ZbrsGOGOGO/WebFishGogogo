import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';

import { shouldIgnoreGameKeyboard } from '../games/game-input';
import {
  HERO_MAX_LEVEL, TOWER_DEFINITIONS, TOWER_DEFENSE_CORE_HP, TOWER_DEFENSE_HEIGHT,
  TOWER_DEFENSE_PATH, TOWER_DEFENSE_TICK_MS, TOWER_DEFENSE_WAVES, TOWER_DEFENSE_WIDTH,
  TOWER_INVENTORY_CAPACITY, TOWER_PLANT_INCOME_INTERVAL, TOWER_PLANT_MAX_LEVEL,
  TOWER_SHOP_REFRESH_COST, TOWER_SLOTS, WAVE_NAMES,
  buyTowerShopOffer, createTowerDefenseState, deployInventoryTower, heroUpgradeCost,
  mergeDeployedTower, moveTowerDefenseHero, pauseTowerDefense, plantIncomePerPayout,
  plantUpgradeCost, refreshTowerDefenseShop, resumeTowerDefense, sellDeployedTower,
  sellInventoryTower, startNextTowerDefenseWave, startTowerDefense, stepTowerDefense,
  triggerFocusPulse, upgradeTowerDefenseHero, upgradeTowerDefensePlant,
  type TowerDefenseDirection, type TowerDefenseState,
} from './tower-defense-logic';
import { OfficeHeroArt, OfficePlantArt, OfficeTowerArt } from './OfficeTowerArt';
import styles from './WorkstationTowerDefensePage.module.css';

// The old action-tower-defense record remains untouched and is not comparable.
const SETTINGS_STORAGE_KEY = 'momo.workstation-tower-defense.settings.v2';

function createNewRun(): TowerDefenseState {
  return createTowerDefenseState(Math.floor(Math.random() * 0x1_0000_0000));
}

export interface WorkstationTowerDefenseCharacter {
  displayName?: string;
  avatarKey?: string;
  avatarMark?: string;
}
export interface WorkstationTowerDefensePageProps { character?: WorkstationTowerDefenseCharacter }

const DIRECTIONS: Record<string, TowerDefenseDirection | undefined> = {
  ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down',
  ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right',
};

function loadBestScore(): number {
  try {
    const raw = globalThis.localStorage?.getItem(SETTINGS_STORAGE_KEY);
    const value: unknown = raw ? JSON.parse(raw)?.bestScore : 0;
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 10_000_000 ? value : 0;
  } catch { return 0; }
}

function statusLabel(state: TowerDefenseState): string {
  return { idle: '准备阶段', running: '防守中', paused: '已暂停', intermission: '波次间歇', won: '准点下班', lost: '防线失守' }[state.status];
}
type RunAction = (state: TowerDefenseState) => { state: TowerDefenseState; ok: boolean; message: string };

export function WorkstationTowerDefensePage({ character }: WorkstationTowerDefensePageProps = {}): JSX.Element {
  const [game, setGame] = useState<TowerDefenseState>(createNewRun);
  const gameRef = useRef(game);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);
  const [showHeroRange, setShowHeroRange] = useState(false);
  const [announcement, setAnnouncement] = useState('先种绿植，再买三件订书机零件：背包会自动合成可部署的 2 阶塔。');
  const [actionFailed, setActionFailed] = useState(false);
  const [autoPaused, setAutoPaused] = useState(false);
  const [bestScore, setBestScore] = useState(loadBestScore);
  const [mergeFlash, setMergeFlash] = useState(0);
  const boardRef = useRef<HTMLDivElement>(null);
  const previousGame = useRef(game);

  const name = character?.displayName?.trim() || '游客同事';
  const avatarMark = character?.avatarMark?.trim() || '守';
  const editable = ['idle', 'running', 'intermission'].includes(game.status);
  const selectedTower = game.towers.find((tower) => tower.slotIndex === selectedSlot);
  const selectedItem = game.inventory.find((item) => item.id === selectedItemId);
  const cells = useMemo(() => Array.from({ length: TOWER_DEFENSE_WIDTH * TOWER_DEFENSE_HEIGHT }, (_, index) => ({
    x: index % TOWER_DEFENSE_WIDTH, y: Math.floor(index / TOWER_DEFENSE_WIDTH),
  })), []);
  const pathIndexes = useMemo(() => new Map(TOWER_DEFENSE_PATH.map((point, index) => [`${point.x}:${point.y}`, index])), []);
  const slotIndexes = useMemo(() => new Map(TOWER_SLOTS.map((point, index) => [`${point.x}:${point.y}`, index])), []);

  const commit = useCallback((next: TowerDefenseState): void => { gameRef.current = next; setGame(next); }, []);
  const focusBoard = useCallback((): void => { boardRef.current?.focus({ preventScroll: true }); }, []);
  function announce(message: string, failed = false): void { setAnnouncement(message); setActionFailed(failed); }
  function runAction(action: RunAction): boolean {
    const current = gameRef.current;
    const result = action(current);
    if (result.ok) {
      const before = current.inventory.reduce((sum, item) => sum + (item.tier >= 2 ? 1 : 0), 0);
      const after = result.state.inventory.reduce((sum, item) => sum + (item.tier >= 2 ? 1 : 0), 0);
      if (after > before || /合成/.test(result.message)) setMergeFlash((value) => value + 1);
      commit(result.state);
    }
    announce(result.message, !result.ok);
    return result.ok;
  }

  const moveHero = useCallback((direction: TowerDefenseDirection): void => { commit(moveTowerDefenseHero(gameRef.current, direction)); focusBoard(); }, [commit, focusBoard]);
  const activatePulse = useCallback((): void => {
    const current = gameRef.current;
    const next = triggerFocusPulse(current);
    commit(next);
    focusBoard();
    if (next !== current) { setAnnouncement('专注脉冲！守卫正在清理附近的工作洪流。'); setActionFailed(false); }
  }, [commit, focusBoard]);
  const togglePause = useCallback((): void => {
    setAutoPaused(false);
    const current = gameRef.current;
    commit(current.status === 'paused' ? resumeTowerDefense(current) : pauseTowerDefense(current));
    focusBoard();
  }, [commit, focusBoard]);

  useEffect(() => {
    if (game.status !== 'running') return undefined;
    const timer = window.setInterval(() => commit(stepTowerDefense(gameRef.current)), TOWER_DEFENSE_TICK_MS);
    return () => window.clearInterval(timer);
  }, [commit, game.status]);
  useEffect(() => {
    const previous = previousGame.current;
    if (game.coreHp < previous.coreHp) announce(`有工作突破防线！核心剩余 ${game.coreHp} 点耐久。`, true);
    if (game.status !== previous.status) {
      if (game.status === 'intermission') announce(`第 ${game.wave} 波守住了。可以整理背包、合成和部署；间歇期间不产币。`);
      if (game.status === 'won') announce('三波全部守住，今天也要准点下班！');
      if (game.status === 'lost') announce('这次防线失守了。试试更早部署塔，或将守卫移到工作堆积的位置。', true);
    }
    previousGame.current = game;
  }, [game]);
  useEffect(() => { if (selectedItemId && !game.inventory.some((item) => item.id === selectedItemId)) setSelectedItemId(null); }, [game.inventory, selectedItemId]);
  useEffect(() => {
    if (!['won', 'lost'].includes(game.status) || game.score <= bestScore) return;
    setBestScore(game.score);
    try { globalThis.localStorage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ bestScore: game.score })); } catch { /* Local storage is optional. */ }
  }, [bestScore, game.score, game.status]);
  useEffect(() => {
    if (game.status !== 'running') return undefined;
    const pause = () => {
      if (gameRef.current.status !== 'running') return;
      setAutoPaused(true); commit(pauseTowerDefense(gameRef.current));
    };
    const hidden = () => { if (document.hidden) pause(); };
    window.addEventListener('blur', pause); document.addEventListener('visibilitychange', hidden);
    return () => { window.removeEventListener('blur', pause); document.removeEventListener('visibilitychange', hidden); };
  }, [commit, game.status]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreGameKeyboard(event.target)) return;
      const state = gameRef.current;
      const direction = DIRECTIONS[event.key];
      if (direction && ['idle', 'running', 'intermission'].includes(state.status)) { event.preventDefault(); moveHero(direction); }
      else if (event.code === 'Space' && state.status === 'running') { event.preventDefault(); activatePulse(); }
      else if ((event.key.toLowerCase() === 'p' || event.key === 'Escape') && ['running', 'paused', 'intermission'].includes(state.status)) { event.preventDefault(); togglePause(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activatePulse, moveHero, togglePause]);

  function chooseSlot(slot: number): void {
    setSelectedSlot(slot);
    if (selectedItem && runAction((state) => deployInventoryTower(state, selectedItem.id, slot))) setSelectedItemId(null);
    focusBoard();
  }
  function chooseItem(itemId: string): void {
    const item = gameRef.current.inventory.find((entry) => entry.id === itemId);
    if (!item || item.tier < 2) return;
    if (selectedItemId === itemId) { setSelectedItemId(null); announce('已取消部署选择。'); return; }
    setSelectedItemId(itemId); setSelectedSlot(null);
    announce(`已选择 ${TOWER_DEFINITIONS[item.type].name} ${item.tier} 阶，请点击地图上的空塔位部署。`);
    boardRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }
  function start(): void { setAutoPaused(false); commit(startTowerDefense(gameRef.current)); announce('第一波开始！绿植在战斗时产币，守卫会自动攻击附近目标。'); focusBoard(); }
  function nextWave(): void {
    commit(startNextTowerDefenseWave(gameRef.current));
    announce('下一波开始，守好你的工位！');
    focusBoard();
  }
  function restart(): void {
    setAutoPaused(false); setSelectedSlot(null); setSelectedItemId(null); setHoveredSlot(null); commit(createNewRun());
    announce('新一局已准备好。优先买绿植，再凑齐三件同名零件。');
    focusBoard();
  }

  const intervalSeconds = TOWER_PLANT_INCOME_INTERVAL * TOWER_DEFENSE_TICK_MS / 1000;
  const secondsUntilIncome = Math.max(0, Math.ceil((TOWER_PLANT_INCOME_INTERVAL - game.plantIncomeTick) * TOWER_DEFENSE_TICK_MS / 1000));
  const activeEnemies = game.enemies.filter((enemy) => enemy.hp > 0);
  const currentRangeSlot = hoveredSlot ?? selectedSlot;
  const rangeTower = currentRangeSlot == null ? undefined : game.towers.find((tower) => tower.slotIndex === currentRangeSlot);
  const rangeDefinition = selectedItem ? TOWER_DEFINITIONS[selectedItem.type] : rangeTower ? TOWER_DEFINITIONS[rangeTower.type] : undefined;
  const rangeOrigin = showHeroRange ? game.hero : currentRangeSlot == null ? null : TOWER_SLOTS[currentRangeSlot];
  const range = showHeroRange ? game.hero.range : rangeDefinition ? rangeDefinition.range + Math.floor(((selectedItem?.tier ?? rangeTower?.level ?? 2) - 1) / 2) : 0;
  const guidance = game.towers.length > 0 ? '防线就绪 · 战斗中也能购买、合成和布塔'
    : game.inventory.some((item) => item.tier >= 2) ? '③ 选择背包成品，再点击地图空塔位'
      : game.plantLevel > 0 ? '② 买三件同名零件，背包自动合成 2 阶塔' : '① 推荐先买一盆绿植，为本局持续赚金币';

  return <main className={styles.page}>
    <header className={styles.pageHeader}>
      <div><span className={styles.eyebrow}>MOMO COMPANY · DESK DEFENSE</span><h1>工位合成塔防<span>午休作战计划</span></h1><p>种点绿，攒点钱，把办公用品拼成你的下班防线。</p></div>
      <div className={styles.runBadge} data-state={game.status}><i />{statusLabel(game)}<small>3 波短局 · 纯本地</small></div>
    </header>
    <div className={styles.layout}>
      <section className={styles.battlePanel} aria-label="工位塔防战场">
        <div className={styles.statusBar} aria-label="当前战局">
          <div><span>核心耐久</span><strong aria-label="核心耐久">{game.coreHp}<small> / {TOWER_DEFENSE_CORE_HP}</small></strong><i style={{ '--value': `${game.coreHp / TOWER_DEFENSE_CORE_HP * 100}%` } as React.CSSProperties} /></div>
          <div><span>局内金币</span><strong className={styles.gold} aria-label="局内金币">{game.credits}<small> G</small></strong><small>不消耗账号办公币</small></div>
          <div><span>当前波次</span><strong aria-label="当前波次">{game.wave}<small> / {TOWER_DEFENSE_WAVES}</small></strong><small>{WAVE_NAMES[game.wave - 1]}</small></div>
          <div><span>本局得分</span><strong aria-label="本局得分">{game.score}</strong><small>已清理 {game.defeated} 项工作</small></div>
        </div>
        <div className={styles.deskEdge}><span><i /> {name}的办公桌</span><small>{guidance}</small></div>
        <div className={styles.boardWrap}>
          <div className={styles.board} ref={boardRef} tabIndex={0} role="group" aria-label={`工位塔防地图，第 ${game.wave} 波，核心耐久 ${game.coreHp}，${activeEnemies.length} 个目标，角色 ${game.hero.level} 级`}>
            {cells.map(({ x, y }) => {
              const key = `${x}:${y}`; const pathIndex = pathIndexes.get(key); const slotIndex = slotIndexes.get(key);
              const tower = slotIndex == null ? undefined : game.towers.find((entry) => entry.slotIndex === slotIndex);
              const enemies = pathIndex == null ? [] : activeEnemies.filter((enemy) => enemy.pathIndex === pathIndex);
              const isHero = game.hero.x === x && game.hero.y === y; const core = pathIndex === TOWER_DEFENSE_PATH.length - 1;
              const inRange = Boolean(rangeOrigin && range > 0 && Math.abs(rangeOrigin.x - x) + Math.abs(rangeOrigin.y - y) <= range);
              return <span key={key} className={`${styles.cell} ${pathIndex == null ? styles.floor : styles.path} ${core ? styles.core : ''}`} data-in-range={inRange} aria-hidden={slotIndex == null ? true : undefined}>
                {pathIndex === 0 ? <span className={styles.entrance}>IN →</span> : null}
                {core ? <span className={styles.coreDesk}><i /><b>下班</b></span> : null}
                {pathIndex == null && slotIndex == null && !isHero && ((x === 10 && y === 1) || (x === 0 && y === 7)) ? <OfficePlantArt className={styles.deskPlant} /> : null}
                {slotIndex != null ? <button type="button" className={styles.towerSlot} data-selected={selectedSlot === slotIndex} data-empty={!tower} data-placement={Boolean(selectedItem)} data-firing={game.effects.some((effect) => effect.from.x === x && effect.from.y === y && effect.source !== 'hero' && effect.source !== 'pulse')} aria-label={tower ? `塔位 ${slotIndex + 1}，${TOWER_DEFINITIONS[tower.type].name} ${tower.level} 阶` : `空塔位 ${slotIndex + 1}`} aria-pressed={selectedSlot === slotIndex} onClick={() => chooseSlot(slotIndex)} onMouseEnter={() => setHoveredSlot(slotIndex)} onMouseLeave={() => setHoveredSlot(null)}>
                  {tower ? <><OfficeTowerArt kind={tower.type} tier={tower.level} /><small>{tower.level === 3 ? '★★★' : '★★'}</small></> : <><b>＋</b><small>{slotIndex + 1}</small></>}
                </button> : null}
                {enemies.slice(0, 2).map((enemy, index) => <span key={enemy.id} className={`${styles.enemy} ${enemy.boss ? styles.boss : ''}`} data-stack={index} data-hit={game.effects.some((effect) => effect.targetEnemyIds.includes(enemy.id))} title={`${enemy.name} · ${enemy.hp}/${enemy.maxHp}`}><i className={styles.enemyPaper}><b>{enemy.boss ? '会' : '!'}</b></i><small style={{ '--value': `${Math.max(0, enemy.hp) / enemy.maxHp * 100}%` } as React.CSSProperties} /></span>)}
                {enemies.length > 2 ? <b className={styles.enemyCount}>+{enemies.length - 2}</b> : null}
                {isHero ? <span className={styles.hero} data-avatar={character?.avatarKey || 'guest'} data-pulsing={game.hero.lastPulseTick === game.tick} data-direction={game.hero.direction}><OfficeHeroArt mark={avatarMark} /><b>YOU</b></span> : null}
              </span>;
            })}
            <svg className={styles.battleEffects} viewBox={`0 0 ${TOWER_DEFENSE_WIDTH * 64} ${TOWER_DEFENSE_HEIGHT * 64}`} aria-hidden="true" focusable="false">
              {game.effects.map((effect) => <g key={effect.id} data-source={effect.source} className={styles.shot}><path d={`M ${effect.from.x * 64 + 32} ${effect.from.y * 64 + 32} L ${effect.to.x * 64 + 32} ${effect.to.y * 64 + 32}`} /><circle cx={effect.to.x * 64 + 32} cy={effect.to.y * 64 + 32} r={effect.source === 'pulse' ? 35 : 11} /></g>)}
            </svg>
          </div>
          {game.status === 'paused' ? <div className={styles.boardOverlay}><span>Ⅱ</span><h2>{autoPaused ? '已为你自动暂停' : '工位塔防已暂停'}</h2><p>战斗和绿植产币都已暂停，不会偷偷流失进度。</p><button type="button" className={styles.primaryButton} onClick={togglePause}>继续防守</button></div> : null}
          {game.status === 'won' || game.status === 'lost' ? <div className={styles.boardOverlay} data-result={game.status}><span>{game.status === 'won' ? '✦' : '↻'}</span><h2>{game.status === 'won' ? '守住工位，准点下班！' : '工作洪流突破了防线'}</h2><p>得分 {game.score} · 清理 {game.defeated} 项工作</p><button type="button" className={styles.primaryButton} onClick={restart}>再来一局</button></div> : null}
        </div>
        <div className={styles.battleToolbar}>
          {game.status === 'idle' ? <button type="button" className={styles.primaryButton} aria-label="开始工位塔防" onClick={start}>开始第一波 <span>→</span></button> : game.status === 'intermission' ? <button type="button" className={styles.primaryButton} onClick={nextWave}>开始第 {game.wave + 1} 波 <span>→</span></button> : <button type="button" className={styles.secondaryButton} disabled={!['running', 'paused'].includes(game.status)} onClick={togglePause}>{game.status === 'paused' ? '继续防守' : '暂停战斗'}</button>}
          <span>{game.status === 'idle' ? '准备时不产币；建议先合成一座塔' : `场上 ${activeEnemies.length} · 后续 ${game.spawnQueue.length}`}</span><button type="button" className={styles.textButton} onClick={restart}>重新开局</button>
        </div>
        <div className={styles.feedback} data-error={actionFailed} role="status" aria-live="polite" aria-atomic="true"><span>{actionFailed ? '!' : '✦'}</span><p>{announcement}</p></div>
        <section className={styles.heroPanel} aria-label="唯一守卫控制">
          <div className={styles.heroIdentity}><OfficeHeroArt mark={avatarMark} /><div><span>唯一角色 · 自动普攻</span><strong>{name} · 工位守卫</strong><small>Lv.{game.hero.level} · 攻击 {game.hero.attack} · 范围 {game.hero.range}</small></div></div>
          <div className={styles.heroButtons}><button type="button" className={styles.secondaryButton} disabled={!editable || game.hero.level >= HERO_MAX_LEVEL || game.credits < heroUpgradeCost(game.hero.level)} onClick={() => { const current = gameRef.current; const next = upgradeTowerDefenseHero(current); commit(next); announce(next === current ? '金币不足或角色已满级。' : `守卫升到 ${next.hero.level} 级，自动防守更有力了。`, next === current); focusBoard(); }}>{game.hero.level >= HERO_MAX_LEVEL ? '守卫已满级' : `升级守卫 · ${heroUpgradeCost(game.hero.level)} G`}</button><button type="button" className={styles.textButton} aria-pressed={showHeroRange} onClick={() => setShowHeroRange((value) => !value)}>{showHeroRange ? '隐藏守卫射程' : '显示守卫射程'}</button></div>
          <div className={styles.touchControls} aria-label="移动角色"><div className={styles.dpad}>
            <button type="button" className={styles.up} aria-label="向上移动" disabled={!editable} onClick={() => moveHero('up')}>↑</button><button type="button" className={styles.left} aria-label="向左移动" disabled={!editable} onClick={() => moveHero('left')}>←</button><span>移动</span><button type="button" className={styles.right} aria-label="向右移动" disabled={!editable} onClick={() => moveHero('right')}>→</button><button type="button" className={styles.down} aria-label="向下移动" disabled={!editable} onClick={() => moveHero('down')}>↓</button>
          </div><button type="button" className={styles.pulseButton} aria-label="释放专注脉冲" disabled={game.status !== 'running' || game.hero.pulseCooldown > 0} onClick={activatePulse}><span>◎</span><strong>专注脉冲</strong><small>{game.hero.pulseCooldown > 0 ? `${Math.ceil(game.hero.pulseCooldown * TOWER_DEFENSE_TICK_MS / 1000)}s 冷却` : '空格释放'}</small></button></div>
          <p>不用一直操作：守卫会自动处理射程内目标。手动移动和脉冲可解围。方向键 / WASD 移动，P / Esc 暂停。</p>
        </section>
      </section>
      <aside className={styles.workbench} aria-label="合成工作台">
        <section className={styles.plantCard} aria-labelledby="plant-title"><OfficePlantArt /><div><span className={styles.eyebrow}>你的第一份被动收入</span><h2 id="plant-title">办公桌绿植 <small>Lv.{game.plantLevel}</small></h2><p aria-label="绿植产币">{game.plantLevel > 0 ? `每 ${Number(intervalSeconds.toFixed(1))} 秒 +${plantIncomePerPayout(game.plantLevel)} G` : '买一盆绿植，战斗时持续产金币'}</p><small>{game.plantLevel === 0 ? '不占塔位，只影响本局' : game.status === 'running' ? `约 ${secondsUntilIncome} 秒后产币` : '等待战斗开始后产币'}</small></div><button type="button" className={styles.plantButton} aria-label={game.plantLevel === 0 ? '购买办公桌绿植' : '升级办公桌绿植'} disabled={!editable || game.plantLevel >= TOWER_PLANT_MAX_LEVEL || game.credits < plantUpgradeCost(game.plantLevel)} onClick={() => runAction(upgradeTowerDefensePlant)}>{game.plantLevel >= TOWER_PLANT_MAX_LEVEL ? '绿植已满级' : `${game.plantLevel === 0 ? '种下' : '升级'} · ${plantUpgradeCost(game.plantLevel)} G`}</button></section>
        <section className={styles.workCard} aria-labelledby="shop-title">
          <p className={styles.shopBalance} aria-label="商店可用局内金币"><span>本局可用金币</span><strong>{game.credits} <small>G</small></strong><small>仅本局使用</small></p>
          <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>SUPPLY ROOM</span><h2 id="shop-title">零件补给站</h2></div><button type="button" className={styles.refreshButton} aria-label={`刷新零件商店，${TOWER_SHOP_REFRESH_COST} 金币`} disabled={!editable || game.credits < TOWER_SHOP_REFRESH_COST} onClick={() => runAction(refreshTowerDefenseShop)}>↻ 刷新 <b>{TOWER_SHOP_REFRESH_COST} G</b></button></div><p className={styles.sectionHint}>买下后自动补货；同名同阶满 3 件自动合成。</p>
          <div className={styles.shopGrid} aria-label="五格零件商店">{game.shop.map((offer, index) => <button type="button" key={offer.id} className={styles.shopOffer} data-type={offer.type} aria-label={`购买第 ${index + 1} 格${TOWER_DEFINITIONS[offer.type].name}零件，${offer.cost} 金币`} disabled={!editable || game.credits < offer.cost} onClick={() => runAction((state) => buyTowerShopOffer(state, offer.id))}><small>1 阶零件</small><OfficeTowerArt kind={offer.type} tier={1} /><strong>{TOWER_DEFINITIONS[offer.type].name}</strong><span>{offer.cost} <small>G</small></span></button>)}</div>
          <div className={styles.mergeRecipe} aria-label="合成规则"><span>同名 1 阶 ×3</span><b>→</b><strong>2 阶可部署</strong><b>→</b><span>同名 2 阶 ×3<br /><strong>3 阶满级</strong></span></div>
        </section>
        <section className={styles.workCard} aria-labelledby="inventory-title">
          <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>ASSEMBLY BENCH</span><h2 id="inventory-title">合成背包 <small aria-label="背包容量">{game.inventory.length}/{TOWER_INVENTORY_CAPACITY}</small></h2></div><span className={styles.autoMergeBadge} key={mergeFlash}>✦ 自动三合一</span></div>
          {selectedItem ? <p className={styles.placementHint}>已选 {TOWER_DEFINITIONS[selectedItem.type].name} {selectedItem.tier} 阶 · 点击上方空塔位部署<button type="button" onClick={() => setSelectedItemId(null)}>取消</button></p> : <p className={styles.sectionHint}>点击 2 / 3 阶成品，再点地图空塔位。1 阶不能部署。</p>}
          {game.inventory.length ? <div className={styles.inventoryGrid} aria-label="背包物品">{game.inventory.map((item) => <article key={item.id} data-tier={item.tier} data-selected={selectedItemId === item.id}><button type="button" className={styles.inventoryItem} disabled={!editable || item.tier === 1} aria-label={`${item.tier === 1 ? '待合成' : '选择部署'}${TOWER_DEFINITIONS[item.type].name} ${item.tier} 阶`} aria-pressed={selectedItemId === item.id} onClick={() => chooseItem(item.id)}><OfficeTowerArt kind={item.type} tier={item.tier} /><strong>{TOWER_DEFINITIONS[item.type].name}</strong><small>{item.tier === 1 ? '1 阶 · 等待合成' : `${item.tier} 阶 · 点击部署`}</small></button><button type="button" className={styles.sellItem} disabled={!editable} aria-label={`出售背包${TOWER_DEFINITIONS[item.type].name} ${item.tier} 阶`} onClick={() => runAction((state) => sellInventoryTower(state, item.id))}>出售</button></article>)}</div> : <div className={styles.emptyInventory}><span>▧</span><strong>零件会在这里集合</strong><p>先从上方购买三个同名零件，试试第一次合成。</p></div>}
          {selectedTower ? <div className={styles.selectedTower} aria-label="选中的防御塔"><OfficeTowerArt kind={selectedTower.type} tier={selectedTower.level} /><div><strong>塔位 {selectedTower.slotIndex + 1} · {TOWER_DEFINITIONS[selectedTower.type].name}</strong><small>{selectedTower.level} 阶 · {selectedTower.level === 3 ? '已到最高阶' : '背包再备 2 个同名 2 阶可原地升阶'}</small></div><button type="button" className={styles.secondaryButton} disabled={!editable || selectedTower.level >= 3} onClick={() => runAction((state) => mergeDeployedTower(state, selectedTower.slotIndex))}>合成升阶</button><button type="button" className={styles.textButton} disabled={!editable} onClick={() => runAction((state) => sellDeployedTower(state, selectedTower.slotIndex))}>卖出防御塔</button></div> : null}
        </section>
        <details className={styles.guide}><summary>五条防线 · 玩法说明 <span>＋</span></summary><div className={styles.towerGuide}>{Object.values(TOWER_DEFINITIONS).map((tower) => <div key={tower.type}><OfficeTowerArt kind={tower.type} tier={2} /><p><strong>{tower.name}</strong><span>{tower.description}</span></p></div>)}</div><p>只买零件，不直接买塔；三件同名同阶自动合成。已部署的 2 阶塔可以消耗背包内两座同名 2 阶塔原地升至 3 阶。卖出返还部分局内金币。</p><p>准备、暂停和波次间歇不产币。切出窗口会自动暂停。本版是纯本地三波短局，只保存本机最高分；刷新页面将重新开局，没有账号奖励、离线收益或付费抽卡。</p></details>
        <footer className={styles.localRecord}><span>合成版 · 本机最高分</span><strong>{Math.max(bestScore, ['won', 'lost'].includes(game.status) ? game.score : 0)}</strong><small>与旧塔防记录分开保存</small></footer>
      </aside>
    </div>
  </main>;
}

export default WorkstationTowerDefensePage;
