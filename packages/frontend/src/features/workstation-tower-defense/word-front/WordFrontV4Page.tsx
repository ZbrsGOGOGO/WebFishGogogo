import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';
import {
  applyWordFrontV4Action, createWordFrontV4State, stepWordFrontV4,
  wordFrontV4DrawCost, wordFrontV4HeroForLetters, wordFrontV4Terrain, wordFrontV4UnitForLetter,
  WORD_FRONT_V4_GEARS, WORD_FRONT_V4_HEIGHT, WORD_FRONT_V4_MAPS, WORD_FRONT_V4_UNITS, WORD_FRONT_V4_WIDTH,
  type WordFrontMode, type WordFrontV4Action, type WordFrontV4Gear, type WordFrontV4State, type WordFrontV4UnitKind,
} from '@stealth-reader/shared';
import { useCommunityAuthStore } from '../../../app/store/community-auth-store';
import { COMMUNITY_FEATURE_FLAGS } from '../../../app/community-nav';
import { buyWordFrontCosmetic, finishArcadeRun, getArcadeLeaderboard, getWordFrontProgress, startArcadeRun, type WordFrontProgress } from '../../../api/community-arcade';
import { ArcadeAdapterProvider, type ArcadeAdapter } from '../../games/ArcadeAdapter';
import { ArcadeLeaderboard } from '../../games/ArcadeLeaderboard';
import { announceLocalGameForeground, listenForOtherLocalGame } from '../../games/game-input';
import { useArcadeRun } from '../../games/useArcadeRun';
import styles from './WordFrontV4Page.module.css';

const MODES: Record<WordFrontMode, string> = { story: '长坂坡战役', endless: '无尽军阵' };
const ENEMY: Record<string, string> = { bandit: '贼', blade: '刀', spear: '枪', bow: '弓', cavalry: '骑', shield: '盾', elite: '精', boss: '将' };
const integer = (value: unknown, min: number, max: number): boolean => Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
function restore(key: string, mode: WordFrontMode): WordFrontV4State | null {
  try {
    const raw = localStorage.getItem(key); if (!raw || raw.length > 160_000) return null; const value = JSON.parse(raw) as Partial<WordFrontV4State>;
    if (value.version !== 4 || value.mode !== mode || !integer(value.mapId,1,3) || !integer(value.tick,0,5_000) || !integer(value.coreHp,0,20) ||
      !Array.isArray(value.hand) || value.hand.length > 150 || !Array.isArray(value.units) || value.units.length > 50 || !Array.isArray(value.enemies) || value.enemies.length > 40 ||
      !value.pool || typeof value.pool !== 'object' || !['ready','running','won','lost'].includes(value.status ?? '')) return null;
    return value as WordFrontV4State;
  } catch { return null; }
}

export function WordFrontV4Page(): JSX.Element {
  const [mode, setMode] = useState<WordFrontMode>('story');
  const phase = useCommunityAuthStore(state => state.phase), publicId = useCommunityAuthStore(state => state.phase === 'active' ? state.user?.publicId : null);
  const restoreSession = useCommunityAuthStore(state => state.restoreSession);
  const adapter = useMemo<ArcadeAdapter>(() => ({ signedIn: phase === 'active', restoreSession,
    startRun: (gameKey, mapId) => startArcadeRun(gameKey, 4, mapId), finishRun: finishArcadeRun, getLeaderboard: getArcadeLeaderboard }), [phase, restoreSession]);
  if (!publicId) return <main className={styles.page}><h1>赵云救阿斗</h1><p role="status">{phase === 'bootstrapping' ? '正在核对账号…' : <>登录后进入长坂坡。<Link to="/login">前往登录</Link></>}</p></main>;
  return <ArcadeAdapterProvider adapter={adapter}><V4Run key={`${publicId}:${mode}`} publicId={publicId} mode={mode} onModeChange={setMode} /></ArcadeAdapterProvider>;
}

