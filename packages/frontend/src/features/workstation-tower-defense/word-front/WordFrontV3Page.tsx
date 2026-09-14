import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';
import {
  applyWordFrontV3Action, createWordFrontV3State, stepWordFrontV3,
  wordFrontV3DrawCost, wordFrontV3HeroForLetters, wordFrontV3Routes, wordFrontV3Terrain, wordFrontV3UnitForLetter,
  WORD_FRONT_V3_CHAPTERS, WORD_FRONT_V3_GEAR_SLOTS, WORD_FRONT_V3_HEIGHT, WORD_FRONT_V3_RARITIES, WORD_FRONT_V3_UNITS, WORD_FRONT_V3_WIDTH,
  type WordFrontMode, type WordFrontV3Action, type WordFrontV3State, type WordFrontV3UnitKind,
} from '@stealth-reader/shared';

import { useCommunityAuthStore } from '../../../app/store/community-auth-store';
import { COMMUNITY_FEATURE_FLAGS } from '../../../app/community-nav';
import { finishArcadeRun, getArcadeLeaderboard, startArcadeRun } from '../../../api/community-arcade';
import { ArcadeAdapterProvider, type ArcadeAdapter } from '../../games/ArcadeAdapter';
import { ArcadeLeaderboard } from '../../games/ArcadeLeaderboard';
import { announceLocalGameForeground, listenForOtherLocalGame } from '../../games/game-input';
import { useArcadeRun } from '../../games/useArcadeRun';
import styles from './WordFrontV3Page.module.css';

const MODES: Record<WordFrontMode, string> = { story: '剧情护送', endless: '无尽守卫' };
const ENEMIES: Record<string, string> = { routine: '需', mail: '催', approval: '审', bug: '错', boss: '考' };
const validInt = (value: unknown, min: number, max: number): boolean => Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
function safeDraft(key: string, mode: WordFrontMode): WordFrontV3State | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw || raw.length > 128_000) return null;
    const state = JSON.parse(raw) as Partial<WordFrontV3State>;
    if (state.version !== 3 || state.mode !== mode || !['ready', 'running', 'won', 'lost'].includes(state.status ?? '') ||
      !validInt(state.chapter, 1, 6) || !validInt(state.coreHp, 0, 5) || !validInt(state.wave, 0, 30) ||
      !validInt(state.completedWaves, 0, 30) || !validInt(state.kills, 0, 1_000) || !validInt(state.score, 0, 100_000) ||
      !validInt(state.credits, 0, 40) || !validInt(state.gold, 0, 2_000) || !validInt(state.drawCount, 0, 100) ||
      !validInt(state.shovels, 0, 100) || !validInt(state.attackBoost, 0, 3) || !validInt(state.tick, 0, 3_000) ||
      !validInt(state.guardRemaining, 0, 9) || !Array.isArray(state.guardClaimedIds) || state.guardClaimedIds.length > 32 ||
      !state.guardClaimedIds.every(id => validInt(id, 1, 1_000)) ||
      !validInt(state.seed, 0, 0xffff_ffff) || !validInt(state.pendingSpawns, 0, 18) || !validInt(state.nextEnemyId, 1, 1_000) ||
      typeof state.message !== 'string' || state.message.length > 200 || !Array.isArray(state.hand) || state.hand.length > 150 ||
      !state.hand.every(card => typeof card === 'string' && [...card].length === 1) || !Array.isArray(state.unlocked) ||
      !state.unlocked.every(slot => validInt(slot, 0, 47)) || !Array.isArray(state.units) || state.units.length > 31 ||
      !state.units.every(unit => validInt(unit.slot, 0, 47) && validInt(unit.level, 1, 3) && Object.prototype.hasOwnProperty.call(WORD_FRONT_V3_UNITS, unit.kind)) ||
      new Set(state.units.map(unit => unit.slot)).size !== state.units.length || !Array.isArray(state.enemies) || state.enemies.length > 32 ||
      !state.enemies.every(enemy => validInt(enemy.id, 1, 1_000) && validInt(enemy.routeId, 0, 2) && typeof enemy.interfered === 'boolean' &&
        validInt(enemy.pathIndex, 0, 20) && validInt(enemy.hp, 1, 1_000) && validInt(enemy.maxHp, 1, 1_000) &&
        validInt(enemy.moveEvery, 1, 6) && Object.prototype.hasOwnProperty.call(ENEMIES, enemy.kind)) ||
      !Array.isArray(state.loot) || state.loot.length > 32 || !state.loot.every(item => validInt(item.id, 1, 1_000) &&
        Object.prototype.hasOwnProperty.call(WORD_FRONT_V3_GEAR_SLOTS, item.slot) && Object.prototype.hasOwnProperty.call(WORD_FRONT_V3_RARITIES, item.rarity)) ||
      !state.equipped || typeof state.equipped !== 'object' || Array.isArray(state.equipped) ||
      Object.entries(state.equipped).some(([slot, id]) => !Object.prototype.hasOwnProperty.call(WORD_FRONT_V3_GEAR_SLOTS, slot) ||
        !state.loot?.some(item => item.id === id && item.slot === slot)) ||
      state.interference !== null && (!state.interference || !['stun', 'fog'].includes(state.interference.kind) ||
        !validInt(state.interference.untilTick, 0, 3_003) ||
        state.interference.targetSlot !== null && !validInt(state.interference.targetSlot, 0, 47))) return null;
    return state as WordFrontV3State;
  } catch { return null; }
}

