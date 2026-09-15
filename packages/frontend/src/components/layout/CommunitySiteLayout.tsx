import { useEffect, useState, type JSX } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';

import { communityDirectMessagesApi } from '../../api/community';
import { getCommunitySessionGeneration } from '../../api/community-http';
import {
  COMMUNITY_FEATURE_FLAGS,
  communitySystemByPath,
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
import { Button } from '../ui';
import { CommunityDirectoryTrigger, CommunitySidebarLinks, CommunityWorkspaceNavigationBoundary, useCommunityWorkspaceNavigation } from './CommunityWorkspaceNavigation';
import { ThemeSwitch } from './ThemeSwitch';
import { CommunityPrimaryNavigation } from './CommunityPrimaryNavigation';
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
  return <CommunityWorkspaceNavigationBoundary><CommunitySiteLayoutContent /></CommunityWorkspaceNavigationBoundary>;
}

function CommunitySiteLayoutContent(): JSX.Element {
  const location = useLocation();
  const phase = useCommunityAuthStore((state) => state.phase);
  const user = useCommunityAuthStore((state) => state.user);
  const restoreSession = useCommunityAuthStore((state) => state.restoreSession);
  const logout = useCommunityAuthStore((state) => state.logout);
  const unreadScope = `${phase}:${user?.publicId ?? 'guest'}:${getCommunitySessionGeneration()}`;
  const [directUnread, setDirectUnread] = useState({ scope: unreadScope, count: 0 });
  const directUnreadCount = directUnread.scope === unreadScope && phase === 'active' ? directUnread.count : 0;
  const navigation = useCommunityWorkspaceNavigation();
  const wallet = useCommunityWalletStore();

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
      setDirectUnread({ scope: unreadScope, count: 0 });
      return;
    }
    let active = true;
    let unreadRequestVersion = 0;
    const refreshUnread = async (): Promise<void> => {
      const requestVersion = ++unreadRequestVersion;
      try {
        const page = await communityDirectMessagesApi.listConversations();
        if (active && requestVersion === unreadRequestVersion) {
          const auth = useCommunityAuthStore.getState();
          if (`${auth.phase}:${auth.user?.publicId ?? 'guest'}:${getCommunitySessionGeneration()}` !== unreadScope) return;
          setDirectUnread({ scope: unreadScope, count: Math.max(0, page.totalUnread ?? 0) });
        }
      } catch {
        // 只保留同一账号会话的可信未读数；旧账号计数不会参与新页面展示。
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
  }, [phase, user?.publicId, unreadScope]);

  const signedIn = phase !== 'guest' && phase !== 'bootstrapping';
  const workspaceRoute = signedIn || isWorkspaceRoute(location.pathname);
  const displayName = user?.displayName ?? '游客同事';
  const profession = user?.battleProfession
    ? PROFESSION_LABELS[user.battleProfession] ?? '办公室新人'
    : '办公室新人';
  const developmentAllowed = navigation.developmentAllowed;
  const walletBalance = wallet.ownerId === user?.publicId ? wallet.officeCoins : null;
  const walletUnsynced = wallet.status === 'stale' || wallet.status === 'error';
  const walletLabel = walletBalance === null
    ? walletUnsynced ? '余额未同步' : '余额同步中'
    : walletBalance.toLocaleString('zh-CN');

  return (
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

          <CommunityDirectoryTrigger />
          <CommunityPrimaryNavigation unreadCount={directUnreadCount} />

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
            <CommunitySidebarLinks unreadCount={directUnreadCount} />

            <div className={styles.railFoot}>
              {signedIn ? <Link to="/account/security">账号与安全</Link> : <Link to="/login">登录并保存成长进度</Link>}
              <Link to="/community-guidelines">社区公约</Link>
            </div>
          </aside>
        ) : null}

        <div id="community-main" className={styles.main} tabIndex={-1}>
          <Outlet />
        </div>

      </div>

      {workspaceRoute ? <CommunityPrimaryNavigation unreadCount={directUnreadCount} mobile /> : null}
    </div>
  );
}
