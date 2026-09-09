import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';

import { listenForOtherLocalGame, shouldIgnoreGameKeyboard } from '../games/game-input';
import {
  HERO_MAX_LEVEL, TOWER_DEFINITIONS, TOWER_EVOLUTIONS, TOWER_DEFENSE_CORE_HP, TOWER_DEFENSE_HEIGHT,
  TOWER_DEFENSE_PATH, TOWER_DEFENSE_TICK_MS, TOWER_DEFENSE_WAVES, TOWER_DEFENSE_WIDTH,
  TOWER_INVENTORY_CAPACITY, TOWER_PLANT_INCOME_INTERVAL, TOWER_PLANT_MAX_LEVEL,
  TOWER_INTERMISSION_CREDIT_BONUS, TOWER_SHOP_REFRESH_COST, TOWER_SLOTS,
  TOWER_SWARM_SINGLE_TARGET_DAMAGE_CAP, WAVE_NAMES,
  buyTowerShopOffer, createTowerDefenseState, deployInventoryTower, heroUpgradeCost,
  focusedTowerPartCost, getTowerRoundSummary,
  mergeDeployedTower, moveTowerDefenseHero, pauseTowerDefense, plantIncomePerPayout,
  plantUpgradeCost, refreshTowerDefenseShop, resumeTowerDefense, sellDeployedTower,
  sellInventoryTower, setTowerShopFocus, startNextTowerDefenseWave, startTowerDefense, stepTowerDefense,
  triggerFocusPulse, upgradeTowerDefenseHero, upgradeTowerDefensePlant,
  type TowerDefenseDirection, type TowerDefenseState, type TowerEnemyArchetype, type TowerType,
} from './tower-defense-logic';
import { OfficeHeroArt, OfficePlantArt, OfficeTowerArt } from './OfficeTowerArt';
import styles from './WorkstationTowerDefensePage.module.css';

// Restock/evolution challenge scores are not comparable with V1–V3. Keep all untouched.
const SETTINGS_STORAGE_KEY = 'momo.workstation-tower-defense.settings.v4';

export const TOWER_TAUNTS = {
  entrance: '就你也想下班？守住你的工位吧',
  breach: '就这点实力，当一辈子牛马吧',
  defeat: '年轻人，还得练啊，这个月的工资归公司了',
} as const;
const BREACH_NOTICE_MS = 3_600;
const TECHNIQUE_LABEL = { pierce: '破甲', freeze: '冰冻', root: '定身', stun: '眩晕', taunt: '聚怪', 'true-damage': '真伤', execute: '吞噬', vulnerable: '易伤' } as const;

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
const ENEMY_BRIEF: Record<TowerEnemyArchetype, { mark: string; name: string; counter: string }> = {
  basic: { mark: '待', name: '零散待办', counter: '先布好主力塔，留时间经营' },
  fast: { mark: '快', name: '快速催办', counter: '咖啡机减速，守卫拦漏怪' },
  swarm: { mark: '群', name: '密集群怪', counter: `成团：单体每次最多 ${TOWER_SWARM_SINGLE_TARGET_DAMAGE_CAP} 伤害，范围处理有效` },
  elite: { mark: '精', name: '护甲精英', counter: '订书机破甲，打印机穿甲/真伤，碎纸机易伤' },
  midboss: { mark: '会', name: '小 Boss', counter: '抵抗聚怪和吞噬；短控有抗性，破甲后集中输出' },
};

function loadBestScore(): number {
  try {
    const raw = globalThis.localStorage?.getItem(SETTINGS_STORAGE_KEY);
    const value: unknown = raw ? JSON.parse(raw)?.bestScore : 0;
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 10_000_000 ? value : 0;
  } catch { return 0; }
}

