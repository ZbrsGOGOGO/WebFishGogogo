import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';
import { WORKSTATION_CHAPTERS, WORKSTATION_JOBS, WORKSTATION_PROMOTIONS, TOWER_DEFINITIONS, OFFICE_COLLECTION, type WorkstationCommand, type WorkstationJob, type WorkstationMode, type WorkstationOverview } from '@stealth-reader/shared';
import { CommunityApiError, getCommunitySessionGeneration } from '../../api/community-http';
import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import { WorkstationTowerDefensePage, type WorkstationTowerDefenseCharacter } from './WorkstationTowerDefensePage';
import { WorkstationTalentPlan } from './WorkstationTalentPlan';
import { workstationApi, type WorkstationRanking } from './workstation-api';
import styles from './WorkstationCampaignPage.module.css';

const MODES: Record<WorkstationMode,string> = { story: '剧情任务', endless: '无尽值班', extreme: '极限资格' };
const ACHIEVEMENTS: Record<string,string> = { tower_first_three:'三星首次',tower_perfect:'零失误通关',tower_speed:'20 秒急速',tower_overtime:'加班到天明',tower_score_10000:'摸鱼值破万' };
const ERRORS: Record<string,string> = {
  WORKSTATION_RUN_ACTIVE:'还有未结束的任务，请继续当前存档，或明确结束本局。', WORKSTATION_REVISION_CONFLICT:'进度已变化，已同步最新存档；请再操作一次。',
  WORKSTATION_CATCHUP_REQUIRED:'正在补算离线战报，完成后可以继续操作。', WORKSTATION_TALENT_POINTS:'可用天赋点不足。',
  WORKSTATION_TALENTS_CONFLICT:'另一页面已更新天赋方案；请核对服务端已保存方案，必要时同步存档，再载入后重新分配。', WORKSTATION_NUMBER_INVALID:'数值无效；天赋每系须为 0–5 的整数，请核对后重试。',
  WORKSTATION_TALENTS_NEXT_RUN:'请先结束当前局，天赋调整从下一局生效。', WORKSTATION_CAMPAIGN_DISABLED:'正式任务暂在维护，存档保留，可前往本地练习。',
  WORKSTATION_CHAPTER_LOCKED:'请先完成前一章节。', COMMUNITY_WRITES_DISABLED:'网站当前为只读维护，已有存档保留。',
};
function errorMessage(error: unknown): string {
  const code = error instanceof CommunityApiError && error.body && typeof error.body === 'object' && 'code' in error.body ? String(error.body.code) : '';
  return ERRORS[code] ?? '连接未完成，未假定操作成功。请同步存档后重试。';
}
async function copyBattleReport(text:string,notice:(value:string)=>void):Promise<void>{
  if(!navigator.clipboard?.writeText){notice('当前浏览器不支持剪贴板，可直接截图这张战报卡片。');return;}
  try{await navigator.clipboard.writeText(text);notice('战报文字已复制，可粘贴到公司或故事区；也可直接截取本卡片。');}
  catch{notice('浏览器不允许剪贴板，可直接截图这张战报卡片。');}
}

export function WorkstationCampaignPage({ character }: { character?: WorkstationTowerDefenseCharacter }): JSX.Element {
  const auth = useCommunityAuthStore();
  // Session changes discard private snapshots, queued intents and unsaved plans.
  // Menu/sidebar renders leave this key stable and never restart the game.
  return <WorkstationCampaignContent key={`${auth.user?.publicId ?? 'guest'}:${getCommunitySessionGeneration()}`} character={character} />;
}

