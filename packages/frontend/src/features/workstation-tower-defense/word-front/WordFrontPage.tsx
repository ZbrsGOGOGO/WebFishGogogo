import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';
import {
  applyWordFrontAction, createWordFrontState, deployWordFrontUnit, isWordFrontPath, mergeWordFrontUnits,
  recruitWordFrontCards, startWordFront, stepWordFront, wordFrontDrawCost,
  wordFrontHeroForLetters, WORD_FRONT_HEROES, WORD_FRONT_HEIGHT, WORD_FRONT_PATH, WORD_FRONT_WIDTH,
  type WordFrontAction, type WordFrontMode, type WordFrontState,
} from '@stealth-reader/shared';

import { useCommunityAuthStore } from '../../../app/store/community-auth-store';
import { finishArcadeRun, getArcadeLeaderboard, startArcadeRun } from '../../../api/community-arcade';
import { ArcadeAdapterProvider, type ArcadeAdapter } from '../../games/ArcadeAdapter';
import { ArcadeLeaderboard } from '../../games/ArcadeLeaderboard';
import { announceLocalGameForeground, listenForOtherLocalGame } from '../../games/game-input';
import { useArcadeRun } from '../../games/useArcadeRun';
import styles from './WordFrontPage.module.css';

const MODE_LABELS: Record<WordFrontMode, string> = { story: '剧情护送', endless: '无尽值班' };
const CHAPTERS = [
  { id: 1, title: '第一章 · 接到急件', detail: '3 波来客，先熟悉招募与路线。' },
  { id: 2, title: '第二章 · 跨部门通道', detail: '4 波来客，留意漏过的文件。' },
  { id: 3, title: '第三章 · 护送到档案室', detail: '5 波来客，完成本次护送。' },
];

function safeDraft(key: string, mode: WordFrontMode): WordFrontState | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw || raw.length > 256_000) return null;
    const draft: unknown = JSON.parse(raw);
    if (!draft || typeof draft !== 'object') return null;
    const state = draft as Partial<WordFrontState>;
    const integer = (value: unknown, min: number, max: number) => Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
    if (state.version !== 1 || state.mode !== mode || !['ready', 'running', 'won', 'lost'].includes(state.status ?? '') ||
      !Array.isArray(state.hand) || !Array.isArray(state.units) || !Array.isArray(state.enemies) ||
      !integer(state.chapter, 1, 3) || !integer(state.coreHp, 0, 5) || !integer(state.wave, 0, 30) ||
      !integer(state.completedWaves, 0, 30) || !integer(state.kills, 0, 1_000) || !integer(state.score, 0, 100_000) ||
      !integer(state.credits, 0, 100_000) || !integer(state.drawCount, 0, 400) || !integer(state.tick, 0, 3_000) ||
      !integer(state.seed, 0, 0xffff_ffff) || !integer(state.pendingSpawns, 0, 18) || !integer(state.nextEnemyId, 1, 1_000) ||
      typeof state.message !== 'string' || state.message.length > 200 ||
      state.hand.length > 2_000 || !state.hand.every(card => typeof card === 'string' && [...card].length === 1) ||
      state.units.length > 31 || !state.units.every(unit => integer(unit.slot, 0, 47) && !isWordFrontPath(unit.slot) &&
        Object.prototype.hasOwnProperty.call(WORD_FRONT_HEROES, unit.kind) && integer(unit.level, 1, 3)) ||
      new Set(state.units.map(unit => unit.slot)).size !== state.units.length ||
      state.enemies.length > 32 || !state.enemies.every(enemy => integer(enemy.id, 1, 1_000) && integer(enemy.pathIndex, 0, WORD_FRONT_PATH.length - 1) &&
        integer(enemy.hp, 1, 1_000) && integer(enemy.maxHp, 1, 1_000) && integer(enemy.speed, 1, 4))) return null;
    return state as WordFrontState;
  } catch { return null; }
}

