import { lazy, Suspense, useCallback, useEffect, useRef, useState, type JSX } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { COMMUNITY_FEATURE_FLAGS } from '../../app/community-nav';
import { getCommunitySessionGeneration } from '../../api/community-http';
import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import { beginCommunityWalletObservation, markCommunityWalletObservationFailed, publishCommunityWalletOverview, useCommunityWalletStore } from '../../app/store/community-wallet-store';
import {
  communityFarmApi, communityFeedsApi, communityNotificationsApi, communityProfileApi, communityRelationshipsApi,
  type CommunityFarmOverview, type CommunityFeedOverview, type CommunityNotificationPage, type CommunityProfile,
} from '../../api/community';
import { COMMUNITY_PROFESSIONS } from './community-professions';
import { communityRequestErrorMessage } from './request-error';
import { WorkspaceSceneBoundary } from './WorkspaceSceneBoundary';
import styles from './CommunityHome.module.css';

const WorkspaceDeskScene = lazy(() => import('./WorkspaceDeskScene'));
interface HomeSummaries {
  profile?: CommunityProfile;
  notifications?: CommunityNotificationPage;
  friends?: { pendingIncomingCount: number };
  farm?: CommunityFarmOverview;
  feed?: CommunityFeedOverview;
}
type SummaryKey = keyof HomeSummaries;
interface HomeSummaryState { ownerId: string | null; generation: number; data: HomeSummaries; errors: Partial<Record<SummaryKey, string>>; loading: boolean }
function farmStatus(farm: CommunityFarmOverview | undefined): string {
  if (!farm) return '绿植状态待同步';
  if (farm.state === 'ready') return '可以收获了';
  if (farm.state === 'growing') return '正在生长中';
  return '等待开始新一轮';
}

