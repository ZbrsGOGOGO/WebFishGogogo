import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { OFFICE_COLLECTION, OFFICE_STORY_STARTERS, OFFICE_TITLES, type OfficeHubOverview, type OfficeSpyView, type OfficeStory, type OfficeStroke } from '@stealth-reader/shared';
import { officeHubApi, officeHubError } from '../../api/office-hub';
import { getCommunitySessionGeneration } from '../../api/community-http';
import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import { CommunityGuildPanel } from '../office-battle/CommunityGuildPanel';
import { OfficeBossDailyPanel } from './OfficeBossDailyPanel';
import { OfficeDrawingPanel } from './OfficeDrawingPanel';
import styles from './OfficeHubPage.module.css';
type Tab = 'company' | 'collection' | 'stories' | 'drawings' | 'spy' | 'boss';
type Command = (action: string, data?: Record<string, unknown>) => Promise<boolean>;
const TABS: Array<[
    Tab,
    string
]> = [['company', '我的公司'], ['collection', '每日收藏'], ['stories', '故事接龙'], ['drawings', '异步猜画'], ['spy', '描述墙'], ['boss', '减压日常']];
function useOfficeHub(tab:Tab) {
    const [view, setView] = useState<OfficeHubOverview | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    const alive = useRef(false), serial = useRef(0), pending = useRef<{
        fingerprint: string;
        id: string;
    } | null>(null), locked = useRef(false);
    const currentCursor=useRef<string|undefined>(undefined);
    const kind=tab==='stories'?'story':tab==='drawings'?'drawing':tab==='spy'?'spy':undefined;
    const refresh = useCallback(async (cursor?:string) => { const id = ++serial.current, generation = getCommunitySessionGeneration(); try {
        const next = await officeHubApi.overview(cursor,kind);
        if (alive.current && serial.current === id && generation === getCommunitySessionGeneration()) {
            setView(next);
            currentCursor.current=cursor;
            setError('');
        }
    }
    catch (e) {
        if (alive.current && serial.current === id && generation === getCommunitySessionGeneration())
            setError(officeHubError(e));
    } }, [kind]);
    useEffect(() => { alive.current = true; void refresh(); const timer = window.setInterval(() => { if (!document.hidden && !locked.current)
        void refresh(currentCursor.current); }, 15000); return () => { alive.current = false; ++serial.current; window.clearInterval(timer); }; }, [refresh]);
    const command: Command = async (action, data = {}) => {
        if (locked.current)
            return false;
        locked.current = true;
        setBusy(true);
        setError('');
        const id = ++serial.current, generation = getCommunitySessionGeneration();
        const fingerprint = JSON.stringify({ action, data });
        if (pending.current?.fingerprint !== fingerprint)
            pending.current = { fingerprint, id: crypto.randomUUID() };
        try {
            let next = await officeHubApi.action(action, data, pending.current.id);
            if(kind&&generation===getCommunitySessionGeneration())next={...await officeHubApi.overview(currentCursor.current,kind),notice:next.notice};
            if (!alive.current || serial.current !== id || generation !== getCommunitySessionGeneration())
                return false;
            setView(next);
            pending.current = null;
            return true;
        }
        catch (e) {
            if (alive.current && serial.current === id && generation === getCommunitySessionGeneration())
                setError(officeHubError(e));
            return false;
        }
        finally {
            locked.current = false;
            if (alive.current)
                setBusy(false);
        }
    };
    return { view, error, busy, refresh, command };
}
export function OfficeHubPage({ initialTab = 'company' }: {
    initialTab?: Tab;
}) {
    const [params, setParams] = useSearchParams();
    const requested = params.get('tab');
    const user = useCommunityAuthStore((state) => state.user);
    const scope = `${user?.publicId ?? 'guest'}:${getCommunitySessionGeneration()}`;
    return <OfficeHubContent key={scope} initialTab={initialTab} requested={requested} setTab={(next) => setParams({ tab: next })}/>;
}
function OfficeHubContent({ initialTab, requested, setTab }: {
    initialTab: Tab;
    requested: string | null;
    setTab: (tab: Tab) => void;
}) {
    const tab = TABS.some(([id]) => id === requested) ? requested as Tab : initialTab;
    const { view, error, busy, refresh, command } = useOfficeHub(tab);
    const equipped = OFFICE_COLLECTION.find((x) => x.id === view?.collection.equipped);
    return <main className={styles.hub} style={{ '--office-paper': equipped?.kind === 'skin' ? equipped.color : '#fafaf8' } as CSSProperties}>
    <header className={styles.header}><div><span className={styles.kicker}>摸摸公司 · 同事工作台</span><h1>{tab === 'boss' ? '压力整理' : '公司工作台'}</h1><p>一层公司，轻松共创。离线进度保留，没有付费或强制打卡。</p></div><div className={styles.actions}><Link to="/">返回首页</Link><Link to="/games">小游戏</Link><button disabled={busy} onClick={() => void refresh()}>刷新</button></div></header>
    <nav className={styles.tabs} aria-label="公司工作台功能">{TABS.map(([id, label]) => <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>{label}</button>)}</nav>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {view?.notice && <p role="status" className={styles.notice}>{view.notice}</p>}
    {!view ? <p role="status">{error ? '暂时无法加载，可点击刷新重试。' : '正在读取工作台…'}</p> : <>
      {tab === 'company' && <CompanyPanel view={view} busy={busy} command={command}/>}
      {tab === 'collection' && <CollectionPanel view={view} busy={busy} command={command}/>}
      {tab === 'stories' && <StoryPanel stories={view.stories} busy={busy} command={command}/>}
      {tab === 'drawings' && <OfficeDrawingPanel view={view} busy={busy} command={command} refresh={refresh}/>}
      {tab === 'spy' && <SpyPanel spies={view.spies} busy={busy} command={command} department={Boolean(view.weekly.guildId)}/>}
      {tab === 'boss' && <><p className={styles.notice}>机会挑战、独立解压币与待领物品已集中到 <Link to="/games/office-boss">压力整理工作区</Link>。下方每日巡视照常保留，不消耗挑战机会。</p><OfficeBossDailyPanel view={view} busy={busy} command={command}/></>}
      {['stories','drawings','spy'].includes(tab)&&<div className={styles.actions} aria-label="共创历史翻页">{view.page?.historical&&<button disabled={busy} onClick={()=>void refresh()}>返回最新内容</button>}{view.page?.nextCursor&&<button disabled={busy} onClick={()=>void refresh(view.page!.nextCursor!)}>查看更早的共创记录</button>}</div>}
      {view.moderation && <ModerationPanel view={view} busy={busy} command={command}/>}
    </>}
  </main>;
}
function CompanyPanel({ view, busy, command }: {
    view: OfficeHubOverview;
    busy: boolean;
    command: Command;
}) {
    const w = view.weekly;
    const [announcement, setAnnouncement] = useState('');
    return <div className={styles.stack}><section className={styles.panel}><div className={styles.sectionTitle}><h2>{w.guildName ?? '加入一个公司'}</h2><span>公司 / 部门 / 旧帮派是同一个组织</span></div>
    <p>沿用现有公司成员、金库和建设，不创建第二层组织。达到职场 Lv.15 后可加入；创建费用及余额见下方档案。</p>
    {w.guildId && <><blockquote>{w.announcement || '本周目标：一起守好工位，准点下班。'}</blockquote><div className={styles.metrics}><div><small>本周共同守护</small><strong>{w.totalWaves} / {w.targetWaves} 波</strong></div><div><small>我的成功波次</small><strong>{w.myWaves}</strong></div><div><small>公司收藏声望</small><strong>{w.reputation}</strong></div></div>
      <progress aria-label="公司周常进度" value={Math.min(w.totalWaves, w.targetWaves)} max={w.targetWaves}/><p>只统计服务器核验的塔防结算。个人至少守护 2 波后，本周可领取 30 办公币一次；换公司不重复领奖。</p><div className={styles.actions}><Link to="/tower-defense">去守护工位</Link><button disabled={busy || w.rewardClaimed || w.myWaves < 2 || w.totalWaves < w.targetWaves} onClick={() => void command('weekly_claim')}>{w.rewardClaimed ? '本周已领取' : '领取周常奖励'}</button></div>
      {w.canEdit && <form onSubmit={(e) => { e.preventDefault(); void command('announcement', { text: announcement }); }}><label>公司公告<textarea value={announcement} maxLength={300} onChange={(e) => setAnnouncement(e.target.value)} placeholder={w.announcement || '写给同事的一句话'}/></label><button disabled={busy}>保存公告</button></form>}
      <h3>部门周榜 · {w.week}</h3><div className={styles.tableScroll}><table><thead><tr><th>同事</th><th>守护波次</th><th>最高分</th><th>最高星阶 / 连胜</th></tr></thead><tbody>{w.leaderboard.map((r) => <tr key={r.rank}><td>#{r.rank} {r.author.displayName}</td><td>{r.waves}</td><td>{r.score}</td><td>{r.stars} / {r.streak}</td></tr>)}</tbody></table></div>
    </>}
    {w.departments.length > 0 && <><h3>公司协作周榜</h3><ol>{w.departments.map((d) => <li key={d.name}>{d.name} · {d.waves} 波 · 声望 {d.reputation}</li>)}</ol></>}
  </section><CommunityGuildPanel onAssetsChanged={() => undefined}/></div>;
}
function CollectionPanel({ view, busy, command }: {
    view: OfficeHubOverview;
    busy: boolean;
    command: Command;
}) {
    const c = view.collection, [pool, setPool] = useState('daily');
    const up = OFFICE_COLLECTION.find((x) => x.id === c.dailyUp);
    return <div className={styles.stack}><section className={styles.panel}><div className={styles.sectionTitle}><div><h2>今日收藏 · {c.theme}</h2><p>限定 UP：{up?.name}。收藏全部免费，只改变外观，不挡住塔防进度。</p></div><span>{OFFICE_TITLES[c.promotionTier]}</span></div>
    <div className={styles.metrics}><div><small>今日可用 farmExp</small><strong>{c.farmExp}</strong><small>累计 {c.farmEarned} / 2000</small></div><div><small>限定券</small><strong>{c.tickets}</strong><small>独立于每日 20 抽额度</small></div><div><small>社交积分</small><strong>{c.socialPoints}</strong><small>今日领取 {c.socialEarnedToday} / 100</small></div></div>
    <p>工位自动积累 {c.hourlyExp} farmExp / 小时；每天前 4 个成功塔防波次每波 {c.waveExp}，已计 {c.creditedWaves} 波。100 经验 = 1 抽，今天已用 {c.farmDraws} / 20 抽。北京时间 00:00 清零未用经验；收藏、券、保底永久保留。</p>
    <div className={styles.actions}><button disabled={busy || c.dailyTicketClaimed} onClick={() => void command('daily_ticket')}>{c.dailyTicketClaimed ? '今日券已领取' : '领取今日免费券'}</button><button disabled={busy || c.socialEarnedToday >= 100} onClick={() => void command('collect_social')}>领取互动积分</button><button disabled={busy || c.socialPoints < 50 || c.socialExchangesToday >= 2} onClick={() => void command('exchange_ticket')}>50 积分换券（{c.socialExchangesToday}/2）</button></div>
    <div className={styles.drawControls}><label>收藏池<select value={pool} onChange={(e) => setPool(e.target.value)}><option value="daily">今日限定（SSR 为当期 UP）</option><option value="standard">常驻（SSR 四款等概率）</option></select></label><button disabled={busy || c.tickets < 1} onClick={() => void command('draw', { source: 'ticket', pool })}>使用 1 张券</button><button disabled={busy || c.farmExp < 100 || c.farmDraws >= 20} onClick={() => void command('draw', { source: 'farm', pool })}>使用 100 farmExp</button></div>
    <p>基础概率：N 93.7% · R 4% · SR 1.5% · SSR 0.8%。连续 9 次无 R+，第 10 次保底 R+；连续 79 次无 SSR，第 80 次保底 SSR。两池共享进度，切池不会清零。</p><div className={styles.actions}><span>R+ 保底 {c.pityR}/10</span><span>SSR 保底 {c.pitySSR}/80</span><span>收藏声望 {c.reputation}</span></div>
    {c.lastDraw && <p className={styles.drawResult} role="status">最近获得：{OFFICE_COLLECTION.find((x) => x.id === c.lastDraw)?.name}</p>}
  </section><section className={styles.panel}><div className={styles.sectionTitle}><h2>我的收藏 · {Object.keys(c.owned).length}/{OFFICE_COLLECTION.length}</h2><button disabled={busy || !c.equipped} onClick={() => void command('equip', { itemId: null })}>恢复默认外观</button></div><div className={styles.collectionGrid}>{OFFICE_COLLECTION.map((item) => <article key={item.id} className={styles.collectible} data-owned={Boolean(c.owned[item.id])}><div className={styles.sample} style={{ background: item.color }} aria-hidden="true">{item.kind === 'skin' ? '▤' : item.kind === 'tower' ? '▥' : item.kind === 'companion' ? '☺' : '▰'}</div><span>{item.rarity} · {item.kind === 'skin' ? '工作台皮肤' : item.kind === 'tower' ? '塔防外观' : item.kind === 'companion' ? '伙伴外观' : '纪念便签'}</span><h3>{item.name}</h3><small>{c.owned[item.id] ? `已拥有 ×${c.owned[item.id]}` : '尚未收藏'}</small><button disabled={busy || !c.owned[item.id] || c.equipped === item.id} onClick={() => void command('equip', { itemId: item.id })}>{c.equipped === item.id ? '使用中' : '使用外观'}</button></article>)}</div></section></div>;
}
function StoryPanel({ stories, busy, command }: {
    stories: OfficeStory[];
    busy: boolean;
    command: Command;
}) {
    const [title, setTitle] = useState(''), [text, setText] = useState(''), [starter, setStarter] = useState('0');
    return <div className={styles.stack}><section className={styles.panel}><h2>故事接龙</h2><p>每条分支连续最多写 2 段；同一节点最多保留 5 条活跃分支。至少 3 人评分且均分低于 2 的续写及后续自动归档，可切换查看，不抹掉创作记录。</p><form onSubmit={(e) => { e.preventDefault(); void command('story_create', { title, ...(starter === 'custom' ? { text } : { starter: Number(starter) }) }).then((ok) => { if (ok) {
        setTitle('');
        setText('');
    } }); }}><label>故事标题<input maxLength={60} minLength={2} required value={title} onChange={(e) => setTitle(e.target.value)}/></label><label>故事开头<select value={starter} onChange={(e) => setStarter(e.target.value)}>{OFFICE_STORY_STARTERS.map((s, i) => <option key={s} value={i}>{s}</option>)}<option value="custom">自己写开头</option></select></label>{starter === 'custom' && <label>开头正文<textarea required minLength={5} maxLength={500} value={text} onChange={(e) => setText(e.target.value)}/></label>}<button disabled={busy}>发布故事（每天最多 3 篇）</button></form></section>
    {stories.map((story) => <StoryCard key={story.id} story={story} busy={busy} command={command}/>)}{stories.length === 0 && <p>还没有故事，写下第一段吧。</p>}</div>;
}
function StoryCard({ story, busy, command }: {
    story: OfficeStory;
    busy: boolean;
    command: Command;
}) {
    const [parent, setParent] = useState(story.nodes.find((n) => !n.archived)?.id ?? ''), [text, setText] = useState(''), [archived, setArchived] = useState(false), [ratings, setRatings] = useState<Record<string, string>>({});
    return <article className={styles.panel}><div className={styles.sectionTitle}><h2>{story.title}</h2><div className={styles.actions}><label><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)}/> 显示归档</label>{story.mine ? <button disabled={busy || story.nodes.some((n) => !n.mine)} onClick={() => void command('post_delete', { postId: story.id })}>删除我的独作</button> : <button disabled={busy} onClick={() => void command('post_report', { postId: story.id })}>举报</button>}</div></div>
    <ol className={styles.storyNodes}>{story.nodes.filter((n) => archived || !n.archived).map((n) => <li key={n.id} data-archived={n.archived}><small>{n.author.displayName} · {n.parentId ? `接第 ${story.nodes.findIndex((x) => x.id === n.parentId) + 1} 段` : '开头'} · {n.score === null ? '尚未评分' : `${n.score.toFixed(1)} 分 / ${n.ratings} 人`}</small><p>{n.text}</p>{n.archived ? <small>{n.archiveReason}</small> : <div className={styles.actions}><button disabled={busy} onClick={() => setParent(n.id)}>{parent === n.id ? '已选为续写起点' : '从这里分支续写'}</button>{!n.mine && n.myRating === null && <><select aria-label={`为第 ${story.nodes.indexOf(n) + 1} 段评连续性分`} value={ratings[n.id] ?? '3'} onChange={(e) => setRatings({ ...ratings, [n.id]: e.target.value })}>{[1, 2, 3, 4, 5].map((i) => <option key={i} value={i}>{i} 分</option>)}</select><button disabled={busy} onClick={() => void command('story_rate', { postId: story.id, nodeId: n.id, rating: Number(ratings[n.id] ?? 3) })}>评分</button></>}{n.myRating !== null && <small>我的评分 {n.myRating}</small>}</div>}</li>)}</ol>
    <form onSubmit={(e) => { e.preventDefault(); void command('story_reply', { postId: story.id, parentId: parent, text }).then((ok) => { if (ok)
        setText(''); }); }}><label>续写起点<select value={parent} onChange={(e) => setParent(e.target.value)}>{story.nodes.filter((n) => !n.archived).map((n, i) => <option key={n.id} value={n.id}>第 {i + 1} 段 · {n.text.slice(0, 24)}</option>)}</select></label><label>接下来的故事<textarea required minLength={5} maxLength={500} value={text} onChange={(e) => setText(e.target.value)}/></label><button disabled={busy || !parent || story.nodes.length >= 128}>续写并保存分支</button></form></article>;
}
function Drawing({ strokes, label = '同事的画作' }: {
    strokes: OfficeStroke[];
    label?: string;
}) { return <svg className={styles.drawing} viewBox="0 0 1000 1000" role="img" aria-label={label}>{strokes.map((s, i) => <polyline key={i} points={s.points.map((p) => `${p.x},${p.y}`).join(' ')} stroke={s.color} strokeWidth={s.width} fill="none" strokeLinecap="round" strokeLinejoin="round"/>)}</svg>; }
function SpyPanel({ spies, busy, command, department }: {
    spies: OfficeSpyView[];
    busy: boolean;
    command: Command;
    department: boolean;
}) {
    const [title, setTitle] = useState('茶水间描述局'), [guild, setGuild] = useState(false);
    return <div className={styles.stack}><section className={styles.panel}><h2>异步描述墙 · 谁是卧底</h2><p>3—5 人设 1 位卧底，6—8 人设 2 位。每人碎片时间写一句，齐人后自动转投票；票数相同无人出局，最多 8 轮。24 小时自动归档，离开不扣资源。</p><form onSubmit={(e) => { e.preventDefault(); void command('spy_create', { title, department: guild }); }}><label>描述局名称<input required minLength={2} maxLength={50} value={title} onChange={(e) => setTitle(e.target.value)}/></label><label><input type="checkbox" checked={guild} disabled={!department} onChange={(e) => setGuild(e.target.checked)}/> 仅本公司（胜者增加公司声望，解锁部门称号）</label><button disabled={busy}>创建描述局</button></form><Link to="/games/rooms">想实时玩？去玩家房间</Link></section>{spies.map((spy) => <SpyCard key={spy.id} spy={spy} busy={busy} command={command}/>)}</div>;
}
function SpyCard({ spy, busy, command }: {
    spy: OfficeSpyView;
    busy: boolean;
    command: Command;
}) {
    const [description, setDescription] = useState(''), [target, setTarget] = useState('');
    const me = spy.members.find((m) => m.id === spy.meId);
    return <article className={styles.panel}><div className={styles.sectionTitle}><h3>{spy.title} {spy.guildGame ? '· 本公司' : ''}</h3><span>{spy.phase === 'waiting' ? '等同事入局' : spy.phase === 'describe' ? `第 ${spy.round} 轮描述` : spy.phase === 'vote' ? `第 ${spy.round} 轮投票` : '已结束'}</span></div><p>{spy.theme} · {spy.members.length}/8 人 · {new Date(spy.expiresAt).toLocaleString()} 前有效</p><ul className={styles.members}>{spy.members.map((m) => <li key={m.id}>{m.name}{m.id === spy.meId ? '（我）' : ''} · {!m.alive ? '已出局' : spy.phase === 'describe' ? (m.described ? '已描述' : '待描述') : spy.phase === 'vote' ? (m.voted ? '已投票' : '待投票') : '已入局'}{m.role ? ` · ${m.role === 'undercover' ? '卧底' : '平民'}` : ''}</li>)}</ul>
    {spy.word && <p className={styles.notice}>仅你的词：<strong>{spy.word}</strong>，不要在描述里直接说出。</p>}
    <ol>{spy.descriptions.map((d, i) => <li key={i}>第 {d.round} 轮 · {spy.members.find((m) => m.id === d.playerId)?.name ?? '同事'}：{d.text}</li>)}</ol>
    <div className={styles.actions}>{spy.phase === 'waiting' && !spy.joined && <button disabled={busy || spy.members.length >= 8} onClick={() => void command('spy_join', { postId: spy.id })}>加入</button>}{spy.phase === 'waiting' && spy.owner && <button disabled={busy || spy.members.length < 3} onClick={() => void command('spy_start', { postId: spy.id })}>开始描述</button>}{spy.joined && spy.phase !== 'finished' && <button disabled={busy} onClick={() => void command('spy_leave', { postId: spy.id })}>{spy.phase === 'waiting' ? '离开等待局' : '结束参与（本局归档）'}</button>}{!spy.owner && <button disabled={busy} onClick={() => void command('post_report', { postId: spy.id })}>举报</button>}</div>
    {me?.alive && spy.phase === 'describe' && !me.described && <form onSubmit={(e) => { e.preventDefault(); void command('spy_describe', { postId: spy.id, text: description }).then((ok) => { if (ok)
        setDescription(''); }); }}><label>一句描述<input required minLength={2} maxLength={160} value={description} onChange={(e) => setDescription(e.target.value)}/></label><button disabled={busy}>保存描述</button></form>}
    {me?.alive && spy.phase === 'vote' && !spy.myVote && <form onSubmit={(e) => { e.preventDefault(); void command('spy_vote', { postId: spy.id, targetId: target }); }}><label>你认为谁是卧底<select required value={target} onChange={(e) => setTarget(e.target.value)}><option value="">请选择</option>{spy.members.filter((m) => m.alive && m.id !== spy.meId).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><button disabled={busy || !target}>确认投票</button></form>}
    {spy.phase === 'finished' && <p className={styles.notice}>{spy.outcome === 'cancelled' ? '本局已取消，无资源扣除' : spy.outcome === 'undercover' ? '卧底胜出，去收藏页领取互动积分' : '平民胜出，去收藏页领取互动积分'}</p>}
  </article>;
}
function ModerationPanel({ view, busy, command }: {
    view: OfficeHubOverview;
    busy: boolean;
    command: Command;
}) {
    const [reason, setReason] = useState('');
    return <details className={styles.panel}><summary>网站内容审核 · 仅管理员 / 版主可见</summary><label>审核说明（至少 5 字）<input minLength={5} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)}/></label><ul>{view.moderation?.map((p) => <li key={p.id}><details><summary>{p.title} · {p.kind} · {p.reports} 次举报 · {p.hidden ? '已隐藏' : '正常'}</summary><p style={{whiteSpace:'pre-wrap'}}>{p.preview}</p>{p.strokes&&<Drawing strokes={p.strokes} label="待审核的画作"/>}<button disabled={busy || reason.trim().length < 5} onClick={() => void command('post_moderate', { postId: p.id, hidden: !p.hidden, reason })}>{p.hidden ? '恢复' : '隐藏'}</button></details></li>)}</ul></details>;
}