export function WordFrontPage(): JSX.Element {
  const [mode, setMode] = useState<WordFrontMode>('story');
  const phase = useCommunityAuthStore(state => state.phase);
  const signedIn = phase === 'active';
  const publicId = useCommunityAuthStore(state => state.phase === 'active' ? state.user?.publicId : null);
  const restoreSession = useCommunityAuthStore(state => state.restoreSession);
  const adapter = useMemo<ArcadeAdapter>(() => ({ signedIn, restoreSession, startRun: startArcadeRun,
    finishRun: finishArcadeRun, getLeaderboard: getArcadeLeaderboard }), [signedIn, restoreSession]);
  if (!signedIn || !publicId) return <main className={styles.page}>
    <h1>文字战线</h1>
    {phase === 'bootstrapping'
      ? <p role="status">正在核对账号，暂不载入本机对局。</p>
      : <p role="status">登录后可开始文字战线；账号进度与排行榜会彼此隔离。<Link to="/login">前往登录</Link></p>}
  </main>;
  return <ArcadeAdapterProvider adapter={adapter}>
    <WordFrontRun key={`${publicId}:${mode}`} mode={mode} publicId={publicId} onModeChange={setMode} />
  </ArcadeAdapterProvider>;
}

function WordFrontRun({ mode, publicId, onModeChange }: { mode: WordFrontMode; publicId: string; onModeChange: (mode: WordFrontMode) => void }): JSX.Element {
  const storageKey = `momo.word-front.v1.${publicId}.${mode}`;
  const [state, setState] = useState<WordFrontState>(() => safeDraft(storageKey, mode) ?? createWordFrontState(mode));
  const stateRef = useRef(state);
  const [chapter, setChapter] = useState(state.chapter);
  const [selectedCards, setSelectedCards] = useState<number[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<number | null>(null);
  const [paused, setPaused] = useState(true);
  const [rankEligible, setRankEligible] = useState(false);
  const [starting, setStarting] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const finishSent = useRef(false);
  const sessionStarted = useRef(false);
  const startRequest = useRef(0);
  const actions = useRef<WordFrontAction[]>([]);
  const alive = useRef(true);
  const gameOwner = useRef(`word-front-${publicId}-${mode}`).current;
  const arcade = useArcadeRun(mode === 'story' ? 'word_story' : 'word_endless');

  useEffect(() => {
    try { window.localStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* Private mode still permits play. */ }
  }, [state, storageKey]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; startRequest.current += 1; }; }, []);
  useEffect(() => {
    const pause = () => setPaused(true);
    const hidden = () => { if (document.hidden) pause(); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') pause(); };
    const off = listenForOtherLocalGame(gameOwner, pause);
    window.addEventListener('blur', pause);
    window.addEventListener('keydown', escape);
    document.addEventListener('visibilitychange', hidden);
    return () => { off(); window.removeEventListener('blur', pause); window.removeEventListener('keydown', escape); document.removeEventListener('visibilitychange', hidden); };
  }, [gameOwner]);
  useEffect(() => {
    if (state.status !== 'running' || paused) return undefined;
    const timer = window.setInterval(() => {
      const next = stepWordFront(stateRef.current);
      stateRef.current = next;
      setState(next);
    }, 850);
    return () => window.clearInterval(timer);
  }, [state.status, paused]);
  useEffect(() => {
    if (!rankEligible || finishSent.current || (state.status !== 'won' && state.status !== 'lost')) return;
    finishSent.current = true;
    void arcade.finish(state.score, { mode, chapter: state.chapter, wave: state.completedWaves,
      kills: state.kills, coreHp: state.coreHp, drawCount: state.drawCount, outcome: state.status,
      finishTick: state.tick, actions: actions.current });
  }, [arcade.finish, mode, rankEligible, state]);

  const chosenHero = selectedCards.length === 2 ? wordFrontHeroForLetters(state.hand[selectedCards[0]!] ?? '', state.hand[selectedCards[1]!] ?? '') : null;
  const active = state.status === 'running';
  function switchMode(next: WordFrontMode): void {
    if (next === mode) return;
    if (rankEligible && !window.confirm('切换模式会保留本机草稿，但当前在线对局无法继续参榜。确定切换吗？')) return;
    setPaused(true);
    onModeChange(next);
  }
  function chooseCard(index: number): void {
    setSelectedUnit(null);
    setSelectedCards(current => current.includes(index) ? current.filter(value => value !== index) : current.length >= 2 ? [index] : [...current, index]);
  }
  function applyAction(action: WordFrontAction): WordFrontState | null {
    const next = applyWordFrontAction(stateRef.current, action);
    if (next) {
      stateRef.current = next;
      setState(next);
      if (rankEligible) actions.current.push(action);
    }
    return next;
  }
  async function recruit(): Promise<void> {
    if (starting || stateRef.current.status === 'won' || stateRef.current.status === 'lost') return;
    setSelectedCards([]);
    if (!sessionStarted.current && stateRef.current.drawCount === 0 && stateRef.current.hand.length === 0) {
      sessionStarted.current = true;
      const request = ++startRequest.current;
      setStarting(true);
      const run = await arcade.begin();
      if (!alive.current || request !== startRequest.current || useCommunityAuthStore.getState().user?.publicId !== publicId) return;
      const key = mode === 'story' ? 'word_story' : 'word_endless';
      const validSeed = run?.gameKey === key && Number.isSafeInteger(run.seed) && run.seed! >= 0 && run.seed! <= 0xffff_ffff;
      const base = createWordFrontState(mode, chapter, validSeed ? run.seed! : stateRef.current.seed);
      const action: WordFrontAction = { tick: 0, type: 'recruit' };
      const next = applyWordFrontAction(base, action);
      if (next) {
        stateRef.current = next;
        setState(next);
        setRankEligible(validSeed);
        actions.current = validSeed ? [action] : [];
      }
      setStarting(false);
      return;
    }
    const action: WordFrontAction = { tick: stateRef.current.tick, type: 'recruit' };
    const next = applyAction(action);
    if (!next) {
      const failed = recruitWordFrontCards(stateRef.current);
      stateRef.current = failed; setState(failed);
    }
  }
  function chooseCell(slot: number): void {
    if (isWordFrontPath(slot)) return;
    const occupied = stateRef.current.units.find(unit => unit.slot === slot);
    if (chosenHero && !occupied) {
      const action: WordFrontAction = { tick: stateRef.current.tick, type: 'deploy', first: selectedCards[0]!, second: selectedCards[1]!, slot };
      if (!applyAction(action)) { const failed = deployWordFrontUnit(stateRef.current, action.first, action.second, slot); stateRef.current = failed; setState(failed); }
      setSelectedCards([]);
      setSelectedUnit(null);
      return;
    }
    if (occupied && selectedUnit !== null && selectedUnit !== slot) {
      const action: WordFrontAction = { tick: stateRef.current.tick, type: 'merge', from: selectedUnit, to: slot };
      if (!applyAction(action)) { const failed = mergeWordFrontUnits(stateRef.current, selectedUnit, slot); stateRef.current = failed; setState(failed); }
      setSelectedUnit(null);
      return;
    }
    setSelectedUnit(occupied ? slot : null);
  }
  function beginRun(): void {
    if (starting) return;
    const action: WordFrontAction = { tick: stateRef.current.tick, type: 'start' };
    const next = applyAction(action);
    if (!next) { const failed = startWordFront(stateRef.current); stateRef.current = failed; setState(failed); return; }
    announceLocalGameForeground(gameOwner);
    finishSent.current = false;
    setPaused(false);
  }
  function resetRun(): void {
    if (active && !window.confirm('当前局会结束；本机草稿将被新局覆盖。确定重开吗？')) return;
    startRequest.current += 1;
    const next = createWordFrontState(mode, chapter, (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
    stateRef.current = next; setState(next);
    actions.current = []; sessionStarted.current = false;
    setSelectedCards([]); setSelectedUnit(null); setPaused(true); setRankEligible(false); setStarting(false); finishSent.current = false;
  }
  const routeProgress = state.enemies.length ? Math.max(...state.enemies.map(enemy => enemy.pathIndex)) + 1 : 0;
  return <main className={styles.page}>
    <header className={styles.header}>
      <div><span className={styles.kicker}>WORKSHEET / WORD FRONT</span><h1>文字战线 · 赵云救阿斗</h1><p>一条隐约可见的文件路线，两字组队、两人合一；原工位塔防仍独立保留。</p></div>
      <nav aria-label="文字战线导航"><Link to="/tower-defense">原工位塔防</Link><Link to="/games">小游戏专区</Link></nav>
    </header>
    <div className={styles.layout}>
      <section className={styles.mainPanel} aria-label="文字战线对局">
        <div className={styles.toolbar}>
          <div className={styles.modes} role="group" aria-label="玩法模式">
            {(Object.keys(MODE_LABELS) as WordFrontMode[]).map(option => <button key={option} type="button" data-active={mode === option} onClick={() => switchMode(option)}>{MODE_LABELS[option]}</button>)}
          </div>
          {mode === 'story' ? <label>章节<select value={chapter} disabled={active || starting || state.drawCount > 0} onChange={event => { const value = Number(event.target.value); const next = createWordFrontState(mode, value); setChapter(value); stateRef.current = next; setState(next); setPaused(true); setRankEligible(false); actions.current = []; sessionStarted.current = false; }}>{CHAPTERS.map(item => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label> : <span className={styles.modeHint}>无尽模式共 30 波，本期单独计榜。</span>}
        </div>
        {mode === 'story' ? <p className={styles.chapterDetail}>{CHAPTERS[chapter - 1]?.detail}</p> : <p className={styles.chapterDetail}>每波来客增多；保住五点核心生命，坚持到第 30 波。</p>}
        <div className={styles.metrics} aria-label="对局数据"><span>生命 <strong>{state.coreHp}/5</strong></span><span>波次 <strong>{state.wave || '未开始'}</strong></span><span>击败 <strong>{state.kills}</strong></span><span>得分 <strong>{state.score}</strong></span><span>局内经费 <strong>{state.credits}</strong></span></div>
        <div className={styles.board} role="group" aria-label="文字战线路线图">
          {Array.from({ length: WORD_FRONT_WIDTH * WORD_FRONT_HEIGHT }, (_, slot) => {
            const pathIndex = WORD_FRONT_PATH.indexOf(slot as typeof WORD_FRONT_PATH[number]);
            const unit = state.units.find(item => item.slot === slot);
            const enemy = pathIndex >= 0 ? state.enemies.filter(item => item.pathIndex === pathIndex) : [];
            const row = Math.floor(slot / WORD_FRONT_WIDTH) + 1, column = slot % WORD_FRONT_WIDTH + 1;
            const label = pathIndex >= 0 ? `${row}行${column}列，文件路线${pathIndex === 0 ? '入口' : pathIndex === WORD_FRONT_PATH.length - 1 ? '核心' : ''}${enemy.length ? `，${enemy.length}名来客` : ''}` : `${row}行${column}列，${unit ? `${WORD_FRONT_HEROES[unit.kind].name}${unit.level}阶` : '空白工位'}`;
            return <button key={slot} type="button" className={styles.cell} data-path={pathIndex >= 0} data-unit={unit?.kind ?? ''} data-selected={selectedUnit === slot} data-front={pathIndex >= 0 && pathIndex < routeProgress} aria-label={label} disabled={pathIndex >= 0} onClick={() => chooseCell(slot)}>
              {unit ? <span className={styles.unit}><b>{WORD_FRONT_HEROES[unit.kind].name}</b><small>{unit.level}阶 · {WORD_FRONT_HEROES[unit.kind].role}</small></span> : pathIndex === 0 ? <span className={styles.pathLabel}>入口</span> : pathIndex === WORD_FRONT_PATH.length - 1 ? <span className={styles.pathLabel}>档案</span> : pathIndex >= 0 ? <span className={styles.pathDot}>·</span> : <span className={styles.emptyCell}>+</span>}
              {enemy.length > 0 ? <span className={styles.enemy} title={`来客血量 ${enemy.map(item => item.hp).join('/')}`}>{enemy.length > 1 ? enemy.length : '●'}</span> : null}
            </button>;
          })}
        </div>
        <p className={styles.routeNote}>文件沿浅色路线进入档案室；相邻工位的角色会自动攻击。先选两张字卡，再点空位部署；点两位同角色同阶成员可二合一。</p>
        <div className={styles.controls}><button type="button" onClick={beginRun} disabled={state.status !== 'ready' || starting}>开始防守</button><button type="button" onClick={() => { announceLocalGameForeground(gameOwner); setPaused(false); }} disabled={!active || !paused}>继续</button><button type="button" onClick={() => setPaused(true)} disabled={!active || paused}>暂停 / Esc</button><button type="button" onClick={resetRun}>新开一局</button></div>
        <p role="status" className={styles.message}>{state.status === 'won' ? '护送成功 · ' : state.status === 'lost' ? '本局结束 · ' : active && paused ? '已暂停 · ' : ''}{state.message}</p>
      </section>
      <aside className={styles.sidePanel} aria-label="招募和编队">
        <div className={styles.sideHeading}><span>01 / 招募</span><h2>字卡工作台</h2><p>每次补入五张单字卡，至少可组出一位成员。价格从 10 点开始，每次增加 2 点。</p></div>
        <button className={styles.recruit} type="button" disabled={starting || state.status === 'won' || state.status === 'lost'} onClick={() => { void recruit(); }}>{starting ? '正在建立可验证对局…' : `招募五张 · ${wordFrontDrawCost(state.drawCount)} 点`}</button>
        <div className={styles.hand} role="group" aria-label="手中字卡">{state.hand.length ? state.hand.map((letter, index) => <button type="button" key={`${index}-${letter}`} data-selected={selectedCards.includes(index)} aria-pressed={selectedCards.includes(index)} onClick={() => chooseCard(index)}>{letter}</button>) : <p>还没有字卡，先招募一次。</p>}</div>
        <p className={styles.combo}>{chosenHero ? <>已组成 <strong>{WORD_FRONT_HEROES[chosenHero].name}</strong> · {WORD_FRONT_HEROES[chosenHero].role}，点击空白工位部署。</> : selectedCards.length === 2 ? '这两个字暂时无法组成成员，换一组试试。' : '选两张字卡，合成赵云、关羽、张飞或诸葛。'}</p>
        <div className={styles.roster}><h3>编队手册</h3>{(Object.keys(WORD_FRONT_HEROES) as Array<keyof typeof WORD_FRONT_HEROES>).map(key => <div key={key}><b>{WORD_FRONT_HEROES[key].letters.join(' + ')}</b><span>{WORD_FRONT_HEROES[key].name}</span><small>{WORD_FRONT_HEROES[key].role}</small></div>)}</div>
        <div className={styles.ranking}><h3>独立成绩</h3><p>剧情与无尽分榜；旧工位塔防成绩、存档及办公币均不受影响。本期不发放办公币奖励。在线资格需在当前页面完成，刷新或切页后可续玩本机草稿，但不再参榜。</p>{state.drawCount > 0 && !rankEligible ? <p>本局为恢复或离线的本机草稿，不会提交在线榜；新开局取得服务端种子后才可参榜。</p> : null}{arcade.notice ? <p role="status">{arcade.notice}</p> : null}<ArcadeLeaderboard gameKey={mode === 'story' ? 'word_story' : 'word_endless'} refreshKey={arcade.revision} /></div>
        <button className={styles.rulesToggle} type="button" aria-expanded={showRules} onClick={() => setShowRules(value => !value)}>{showRules ? '收起规则' : '展开规则'}</button>
        {showRules ? <ol className={styles.rules}><li>每次招募五张字卡，消耗局内经费，不扣账号办公币。</li><li>选两字召唤成员，放在文件路线旁；同角色同阶的两位成员可合并升阶，最高三阶。</li><li>每漏过一名来客扣 1 点核心生命；五点耗尽即结束。</li><li>结束后按守住波次、击败数和剩余生命结算得分。</li></ol> : null}
      </aside>
    </div>
  </main>;
}
