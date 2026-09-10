import { useEffect, useState, type JSX } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';

import { communityDirectMessagesApi } from '../../api/community';
import {
  COMMUNITY_FEATURE_FLAGS,
  COMMUNITY_SYSTEM_NAV,
  communitySystemByPath,
  type CommunitySystemId,
} from '../../app/community-nav';
import { SITE_NAME } from '../../app/site-config';
import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import {
  refreshCommunityWallet,
  synchronizeCommunityWalletSession,
  useCommunityWalletStore,
} from '../../app/store/community-wallet-store';
import {
  acquireCommunityChatConnection,
  releaseCommunityChatConnection,
} from '../../features/community-chat/community-chat-connection';
import {
  DevelopmentAccessProvider,
  useDevelopmentAccessState,
} from '../../features/development/development-access';
import { Button, Modal } from '../ui';
import { SystemIcon } from './SystemIcon';
import { ThemeSwitch } from './ThemeSwitch';
import styles from './CommunityShell.module.css';
import { FishGrowthSummary } from '../../features/community-progression/FishGrowthSummary';


const PROFESSION_LABELS: Record<string, string> = {
  developer: '程序员',
  product: '产品经理',
  qa: '测试',
  sales: '销售员',
  hr: '人力资源管理',
};

function isWorkspaceRoute(pathname: string): boolean {
  return Boolean(communitySystemByPath(pathname)) || [
    '/notifications',
    '/account',
    '/settings',
    '/moderation',
    '/development',
  ].some((prefix) => pathname.startsWith(prefix));
}

