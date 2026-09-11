import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';

import { SITE_NAME } from '../../../app/site-config';
import { ThemeSwitch } from '../../../components/layout/ThemeSwitch';
import { useCommunityAuthStore } from '../../../app/store/community-auth-store';
import { refreshCommunityWallet, synchronizeCommunityWalletSession, useCommunityWalletStore } from '../../../app/store/community-wallet-store';
import { GamePrivacyProvider, useGamePrivacy } from '../GamePrivacyContext';
import styles from './GameRooms.module.css';
import { useBallpointWindow } from '../ballpoint-breach/BallpointWindow';
import { CommunityDirectoryTrigger, CommunitySidebarLinks, CommunityWorkspaceNavigationBoundary, useCommunityWorkspaceNavigation } from '../../../components/layout/CommunityWorkspaceNavigation';

/** Controls can stop accepting input while the mounted session is covered. */
export function useGameWorkspaceHidden(): boolean {
  return useGamePrivacy().covered;
}

export function CommunityGameWorkspaceLayout(): JSX.Element {
  return <CommunityWorkspaceNavigationBoundary><CommunityGameWorkspaceContent /></CommunityWorkspaceNavigationBoundary>;
}

function CommunityGameWorkspaceContent(): JSX.Element {
  const navigation = useCommunityWorkspaceNavigation();
  const { coverWindow } = useBallpointWindow();
  const location = useLocation();
  const phase = useCommunityAuthStore((state) => state.phase);
  const user = useCommunityAuthStore((state) => state.user);
  const restoreSession = useCommunityAuthStore((state) => state.restoreSession);
  const wallet = useCommunityWalletStore();
  const [covered, setCovered] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const toggleCover = useCallback(() => setCovered((value) => !value), []);
  const [notes, setNotes] = useState('');
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const coverButtonRef = useRef<HTMLButtonElement>(null);
  const wasCovered = useRef(false);

  useEffect(() => { setNotes(''); setCovered(false); setRailCollapsed(false); }, [user?.publicId]);
  useEffect(() => { if (covered) coverWindow(); }, [covered, coverWindow]);

  useEffect(() => { void restoreSession(); }, [restoreSession]);
  useEffect(() => {
    synchronizeCommunityWalletSession();
    if (phase !== 'active' || !user?.publicId) return undefined;
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
    const shortcut = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
      event.preventDefault();
      setCovered((value) => !value);
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  useEffect(() => {
    if (covered) notesRef.current?.focus();
    else if (wasCovered.current) coverButtonRef.current?.focus({ preventScroll: true });
    wasCovered.current = covered;
  }, [covered]);

  const balance = wallet.ownerId === user?.publicId ? wallet.officeCoins : null;
  const stale = wallet.status === 'stale' || wallet.status === 'error';

  return (
    <GamePrivacyProvider value={{ covered: covered || navigation.open, toggleCover }}>
      <div className={styles.workspace} data-activity-covered={covered || navigation.open ? 'true' : undefined}>
        <header className={styles.workspaceHeader}>
          <Link to="/" className={styles.workspaceBrand}>{SITE_NAME}<span>协作工作台</span></Link>
          <CommunityDirectoryTrigger neutral />
          <nav aria-label="工作台导航" className={styles.workspaceNav} hidden={covered}>
            <Link to="/games">小游戏专区</Link>
            <Link to="/leaderboards">排行榜</Link>
            <Link to="/community/chat">聊天室</Link>
            {phase === 'active' ? <Link to="/farm" className={styles.wallet}>办公币 <strong>{balance === null ? '待同步' : balance.toLocaleString('zh-CN')}</strong>{stale && balance !== null ? <small>待同步</small> : null}</Link> : <Link to="/login">登录账号</Link>}
          </nav>
          <button ref={coverButtonRef} type="button" className={styles.quietButton} onClick={() => setCovered((value) => !value)} aria-pressed={covered} aria-keyshortcuts="Escape">{covered ? '返回工作区' : '便签遮罩'}<kbd>Esc</kbd></button>
          <ThemeSwitch />
        </header>
        <div className={styles.workspaceBody} data-rail={Boolean(user?.publicId && phase !== 'guest' && phase !== 'bootstrapping' && !covered)} data-collapsed={railCollapsed}>
          {user?.publicId && phase !== 'guest' && phase !== 'bootstrapping' && !covered ? <aside className={styles.workspaceRail} aria-label="我的工作台">
            <button type="button" className={styles.railToggle} aria-label={railCollapsed ? '展开侧目录' : '收起侧目录'} aria-expanded={!railCollapsed} onClick={() => setRailCollapsed(value => !value)}>{railCollapsed ? '→' : '←'}<span>{railCollapsed ? '目录' : '收起侧目录'}</span></button>
            <div hidden={railCollapsed}><CommunitySidebarLinks /></div>
          </aside> : null}
        <main className={styles.workspaceMain}>
          <section className={styles.notes} hidden={!covered} aria-label="临时便签">
            <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>PERSONAL NOTES</span><h1>临时便签</h1></div><span className={styles.muted}>仅当前页面内存保存</span></div>
            <textarea ref={notesRef} aria-label="便签内容" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="记录待办与想法…" />
            <p>按 Esc 或点击“返回工作区”恢复。遮罩只收起画面，不暂停线上房间计时，也不会退出游戏。</p>
          </section>
          <div hidden={covered} className={styles.mountedWorkspace}><Outlet /></div>
        </main>
        </div>
        <footer className={styles.workspaceFooter}><span>默认静音 · 轻量界面</span><span>单机与玩家房间均有明确标识</span></footer>
      </div>
    </GamePrivacyProvider>
  );
}
