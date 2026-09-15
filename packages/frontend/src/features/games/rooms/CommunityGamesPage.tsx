import { useEffect, useRef, useState, type JSX, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ArcadeGameKey, PlayCreateInput } from '@stealth-reader/shared';

import { communityGameErrorMessage, communityGameRoomsApi, createPlayRequestId } from '../../../api/community-game-rooms';
import { getCommunitySessionGeneration } from '../../../api/community-http';
import { useCommunityAuthStore } from '../../../app/store/community-auth-store';
import { COMMUNITY_FEATURE_FLAGS } from '../../../app/community-nav';
import { PRACTICE_PATHS, usePlayCatalog } from './play-ui-state';
import styles from './CommunityGamesPage.module.css';
import { useBallpointWindow } from '../ballpoint-breach/BallpointWindow';

type GameCategory = 'all' | 'solo' | 'rooms' | 'growth' | 'local';
type CoverKind = ArcadeGameKey | 'paper' | 'tower' | 'word' | 'office' | 'boss' | 'demon' | 'rail' | 'numbers' | 'underrun';
interface GameCardDefinition {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  categories: Exclude<GameCategory, 'all'>[];
  cover: CoverKind;
  time: string;
  device: string;
  access: string;
  save: string;
  ranking: string;
  rules: ReactNode;
  actions: ReactNode;
}
const FILTERS: { key: GameCategory; label: string }[] = [
  { key: 'all', label: '全部游戏' }, { key: 'solo', label: '单机挑战' },
  { key: 'rooms', label: '实时房间' }, { key: 'growth', label: '角色与养成' }, { key: 'local', label: '本机练习' },
];
const SOLO_TIMES: Record<ArcadeGameKey, string> = { snake: '最多 2 分钟', tetris: '最多 2 分钟', tank: '最多 2 分钟', zhesi: '最多 80 秒', draw: '最多 2 分钟', undercover: '最多 150 秒' };
const COVER_MARKS: Record<CoverKind, string> = { snake: 'SNAKE', tetris: 'BLOCKS', tank: 'TANK', zhesi: 'TRIAL', draw: 'DRAW', undercover: 'SECRET', paper: 'PAPER', tower: 'DEFEND', word: 'WORD', office: 'CONNECT', boss: 'RELIEF', demon: 'EXPLORE', rail: 'DECIDE', numbers: 'MERGE', underrun: 'PATROL' };

const COVER_ICONS: Record<CoverKind, string> = { snake: '⌁', tetris: '▦', tank: '✥', zhesi: '◇', draw: '✎', undercover: '?', paper: '↗', tower: '▤', word: '字', office: '☷', boss: '◎', demon: '九', rail: '⇄', numbers: '2048', underrun: '⌘' };
const COVER_LABELS: Record<CoverKind, string> = { snake: '方向与节奏', tetris: '排列与消除', tank: '移动与射击', zhesi: '命格与试炼', draw: '画笔与猜词', undercover: '描述与推理', paper: '纸笔与突围', tower: '职业与防守', word: '招募与布阵', office: '接力与互动', boss: '挑战与收藏', demon: '探索与成长', rail: '讨论与抉择', numbers: '数字与合并', underrun: '机房与巡检' };

/** Typographic category covers load no artwork, remote resources or game runtime. */
function GameCover({ kind }: { kind: CoverKind }): JSX.Element {
  return <div className={styles.cover} data-cover={kind} aria-hidden="true">
    <span className={styles.coverCode}>{COVER_MARKS[kind]}</span><span className={styles.coverIcon}>{COVER_ICONS[kind]}</span><span className={styles.coverLabel}>{COVER_LABELS[kind]}</span><span className={styles.coverCorner}>↗</span>
  </div>;
}