export function CommunitySiteLayout(): JSX.Element {
  const location = useLocation();
  const phase = useCommunityAuthStore((state) => state.phase);
  const user = useCommunityAuthStore((state) => state.user);
  const restoreSession = useCommunityAuthStore((state) => state.restoreSession);
  const logout = useCommunityAuthStore((state) => state.logout);
  const currentSystem = communitySystemByPath(location.pathname);
  const [directUnreadCount, setDirectUnreadCount] = useState(0);
  const developmentAccess = useDevelopmentAccessState();
  const wallet = useCommunityWalletStore();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [navigationQuery, setNavigationQuery] = useState('');
  useEffect(() => { setNavigationOpen(false); setNavigationQuery(''); }, [location.key, user?.publicId, phase]);

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  useEffect(() => {
    synchronizeCommunityWalletSession();
    if (phase !== 'active' || !user?.publicId) return;
    void refreshCommunityWallet();
    const refresh = (): void => { if (!document.hidden) void refreshCommunityWallet(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [phase, user?.publicId, location.pathname]);

  useEffect(() => {
    if (
      phase !== 'active' ||
      !COMMUNITY_FEATURE_FLAGS.chat ||
      !COMMUNITY_FEATURE_FLAGS.friends
    ) {
      setDirectUnreadCount(0);
      return;
    }
    let active = true;
    let unreadRequestVersion = 0;
    const refreshUnread = async (): Promise<void> => {
      const requestVersion = ++unreadRequestVersion;
      try {
        const page = await communityDirectMessagesApi.listConversations();
        if (active && requestVersion === unreadRequestVersion) {
          setDirectUnreadCount(Math.max(0, page.totalUnread ?? 0));
        }
      } catch {
        // 保留上一次可信未读数；实时连接恢复后会再次同步。
      }
    };
    const connection = acquireCommunityChatConnection();
    const removeListener = connection.addListener((event) => {
      if (
        (event.kind === 'state' && event.snapshot.status === 'ready') ||
        (event.kind === 'protocol' && (
          event.event.type === 'chat.direct.message.created' ||
          event.event.type === 'chat.direct.message.updated' ||
          event.event.type === 'chat.direct.read.updated'
        ))
      ) {
        void refreshUnread();
      }
    });
    connection.connect();
    void refreshUnread();
    return () => {
      active = false;
      unreadRequestVersion += 1;
      removeListener();
      releaseCommunityChatConnection(connection);
    };
  }, [phase, user?.publicId]);

  const signedIn = phase !== 'guest' && phase !== 'bootstrapping';
  const workspaceRoute = isWorkspaceRoute(location.pathname);
  const primaryNav = COMMUNITY_SYSTEM_NAV.filter((item) => item.enabled).slice(0, 5);
  const utilityNav = COMMUNITY_SYSTEM_NAV.filter((item) =>
    item.enabled && (item.id === 'games' || item.id === 'tools' || item.id === 'deskPet'),
  );
  const mobileNavIds: CommunitySystemId[] = ['home', 'community', 'messages', 'friends', 'profile'];
  const mobileNav = mobileNavIds
    .map((id) => COMMUNITY_SYSTEM_NAV.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item?.enabled));
  const displayName = user?.displayName ?? '游客同事';
  const profession = user?.battleProfession
    ? PROFESSION_LABELS[user.battleProfession] ?? '办公室新人'
    : '办公室新人';
  const developmentAllowed = developmentAccess.status === 'allowed';
  const developmentCurrent = location.pathname.startsWith('/development');
  const canModerate = phase === 'active' && user?.roles?.some((role) => role === 'moderator' || role === 'admin');
  const directoryItems = COMMUNITY_SYSTEM_NAV.filter((item) => item.enabled && `${item.label} ${item.description}`.includes(navigationQuery.trim()));
  const walletBalance = wallet.ownerId === user?.publicId ? wallet.officeCoins : null;
  const walletUnsynced = wallet.status === 'stale' || wallet.status === 'error';
  const walletLabel = walletBalance === null
    ? walletUnsynced ? '余额未同步' : '余额同步中'
    : walletBalance.toLocaleString('zh-CN');

  return (
    <DevelopmentAccessProvider value={developmentAccess}>
    <div className={styles.shell}>
      <a className="skip-link" href="#community-main">跳到主要内容</a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link className={styles.brand} to="/" aria-label={`${SITE_NAME}首页`}>
            <span className={styles.brandMark} aria-hidden="true">摸</span>
            <span>
              <strong>{SITE_NAME}</strong>
              <small>协作 · 工具 · 工作台</small>
            </span>
          </Link>

          <button type="button" className={styles.navigationTrigger} aria-label="浏览全部栏目" aria-haspopup="dialog" aria-expanded={navigationOpen} onClick={() => { setNavigationQuery(''); setNavigationOpen(true); }}><SystemIcon name="menu" /><span>全部栏目</span></button>
          <nav className={styles.topNav} aria-label="快捷导航">
            {primaryNav.map((item) => (
              <Link
                key={item.id}
                to={item.path}
                aria-label={item.id === 'messages' && directUnreadCount > 0
                  ? `${item.label}，${directUnreadCount} 条未读`
                  : undefined}
                data-current={currentSystem?.id === item.id}
                aria-current={currentSystem?.id === item.id ? 'page' : undefined}
              >
                {item.label}
                {item.id === 'messages' && directUnreadCount > 0 ? (
                  <em className={styles.unreadBadge}>{Math.min(directUnreadCount, 99)}</em>
                ) : null}
              </Link>
            ))}
          </nav>

          <div className={styles.accountActions}>
            <ThemeSwitch />
            {phase === 'bootstrapping' ? (
              <span className={styles.sessionState}>连接中…</span>
            ) : signedIn ? (
              <>
                {phase === 'active' ? <Link className={styles.walletLink} to="/farm" aria-label={`办公币 ${walletLabel}${walletUnsynced && walletBalance !== null ? '，待同步' : ''}，查看农场余额与收益`} title="查看农场余额与收益" data-stale={walletUnsynced}><span>办公币</span><strong>{walletLabel}</strong>{walletUnsynced && walletBalance !== null ? <small>待同步</small> : null}</Link> : null}
                {phase === 'active' && COMMUNITY_FEATURE_FLAGS.community && COMMUNITY_FEATURE_FLAGS.moderation && user?.roles?.some((role) => role === 'moderator' || role === 'admin') ? (
                  <Link className={styles.noticeLink} to="/moderation">审核台</Link>
                ) : null}
                {phase === 'active' && COMMUNITY_FEATURE_FLAGS.news && COMMUNITY_FEATURE_FLAGS.newsAdmin && user?.roles?.some((role) => role === 'moderator' || role === 'admin') ? (
                  <Link className={styles.noticeLink} to="/news/admin" aria-label="热点资讯编辑发布台">资讯台</Link>
                ) : null}
                {developmentAllowed ? <Link className={styles.noticeLink} to="/development">开发协作</Link> : null}
                <Link className={styles.noticeLink} to="/notifications" aria-label="通知中心">通知</Link>
                <Link className={styles.accountLink} to={phase === 'active' ? '/me' : '/account/status'}>
                  {displayName}
                </Link>
                <Button variant="ghost" size="sm" onClick={() => void logout()}>退出</Button>
              </>
            ) : (
              <>
                <Link className={styles.loginLink} to="/login">登录</Link>
                {COMMUNITY_FEATURE_FLAGS.registration ? (
                  <Link className={styles.registerLink} to="/register">注册工位</Link>
                ) : null}
              </>
            )}
          </div>
        </div>
        {/* 手机首页提供直达入口；会话页保持原页头高度，避免遮挡聊天输入区。 */}
        {location.pathname === '/' ? (
          <nav className={styles.mobileUtilities} aria-label="小游戏、工具与搭子快捷入口">
            {utilityNav.map((item) => (
              <Link key={item.id} to={item.path}
                aria-current={currentSystem?.id === item.id ? 'page' : undefined}>
                <span aria-hidden="true"><SystemIcon name={item.id} /></span>
                <b>{item.label}</b>
                <span aria-hidden="true">→</span>
              </Link>
            ))}
          </nav>
        ) : null}
      </header>

      <div className={workspaceRoute ? styles.workspace : styles.publicFrame} data-home={location.pathname === '/'}>
        {workspaceRoute ? (
          <aside className={styles.leftRail} aria-label="我的工作台">
            <section className={styles.identityCard}>
              <span className={styles.avatar} aria-hidden="true">{displayName.slice(0, 1).toUpperCase()}</span>
              <div>
                <small>{signedIn ? '我的工位' : '临时工位'}</small>
                <strong>{displayName}</strong>
                <span><i /> {signedIn ? profession : '登录后保存进度'}</span>
              </div>
            </section>

            {phase === 'active' && COMMUNITY_FEATURE_FLAGS.communityProgressionEnabled ? <FishGrowthSummary compact /> : null}
            <nav className={styles.sideNav} aria-label="全部系统">
              <p>工作台</p>
              {COMMUNITY_SYSTEM_NAV.filter((item) => item.enabled).map((item) => (
                <Link
                  key={item.id}
                  to={item.path}
                  aria-label={item.id === 'messages' && directUnreadCount > 0
                    ? `${item.label}，${directUnreadCount} 条未读`
                    : undefined}
                  data-current={currentSystem?.id === item.id}
                  aria-current={currentSystem?.id === item.id ? 'page' : undefined}
                >
                  <span aria-hidden="true"><SystemIcon name={item.id} /></span>
                  <b>{item.label}</b>
                  {item.id === 'messages' && directUnreadCount > 0 ? (
                    <em className={styles.unreadBadge}>{Math.min(directUnreadCount, 99)}</em>
                  ) : null}
                </Link>
              ))}
              {developmentAllowed ? (
                <Link
                  to="/development"
                  data-current={developmentCurrent}
                  aria-current={developmentCurrent ? 'page' : undefined}
                >
                  <span aria-hidden="true"><SystemIcon name="development" /></span>
                  <b>开发协作</b>
                </Link>
              ) : null}
            </nav>

            <div className={styles.railFoot}>
              {signedIn ? <Link to="/account/security">账号与安全</Link> : <Link to="/login">登录并保存成长进度</Link>}
              <Link to="/community-guidelines">社区公约</Link>
            </div>
          </aside>
        ) : null}

        <div id="community-main" className={styles.main} tabIndex={-1}>
          <Outlet />
        </div>

        {workspaceRoute && location.pathname === '/' ? (
          <aside className={styles.rightRail} aria-label="快捷行动">
            <section className={styles.actionWidget}>
              <span>现在就玩</span>
              <strong>工位防线</strong>
              <p>首回合经营布阵，次回合迎战混合稽查与加班首领。</p>
              <Link to="/tower-defense">开始守工位 <b>→</b></Link>
            </section>
            {COMMUNITY_FEATURE_FLAGS.farm ? (
              <section className={styles.miniWidget}>
                <div><span aria-hidden="true">☘</span><strong>工位绿植</strong></div>
                <p>每天一次轻操作，离线也会成长。</p>
                <Link to="/farm">去看看</Link>
              </section>
            ) : null}
            <section className={styles.miniWidget}>
              <div><span aria-hidden="true">⌁</span><strong>效率工具</strong></div>
              <p>文本、时间和数据处理，打开即用。</p>
              <Link to="/tools">打开工具箱</Link>
            </section>
            <section className={styles.tipWidget}>
              <small>工位提示</small>
              <p>{signedIn ? '通知、好友请求和成长进度都集中在左侧工作台。' : '登录后可以进入农场、工位塔防和社区；工具与小游戏无需登录。'}</p>
            </section>
          </aside>
        ) : null}
      </div>

      {workspaceRoute && mobileNav.length > 0 ? (
        <nav className={styles.mobileDock} aria-label="移动端快捷导航">
          {mobileNav.map((item) => (
            <Link
              key={item.id}
              to={item.path}
              data-current={currentSystem?.id === item.id}
              aria-label={item.id === 'messages' && directUnreadCount > 0
                ? `${item.label}，${directUnreadCount} 条未读`
                : undefined}
              aria-current={currentSystem?.id === item.id ? 'page' : undefined}
            >
              <span aria-hidden="true"><SystemIcon name={item.id} /></span>
              <small>{item.id === 'profile' ? '我的' : item.label}</small>
              {item.id === 'messages' && directUnreadCount > 0 ? (
                <em className={styles.unreadBadge}>{Math.min(directUnreadCount, 99)}</em>
              ) : null}
            </Link>
          ))}
          {developmentAllowed ? (
            <Link
              to="/development"
              data-current={developmentCurrent}
              aria-current={developmentCurrent ? 'page' : undefined}
            >
              <span aria-hidden="true"><SystemIcon name="development" /></span>
              <small>开发</small>
            </Link>
          ) : null}
        </nav>
      ) : null}
      <Modal open={navigationOpen} onClose={() => setNavigationOpen(false)} title="全部栏目" size="lg">
        <div className={styles.navigationSearch}>
          <label htmlFor="workspace-navigation-search">查找栏目</label>
          <input id="workspace-navigation-search" type="search" placeholder="例如：工具、聊天室、排行榜" maxLength={80} value={navigationQuery} onChange={(event) => setNavigationQuery(event.target.value)} />
        </div>
        <nav className={styles.navigationGrid} aria-label="栏目目录">
          {directoryItems.map((item) => <Link key={item.id} to={item.path} onClick={() => setNavigationOpen(false)} aria-current={currentSystem?.id === item.id ? 'page' : undefined}><SystemIcon name={item.id} /><span>{item.label}</span></Link>)}
          {developmentAllowed && '开发协作'.includes(navigationQuery.trim()) ? <Link to="/development" onClick={() => setNavigationOpen(false)}><SystemIcon name="development" /><span>开发协作</span></Link> : null}
        </nav>
        {!directoryItems.length && !(developmentAllowed && '开发协作'.includes(navigationQuery.trim())) ? <p role="status">没有匹配的栏目，试试更短的关键词。</p> : null}
        <div className={styles.navigationFooter}>
          {canModerate && COMMUNITY_FEATURE_FLAGS.community && COMMUNITY_FEATURE_FLAGS.moderation ? <Link to="/moderation" onClick={() => setNavigationOpen(false)}>审核台</Link> : null}
          {canModerate && COMMUNITY_FEATURE_FLAGS.news && COMMUNITY_FEATURE_FLAGS.newsAdmin ? <Link to="/news/admin" onClick={() => setNavigationOpen(false)}>资讯台</Link> : null}
          {signedIn ? <><Link to="/account/security" onClick={() => setNavigationOpen(false)}>账号与安全</Link><Link to="/notifications" onClick={() => setNavigationOpen(false)}>通知中心</Link><Button variant="secondary" size="sm" onClick={() => { setNavigationOpen(false); void logout(); }}>退出登录</Button></> : <Link to="/login" onClick={() => setNavigationOpen(false)}>登录账号</Link>}
        </div>
      </Modal>
    </div>
    </DevelopmentAccessProvider>
  );
}
