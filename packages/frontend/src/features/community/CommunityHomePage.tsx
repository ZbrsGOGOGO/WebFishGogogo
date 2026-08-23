import { useCallback, useEffect, useState, type JSX } from 'react';
import { Link, Navigate } from 'react-router-dom';

import { COMMUNITY_FEATURE_FLAGS } from '../../app/community-nav';
import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import {
  communityFarmApi,
  communityFeedsApi,
  communityNotificationsApi,
  communityProfileApi,
  communityRelationshipsApi,
  type CommunityFarmOverview,
  type CommunityFeedOverview,
  type CommunityNotificationPage,
  type CommunityProfile,
} from '../../api/community';
import { PROFESSION_DEFINITIONS } from '../office-battle/office-battle-domain';
import { communityRequestErrorMessage } from './request-error';
import styles from './CommunityHomePage.module.css';

interface HomeSummaries {
  profile?: CommunityProfile;
  notifications?: CommunityNotificationPage;
  friends?: { pendingIncomingCount: number };
  farm?: CommunityFarmOverview;
  feed?: CommunityFeedOverview;
}

type SummaryKey = keyof HomeSummaries;

function farmStatus(farm: CommunityFarmOverview | undefined): string {
  if (!farm) return '看看你的桌面绿植';
  if (farm.state === 'ready') return '绿植成熟了，收一下';
  if (farm.state === 'growing') return '绿植正在悄悄长大';
  return '今天还没照料绿植';
}