function GameCard({ card }: { card: GameCardDefinition }): JSX.Element {
  return <article className={styles.card} aria-label={card.title}>
    <GameCover kind={card.cover} />
    <div className={styles.cardBody}><p className={styles.cardSubtitle}>{card.subtitle}</p><h2>{card.title}</h2><p className={styles.description}>{card.description}</p>
      <dl className={styles.metadata}><div><dt>时长</dt><dd>{card.time}</dd></div><div><dt>设备</dt><dd>{card.device}</dd></div><div><dt>访问</dt><dd>{card.access}</dd></div><div><dt>进度</dt><dd>{card.save}</dd></div></dl>
      <p className={styles.ranking}><span aria-hidden="true">◇</span>{card.ranking}</p><div className={styles.cardActions}>{card.actions}</div>
      <details className={styles.rules}><summary>规则与进度说明</summary><div>{card.rules}</div></details>
    </div>
  </article>;
}

export function CommunityGamesPage(): JSX.Element {
  const ballpoint = useBallpointWindow();
  const { catalog, error: catalogError, retry } = usePlayCatalog();
  const active = useCommunityAuthStore((state) => state.phase === 'active');
  const userId = useCommunityAuthStore((state) => state.user?.publicId);
  const navigate = useNavigate();
  const [starting, setStarting] = useState<ArcadeGameKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<GameCategory>('all');
  const [search, setSearch] = useState('');
  const createRequest = useRef<PlayCreateInput | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { createRequest.current = null; setError(null); setStarting(null); }, [userId]);
  const start = async (gameKey: ArcadeGameKey): Promise<void> => {
    if (!active) { navigate('/login'); return; }
    if (starting) return;
    const generation = getCommunitySessionGeneration();
    if (createRequest.current?.gameKey !== gameKey) createRequest.current = { clientRequestId: createPlayRequestId(), gameKey, mode: 'solo' };
    const request = createRequest.current;
    setStarting(gameKey); setError(null);
    try {
      const room = await communityGameRoomsApi.create(request);
      if (!mounted.current || generation !== getCommunitySessionGeneration() || useCommunityAuthStore.getState().user?.publicId !== userId) return;
      createRequest.current = null;
      navigate(`/games/rooms/${room.id}`);
    } catch (reason) {
      if (mounted.current && generation === getCommunitySessionGeneration() && useCommunityAuthStore.getState().user?.publicId === userId) setError(communityGameErrorMessage(reason));
    } finally { if (mounted.current && generation === getCommunitySessionGeneration()) setStarting(null); }
  };
  const cards: GameCardDefinition[] = (catalog?.games ?? []).map(game => ({
    id: `solo-${game.gameKey}`, title: game.name, subtitle: filter === 'rooms' ? game.gameKey === 'draw' || game.gameKey === 'undercover' ? '玩家房间 · 实时协作' : '玩家房间 · 同题竞速' : '账号短局 · 单机 / 玩家房间', description: filter === 'rooms' ? game.roomDescription : game.soloDescription,
    categories: ['solo', 'rooms'], cover: game.gameKey, time: SOLO_TIMES[game.gameKey], device: game.gameKey === 'draw' || game.gameKey === 'undercover' || game.gameKey === 'zhesi' ? '点击 / 触屏' : '键盘 / 触屏', access: '需要登录', save: '服务端赛局', ranking: `单机与房间共享日榜 · 冠军 ${game.dailyChampionCoins} 办公币`,
    rules: <>{filter !== 'rooms' ? <p>单机规则：{game.soloDescription}</p> : null}<p>房间规则：{game.roomDescription} · {game.minPlayers}–{game.maxPlayers} 人。</p><p>服务端计时与判分；收起画面后线上赛局仍继续。{filter !== 'rooms' ? '你画我猜、谁是卧底单机模式使用系统练习搭档，不是真人玩家。' : '实时房间需要真人加入并准备；不自动补充系统搭档。'}</p></>,
    actions: <>{filter !== 'rooms' ? <button className={styles.primaryButton} disabled={starting !== null} type="button" onClick={() => { void start(game.gameKey); }}>{starting === game.gameKey ? '正在建立…' : active ? '开始挑战' : '登录挑战'}</button> : null}<Link className={filter === 'rooms' ? styles.primaryButton : styles.secondaryButton} to={`/games/rooms?game=${game.gameKey}`}>查看房间</Link><Link className={styles.textLink} to={`/games/leaderboards/${game.gameKey}`}>日榜</Link></>,
  }));
  const add = (card: GameCardDefinition): void => { cards.push(card); };
  if (COMMUNITY_FEATURE_FLAGS.paperArena) add({ id: 'paper-arena', title: '纸上突围 · 红蓝对战', subtitle: '实时联机 · AI 补位', cover: 'paper', categories: ['rooms'], time: '按击败目标结束', device: '桌面键鼠 · WebGL 2', access: '需要登录', save: '临时房间', ranking: '不计官方排行或办公币', description: '原版纸笔场景、人物与五种武器，红蓝双方在扩建地图上交锋。', rules: <p>4–8 人容量，房主设置 20–100 团队击败目标及可选密码。阵亡后随机安全位置复活；空席和断线由 AI 接替，真人回归接管原状态。服务端判定命中和比分，联机小窗收起时对局仍继续；API 重启会结束临时房间。</p>, actions: <Link className={styles.primaryButton} to="/games/ballpoint-breach/arena">查看红蓝房间 / 建房</Link> });
  if (COMMUNITY_FEATURE_FLAGS.officeHub) {
    add({ id: 'office', title: '公司茶水间', subtitle: '异步互动 · 外观收藏', cover: 'office', categories: ['growth'], time: '随时接力', device: '键鼠 / 触屏', access: '需要登录', save: '服务端记录', ranking: '社交积分 · 独立解压币', description: '分支故事、自由猜画与描述投票，无需同时上线也能一起玩。', rules: <p>公司 / 收藏 / 异步互动集中在同一工作区。解压币独立于全站办公币；实时你画我猜、谁是卧底仍在玩家建房专区。</p>, actions: <Link className={styles.primaryButton} to="/office">公司 / 收藏 / 异步互动</Link> });
    add({ id: 'office-boss', title: '压力整理 · 小老板挑战', subtitle: '免费机会挑战 · 每日巡视', cover: 'boss', categories: ['solo', 'growth'], time: '短局手动挑战', device: '键鼠 / 触屏', access: '需要登录', save: '服务端收藏', ranking: '解压币独立于办公币', description: '挑战小老板，整理工作压力，收集不同的外观。', rules: <p>机会挑战免费、手动参与，默认静音。每日巡视入口保留；外观收藏和公司工作区互通，不新增付费。</p>, actions: <><Link className={styles.primaryButton} to="/games/office-boss">开始压力整理</Link><Link className={styles.textLink} to="/games/office-boss?mode=daily">每日巡视</Link></> });
  }
  if (COMMUNITY_FEATURE_FLAGS.towerDefense) {
    if (COMMUNITY_FEATURE_FLAGS.workstationCampaign) add({ id: 'tower', title: '工位塔防 · 职业档案', subtitle: '正式战役 · 角色成长', cover: 'tower', categories: ['growth'], time: '剧情 / 无尽 / 极限', device: '键鼠 / 触屏', access: '需要登录', save: '服务端存档 · 离线推进', ranking: '正式塔防日榜 · 晋升与办公币', description: '四种职业、局外天赋与多种关卡，继续守住你的工位。', rules: <p>正式局可积累晋升经验及办公币。手动暂停停止推进，离线回放仅完成当前局，不代买零件或开新局。原本地练习与正式记录独立。</p>, actions: <><Link className={styles.primaryButton} to="/tower-defense">继续守工位</Link><Link className={styles.textLink} to="/tower-defense/leaderboard">正式塔防日榜</Link></> });
    add({ id: 'tower-practice', title: '工位塔防 · 本地练习', subtitle: '本地防守 · 独立记录', cover: 'tower', categories: ['local'], time: '本地短局', device: '键鼠 / 触屏', access: '需要登录', save: '本机最高分', ranking: '不计正式榜或办公币', description: '保留原工位塔防练习，先试布阵，再进入正式职业档案。', rules: <p>仅本机最高分与设置，不保存账号战役进度；切出窗口自动暂停，刷新重新开局。V1–V3 本机记录保留且不混分。</p>, actions: <Link className={styles.primaryButton} to="/tower-defense/practice">本地练习</Link> });
    add({
      id: 'word-front', title: '文字战线 · 赵云救阿斗', subtitle: filter === 'rooms' ? '双人房间 · V2 双线对攻' : '双字组队 · V3 路径防守', cover: 'word', categories: ['solo', ...(COMMUNITY_FEATURE_FLAGS.wordFrontRooms ? ['rooms' as const] : [])],
      time: filter === 'rooms' ? '对战最多 15 分钟' : '章节 / 无尽', device: '键鼠 / 触屏', access: '需要登录', save: filter === 'rooms' ? '临时会话 · 不存档' : '本机草稿', ranking: filter === 'rooms' ? '不计正式榜、成就或办公币' : 'V3 独立榜 · 不发办公币',
      description: filter === 'rooms' ? '两位真人红蓝双线对攻；击败来客，向对方投递援军。' : '招募字卡、合成队员，经营阵容守住核心；旧版入口全部保留。',
      rules: <>{filter !== 'rooms' ? <p>剧情与无尽独立于原工位塔防，不扣账号办公币。在线参榜需当前页面完成；刷新或切页后可续本机草稿，但失去当前局参榜资格。</p> : null}{COMMUNITY_FEATURE_FLAGS.wordFrontRooms ? <p>双人房间采用 V2 规则，不是 V3 单机规则；不计正式榜、办公币、成就或存档，服务重启结束。收起画面后服务端仍持续推进，对战最多 15 分钟。</p> : null}<div className={styles.ruleLinks}><Link to="/tower-defense/word-front/v2">旧版六章（V2）</Link><Link to="/tower-defense/word-front/legacy">初版草稿（V1）</Link><Link to="/tower-defense">原工位塔防</Link></div></>,
      actions: <>{filter !== 'rooms' ? <Link className={styles.primaryButton} to="/tower-defense/word-front">进入文字战线</Link> : null}{COMMUNITY_FEATURE_FLAGS.wordFrontRooms ? <Link className={filter === 'rooms' ? styles.primaryButton : styles.secondaryButton} to="/tower-defense/word-front/rooms">双人房间</Link> : null}</>,
    });
  }
  if (COMMUNITY_FEATURE_FLAGS.demonTower) add({ id: 'demon-tower', title: '九层妖塔 · 角色养成', subtitle: '免费养成 · 异步协作', cover: 'demon', categories: ['growth'], time: '持续成长 · 随时继续', device: '键鼠 / 触屏', access: '需要登录', save: '服务端角色档案', ranking: '贡献日榜 · 冠军另奖 100 办公币', description: '探索九层区域、收集武器技能，全站共同推进守层者和通道建设。', rules: <p>个人冒险随时继续，不用凑齐在线人数。服务端保存进度；日常办公币最多 200，贡献日榜冠军另奖 100。武器与技能均可免费获得，没有充值入口。</p>, actions: <><Link className={styles.primaryButton} to="/games/demon-tower">{active ? '进入角色档案 →' : '登录建立档案 →'}</Link><Link className={styles.textLink} to="/games/demon-tower/leaderboard">查看妖塔贡献日榜</Link></> });
  add({ id: 'rail', title: '轨道难题', subtitle: '派对协作 · 3–9 席 · 可观战', cover: 'rail', categories: ['rooms'], time: '按房间轮次结束', device: '键鼠 / 触屏', access: '需要登录', save: '服务端房间', ranking: '合格真人局参榜 · 冠军 100 办公币', description: '轮流担任列车长，出牌、加特性，讨论两条轨道的取舍。', rules: <p>可用人机补位练习，也可以设置密码邀请同事一起玩。至少 3 位真人、无机器人且完整手动操作的建房对局才可参榜；每日冠军 100 办公币，恶魔值仅作趣味展示。</p>, actions: <><Link className={styles.primaryButton} to="/games/rail">练习 / 玩家建房 →</Link><Link className={styles.textLink} to="/games/rail/leaderboard">查看生存率日榜</Link></> });
  add({ id: 'paper-local', title: '纸上突围 · 本地单机', subtitle: '纸笔世界 · 低调工作稿', cover: 'paper', categories: ['local'], time: '五轮生存练习', device: '桌面键鼠 · WebGL 2', access: '无需登录', save: '小窗保留当前轮', ranking: '不计官方排行、成就或办公币', description: '五轮关卡、五种工具和抓钩，右下角工作稿可随时收起恢复。', rules: <p>站内切页保留本轮并自动暂停，默认静音。此本地练习独立于红蓝联机房间；关闭、刷新或切换账号会结束本轮。</p>, actions: <><button className={styles.primaryButton} type="button" onClick={ballpoint.openWindow}>{ballpoint.isOpen ? '恢复工作稿小窗' : '打开工作稿小窗'}</button><Link className={styles.textLink} to="/games/ballpoint-breach">玩法与来源说明</Link></> });
  add({ id: '2048', title: '表格工作稿 · 2048', subtitle: '数字合并 · 静音小窗', cover: 'numbers', categories: ['local'], time: '随时结束的短局', device: '键盘 / 触屏', access: '无需登录', save: '仅本轮状态', ranking: '不计官方排行、成就或办公币', description: '把相同数字合并，做一份不太普通的表格工作稿。', rules: <p>本站本地运行，无第三方嵌入或广告，开源许可保留。离开页面结束本轮，失焦自动暂停。</p>, actions: <Link className={styles.primaryButton} to="/games/office-2048">打开表格工作稿</Link> });
  add({ id: 'underrun', title: '机房巡检 · Underrun', subtitle: '灰调俯视射击 · 静音小窗', cover: 'underrun', categories: ['local'], time: '按关卡推进', device: '桌面键鼠', access: '无需登录', save: '仅本轮状态', ranking: '不计官方排行、成就或办公币', description: '穿行低饱和机房场景，完成一次俯视射击巡检。', rules: <p>本站本地运行，无第三方嵌入或广告，开源许可保留。离开页面结束本轮，失焦自动暂停。</p>, actions: <Link className={styles.primaryButton} to="/games/underrun">打开机房巡检</Link> });
  for (const game of catalog?.games ?? []) {
    const path = PRACTICE_PATHS[game.gameKey];
    if (!path) continue;
    const title = game.gameKey === 'zhesi' ? '遮司 · 原命格录' : `${game.name} · 本机练习`;
    add({ id: `practice-${game.gameKey}`, title, subtitle: '经典本机 · 独立于账号短局', cover: game.gameKey, categories: ['local'], time: '自由练习', device: game.gameKey === 'tank' ? '桌面键鼠' : '键盘 / 触屏', access: '无需登录', save: game.gameKey === 'zhesi' ? '当前浏览器存档' : game.gameKey === 'snake' ? '本机最高分 · 本轮状态' : '仅本轮状态', ranking: '不参与办公币奖励日榜', description: game.gameKey === 'zhesi' ? '继续原命格录养成；旧存档不会被新版账号试炼读取。' : '保留经典自由练习，无需建立账号赛局即可开始。', rules: <p>{catalog?.historyNotice} 本机进度与账号计榜短局独立，不混算成绩或奖励。</p>, actions: <Link className={styles.primaryButton} to={path}>{game.gameKey === 'zhesi' ? title : `练习${game.name}`}</Link> });
  }
  const query = search.trim().toLocaleLowerCase();
  const visibleCards = cards.filter(card => (filter === 'all' || card.categories.includes(filter)) && (!query || `${card.title} ${card.subtitle} ${card.description}`.toLocaleLowerCase().includes(query)));
  return <section className={styles.gallery} aria-label="小游戏专区">
    <header className={styles.hero}>
      <div className={styles.heroCopy}><span className={styles.eyebrow}><span />工作台 / 游戏大厅</span><h1>留一点时间，<br /><span>给好玩的事。</span></h1><p>短局挑战、同事组队与长期养成，都在这里。<br />选一个适合现在的节奏，随时返回工作台。</p><div className={styles.heroActions}><button type="button" className={styles.primaryButton} onClick={() => { setFilter('solo'); setSearch(''); }}>来一局短挑战 <span aria-hidden="true">↗</span></button><Link className={styles.secondaryButton} to="/games/rooms">玩家建房</Link></div><div className={styles.heroHints}><span>◌ 默认静音</span><span>◇ 本地练习与账号日榜独立</span></div></div>
      <aside className={styles.heroGuide} aria-label="收起与计时说明"><span className={styles.guideIcon} aria-hidden="true">⌘</span><span className={styles.eyebrow}>工作稿模式</span><h2>好玩，也能随时收起。</h2><p>支持小窗的游戏可以收起或切换便签，界面保持低调。</p><dl><div><dt>本地练习</dt><dd>收起画面可暂停本轮</dd></div><div><dt>实时赛局</dt><dd>联机与账号赛局仍正常计时</dd></div></dl><small>存档、暂停和参榜条件，以各游戏说明为准。</small></aside>
    </header>
    <div className={styles.directoryToolbar}><div><span className={styles.eyebrow}>挑选你的下一局</span><h2>游戏目录</h2></div><label className={styles.search}><span aria-hidden="true">⌕</span><span className={styles.srOnly}>搜索游戏</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索名称或玩法" /></label></div>
    <div className={styles.filters} role="group" aria-label="筛选游戏类型">{FILTERS.map(item => <button key={item.key} type="button" aria-pressed={filter === item.key} onClick={() => setFilter(item.key)}>{item.label}<span>{cards.filter(card => item.key === 'all' || card.categories.includes(item.key)).length}</span></button>)}</div>
    <p className={styles.directoryStatus} aria-live="polite">显示 {visibleCards.length} 个入口 <span>本地收起可暂停；联机房间与账号赛局仍正常计时。</span></p>
    {error ? <div className={styles.error} role="alert">{error} <Link to="/games/rooms">查看进行中的房间</Link></div> : null}
    {catalogError ? <div className={styles.error} role="alert">{catalogError} <button type="button" className={styles.secondaryButton} onClick={retry}>重试目录</button><span>账号挑战与经典练习目录暂不可用，其他已开放入口仍可访问。</span></div> : null}
    {!catalog && !catalogError ? <p role="status" className={styles.loading}>正在读取小游戏目录…</p> : null}
    <div className={styles.cardGrid} aria-label="游戏目录结果">{visibleCards.map(card => <GameCard key={card.id} card={card} />)}</div>
    {visibleCards.length === 0 ? <div className={styles.empty}><h3>暂时没有匹配的游戏</h3><p>试试其他关键词或分类。</p><button className={styles.secondaryButton} type="button" onClick={() => { setSearch(''); setFilter('all'); }}>查看全部游戏</button></div> : null}
    {catalog ? <aside className={styles.settlement} aria-label="排行榜与奖励规则"><div><span aria-hidden="true">◇</span><strong>排名有规则，练习无负担。</strong></div><p>{catalog.rankingRules}<br />{catalog.rewardRules} · {catalog.settlementTime}</p><p>{catalog.historyNotice}</p><Link className={styles.textLink} to="/leaderboards?tab=games">查看全站排行榜 →</Link></aside> : null}
  </section>;
}