export function WordFrontV3Page(): JSX.Element {
  const [mode, setMode] = useState<WordFrontMode>('story');
  const phase = useCommunityAuthStore(state => state.phase);
  const publicId = useCommunityAuthStore(state => state.phase === 'active' ? state.user?.publicId : null);
  const restoreSession = useCommunityAuthStore(state => state.restoreSession);
  const adapter = useMemo<ArcadeAdapter>(() => ({ signedIn: phase === 'active', restoreSession,
    startRun: (gameKey, chapter) => startArcadeRun(gameKey, 3, chapter), finishRun: finishArcadeRun, getLeaderboard: getArcadeLeaderboard }), [phase, restoreSession]);
  if (!publicId) return <main className={styles.page}><h1>文字战线</h1>{phase === 'bootstrapping' ? <p role="status">正在核对账号…</p> : <p role="status">登录后开始对局。<Link to="/login">前往登录</Link></p>}</main>;
  return <ArcadeAdapterProvider adapter={adapter}><WordFrontV3Run key={`${publicId}:${mode}`} publicId={publicId} mode={mode} onModeChange={setMode} /></ArcadeAdapterProvider>;
}

function WordFrontV3Run({ publicId, mode, onModeChange }: { publicId: string; mode: WordFrontMode; onModeChange: (mode: WordFrontMode) => void }): JSX.Element {
  const storageKey = `momo.word-front.v3.${publicId}.${mode}`;
  const [state, setState] = useState<WordFrontV3State>(() => safeDraft(storageKey, mode) ?? createWordFrontV3State(mode));
  const stateRef = useRef(state), actions = useRef<WordFrontV3Action[]>([]);
  const [chapter, setChapter] = useState(state.chapter);
  const [selectedCards, setSelectedCards] = useState<number[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<number | null>(null);
  const [paused, setPaused] = useState(true), [eligible, setEligible] = useState(false), [starting, setStarting] = useState(false), [rulesOpen, setRulesOpen] = useState(false);
  const [onlineExpiresAt, setOnlineExpiresAt] = useState<string | null>(null);
  const finishSent = useRef(false), sessionStarted = useRef(false), requestId = useRef(0), alive = useRef(true);
  const gameOwner = useRef(`word-front-v3-${publicId}-${mode}`).current;
  const arcade = useArcadeRun(mode === 'story' ? 'word_story_v3' : 'word_endless_v3');
  useEffect(() => { try { window.localStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* Local play remains available. */ } }, [state, storageKey]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; requestId.current += 1; }; }, []);
  useEffect(() => {
    const pause = () => setPaused(true);
    const hidden = () => { if (document.hidden) pause(); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') pause(); };
    const off = listenForOtherLocalGame(gameOwner, pause);
    window.addEventListener('blur', pause); window.addEventListener('keydown', escape); document.addEventListener('visibilitychange', hidden);
    return () => { off(); window.removeEventListener('blur', pause); window.removeEventListener('keydown', escape); document.removeEventListener('visibilitychange', hidden); };
  }, [gameOwner]);
  useEffect(() => {
    if (state.status !== 'running' || paused) return;
    const timer = window.setInterval(() => { const next = stepWordFrontV3(stateRef.current); stateRef.current = next; setState(next); }, 850);
    return () => window.clearInterval(timer);
  }, [state.status, paused]);
  useEffect(() => {
    if (!eligible || finishSent.current || state.status !== 'won' && state.status !== 'lost') return;
    finishSent.current = true;
    void arcade.finish(state.score, { mode, chapter: state.chapter, wave: state.completedWaves, kills: state.kills,
      coreHp: state.coreHp, drawCount: state.drawCount, outcome: state.status, finishTick: state.tick, actions: actions.current });
  }, [arcade.finish, eligible, mode, state]);

  const chosenKind: WordFrontV3UnitKind | null = selectedCards.length === 2
    ? wordFrontV3HeroForLetters(state.hand[selectedCards[0]!] ?? '', state.hand[selectedCards[1]!] ?? '')
    : selectedCards.length === 1 ? wordFrontV3UnitForLetter(state.hand[selectedCards[0]!] ?? '') : null;
  const map = WORD_FRONT_V3_CHAPTERS[(mode === 'endless' ? 6 : state.chapter) - 1]!;
  const routes = wordFrontV3Routes(state);
  const active = state.status === 'running';
  function set(next: WordFrontV3State): void { stateRef.current = next; setState(next); }
  function apply(action: WordFrontV3Action): boolean {
    const next = applyWordFrontV3Action(stateRef.current, action);
    if (!next) return false;
    set(next); if (eligible) actions.current.push(action); return true;
  }
  function chooseCard(index: number): void {
    setSelectedUnit(null);
    setSelectedCards(current => current.includes(index) ? current.filter(value => value !== index) : current.length === 2 ? [index] : [...current, index]);
  }
  async function recruit(): Promise<void> {
    if (starting || stateRef.current.status === 'won' || stateRef.current.status === 'lost') return;
    setSelectedCards([]);
    if (!sessionStarted.current && stateRef.current.drawCount === 0) {
      sessionStarted.current = true;
      const request = ++requestId.current;
      setStarting(true);
      const run = await arcade.beginForChapter(mode === 'story' ? chapter : 1);
      if (!alive.current || request !== requestId.current || useCommunityAuthStore.getState().user?.publicId !== publicId) return;
      const gameKey = mode === 'story' ? 'word_story_v3' : 'word_endless_v3';
      // A previous API ignores rulesVersion. It must never receive a v3 trace.
      const verified = run?.gameKey === gameKey && run.rulesVersion === 3 && validInt(run.seed, 0, 0xffff_ffff) &&
        validInt(run.chapter, 1, mode === 'story' ? 6 : 1) &&
        Number.isFinite(Date.parse(run.expiresAt)) && Date.parse(run.expiresAt) - Date.now() >= 5 * 60_000;
      const boundChapter = verified ? run.chapter! : chapter;
      const base = createWordFrontV3State(mode, boundChapter, verified ? run.seed! : stateRef.current.seed);
      const action: WordFrontV3Action = { tick: 0, type: 'recruit' };
      const next = applyWordFrontV3Action(base, action);
      if (next) { set(verified && boundChapter !== chapter ? { ...next, message: `沿用尚未结束的在线对局，本局固定第 ${boundChapter} 章。` } : next);
        setChapter(boundChapter); setEligible(verified); setOnlineExpiresAt(verified ? run!.expiresAt : null); actions.current = verified ? [action] : []; }
      setStarting(false);
      return;
    }
    if (!apply({ tick: stateRef.current.tick, type: 'recruit' })) set({ ...stateRef.current, message: `局内经费不足，下次招募需 ${wordFrontV3DrawCost(stateRef.current.drawCount)} 点。` });
  }
  function chooseCell(slot: number): void {
    const terrain = wordFrontV3Terrain(stateRef.current, slot);
    if (terrain === 'waste') {
      if (!apply({ tick: stateRef.current.tick, type: 'unlock', slot })) set({ ...stateRef.current, message: '需要一把铲子才能解封荒地；招募有概率抽到。' });
      return;
    }
    if (terrain === 'path' || terrain === 'slow' || terrain === 'obstacle') return;
    const occupied = stateRef.current.units.find(unit => unit.slot === slot);
    if (chosenKind && !occupied) {
      const action: WordFrontV3Action = selectedCards.length === 2
        ? { tick: stateRef.current.tick, type: 'deploy_hero', first: selectedCards[0]!, second: selectedCards[1]!, slot }
        : { tick: stateRef.current.tick, type: 'deploy_basic', card: selectedCards[0]!, slot };
      apply(action); setSelectedCards([]); setSelectedUnit(null); return;
    }
    if (occupied && selectedUnit !== null && selectedUnit !== slot) {
      if (!apply({ tick: stateRef.current.tick, type: 'merge', from: selectedUnit, to: slot })) set({ ...stateRef.current, message: '只有同角色、同阶的两位单位才能合并，最高三阶。' });
      setSelectedUnit(null); return;
    }
    setSelectedUnit(occupied ? slot : null);
  }
  function begin(): void {
    if (!apply({ tick: stateRef.current.tick, type: 'start' })) { set({ ...stateRef.current, message: '先部署至少一位单位，再开始防守。' }); return; }
    announceLocalGameForeground(gameOwner); finishSent.current = false; setPaused(false);
  }
  function reset(): void {
    if (active && !window.confirm('当前对局会结束，本机草稿将被覆盖。确定重开吗？')) return;
    requestId.current += 1;
    set(createWordFrontV3State(mode, chapter, (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0));
    actions.current = []; sessionStarted.current = false; finishSent.current = false;
    setSelectedCards([]); setSelectedUnit(null); setPaused(true); setEligible(false); setStarting(false); setOnlineExpiresAt(null);
  }
  function changeMode(next: WordFrontMode): void {
    if (next === mode) return;
    if (eligible && !window.confirm('切换模式会保留本机草稿，但当前在线对局不能继续参榜。确定切换吗？')) return;
    setPaused(true); onModeChange(next);
  }
  function buy(boost: 'attack' | 'heal'): void {
    if (!apply({ tick: stateRef.current.tick, type: 'buy_boost', boost })) set({ ...stateRef.current, message: '局内金币不足，或当前增益已满 / 核心生命已满。' });
  }
  function equip(index: number): void { apply({ tick: stateRef.current.tick, type: 'equip_loot', index }); }
  const frontSlots = new Set(state.enemies.flatMap(enemy => routes[enemy.routeId]?.slice(0, enemy.pathIndex) ?? []));
  const interferenceActive = state.interference && state.interference.untilTick >= state.tick ? state.interference : null;
  return <main className={styles.page}>
    <header className={styles.header}><div><span className={styles.kicker}>WORKSHEET / WORD FRONT 3</span><h1>文字战线 · 赵云救阿斗</h1><p>六章护送、后段岔路与局内战利品；页面像一份安静的工作表。</p></div><nav><Link to="/tower-defense">原工位塔防</Link><Link to="/tower-defense/word-front/v2">旧版六章</Link><Link to="/tower-defense/word-front/legacy">初版草稿</Link>{COMMUNITY_FEATURE_FLAGS.wordFrontRooms ? <Link to="/tower-defense/word-front/rooms">双人房间（V2 规则）</Link> : null}<Link to="/games">小游戏专区</Link></nav></header>
    <div className={styles.layout}>
      <section className={styles.mainPanel} aria-label="文字战线对局">
        <div className={styles.toolbar}><div className={styles.modes} role="group" aria-label="玩法模式">{(Object.keys(MODES) as WordFrontMode[]).map(key => <button key={key} type="button" data-active={mode === key} aria-pressed={mode === key} onClick={() => changeMode(key)}>{MODES[key]}</button>)}</div>
          {mode === 'story' ? <label>章节<select value={chapter} disabled={active || starting || state.drawCount > 0} onChange={event => { const value = Number(event.target.value); setChapter(value); set(createWordFrontV3State(mode, value)); setPaused(true); setEligible(false); actions.current = []; sessionStarted.current = false; }}>{WORD_FRONT_V3_CHAPTERS.map(item => <option key={item.id} value={item.id}>{item.id}. {item.name}</option>)}</select></label> : <span>无尽 · 30 波 / 每 10 波首领</span>}
        </div>
        <p className={styles.chapterDetail}>{mode === 'story' ? `${state.chapter}. ${map.name} · ${state.chapter + 2} 波，末波首领` : '大老板巡场路线，波数递增；不扣账号办公币。'} · 固定 {routes.length} 条来客路线</p>
        <div className={styles.metrics} aria-label="对局数据"><span>核心<strong>{state.coreHp}/5</strong></span><span>波次<strong>{state.wave || '待命'}</strong></span><span>击败<strong>{state.kills}</strong></span><span>得分<strong>{state.score}</strong></span><span>经费<strong>{state.credits}/40</strong></span><span>局内金币<strong>{state.gold}</strong></span><span>铲子<strong>{state.shovels}</strong></span><span>防具护盾<strong>{state.guardRemaining}</strong></span></div>
        {interferenceActive ? <p className={styles.interference} role="status">{interferenceActive.kind === 'stun' ? '故障干扰 · 一位成员暂时停手' : '催办干扰 · 射程暂时缩短'} · 剩余 {interferenceActive.untilTick - state.tick + 1} 拍</p> : null}
        <div className={styles.boardViewport}><div className={styles.board} role="group" aria-label="文字战线地图" data-interference={interferenceActive?.kind ?? ''}>{Array.from({ length: WORD_FRONT_V3_WIDTH * WORD_FRONT_V3_HEIGHT }, (_, slot) => {
          const terrain = wordFrontV3Terrain(state, slot);
          const unit = state.units.find(item => item.slot === slot), enemies = state.enemies.filter(item => routes[item.routeId]?.[item.pathIndex] === slot);
          const entrance = routes.some(route => route[0] === slot), core = routes.every(route => route.at(-1) === slot);
          const row = Math.floor(slot / 8) + 1, column = slot % 8 + 1;
          const label = `${row}行${column}列，${unit ? `${WORD_FRONT_V3_UNITS[unit.kind].name}${unit.level}阶` : terrain === 'path' ? '路线' : terrain === 'slow' ? '减速地毯' : terrain === 'waste' ? '未开垦荒地' : terrain === 'obstacle' ? '障碍' : terrain === 'buff' ? '增益工位' : '空白工位'}${enemies.length ? `，${enemies.length}名来客` : ''}`;
          return <button key={slot} type="button" className={styles.cell} data-terrain={terrain} data-unit={unit?.kind ?? ''} data-selected={selectedUnit === slot} data-front={frontSlots.has(slot)} data-stunned={interferenceActive?.kind === 'stun' && interferenceActive.targetSlot === slot} aria-pressed={unit ? selectedUnit === slot : undefined} aria-label={label} disabled={terrain === 'path' || terrain === 'slow' || terrain === 'obstacle'} onClick={() => chooseCell(slot)}>
            {unit ? <span className={styles.unit}><b>{WORD_FRONT_V3_UNITS[unit.kind].glyph}</b><small>{WORD_FRONT_V3_UNITS[unit.kind].name} · {unit.level}阶</small></span> : entrance ? <span className={styles.pathLabel}>入口</span> : core ? <span className={styles.pathLabel}>鱼</span> : terrain === 'waste' ? <span className={styles.terrainGlyph}>锁</span> : terrain === 'obstacle' ? <span className={styles.terrainGlyph}>柜</span> : terrain === 'buff' ? <span className={styles.terrainGlyph}>充</span> : terrain === 'slow' ? <span className={styles.pathLabel}>缓</span> : terrain === 'path' ? <span className={styles.pathDot}>·</span> : <span className={styles.emptyCell}>+</span>}
            {enemies.length ? <span className={styles.enemy} title={`来客：${enemies.map(item => `${ENEMIES[item.kind]} ${item.hp}/${item.maxHp}`).join('、')}`}>{enemies.length > 1 ? enemies.length : ENEMIES[enemies[0]!.kind]}</span> : null}
          </button>;
        })}</div></div>
        <p className={styles.note}>窄屏可横向滑动地图。第 5 章起有多条固定岔路与不同入口；来客沿各自路线自动前进。字卡选基础单位或互补双字职业，点击空工位部署；同角色同阶可合并。荒地需铲子，金色工位增伤，蓝色地毯减速。</p>
        <div className={styles.controls}><button type="button" onClick={begin} disabled={state.status !== 'ready' || starting}>开始防守</button><button type="button" onClick={() => { announceLocalGameForeground(gameOwner); setPaused(false); }} disabled={!active || !paused}>继续</button><button type="button" onClick={() => setPaused(true)} disabled={!active || paused}>暂停 / Esc</button><button type="button" onClick={reset}>新开一局</button></div>
        <p role="status" className={styles.message}>{state.status === 'won' ? '护送成功 · ' : state.status === 'lost' ? '本局结束 · ' : active && paused ? '已暂停 · ' : ''}{state.message}</p>
      </section>
      <aside className={styles.sidePanel} aria-label="招募与编队"><span className={styles.kicker}>01 / RECRUIT</span><h2>字卡工作台</h2><p>招募五张；10 点起，每次加 2。首抽保底一组职业双字，后续按基础字 90%、职业字 8%、铲子 2% 抽取。未过期的在线对局重新开始会复用同一种子，不可重抽开局。</p>
        <button className={styles.recruit} type="button" disabled={starting || state.status === 'won' || state.status === 'lost'} onClick={() => { void recruit(); }}>{starting ? '正在建立可验证对局…' : `招募五张 · ${wordFrontV3DrawCost(state.drawCount)} 点`}</button>
        <div className={styles.hand} role="group" aria-label="手中字卡">{state.hand.length ? state.hand.map((letter, index) => <button type="button" key={`${index}-${letter}`} aria-label={`第 ${index + 1} 张字卡：${letter}`} aria-pressed={selectedCards.includes(index)} data-selected={selectedCards.includes(index)} onClick={() => chooseCard(index)}>{letter}</button>) : <p>暂无字卡，先招募一次。</p>}</div>
        <p className={styles.combo}>{chosenKind ? <>已选 <strong>{WORD_FRONT_V3_UNITS[chosenKind].name}</strong>，点击空工位部署。</> : selectedCards.length ? '基础单位单字可部署；职业需要互补双字。' : '选择单字或互补双字。'}</p>
        <div className={styles.roster}><h3>角色与装备字</h3>{Object.entries(WORD_FRONT_V3_UNITS).map(([key, value]) => <div key={key}><b>{value.glyph}</b><span>{value.name}</span><small>{value.role}</small></div>)}</div>
        <div className={styles.merchant}><h3>局内商人</h3><p>金币只在本局通过击败来客取得；不扣账号办公币。</p><button type="button" disabled={!active || state.gold < 12 || state.attackBoost >= 3} onClick={() => buy('attack')}>输出 +15% · 12 金</button><button type="button" disabled={!active || state.gold < 12 || state.coreHp >= 5} onClick={() => buy('heal')}>核心 +1 命 · 12 金</button></div>
        <div className={styles.lootPanel}><h3>本局战利品</h3><p>击败特定精英与首领可能获得白、绿、蓝、紫、金五档装备；只在本局生效，不进入账号仓库。武器增伤，防具首次装备给有限护盾，坐骑提供机动输出，高品质还可增加射程。</p>
          {state.loot.length ? <ul>{state.loot.map((item, index) => <li key={item.id} data-rarity={item.rarity}><span>{WORD_FRONT_V3_RARITIES[item.rarity].name}品 · {WORD_FRONT_V3_GEAR_SLOTS[item.slot]}</span><button type="button" disabled={state.equipped[item.slot] === item.id || state.status === 'won' || state.status === 'lost'} onClick={() => equip(index)}>{state.equipped[item.slot] === item.id ? '已装备' : '本局装备'}</button></li>)}</ul> : <p>暂无掉落；完整战利品最多暂存 32 件。</p>}
        </div>
      </aside>
      <aside className={styles.rankingPanel} aria-label="文字战线成绩与规则"><h3>第三版独立成绩</h3><p>新剧情与无尽单独计榜；v2 六章和初版草稿的旧成绩均保留，版本间不混排。服务端逐动作回放核验，局内资源不接账号办公币，也不发放奖励。</p>{onlineExpiresAt && eligible ? <p role="status">本局在线成绩有效至 {new Date(onlineExpiresAt).toLocaleString('zh-CN')}；过期后只保留本机草稿。重开若旧对局尚有充裕时间，会复用原种子。</p> : null}{state.drawCount > 0 && !eligible ? <p role="status">当前是恢复或离线草稿，不提交排行榜；新开局获取 v3 服务端规则种子后才能参榜。</p> : null}{arcade.notice ? <p role="status">{arcade.notice}</p> : null}<ArcadeLeaderboard gameKey={mode === 'story' ? 'word_story_v3' : 'word_endless_v3'} refreshKey={arcade.revision} />
        <button className={styles.rulesToggle} type="button" aria-expanded={rulesOpen} onClick={() => setRulesOpen(!rulesOpen)}>{rulesOpen ? '收起规则' : '展开规则'}</button>{rulesOpen ? <ol><li>v2 六章和初版草稿各自保留原规则、旧榜与本地进度。</li><li>五个基础字可单字部署；职业字必须组成赵云、关羽、张飞、黄忠或马超。</li><li>局内经费上限 40，只由击败来客和清波补给产生；没有被动产出。</li><li>第 5 章起多入口岔路；催办造成短时射程缩短，故障令一位成员短时停手，提示可见且不遮断操作。</li><li>战利品只在本局生效；无局外商店、账号付费或办公币奖励。</li></ol> : null}
      </aside>
    </div>
  </main>;
}