function statusLabel(state: TowerDefenseState): string {
  return { idle: '准备阶段', running: state.wave === 1 ? '轻压经营' : '突袭防守', paused: '已暂停', intermission: '回合间歇', won: '准点下班', lost: '防线失守' }[state.status];
}
function recoveryAdvice(state: TowerDefenseState): string {
  if (state.plantLevel === 0) return '下局先种绿植，再买初始三件订书机；第一回合边防守边攒金币，别把预算都花在刷新上。';
  if (state.towers.length < 2) return '下局在第一回合补出第二座塔；定向订货可凑齐三件，打印机清群怪，咖啡机减速快敌。';
  if (!state.towers.some((tower) => tower.type === 'slow' || tower.type === 'push')) return '下局给出口附近补咖啡机或转椅，延长处理快敌的时间；让守卫补漏，群怪靠近时释放脉冲。';
  if (!state.towers.some((tower) => tower.type === 'splash')) return '下局补一座打印机处理密集群怪；间歇检查塔的射程，把脉冲留给敌人扎堆的时候。';
  return '下局把主力塔升到 3 阶，留金币用定向订货补齐零件；小 Boss 有护甲，用碎纸机易伤配合主力塔，守卫和脉冲清理漏怪。';
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
  const [covered, setCovered] = useState(false);
  const [breachNotice, setBreachNotice] = useState<{ serial: number; count: number } | null>(null);
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
    const newBreaches = game.breached - previous.breached;
    if (newBreaches > 0 && game.status !== 'lost') {
      setBreachNotice((notice) => ({ serial: game.breached, count: (notice?.count ?? 0) + newBreaches }));
      announce(`有工作突破防线！核心剩余 ${game.coreHp} 点耐久。`, true);
    }
    // Final defeat replaces a breach notice. Pausing/covering must not expose
    // a taunt or replay an old event when the player returns to work.
    if (game.status !== 'running') setBreachNotice(null);
    if (game.status !== previous.status) {
      if (game.status === 'intermission') announce(`第一回合守住了！经营回合奖励 ${TOWER_INTERMISSION_CREDIT_BONUS} 金币已到账。第二回合有快敌、群怪、精英与小 Boss；先整理阵容，准备好再开始。间歇不产币。`);
      if (game.status === 'won') announce('两个回合全部守住，今天也要准点下班！');
      if (game.status === 'lost') announce(`防线失守。${recoveryAdvice(game)}`, true);
    }
    previousGame.current = game;
  }, [game]);
  useEffect(() => {
    if (!breachNotice) return undefined;
    const timer = window.setTimeout(() => setBreachNotice(null), BREACH_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [breachNotice]);
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
    const stopListening = listenForOtherLocalGame('tower-defense', pause);
    window.addEventListener('blur', pause); document.addEventListener('visibilitychange', hidden);
    return () => { stopListening(); window.removeEventListener('blur', pause); document.removeEventListener('visibilitychange', hidden); };
  }, [commit, game.status]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (covered) return;
      if (shouldIgnoreGameKeyboard(event.target)) return;
      const state = gameRef.current;
      const direction = DIRECTIONS[event.key];
      if (direction && ['idle', 'running', 'intermission'].includes(state.status)) { event.preventDefault(); moveHero(direction); }
      else if (event.code === 'Space' && state.status === 'running') { event.preventDefault(); activatePulse(); }
      else if ((event.key.toLowerCase() === 'p' || event.key === 'Escape') && ['running', 'paused', 'intermission'].includes(state.status)) { event.preventDefault(); togglePause(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activatePulse, covered, moveHero, togglePause]);

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
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    boardRef.current?.scrollIntoView?.({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  }
  function start(): void { setAutoPaused(false); commit(startTowerDefense(gameRef.current)); announce('第一回合开始：低压经营。绿植在战斗时产币，趁零散待办到来补齐零件、合成布阵。'); focusBoard(); }
  function nextWave(): void {
    commit(startNextTowerDefenseWave(gameRef.current));
    announce('第二回合突袭！快敌、群怪与精英混合进攻，中段小 Boss 登场。用群攻和减速配合守卫补漏。');
    focusBoard();
  }
  function restart(): void {
    setAutoPaused(false); setBreachNotice(null); setSelectedSlot(null); setSelectedItemId(null); setHoveredSlot(null); commit(createNewRun());
    announce('新一局已准备好。优先买绿植，再凑齐三件同名零件。');
    focusBoard();
  }

  const intervalSeconds = TOWER_PLANT_INCOME_INTERVAL * TOWER_DEFENSE_TICK_MS / 1000;
  const secondsUntilIncome = Math.max(0, Math.ceil((TOWER_PLANT_INCOME_INTERVAL - game.plantIncomeTick) * TOWER_DEFENSE_TICK_MS / 1000));
  const activeEnemies = game.enemies.filter((enemy) => enemy.hp > 0);
  const activeBoss = activeEnemies.find((enemy) => enemy.boss);
  const preparingFinalRound = game.status === 'intermission' || (game.status === 'paused' && game.resumeStatus === 'intermission');
  const roundSummary = getTowerRoundSummary(preparingFinalRound ? 2 : game.wave);
  const currentRangeSlot = hoveredSlot ?? selectedSlot;
  const rangeTower = currentRangeSlot == null ? undefined : game.towers.find((tower) => tower.slotIndex === currentRangeSlot);
  const rangeDefinition = selectedItem ? TOWER_DEFINITIONS[selectedItem.type] : rangeTower ? TOWER_DEFINITIONS[rangeTower.type] : undefined;
  const rangeOrigin = showHeroRange ? game.hero : currentRangeSlot == null ? null : TOWER_SLOTS[currentRangeSlot];
  const range = showHeroRange ? game.hero.range : rangeDefinition ? rangeDefinition.range + Math.floor(((selectedItem?.tier ?? rangeTower?.level ?? 2) - 1) / 2) : 0;
  const guidance = game.towers.length > 0 ? '防线就绪 · 战斗中也能购买、合成和布塔'
    : game.inventory.some((item) => item.tier >= 2) ? '③ 选择背包成品，再点击地图空塔位'
      : game.plantLevel > 0 ? '② 买三件同名零件，背包自动合成 2 阶塔' : '① 推荐先买一盆绿植，为本局持续赚金币';

  if (covered) return <main className={`${styles.page} ${styles.workCover}`} aria-label="工作备忘">
    <span className={styles.eyebrow}>WORK NOTES</span><h1>工作备忘</h1>
    <p>本周事项整理</p><ul><li>核对待办安排</li><li>更新资料清单</li><li>整理后续计划</li></ul>
    <button type="button" className={styles.secondaryButton} onClick={() => setCovered(false)}>返回工作台</button>
  </main>;

  return <main className={styles.page}>
    <header className={styles.pageHeader}>
      <div><span className={styles.eyebrow}>MOMO COMPANY · DESK DEFENSE</span><h1>工位合成塔防<span>两回合挑战</span></h1><p>第一回合从容经营，第二回合迎接工作洪流。</p></div>
      <div className={styles.runBadge} data-state={game.status}><i />{statusLabel(game)}<small>2 回合短局 · 纯本地</small></div>
    </header>
    <div className={styles.discretionBar}><span>全程静音 · 仅局内金币</span><button type="button" className={styles.textButton} onClick={() => {
      setBreachNotice(null); commit(pauseTowerDefense(gameRef.current)); setCovered(true);
    }}>收起为工作备忘</button></div>
    {game.status === 'idle' ? <section className={styles.challengeIntro} aria-labelledby="tower-challenge-title">
      <span>下班资格挑战 · 售罄经营版</span><h2 id="tower-challenge-title">{TOWER_TAUNTS.entrance}</h2>
      <p>先经营，再硬仗。零件买完留空，刷新才补货。准备好了吗？</p>
    </section> : null}
    <div className={styles.layout}>
      <section className={styles.battlePanel} aria-label="工位塔防战场">
        <div className={styles.statusBar} aria-label="当前战局">
          <div><span>核心耐久</span><strong aria-label="核心耐久">{game.coreHp}<small> / {TOWER_DEFENSE_CORE_HP}</small></strong><i style={{ '--value': `${game.coreHp / TOWER_DEFENSE_CORE_HP * 100}%` } as React.CSSProperties} /></div>
          <div><span>局内金币</span><strong className={styles.gold} aria-label="局内金币">{game.credits}<small> G</small></strong><small>不消耗账号办公币</small></div>
          <div><span>当前回合</span><strong aria-label="当前回合">{game.wave}<small> / {TOWER_DEFENSE_WAVES}</small></strong><small>{WAVE_NAMES[game.wave - 1]}</small></div>
          <div><span>本局得分</span><strong aria-label="本局得分">{game.score}</strong><small>已清理 {game.defeated} 项工作</small></div>
        </div>
        <ol className={styles.roundProgress} aria-label="两回合进度">
          <li data-complete={game.wave > 1 || preparingFinalRound || game.status === 'won'} aria-current={game.wave === 1 && !preparingFinalRound ? 'step' : undefined}><b>01</b><span><strong>经营回合</strong><small>种绿植 · 凑零件 · 布阵</small></span><i>{game.wave > 1 || preparingFinalRound || game.status === 'won' ? '已守住' : '低压'}</i></li>
          <li data-danger="true" data-complete={game.status === 'won'} aria-current={game.wave === 2 || preparingFinalRound ? 'step' : undefined}><b>02</b><span><strong>突袭回合</strong><small>快敌 + 群怪 + 精英 + Boss</small></span><i>{game.status === 'won' ? '已守住' : preparingFinalRound ? '待迎战' : game.wave === 2 ? '高压' : '待解锁'}</i></li>
        </ol>
        {preparingFinalRound ? <section className={styles.roundWarning} aria-labelledby="round-warning-title"><span aria-hidden="true">!</span><div><h2 id="round-warning-title">第二回合突袭预警</h2><p>经营回合奖励 {TOWER_INTERMISSION_CREDIT_BONUS} 金币已到账；间歇不持续产币。先整理阵容，再主动迎战。打印机清理群怪，咖啡机拖慢快敌；用定向订货补齐零件，守卫留在漏怪附近。</p>{roundSummary ? <small>相比第一回合：工作数量 ×{roundSummary.countMultiplier} · 总生命 ×{roundSummary.totalHpMultiplier}，还有混合敌群与护甲。</small> : null}</div></section> : null}
        {activeBoss ? <section className={styles.bossPanel} aria-label="小 Boss 战况"><div><strong>{activeBoss.name}</strong><span>小 Boss · {activeBoss.hp} / {activeBoss.maxHp}</span></div><progress aria-label="小 Boss 生命值" max={activeBoss.maxHp} value={Math.max(0, activeBoss.hp)} /><p>护甲 {activeBoss.armor} · 夹在混合敌群中进攻。碎纸机易伤配合主力输出，减速与群攻处理护卫。</p></section> : null}
        <div className={styles.deskEdge}><span><i /> {name}的办公桌</span><small>{guidance}</small></div>
        <div className={styles.boardWrap}>
          <div className={styles.board} ref={boardRef} tabIndex={0} role="group" aria-label={`工位塔防地图，第 ${game.wave} 回合，核心耐久 ${game.coreHp}，${activeEnemies.length} 个目标，角色 ${game.hero.level} 级`}>
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
                {enemies.slice(0, 2).map((enemy, index) => <span key={enemy.id} className={`${styles.enemy} ${enemy.boss ? styles.boss : ''}`} data-archetype={enemy.archetype} data-stack={index} data-hit={game.effects.some((effect) => effect.targetEnemyIds.includes(enemy.id))} data-controlled={(enemy.freezeTicks ?? 0) + (enemy.rootTicks ?? 0) + (enemy.stunTicks ?? 0) > 0} data-armor-broken={(enemy.armorBreakTicks ?? 0) > 0} title={`${enemy.name} · ${enemy.hp}/${enemy.maxHp}${enemy.armor > 0 ? ` · 护甲 ${enemy.armor}` : ''}${(enemy.armorBreakTicks ?? 0) > 0 ? ` · 破甲 ${enemy.armorBreakPoints}` : ''}${(enemy.freezeTicks ?? 0) > 0 ? ' · 冰冻' : (enemy.rootTicks ?? 0) > 0 ? ' · 定身' : (enemy.stunTicks ?? 0) > 0 ? ' · 眩晕' : ''}`}><i className={styles.enemyPaper}><b>{ENEMY_BRIEF[enemy.archetype]?.mark ?? '!'}</b></i><small style={{ '--value': `${Math.max(0, enemy.hp) / enemy.maxHp * 100}%` } as React.CSSProperties} /></span>)}
                {enemies.length > 2 ? <b className={styles.enemyCount}>+{enemies.length - 2}</b> : null}
                {isHero ? <span className={styles.hero} data-avatar={character?.avatarKey || 'guest'} data-pulsing={game.hero.lastPulseTick === game.tick} data-direction={game.hero.direction}><OfficeHeroArt mark={avatarMark} /><b>YOU</b></span> : null}
              </span>;
            })}
            <svg className={styles.battleEffects} viewBox={`0 0 ${TOWER_DEFENSE_WIDTH * 64} ${TOWER_DEFENSE_HEIGHT * 64}`} aria-hidden="true" focusable="false">
              {game.effects.map((effect) => <g key={effect.id} data-source={effect.source} data-technique={effect.technique} className={styles.shot}><path d={`M ${effect.from.x * 64 + 32} ${effect.from.y * 64 + 32} L ${effect.to.x * 64 + 32} ${effect.to.y * 64 + 32}`} /><circle cx={effect.to.x * 64 + 32} cy={effect.to.y * 64 + 32} r={effect.source === 'pulse' ? 35 : effect.technique === 'taunt' || effect.technique === 'execute' ? 22 : 11} />{effect.technique ? <text x={effect.to.x * 64 + 32} y={Math.max(16, effect.to.y * 64 + 10)} textAnchor="middle">{TECHNIQUE_LABEL[effect.technique]}</text> : null}</g>)}
            </svg>
          </div>
          {breachNotice && game.status === 'running' ? <aside className={styles.breachPopup} role="alert" aria-label="突破提醒" key={breachNotice.serial}>
            <div><small>防线告急 · 本次提示共 {breachNotice.count} 项突破</small><strong>{TOWER_TAUNTS.breach}</strong><span>核心剩余 {game.coreHp} 点 · 提醒会自动收起</span></div>
            <button type="button" aria-label="收起突破提醒" onClick={() => setBreachNotice(null)}>×</button>
          </aside> : null}
          {game.status === 'paused' ? <div className={styles.boardOverlay}><span>Ⅱ</span><h2>{autoPaused ? '已为你自动暂停' : '工位塔防已暂停'}</h2><p>战斗和绿植产币都已暂停，不会偷偷流失进度。</p><button type="button" className={styles.primaryButton} onClick={togglePause}>继续防守</button></div> : null}
          {game.status === 'won' || game.status === 'lost' ? <div className={styles.boardOverlay} data-result={game.status} role={game.status === 'lost' ? 'alert' : undefined} aria-label={game.status === 'lost' ? '防线失守结算' : undefined}><span>{game.status === 'won' ? '✦' : '下班申请 · 驳回'}</span><h2>{game.status === 'won' ? '守住工位，准点下班！' : TOWER_TAUNTS.defeat}</h2><p>得分 {game.score} · 清理 {game.defeated} 项工作{game.status === 'lost' ? <small className={styles.fictionNote}>仅游戏吐槽，不扣账号办公币</small> : null}</p><button type="button" className={styles.primaryButton} onClick={restart}>再来一局</button></div> : null}
        </div>
        {game.status === 'lost' ? <section className={styles.recoveryCard} aria-labelledby="recovery-title"><h2 id="recovery-title">下一局，试试这样调整</h2><p>{recoveryAdvice(game)}</p></section> : null}
        <div className={styles.battleToolbar}>
          {game.status === 'idle' ? <button type="button" className={styles.primaryButton} aria-label="开始工位塔防" onClick={start}>开始第一回合 <span>→</span></button> : game.status === 'intermission' ? <button type="button" className={styles.primaryButton} onClick={nextWave}>迎战第二回合 <span>→</span></button> : <button type="button" className={styles.secondaryButton} disabled={!['running', 'paused'].includes(game.status)} onClick={togglePause}>{game.status === 'paused' ? '继续防守' : '暂停战斗'}</button>}
          <span>{game.status === 'idle' ? '准备时不产币；建议先合成一座塔' : `场上 ${activeEnemies.length} · 后续 ${game.spawnQueue.length}`}</span><button type="button" className={styles.textButton} onClick={restart}>重新开局</button>
        </div>
        <div className={styles.feedback} data-error={actionFailed} role="status" aria-live="polite" aria-atomic="true"><span>{actionFailed ? '!' : '✦'}</span><p>{announcement}</p></div>
        {roundSummary ? <details className={styles.enemyGuide} open={preparingFinalRound ? true : undefined}><summary>{preparingFinalRound ? '下一回合' : '本回合'}敌情 · {roundSummary.enemyCount} 项工作<span>查看应对建议</span></summary><p>{roundSummary.description}</p><div>{roundSummary.archetypes.map((archetype) => <article key={archetype} data-archetype={archetype}><b aria-hidden="true">{ENEMY_BRIEF[archetype].mark}</b><p><strong>{ENEMY_BRIEF[archetype].name}</strong><span>{ENEMY_BRIEF[archetype].counter}</span></p></article>)}</div></details> : null}
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
          <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>SUPPLY ROOM</span><h2 id="shop-title">零件补给站</h2></div><button type="button" className={styles.refreshButton} aria-label={`刷新零件商店，${TOWER_SHOP_REFRESH_COST} 金币`} disabled={!editable || game.credits < TOWER_SHOP_REFRESH_COST} onClick={() => runAction(refreshTowerDefenseShop)}>↻ 刷新 <b>{TOWER_SHOP_REFRESH_COST} G</b></button></div><p className={styles.sectionHint}>四格随机补给 + 一格定向订货。买后原格售罄，花 {TOWER_SHOP_REFRESH_COST} G 刷新才补货。</p>
          <div className={styles.focusOrder}><div><label htmlFor="tower-order-type">定向订货塔型</label><span>选择免费 · 售罄后只预约下次刷新 · 单件含定向溢价</span></div><select id="tower-order-type" value={game.shopFocus} disabled={!editable} onChange={(event) => runAction((state) => setTowerShopFocus(state, event.target.value as TowerType))}>{Object.values(TOWER_DEFINITIONS).map((tower) => <option key={tower.type} value={tower.type}>{tower.name} · {focusedTowerPartCost(tower.type)} G</option>)}</select></div>
          <div className={styles.shopGrid} aria-label="五格零件商店">{game.shop.map((offer, index) => <button type="button" key={offer.id} className={styles.shopOffer} data-type={offer.type} data-focused={offer.source === 'focused'} data-sold-out={Boolean(offer.soldOut)} aria-label={offer.soldOut ? `第 ${index + 1} 格已售罄，刷新后补货` : `购买第 ${index + 1} 格${TOWER_DEFINITIONS[offer.type].name}零件，${offer.cost} 金币${offer.source === 'focused' ? '，定向订货' : ''}`} disabled={!editable || Boolean(offer.soldOut) || game.credits < offer.cost} onClick={() => runAction((state) => buyTowerShopOffer(state, offer.id))}><small>{offer.source === 'focused' ? '定向订货' : '1 阶零件'}</small><OfficeTowerArt kind={offer.type} tier={1} /><strong>{offer.soldOut ? '已售罄' : TOWER_DEFINITIONS[offer.type].name}</strong><span>{offer.soldOut ? '待刷新' : <>{offer.cost} <small>G</small></>}</span></button>)}</div>
          <div className={styles.mergeRecipe} aria-label="合成规则"><span>同名 1 阶 ×3</span><b>→</b><strong>2 阶可部署</strong><b>→</b><span>同名 2 阶 ×3<br /><strong>3 阶满级</strong></span></div>
        </section>
        <section className={styles.workCard} aria-labelledby="inventory-title">
          <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>ASSEMBLY BENCH</span><h2 id="inventory-title">合成背包 <small aria-label="背包容量">{game.inventory.length}/{TOWER_INVENTORY_CAPACITY}</small></h2></div><span className={styles.autoMergeBadge} key={mergeFlash}>✦ 自动三合一</span></div>
          {selectedItem ? <p className={styles.placementHint}>已选 {TOWER_DEFINITIONS[selectedItem.type].name} {selectedItem.tier} 阶 · 点击上方空塔位部署<button type="button" onClick={() => setSelectedItemId(null)}>取消</button></p> : <p className={styles.sectionHint}>点击 2 / 3 阶成品，再点地图空塔位。1 阶不能部署。</p>}
          {game.inventory.length ? <div className={styles.inventoryGrid} aria-label="背包物品">{game.inventory.map((item) => <article key={item.id} data-tier={item.tier} data-selected={selectedItemId === item.id}><button type="button" className={styles.inventoryItem} disabled={!editable || item.tier === 1} aria-label={`${item.tier === 1 ? '待合成' : '选择部署'}${TOWER_DEFINITIONS[item.type].name} ${item.tier} 阶`} aria-pressed={selectedItemId === item.id} onClick={() => chooseItem(item.id)}><OfficeTowerArt kind={item.type} tier={item.tier} /><strong>{TOWER_DEFINITIONS[item.type].name}</strong><small>{item.tier === 1 ? '1 阶 · 等待合成' : `${item.tier} 阶 · 点击部署`}</small></button><button type="button" className={styles.sellItem} disabled={!editable} aria-label={`出售背包${TOWER_DEFINITIONS[item.type].name} ${item.tier} 阶`} onClick={() => runAction((state) => sellInventoryTower(state, item.id))}>出售</button></article>)}</div> : <div className={styles.emptyInventory}><span>▧</span><strong>零件会在这里集合</strong><p>先从上方购买三个同名零件，试试第一次合成。</p></div>}
          {selectedTower ? <div className={styles.selectedTower} aria-label="选中的防御塔"><OfficeTowerArt kind={selectedTower.type} tier={selectedTower.level} /><div><strong>塔位 {selectedTower.slotIndex + 1} · {TOWER_DEFINITIONS[selectedTower.type].name}</strong><small>{selectedTower.level} 阶 · {selectedTower.level === 3 ? '已到最高阶' : '背包再备 2 个同名 2 阶可原地升阶'}</small></div><button type="button" className={styles.secondaryButton} disabled={!editable || selectedTower.level >= 3} onClick={() => runAction((state) => mergeDeployedTower(state, selectedTower.slotIndex))}>合成升阶</button><button type="button" className={styles.textButton} disabled={!editable} onClick={() => runAction((state) => sellDeployedTower(state, selectedTower.slotIndex))}>卖出防御塔</button></div> : null}
          {selectedTower && selectedTower.level >= 2 ? <p className={styles.evolutionDetail} aria-label="当前塔进阶技能"><strong>{TOWER_EVOLUTIONS[selectedTower.type][selectedTower.level === 3 ? 3 : 2].name}</strong>{TOWER_EVOLUTIONS[selectedTower.type][selectedTower.level === 3 ? 3 : 2].description}</p> : null}
        </section>
        <details className={styles.guide}><summary>五条防线 · 玩法说明 <span>＋</span></summary><div className={styles.towerGuide}>{Object.values(TOWER_DEFINITIONS).map((tower) => <div key={tower.type}><OfficeTowerArt kind={tower.type} tier={2} /><p><strong>{tower.name}</strong><span>{tower.description}</span></p></div>)}</div><p>只买零件，不直接买塔；三件同名同阶自动合成。已部署的 2 阶塔消耗两座同名 2 阶塔原地进阶。买后原格留空；切换定向只改偏好，不会补回售罄格，必须花局内金币刷新。卖出返还零件投入的六成，刷新费不退。</p><p>一拍约 0.28 秒。冰冻、定身、眩晕共享短暂抗性，Boss 停顿更短且不会被聚怪或吞噬。第一回合经营，第二回合要配合进阶技能、脉冲与临场补阵。</p><p>准备、暂停和间歇不产币。切出窗口自动暂停。本版是纯本地两回合短局，只保存本机最高分；刷新页面重新开局，没有账号奖励、离线收益或付费抽卡。</p></details>
        <details className={styles.guide}><summary>进阶图鉴 · 二阶与三阶 <span>＋</span></summary><div className={styles.evolutionCatalog}>{Object.entries(TOWER_EVOLUTIONS).map(([type, tiers]) => <section key={type} aria-label={`${TOWER_DEFINITIONS[type as TowerType].name}进阶图鉴`}>{([2, 3] as const).map((tier) => <article key={tier}><OfficeTowerArt kind={type} tier={tier} /><div><strong>{tier} 阶 · {tiers[tier].name}</strong><p>{tiers[tier].description}</p></div></article>)}</section>)}</div></details>
        <footer className={styles.localRecord}><span>售罄挑战版 · 本机最高分</span><strong>{Math.max(bestScore, ['won', 'lost'].includes(game.status) ? game.score : 0)}</strong><small>V1–V3 记录原样保留，不混分</small></footer>
      </aside>
    </div>
  </main>;
}

export default WorkstationTowerDefensePage;