function V4Run({ publicId, mode, onModeChange }: { publicId: string; mode: WordFrontMode; onModeChange: (mode: WordFrontMode) => void }): JSX.Element {
  const key = `momo.word-front.v4.${publicId}.${mode}`;
  const [state, setState] = useState<WordFrontV4State>(() => restore(key, mode) ?? createWordFrontV4State(mode));
  const ref = useRef(state), actions = useRef<WordFrontV4Action[]>([]), started = useRef(false), finished = useRef(false), alive = useRef(true);
  const [mapId, setMapId] = useState(state.mapId), [cards, setCards] = useState<number[]>([]), [unitSlot, setUnitSlot] = useState<number | null>(null);
  const [paused, setPaused] = useState(true), [eligible, setEligible] = useState(false), [starting, setStarting] = useState(false), [rules, setRules] = useState(false);
  const [progress,setProgress]=useState<WordFrontProgress|null>(null),[progressBusy,setProgressBusy]=useState(false);
  const owner = useRef(`word-front-v4-${publicId}-${mode}`).current;
  const arcade = useArcadeRun(mode === 'story' ? 'word_story_v4' : 'word_endless_v4');
  useEffect(()=>{let live=true;getWordFrontProgress().then(value=>{if(live)setProgress(value)}).catch(()=>{});return()=>{live=false}},[arcade.revision]);
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* bounded local fallback */ } }, [key, state]);
  useEffect(() => () => { alive.current = false; }, []);
  useEffect(() => { const pause = () => setPaused(true), hidden = () => { if (document.hidden) pause(); }, off = listenForOtherLocalGame(owner, pause);
    addEventListener('blur', pause); document.addEventListener('visibilitychange', hidden); return () => { off(); removeEventListener('blur', pause); document.removeEventListener('visibilitychange', hidden); }; }, [owner]);
  useEffect(() => { if (state.status !== 'running' || paused) return; const timer = setInterval(() => { const next = stepWordFrontV4(ref.current); ref.current = next; setState(next); }, 850); return () => clearInterval(timer); }, [paused, state.status]);
  useEffect(() => { if (!eligible || finished.current || state.status !== 'won' && state.status !== 'lost') return; finished.current = true;
    void arcade.finish(state.score, { mode, chapter: state.mapId, wave: state.completedWaves, kills: state.kills, coreHp: state.coreHp, drawCount: state.drawCount,
      outcome: state.status, finishTick: state.tick, actions: actions.current }); }, [arcade.finish, eligible, mode, state]);
  const map = WORD_FRONT_V4_MAPS[state.mapId - 1]!, selected: WordFrontV4UnitKind | null = cards.length === 2 ? wordFrontV4HeroForLetters(state.hand[cards[0]!] ?? '', state.hand[cards[1]!] ?? '') : cards.length === 1 ? wordFrontV4UnitForLetter(state.hand[cards[0]!] ?? '') : null;
  const set = (next: WordFrontV4State) => { ref.current = next; setState(next); };
  const apply = (action: WordFrontV4Action) => { const next = applyWordFrontV4Action(ref.current, action); if (!next) return false; set(next); if (eligible) actions.current.push(action); return true; };
  async function recruit() {
    setCards([]); if (!started.current && ref.current.drawCount === 0) {
      started.current = true; setStarting(true); let run: Awaited<ReturnType<typeof startArcadeRun>> | null = null; try { run = await arcade.beginForChapter(mode === 'story' ? mapId : 1); } catch { /* local play */ }
      if (!alive.current || useCommunityAuthStore.getState().user?.publicId !== publicId) return; const gameKey = mode === 'story' ? 'word_story_v4' : 'word_endless_v4';
      const verified = run?.gameKey === gameKey && run.rulesVersion === 4 && integer(run.seed,0,0xffff_ffff) && integer(run.chapter,1,mode === 'story' ? 3 : 1) && Date.parse(run.expiresAt) - Date.now() >= 5 * 60_000;
      const bound = verified ? run!.chapter! : mapId, base = createWordFrontV4State(mode,bound,verified ? run!.seed : ref.current.seed), first: WordFrontV4Action = { tick: 0, type: 'recruit' }, next = applyWordFrontV4Action(base,first)!;
      set(verified && bound !== mapId ? { ...next, message: `继续服务器中的第 ${bound} 张地图，当前对局地图已固定。` } : next); setMapId(bound); setEligible(verified); actions.current = verified ? [first] : []; setStarting(false); return;
    }
    if (!apply({ tick: ref.current.tick, type: 'recruit' })) set({ ...ref.current, message: `包子不足或卡池耗尽，下次征兵需要 ${wordFrontV4DrawCost(ref.current.drawCount)}。` });
  }
  function choose(slot: number) {
    const terrain = wordFrontV4Terrain(ref.current,slot); if (terrain === 'grass') { if (!apply({ tick: ref.current.tick,type:'unlock',slot })) set({ ...ref.current,message:'需要铲子开垦草障。' }); return; }
    if (terrain === 'path' || terrain === 'obstacle') return; const occupied = ref.current.units.find(unit => unit.slot === slot);
    if (selected && !occupied) { const action: WordFrontV4Action = cards.length === 2 ? { tick:ref.current.tick,type:'deploy_hero',first:cards[0]!,second:cards[1]!,slot } : { tick:ref.current.tick,type:'deploy_basic',card:cards[0]!,slot }; apply(action); setCards([]); setUnitSlot(null); return; }
    if (occupied && unitSlot !== null && unitSlot !== slot) { if (!apply({ tick:ref.current.tick,type:'merge',from:unitSlot,to:slot })) set({ ...ref.current,message:'只可合并同角色、同等级单位，最高五级。' }); setUnitSlot(null); return; } setUnitSlot(occupied ? slot : null);
  }
  function reset() { if (state.status === 'running' && !confirm('确定放弃当前本机对局吗？')) return; const next = createWordFrontV4State(mode,mapId,(Date.now() ^ Math.floor(Math.random()*0x7fffffff))>>>0); set(next); actions.current=[]; started.current=false; finished.current=false; setEligible(false); setPaused(true); setCards([]); }
  const remaining = Object.values(state.pool).reduce((a,b)=>a+b,0);
  return <main className={styles.page} data-ledger-theme={progress?.unlocks.includes('ledger_theme') || undefined} data-zhaoyun-frame={progress?.unlocks.includes('zhaoyun_frame') || undefined}>
    <header className={styles.header}><div><span>PROJECT / CHANGBAN</span><h1>赵云救阿斗</h1><p>十行军阵、消耗型卡池与十二武将；安静工作台外观，战斗信息集中在一屏。</p></div><nav><Link to="/tower-defense">工位塔防</Link><Link to="/tower-defense/word-front/v3">V3 旧版</Link>{COMMUNITY_FEATURE_FLAGS.wordFrontRooms ? <Link to="/tower-defense/word-front/rooms">玩家房间</Link> : null}<Link to="/tower-defense/word-front/maps">地图设计</Link><Link to="/games">小游戏</Link></nav></header>
    <div className={styles.layout}><section className={styles.battle} aria-label="赵云救阿斗对局">
      <div className={styles.toolbar}><div role="group" aria-label="玩法模式">{(Object.keys(MODES) as WordFrontMode[]).map(value=><button key={value} aria-pressed={mode===value} data-active={mode===value} onClick={()=>{ setPaused(true); onModeChange(value); }}>{MODES[value]}</button>)}</div><label>地图<select aria-label="地图" value={mapId} disabled={state.status==='running'||state.drawCount>0||starting} onChange={event=>{ const id=Number(event.target.value);setMapId(id);set(createWordFrontV4State(mode,id));started.current=false;setEligible(false); }}>{WORD_FRONT_V4_MAPS.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
      <div className={styles.mapIntro}><strong>{map.name}</strong><span>{map.description}</span><span>{mode==='story'?'20 波标准局':'40 波无尽局'}</span></div>
      <div className={styles.metrics}><span>阿斗<strong>{state.coreHp}/20</strong></span><span>波次<strong>{state.wave||'待命'}</strong></span><span>击败<strong>{state.kills}</strong></span><span>得分<strong>{state.score}</strong></span><span>包子<strong>{state.buns}/80</strong></span><span>金币<strong>{state.gold}</strong></span><span>卡池<strong>{remaining}</strong></span><span>铲子<strong>{state.shovels}</strong></span></div>
      <div className={styles.viewport}><div className={styles.board} role="group" aria-label="长坂坡十行地图">{Array.from({length:WORD_FRONT_V4_WIDTH*WORD_FRONT_V4_HEIGHT},(_,slot)=>{ const terrain=wordFrontV4Terrain(state,slot),unit=state.units.find(value=>value.slot===slot),enemies=state.enemies.filter(value=>map.path[value.pathIndex]===slot),entrance=map.path[0]===slot,core=map.path.at(-1)===slot; return <button key={slot} type="button" className={styles.cell} data-terrain={terrain} data-grade={unit ? WORD_FRONT_V4_UNITS[unit.kind].grade : ''} data-selected={unitSlot===slot} disabled={terrain==='path'||terrain==='obstacle'} aria-label={`${Math.floor(slot/8)+1}行${slot%8+1}列，${unit?`${WORD_FRONT_V4_UNITS[unit.kind].name}${unit.level}级`:terrain==='path'?'兵道':terrain==='grass'?'草障':terrain==='obstacle'?'障碍':terrain==='buff'?'军旗位':'空地'}${enemies.length?`，敌军${enemies.length}`:''}`} onClick={()=>choose(slot)}>{unit?<><b>{WORD_FRONT_V4_UNITS[unit.kind].glyph}</b><small>Lv.{unit.level}{unit.gear?' · 神兵':''}</small></>:entrance?'兵':core?'斗':terrain==='path'?'·':terrain==='grass'?'草':terrain==='obstacle'?'障':terrain==='buff'?'旗':'+'}{enemies.length?<i title={enemies.map(value=>`${ENEMY[value.kind]} ${value.hp}/${value.maxHp}`).join('、')}>{enemies.length>1?enemies.length:ENEMY[enemies[0]!.kind]}</i>:null}</button>})}</div></div>
      <p className={styles.help}>选择一张兵种字或两张武将字，再点空地部署；相同单位同级合并，最高五级。草障需铲子，军旗位增伤。窄屏可横向滑动。</p>
      <div className={styles.controls}><button disabled={state.status!=='ready'||starting} onClick={()=>{ if (!apply({tick:ref.current.tick,type:'start'})) { set({...ref.current,message:'先征兵并部署至少一个单位。'});return; } announceLocalGameForeground(owner);setPaused(false); }}>开始出兵</button><button disabled={state.status!=='running'||!paused} onClick={()=>{announceLocalGameForeground(owner);setPaused(false)}}>继续</button><button disabled={state.status!=='running'||paused} onClick={()=>setPaused(true)}>收起动静</button><button onClick={reset}>新开一局</button></div><p role="status" className={styles.message}>{paused&&state.status==='running'?'画面已暂停，点击继续恢复。':state.message}</p>
    </section><aside className={styles.side} aria-label="征兵与神兵">
      <h2>征兵台</h2><button className={styles.recruit} disabled={starting||state.buns<wordFrontV4DrawCost(state.drawCount)||state.status==='won'||state.status==='lost'} onClick={()=>void recruit()}>征兵五张 · {wordFrontV4DrawCost(state.drawCount)} 包子</button>
      <div className={styles.hand} role="group" aria-label="手中字卡">{state.hand.length?state.hand.map((letter,index)=><button key={`${index}-${letter}`} aria-label={`第 ${index+1} 张字卡：${letter}`} aria-pressed={cards.includes(index)} data-selected={cards.includes(index)} onClick={()=>{setUnitSlot(null);setCards(value=>value.includes(index)?value.filter(item=>item!==index):value.length===2?[index]:[...value,index])}}>{letter}</button>):<p>暂无字卡，先征兵一次。</p>}</div><p>{selected?`已选：${WORD_FRONT_V4_UNITS[selected].name}`:cards.length?'双字尚未组成武将。':'兵种单字可直接部署；武将需两字配对。'}</p>
      <h3>神秘商人</h3><div className={styles.merchant}><button disabled={state.status!=='running'||state.gold<12||state.attackBoost>=3} onClick={()=>apply({tick:ref.current.tick,type:'buy_boost',boost:'attack'})}>全队攻击 +15% · 12 金</button><button disabled={state.status!=='running'||state.gold<12||state.coreHp>=20} onClick={()=>apply({tick:ref.current.tick,type:'buy_boost',boost:'heal'})}>阿斗 +5 生命 · 12 金</button><button disabled={state.status!=='running'||state.gold<18||state.heroRateBoost} onClick={()=>apply({tick:ref.current.tick,type:'buy_boost',boost:'hero_rate'})}>招贤榜 · 18 金</button></div>
      <h3>本局神兵</h3>{state.gear.length?<ul className={styles.gear}>{state.gear.map((gear:WordFrontV4Gear)=><li key={gear}><div><strong>{WORD_FRONT_V4_GEARS[gear].name}</strong><small>{WORD_FRONT_V4_GEARS[gear].description}</small></div><button disabled={!state.units.some(unit=>unit.kind===WORD_FRONT_V4_GEARS[gear].hero)} onClick={()=>apply({tick:ref.current.tick,type:'equip_gear',gear})}>装备</button></li>)}</ul>:<p>击败首领有机会获得神兵。</p>}
    </aside><aside className={styles.ranking} aria-label="赵云救阿斗排行与规则">{progress?<section className={styles.progress}><h2>战功档案 {progress.unlocks.includes('changban_badge')?<span className={styles.collectible}>长坂徽记</span>:null}</h2><p><strong>{progress.merit}</strong> 战功 · {progress.wins}胜/{progress.losses}负</p><small>今日 {progress.dailyEarned}/{progress.dailyCap}；仅服务器验真的 V4 对局结算，与办公币分离。</small>{progress.shop.map(item=><button key={item.id} disabled={item.owned||progressBusy||progress.merit<item.cost} title={item.description} onClick={()=>{setProgressBusy(true);buyWordFrontCosmetic(item.id).then(setProgress).finally(()=>setProgressBusy(false))}}>{item.owned?`已收藏 · ${item.name}`:`${item.name} · ${item.cost}`}</button>)}</section>:null}<ArcadeLeaderboard gameKey={mode==='story'?'word_story_v4':'word_endless_v4'} refreshKey={arcade.revision} /><button onClick={()=>setRules(value=>!value)}>{rules?'收起规则':'完整规则'}</button>{rules?<div><p>V4 与旧榜分开；服务器用种子和动作轨迹完整重放后才收分。</p><p>只使用局内包子与金币；战功只换展示收藏，不接付费、不加战力。</p><p>原型依据 MIT 仓库的玩法数据重新实现；账号、权限和结算均为本站代码。</p></div>:null}{arcade.notice?<p className={styles.local}>{arcade.notice}</p>:null}{!eligible&&state.drawCount>0?<p className={styles.local}>当前为本机演练，不提交排行榜。</p>:null}</aside></div>
  </main>;
}