function WorkstationCampaignContent({ character }: { character?: WorkstationTowerDefenseCharacter }): JSX.Element {
  const [view,setView] = useState<WorkstationOverview|null>(null);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [busy,setBusy] = useState(false);
  const [dashboard,setDashboard] = useState(true);
  const [job,setJob] = useState<WorkstationJob>('specialist');
  const [mode,setMode] = useState<WorkstationMode>('story');
  const viewRef = useRef(view); viewRef.current = view;
  const locked = useRef(false), alive = useRef(true);
  useEffect(() => {
    alive.current = true; const controller = new AbortController(); const generation = getCommunitySessionGeneration();
    void workstationApi.overview(controller.signal).then((next)=> { if (alive.current && generation === getCommunitySessionGeneration()) { setView(next); } }).catch((err:unknown)=> { if (!controller.signal.aborted && alive.current && generation === getCommunitySessionGeneration()) setError(errorMessage(err)); });
    return ()=>{alive.current=false;controller.abort();};
  },[]);
  const mutate = useCallback(async (operation: ()=>Promise<WorkstationOverview>, quiet = false): Promise<boolean> => {
    if (locked.current) return false;
    locked.current=true; if (!quiet) setBusy(true);
    const generation=getCommunitySessionGeneration();
    try {
      const next=await operation();
      if (!alive.current || generation !== getCommunitySessionGeneration()) return false;
      viewRef.current=next;setView(next);setError('');
      if (next.run?.state.lastAction && !quiet) setNotice(next.run.state.lastAction.message);
      return true;
    } catch(err) {
      if (alive.current && generation===getCommunitySessionGeneration()) {
        setError(errorMessage(err));
        try { const next=await workstationApi.overview(); if(alive.current && generation===getCommunitySessionGeneration()){viewRef.current=next;setView(next);} } catch { /* Keep the verified old snapshot and a visible error. */ }
      }
      return false;
    } finally { locked.current=false;if(alive.current)setBusy(false); }
  },[]);
  const queued = useRef<{runId:string;command:WorkstationCommand}[]>([]);
  const send = useCallback((command:WorkstationCommand):void=>{const run=viewRef.current?.run;if(!run||['won','lost'].includes(run.state.status))return;queued.current.push({runId:run.id,command});if(queued.current.length>12)queued.current.shift();},[]);
  useEffect(()=>{
    const timer=window.setInterval(()=>{
      const snapshot=viewRef.current;
      if(!snapshot?.writesEnabled || locked.current)return;
      queued.current=queued.current.filter(item=>item.runId===snapshot.run?.id&&!['won','lost'].includes(snapshot.run.state.status));
      const item=queued.current.shift();
      if(item && snapshot.run){void mutate(()=>workstationApi.command(snapshot.run!.id,snapshot.run!.revision,item.command));return;}
      if(snapshot.run && ['running','intermission'].includes(snapshot.run.state.status))void mutate(()=>workstationApi.sync(),true);
    },350);
    return()=>window.clearInterval(timer);
  },[mutate]);
  const profile=view?.profile, run=view?.run;
  const active=Boolean(run && !['won','lost'].includes(run.state.status));
  async function start(chapter:number):Promise<void>{
    if(await mutate(()=>workstationApi.start({requestId:crypto.randomUUID(),chapter,mode,job})))setDashboard(false);
  }
  if (!view || !profile) return <main className={styles.page}><h1>工位任务台</h1><p role="status">{error || '正在读取你的存档…'}</p><Link to="/tower-defense/practice">先去本地练习</Link></main>;
  const appearance=OFFICE_COLLECTION.find(item=>item.id===view.appearance?.equipped);
  return <div className={styles.page} data-office-appearance={appearance?.id} style={appearance?{'--office-appearance':appearance.color} as React.CSSProperties:undefined}>
    <header className={styles.heading}><div><span>WORKSPACE · 私人任务簿</span><h1>工位任务台</h1><p>六章故事 · 四种职业 · 服务器保存，随时放下。</p></div><nav aria-label="工位任务导航"><button type="button" onClick={()=>setDashboard(true)}>任务总览</button><Link to="/tower-defense/leaderboard">正式排行榜</Link><Link to="/tower-defense/practice">本地练习</Link></nav></header>
    {error?<p className={styles.error} role="alert">{error}</p>:null}{notice?<p role="status">{notice}</p>:null}
    {!view.writesEnabled?<p role="status">正式任务当前只读，已有记录仍可查看。</p>:null}
    {appearance?<p className={styles.appearance}>已装备：{appearance.name} · 仅外观，不改变战力</p>:null}
    {run?.catchupPending?<p role="status">正在按服务器时间整理离线战报，不会消耗账号办公币。</p>:null}
    {dashboard?<>
      <section className={styles.career} aria-label="升职进度"><div><span>当前职位</span><h2>{WORKSTATION_PROMOTIONS[profile.promotionTier]?.name}</h2><p>职位经验 {profile.experience} · 工位 {Math.min(9,6+Math.floor(profile.promotionTier/2))}/9</p></div><div><progress aria-label="升职进度" value={profile.experience} max={WORKSTATION_PROMOTIONS[profile.promotionTier+1]?.experience ?? Math.max(9000,profile.experience)}/><p>{WORKSTATION_PROMOTIONS[profile.promotionTier+1] ? `下一职级：${WORKSTATION_PROMOTIONS[profile.promotionTier+1]!.name} · ${WORKSTATION_PROMOTIONS[profile.promotionTier+1]!.experience} 经验` : '全部职位已解锁，不扣取其他同事资产'}</p></div></section>
      {run?<section className={styles.resume}><div><h2>{active?'你有一份进行中的任务':'最近战报'}</h2><p>{MODES[run.state.campaign?.mode ?? 'story']} · 第 {run.state.wave} 波 · {run.state.score} 分 · {active?'存档已保留':run.state.status==='won'?'守卫成功':'本局结束'}</p></div><button type="button" onClick={()=>setDashboard(false)}>{active?'继续这份存档':'查看棋盘与战报'}</button>{active?<button type="button" disabled={busy||!view.writesEnabled} onClick={()=>{void mutate(()=>workstationApi.command(run.id,run.revision,{type:'abandon'}));}}>结束本局（按败局结算）</button>:null}<button type="button" disabled={busy||!view.writesEnabled} onClick={()=>{void mutate(()=>workstationApi.formation()).then(ok=>{if(ok)setNotice('阵型蓝图已保存；下局仍需自己购买零件，不会免费生成防御塔。');});}}>保存阵型蓝图</button></section>:null}
      <section className={styles.options} aria-label="职业与模式"><label>任务模式<select value={mode} onChange={e=>setMode(e.target.value as WorkstationMode)}>{Object.entries(MODES).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>守卫职业<select value={job} onChange={e=>setJob(e.target.value as WorkstationJob)}>{Object.entries(WORKSTATION_JOBS).map(([key,value])=><option key={key} value={key}>{value.name}</option>)}</select></label><p>{WORKSTATION_JOBS[job].passive}；{WORKSTATION_JOBS[job].active}</p>{mode==='extreme'?<p>极限资格：首轮必须零漏怪且已部署三星主力，否则直接失败。不改变剧情模式的轻松入门。</p>:null}{mode==='endless'?<p>经营与突袭交替递增，本局最多 60 波；退出后只回放当前局，不自动重开。</p>:null}</section>
      <section className={styles.chapters} aria-label="剧情章节">{WORKSTATION_CHAPTERS.map(chapter=><article key={chapter.id}><span>任务 {String(chapter.id).padStart(2,'0')}</span><h2>{chapter.title}</h2><p>{chapter.story}</p><button type="button" disabled={active||busy||!view.writesEnabled||chapter.id>profile.unlockedChapter} onClick={()=>{void start(chapter.id);}}>{chapter.id>profile.unlockedChapter?'完成前章后解锁':'建立本章任务'}</button></article>)}</section>
      <WorkstationTalentPlan saved={profile.talents} points={profile.talentPoints} currentRun={active ? run?.state.campaign?.talents : undefined} writesEnabled={view.writesEnabled} busy={busy} onSave={input=>mutate(()=>workstationApi.talents(input))} onReload={()=>mutate(()=>workstationApi.overview())} />
      <section className={styles.records}><h2>个人回忆</h2><p>正式最高 {profile.stats.bestScore} 分 · {profile.stats.wins} 次胜利 · 最高连胜 {profile.stats.bestStreak}</p><div>{Object.entries(ACHIEVEMENTS).map(([key,name])=><span key={key} data-unlocked={profile.stats.achievements.includes(key)}>{profile.stats.achievements.includes(key)?'✓':'○'} {name}</span>)}</div>{profile.formation.length?<p>已存阵型：{profile.formation.map(x=>`${x.slotIndex+1}号位 ${TOWER_DEFINITIONS[x.type].name}`).join('、')}</p>:null}</section>
      <section className={styles.reports}><h2>近期战报 · 可截图分享</h2>{view.reports.length?view.reports.map(report=><article key={report.id}><div><h3>{MODES[report.mode]} · 第 {report.chapter} 章</h3><small>{new Date(report.settledAt).toLocaleString('zh-CN')}</small></div><p>{report.score} 分 · 守住 {report.successfulWaves} 波 · 最高 {report.stars} 星 · 连胜 {report.streak}</p><strong>到账 {report.coins} 办公币</strong><progress aria-label="与个人最高分对比" value={report.score} max={Math.max(1,profile.stats.bestScore)}/><p>{profile.stats.bestScore===report.score?'已达到个人最高':`距个人最高还差 ${Math.max(0,Math.round((1-report.score/Math.max(1,profile.stats.bestScore))*100))}%`}</p><p>{report.formation.map(tower=>`${tower.slotIndex+1}号位 ${TOWER_DEFINITIONS[tower.type].name}${'★'.repeat(tower.level)}`).join(' · ')||'未部署防御塔'}</p><button type="button" onClick={()=>{const text=`我的摸摸公司工位战报：${MODES[report.mode]}第${report.chapter}章，${report.score}分，${report.successfulWaves}波，${report.stars}星。阵型：${report.formation.map(t=>`${t.slotIndex+1}号位${TOWER_DEFINITIONS[t.type].name}${t.level}阶`).join('、')}。${window.location.origin}/tower-defense`;void copyBattleReport(text,setNotice);}}>复制分享战报</button></article>):<p>完成第一份任务后，这里会留下服务器确认的战报。</p>}</section>
      <details className={styles.rules}><summary>存档与结算规则</summary><p>{view.rules}</p><p>天赋与经验每日最多前 12 局获得成长奖励，不限制继续练习；皮肤和局内稀有闪光均不提供付费战力。</p></details>
    </>:run?<WorkstationTowerDefensePage character={character} session={{state:run.state,pending:busy||!view.writesEnabled,onCommand:send,onRestart:()=>setDashboard(true)}}/>:null}
  </div>;
}

export function WorkstationLeaderboardPage():JSX.Element{
  const [mode,setMode]=useState<WorkstationMode>('story'),[ranking,setRanking]=useState<WorkstationRanking|null>(null),[error,setError]=useState('');
  useEffect(()=>{const controller=new AbortController();setRanking(null);void workstationApi.leaderboard(mode,undefined,controller.signal).then(setRanking).catch((err:unknown)=>{if(!controller.signal.aborted)setError(errorMessage(err));});return()=>controller.abort();},[mode]);
  return <main className={styles.page}><header className={styles.heading}><div><h1>工位防守正式榜</h1><p>服务器验证的成绩，按模式独立排名；本地练习分不导入。</p></div><Link to="/tower-defense">返回工位任务</Link></header><label>排行榜模式<select value={mode} onChange={e=>setMode(e.target.value as WorkstationMode)}>{Object.entries(MODES).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></label>{error?<p role="alert">{error}</p>:null}<p>{ranking?.date} · 每日冠军 {ranking?.dailyChampionCoins ?? 12} 办公币，次日结算</p><ol className={styles.ranking}>{ranking?.items.map(item=><li key={item.publicId}><b>{item.rank}</b><span>{item.displayName}</span><strong>{item.score} 分</strong><small>{item.waves} 波 / {item.streak} 连胜</small></li>)}</ol>{ranking&&!ranking.items.length?<p>今天尚无正式战报，完成一局即可参与。</p>:null}</main>;
}