export function CommunityHomePage(): JSX.Element {
  const phase = useCommunityAuthStore((state) => state.phase);
  const user = useCommunityAuthStore((state) => state.user);
  const registration = useCommunityAuthStore((state) => state.pendingRegistration);
  const [summaries, setSummaries] = useState<HomeSummaries>({});
  const [summaryErrors, setSummaryErrors] = useState<Partial<Record<SummaryKey, string>>>({});
  const [summaryLoading, setSummaryLoading] = useState(false);

  const loadSummaries = useCallback(async (): Promise<void> => {
    if (phase !== 'active' || !user?.onboardingCompleted) return;
    setSummaryLoading(true);
    const tasks: Array<[SummaryKey, Promise<unknown>]> = [
      ['profile', communityProfileApi.getMe()],
      ['notifications', communityNotificationsApi.list()],
    ];
    if (COMMUNITY_FEATURE_FLAGS.friends) tasks.push(['friends', communityRelationshipsApi.listRequests('incoming')]);
    if (COMMUNITY_FEATURE_FLAGS.farm) tasks.push(['farm', communityFarmApi.getOverview()]);
    if (COMMUNITY_FEATURE_FLAGS.feed) tasks.push(['feed', communityFeedsApi.getOverview()]);
    const settled = await Promise.allSettled(tasks.map(([, request]) => request));
    const next: HomeSummaries = {};
    const errors: Partial<Record<SummaryKey, string>> = {};
    settled.forEach((result, index) => {
      const key = tasks[index][0];
      if (result.status === 'fulfilled') {
        if (key === 'profile') next.profile = result.value as CommunityProfile;
        if (key === 'notifications') next.notifications = result.value as CommunityNotificationPage;
        if (key === 'friends') next.friends = result.value as { pendingIncomingCount: number };
        if (key === 'farm') next.farm = result.value as CommunityFarmOverview;
        if (key === 'feed') next.feed = result.value as CommunityFeedOverview;
      } else {
        errors[key] = communityRequestErrorMessage(result.reason, '暂时没有拿到最新状态');
      }
    });
    setSummaries(next);
    setSummaryErrors(errors);
    setSummaryLoading(false);
  }, [phase, user?.onboardingCompleted]);

  useEffect(() => {
    void loadSummaries();
  }, [loadSummaries]);

  if (phase === 'bootstrapping') return <div className="route-loading" role="status">正在打开你的工位…</div>;
  if (phase === 'pending_email' || registration) return <Navigate to="/register/verify" replace />;
  if (phase === 'suspended' || phase === 'banned' || phase === 'deleting') return <Navigate to="/account/status" replace />;
  if (phase === 'active' && !user?.onboardingCompleted) return <Navigate to="/onboarding" replace />;

  const signedIn = phase === 'active' && Boolean(user);
  const profileSummary = summaries.profile ?? user;
  const professionLabel = PROFESSION_DEFINITIONS.find(
    (profession) => profession.id === profileSummary?.battleProfession,
  )?.name ?? '还没选职业';
  const unreadCount = summaries.notifications?.unreadCount ?? 0;

  return (
    <main className={styles.page}>
      <section className={styles.welcome}>
        <div>
          <span className={styles.eyebrow}>{signedIn ? '欢迎回到工位' : '下班前，轻松一会儿'}</span>
          <h1>{signedIn ? `${user?.displayName ?? '同事'}，今天先做哪一件？` : '你的办公室成长社区'}</h1>
          <p>聊经验、种绿植、打乐斗。每个入口都只保留一个最清楚的下一步。</p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryAction} to="/ledou">马上打一局</Link>
            {COMMUNITY_FEATURE_FLAGS.farm ? (
              <Link className={styles.secondaryAction} to="/farm">照料绿植</Link>
            ) : signedIn ? (
              <Link className={styles.secondaryAction} to="/notifications">看看新消息</Link>
            ) : COMMUNITY_FEATURE_FLAGS.registration ? (
              <Link className={styles.secondaryAction} to="/register">创建我的工位</Link>
            ) : (
              <Link className={styles.secondaryAction} to="/games">玩更多小游戏</Link>
            )}
          </div>
        </div>
        <div className={styles.deskScene} aria-hidden="true">
          <div className={styles.window}><i /><i /><i /></div>
          <div className={styles.monitor}><span>ZBRS</span></div>
          <div className={styles.plant}><b>✦</b><i /></div>
          <div className={styles.desk} />
        </div>
      </section>

      <section className={styles.section} aria-labelledby="quick-title">
        <div className={styles.sectionTitle}>
          <div><span>QUICK START</span><h2 id="quick-title">现在就做</h2></div>
          {signedIn ? <button type="button" disabled={summaryLoading} onClick={() => void loadSummaries()}>{summaryLoading ? '更新中…' : '刷新状态'}</button> : null}
        </div>
        <div className={styles.actionGrid}>
          <Link className={styles.bigAction} data-tone="battle" to="/ledou">
            <span className={styles.actionMark}>斗</span>
            <div><small>办公室乐斗</small><strong>自动打一局</strong><p>五种职业、六件装备，第一次玩也能马上开打。</p></div>
            <b>开始 →</b>
          </Link>
          {COMMUNITY_FEATURE_FLAGS.community || COMMUNITY_FEATURE_FLAGS.chat ? (
            <Link className={styles.bigAction} data-tone="chat" to="/community">
              <span className={styles.actionMark}>聊</span>
              <div><small>经验交流</small><strong>看看同事在聊什么</strong><p>问题、经验和固定主题聊天室放在一起。</p></div>
              <b>进入 →</b>
            </Link>
          ) : (
            <Link className={styles.bigAction} data-tone="tools" to="/tools">
              <span className={styles.actionMark}>工</span>
              <div><small>效率工具</small><strong>打开即用的小工具</strong><p>文本、时间和常用数据处理，不用注册也能使用。</p></div>
              <b>打开 →</b>
            </Link>
          )}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="desk-title">
        <div className={styles.sectionTitle}>
          <div><span>MY DESK</span><h2 id="desk-title">{signedIn ? '我的今日工位' : '登录后可以做这些'}</h2></div>
        </div>
        <div className={styles.statusGrid}>
          <Link to={signedIn ? '/me' : '/login'}>
            <span className={styles.statusIcon}>我</span>
            <div><small>个人档案</small><strong>{signedIn ? profileSummary?.displayName : '保存你的成长'}</strong><p>{signedIn ? `乐斗职业：${professionLabel}` : '等级、装备、好友和绿植跨设备保留'}</p></div>
          </Link>
          <Link to={signedIn ? '/notifications' : '/login'}>
            <span className={styles.statusIcon}>信</span>
            <div><small>消息</small><strong>{signedIn ? `${Math.min(unreadCount, 99)}${unreadCount > 99 ? '+' : ''} 条未读` : '不错过互动'}</strong><p>{summaryErrors.notifications ?? '好友申请、回复和系统提醒集中查看'}</p></div>
          </Link>
          {COMMUNITY_FEATURE_FLAGS.farm ? (
            <Link to={signedIn ? '/farm' : '/login'}>
              <span className={styles.statusIcon}>种</span>
              <div><small>工位绿植</small><strong>{signedIn ? farmStatus(summaries.farm) : '每天照料一次'}</strong><p>{summaryErrors.farm ?? '一个按钮完成，不做复杂农场管理'}</p></div>
            </Link>
          ) : null}
          {COMMUNITY_FEATURE_FLAGS.friends ? (
            <Link to={signedIn ? '/friends' : '/login'}>
              <span className={styles.statusIcon}>友</span>
              <div><small>好友</small><strong>{signedIn && summaries.friends ? `${summaries.friends.pendingIncomingCount} 条待处理` : '找到熟悉的同事'}</strong><p>{summaryErrors.friends ?? '互相投喂、鼓励绿植，也可以切磋乐斗'}</p></div>
            </Link>
          ) : null}
        </div>
      </section>

      <section className={styles.board} aria-labelledby="board-title">
        <div className={styles.boardHeading}>
          <span>工位公告</span>
          <h2 id="board-title">从这里开始，不会走错</h2>
        </div>
        <div className={styles.boardList}>
          <Link to="/ledou"><time>01</time><div><strong>第一次来：选职业，打完一局</strong><p>不需要研究攻略，战斗自动完成；你只负责选择和成长。</p></div><span>去乐斗</span></Link>
          {COMMUNITY_FEATURE_FLAGS.farm ? <Link to="/farm"><time>02</time><div><strong>每天来：点一下照料绿植</strong><p>成熟后收获，再自动开始下一轮，进度离线继续。</p></div><span>去农场</span></Link> : null}
          <Link to="/tools"><time>03</time><div><strong>工作时：常用工具随手打开</strong><p>站点不只用来玩，也能处理日常的小任务。</p></div><span>工具箱</span></Link>
          <Link to="/games"><time>04</time><div><strong>想放松：玩一局经典小游戏</strong><p>俄罗斯方块和坦克大战，随开随停，还能挑战排行榜。</p></div><span>游戏厅</span></Link>
        </div>
      </section>
    </main>
  );
}