export function CommunityHomePage(): JSX.Element {
  const phase = useCommunityAuthStore((state) => state.phase);
  const user = useCommunityAuthStore((state) => state.user);
  const registration = useCommunityAuthStore((state) => state.pendingRegistration);
  const wallet = useCommunityWalletStore();
  const sessionGeneration = getCommunitySessionGeneration();
  const requestRevision = useRef(0);
  const [sceneEnabled, setSceneEnabled] = useState(false);
  const [summaryState, setSummaryState] = useState<HomeSummaryState>({ ownerId: null, generation: -1, data: {}, errors: {}, loading: false });
  const loadSummaries = useCallback(async (): Promise<void> => {
    if (phase !== 'active' || !user?.onboardingCompleted) return;
    const ownerId = user.id, revision = ++requestRevision.current, generation = getCommunitySessionGeneration();
    setSummaryState(current => ({ ownerId, generation, data: current.ownerId === ownerId && current.generation === generation ? current.data : {}, errors: {}, loading: true }));
    const tasks: Array<[SummaryKey, Promise<unknown>]> = [['profile', communityProfileApi.getMe()], ['notifications', communityNotificationsApi.list()]];
    const walletObservation = COMMUNITY_FEATURE_FLAGS.farm ? beginCommunityWalletObservation() : null;
    if (COMMUNITY_FEATURE_FLAGS.friends) tasks.push(['friends', communityRelationshipsApi.listRequests('incoming')]);
    if (COMMUNITY_FEATURE_FLAGS.farm) tasks.push(['farm', communityFarmApi.getOverview()]);
    if (COMMUNITY_FEATURE_FLAGS.feed) tasks.push(['feed', communityFeedsApi.getOverview()]);
    const settled = await Promise.allSettled(tasks.map(([, request]) => request));
    // A previous account's late responses must not appear on a new colleague's desk.
    const auth = useCommunityAuthStore.getState();
    if (revision !== requestRevision.current || auth.phase !== 'active' || auth.user?.id !== ownerId || generation !== getCommunitySessionGeneration()) return;
    const next: HomeSummaries = {}, errors: Partial<Record<SummaryKey, string>> = {};
    settled.forEach((result, index) => {
      const key = tasks[index][0];
      if (result.status === 'fulfilled') {
        if (key === 'profile') next.profile = result.value as CommunityProfile;
        if (key === 'notifications') next.notifications = result.value as CommunityNotificationPage;
        if (key === 'friends') next.friends = result.value as { pendingIncomingCount: number };
        if (key === 'farm') { next.farm = result.value as CommunityFarmOverview; publishCommunityWalletOverview(walletObservation, next.farm); }
        if (key === 'feed') next.feed = result.value as CommunityFeedOverview;
      } else {
        errors[key] = communityRequestErrorMessage(result.reason, '暂时没有拿到最新状态');
        if (key === 'farm') markCommunityWalletObservationFailed(walletObservation);
      }
    });
    setSummaryState({ ownerId, generation, data: next, errors, loading: false });
  }, [phase, user?.id, user?.onboardingCompleted, sessionGeneration]);
  useEffect(() => { void loadSummaries(); return () => { requestRevision.current += 1; }; }, [loadSummaries]);
  if (phase === 'bootstrapping') return <div className="route-loading" role="status">正在打开你的工位…</div>;
  if (phase === 'pending_email' || registration) return <Navigate to="/register/verify" replace />;
  if (phase === 'suspended' || phase === 'banned' || phase === 'deleting') return <Navigate to="/account/status" replace />;
  if (phase === 'active' && !user?.onboardingCompleted) return <Navigate to="/onboarding" replace />;
  const signedIn = phase === 'active' && Boolean(user);
  const summaryMatches = signedIn && summaryState.ownerId === user?.id && summaryState.generation === sessionGeneration;
  const summaries = summaryMatches ? summaryState.data : {};
  const summaryErrors = summaryMatches ? summaryState.errors : {};
  const summaryLoading = signedIn && (!summaryMatches || summaryState.loading);
  const profileSummary = summaries.profile ?? user;
  const professionLabel = COMMUNITY_PROFESSIONS.find(profession => profession.id === profileSummary?.battleProfession)?.name ?? '还没选职业';
  const unreadCount = summaries.notifications?.unreadCount;
  const balance = signedIn && wallet.ownerId === user?.publicId ? wallet.officeCoins : null;
  const communityAvailable = COMMUNITY_FEATURE_FLAGS.community || COMMUNITY_FEATURE_FLAGS.chat;
  return <main className={styles.page}>
    <section className={styles.welcome} aria-labelledby="workspace-home-title">
      <div className={styles.welcomeContent}>
        <span className={styles.eyebrow}><span aria-hidden="true" />{signedIn ? '你的工位，已就绪' : '摸司 · 我的工作台'}</span>
        <h1 id="workspace-home-title">{signedIn ? <>{profileSummary?.displayName ?? '同事'}，<br />欢迎回到工位。</> : <>把日常，<br />安排得刚刚好。</>}</h1>
        <p>{signedIn ? '先接住重要的消息，再留一段自己的时间。今天的状态，都从这里开始。' : '顺手的工具、有趣的同事和一段轻松时间。在同一个空间，各就各位。'}</p>
        <div className={styles.heroActions}><Link className={styles.primaryAction} to={signedIn && communityAvailable ? '/community' : '/tools'}>{signedIn && communityAvailable ? '打开交流区' : '打开工具箱'}<span aria-hidden="true">↗</span></Link><Link className={styles.secondaryAction} to="/games">探索休闲项目 <span aria-hidden="true">→</span></Link></div>
        <div className={styles.welcomeMeta}><span aria-hidden="true">⌘</span><span>{signedIn ? '状态来自你的账户，刷新即可同步' : '工具和本地小游戏，无需登录即可体验'}</span></div>
      </div>
      <div className={styles.workspaceVisual}>
        <div className={styles.visualHeader}><span>个人空间</span><span className={styles.visualTag}>DESK / 01</span></div>
        {sceneEnabled ? <WorkspaceSceneBoundary><Suspense fallback={<ScenePlaceholder loading />}><WorkspaceDeskScene /></Suspense></WorkspaceSceneBoundary> : <ScenePlaceholder />}
        <div className={styles.visualFooter}><span>一点秩序，一点灵感。</span><button type="button" aria-pressed={sceneEnabled} onClick={() => setSceneEnabled(enabled => !enabled)}>{sceneEnabled ? '关闭 3D 视角' : '启动 3D 视角'}<span aria-hidden="true">{sceneEnabled ? '−' : '+'}</span></button></div>
      </div>
    </section>
    <section className={styles.section} aria-labelledby="desk-title">
      <div className={styles.sectionTitle}><div><span>DESK OVERVIEW</span><h2 id="desk-title">{signedIn ? '我的今日状态' : '登录后，拥有自己的工位'}</h2></div>{signedIn ? <button type="button" disabled={summaryLoading} onClick={() => void loadSummaries()}><span aria-hidden="true">↻</span>{summaryLoading ? '同步中…' : '刷新状态'}</button> : COMMUNITY_FEATURE_FLAGS.registration ? <Link to="/register">创建工位 <span aria-hidden="true">→</span></Link> : <Link to="/login">登录工位 <span aria-hidden="true">→</span></Link>}</div>
      <div className={styles.statusGrid}>
        <Link className={styles.profileCard} to="/me"><CardTop mark="我" label="个人档案" /><strong>{signedIn ? profileSummary?.displayName : '留下你的成长'}</strong><p>{signedIn ? `社区职业：${professionLabel}` : '资料、成就和称号，属于同一个你'}</p>{summaryErrors.profile ? <small role="status">{summaryErrors.profile}，当前显示登录资料</small> : <small>{signedIn ? '查看档案与成长记录' : '需登录 · 跨设备保存'}</small>}</Link>
        <Link to="/notifications"><CardTop mark="信" label="消息中心" /><strong>{signedIn ? unreadCount === undefined ? '消息待同步' : <><span className={styles.metricNumber}>{unreadCount.toLocaleString('zh-CN')}</span><span className={styles.metricUnit}>条未读</span></> : '接住每一次互动'}</strong><p>{summaryErrors.notifications ?? '回复、好友申请与系统提醒集中查看'}</p><small>{signedIn ? unreadCount === 0 ? '当前没有未读提醒' : '查看全部提醒' : '需登录 · 消息即时同步'}</small></Link>
        {COMMUNITY_FEATURE_FLAGS.farm ? <Link to="/me"><CardTop mark="币" label="办公币余额" /><strong>{signedIn ? balance === null ? '余额待同步' : <><span className={styles.metricNumber}>{balance.toLocaleString('zh-CN')}</span><span className={styles.metricUnit}>办公币</span></> : '看得见的收获'}</strong><p>{signedIn && (wallet.status === 'stale' || wallet.status === 'error') ? '余额暂未同步，已显示数值可能过期' : '账户实际余额，不是成长积分'}</p><small>{signedIn ? '查看账户与流水' : '需登录 · 记录每次入账'}</small></Link> : COMMUNITY_FEATURE_FLAGS.friends ? <Link to="/friends"><CardTop mark="友" label="我的好友" /><strong>{signedIn ? summaries.friends ? `${summaries.friends.pendingIncomingCount} 条待处理` : '好友状态待同步' : '找到熟悉的同事'}</strong><p>{summaryErrors.friends ?? '彼此交流，互相分享日常'}</p><small>{signedIn ? '查看好友与申请' : '需登录 · 添加好友'}</small></Link> : null}
      </div>
    </section>
    <section className={styles.section} aria-labelledby="quick-title">
      <div className={styles.sectionTitle}><div><span>YOUR NEXT MOVE</span><h2 id="quick-title">留一点时间，做喜欢的事</h2></div><span className={styles.sectionNote}>工作与休闲，各有位置</span></div>
      <div className={styles.bentoGrid}>
        <Link className={`${styles.destination} ${styles.gamesCard}`} to="/games"><DestinationTop label="休闲项目" /><div className={styles.abstractPreview} data-kind="games" aria-hidden="true"><span>01</span><span>PLAY</span><span>02</span></div><div className={styles.destinationCopy}><h3>换个频道，轻松一局。</h3><p>本地经典、策略养成与玩家房间，按你的节奏选择。</p><small>本地游戏无需登录 · 联机与账户成长需登录</small></div></Link>
        <Link className={`${styles.destination} ${styles.toolsCard}`} to="/tools"><DestinationTop label="随手工具" /><div className={styles.abstractPreview} data-kind="tools" aria-hidden="true"><span>{'{ }'}</span><span>Aa</span><span>◷</span></div><div className={styles.destinationCopy}><h3>小任务，顺手完成。</h3><p>文本、时间与数据处理，不必为了一个小需求打开一串页面。</p><small>无需登录 · 在浏览器本地处理</small></div></Link>
        {COMMUNITY_FEATURE_FLAGS.farm ? <Link className={`${styles.destination} ${styles.plantCard}`} to="/farm"><DestinationTop label="工位绿植" /><div className={styles.abstractPreview} data-kind="plant" aria-hidden="true"><span>CARE</span><span>GROW</span></div><div className={styles.destinationCopy}><h3>{signedIn ? farmStatus(summaries.farm) : '给日常，一点生长感。'}</h3><p>{summaryErrors.farm ?? (signedIn && summaries.farm ? `${summaries.farm.plant.name} · 农场等级 ${summaries.farm.plant.level}，离线生长继续。` : '一键照料，成熟后收获。进度与收益保存到账户。')}</p><small>{signedIn ? '查看绿植和收获详情' : '需登录 · 离线进度持续'}</small></div></Link> : null}
        {communityAvailable ? <Link className={`${styles.destination} ${styles.socialCard}`} to="/community"><DestinationTop label="交流空间" /><div className={styles.abstractPreview} data-kind="social" aria-hidden="true"><span>有个想法…</span><span>一起聊聊？</span></div><div className={styles.destinationCopy}><h3>同事之间，总有新话题。</h3><p>分享经验、提交问题，也可以加入聊天室实时交流。</p><small>{summaryErrors.friends ?? (signedIn && summaries.friends ? `${summaries.friends.pendingIncomingCount} 条好友申请待处理` : signedIn ? '帖子与聊天，同一个交流入口' : '需登录 · 发帖、聊天与好友互动')}</small></div></Link> : null}
      </div>
    </section>
    {COMMUNITY_FEATURE_FLAGS.news ? <section className={styles.newsEntry} aria-labelledby="home-news-title"><div className={styles.newsIcon} aria-hidden="true">◎</div><div className={styles.newsCopy}><span>今日视野</span><h2 id="home-news-title">世界很大，看看正在发生什么。</h2><p>分类新闻与每日热榜，在本站集中浏览。{!signedIn ? '需登录后查看。' : ''}</p></div><div className={styles.newsEntryActions}><Link to="/news">分类新闻 <span aria-hidden="true">→</span></Link><Link to="/news/trending">每日热榜 <span aria-hidden="true">→</span></Link></div></section> : null}
    <div className={styles.pageFootnote}><span aria-hidden="true">◇</span><p>工具数据如何处理，以各工具页面说明为准。</p><Link to="/privacy-policy">隐私说明 <span aria-hidden="true">↗</span></Link></div>
  </main>;
}
function CardTop({ mark, label }: { mark: string; label: string }): JSX.Element { return <div className={styles.cardTop}><span className={styles.statusIcon}>{mark}</span><span className={styles.cardCaption}>{label}</span><span className={styles.cardArrow} aria-hidden="true">↗</span></div>; }
function DestinationTop({ label }: { label: string }): JSX.Element { return <div className={styles.destinationTop}><span className={styles.destinationTag}>{label}</span><span aria-hidden="true">↗</span></div>; }
function ScenePlaceholder({ loading = false }: { loading?: boolean }): JSX.Element { return <div className={styles.scenePlaceholder}><span className={styles.sceneMonogram} aria-hidden="true">M /</span><span>{loading ? '正在加载 3D 工位…' : '属于你的个人空间'}</span><small>{loading ? '场景按需加载，不影响常用功能' : '点击下方启动，转动视角、点亮工位'}</small></div>; }
