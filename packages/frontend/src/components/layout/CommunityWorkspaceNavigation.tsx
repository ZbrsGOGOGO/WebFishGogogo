import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type JSX, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { COMMUNITY_FEATURE_FLAGS, COMMUNITY_SYSTEM_NAV, communitySystemByPath, type CommunitySystemNavItem, type CommunitySystemId } from '../../app/community-nav';
import { getCommunitySessionGeneration } from '../../api/community-http';
import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import {
  COMMUNITY_NAVIGATION_PREFERENCES_EVENT, communityNavigationStorageKey,
  defaultCommunityNavigationPreferences, normalizeCommunityNavigationPreferences,
  readCommunityNavigationPreferences, resetCommunityNavigationPreferences,
  writeCommunityNavigationPreferences, type CommunityNavigationPreferences,
} from '../../app/store/community-navigation-preferences';
import { DevelopmentAccessProvider, useDevelopmentAccessState, type DevelopmentAccessState } from '../../features/development/development-access';
import { SystemIcon } from './SystemIcon';
import shell from './CommunityShell.module.css';
import styles from './CommunityWorkspaceNavigation.module.css';

type Panel = 'directory' | 'settings';
type Editor = { scope: string; route: string; mode: Panel; draft: CommunityNavigationPreferences; baseline: string };
interface NavigationContextValue {
  items: CommunitySystemNavItem[];
  developmentAccess: DevelopmentAccessState;
  developmentAllowed: boolean;
  canCustomize: boolean;
  open: boolean;
  show: (panel?: Panel) => void;
  close: () => void;
}
const NavigationContext = createContext<NavigationContextValue | null>(null);

export function useCommunityWorkspaceNavigation(): NavigationContextValue {
  const value = useContext(NavigationContext);
  if (!value) throw new Error('CommunityWorkspaceNavigationProvider is missing');
  return value;
}

/** Standalone shell tests and alternate entry points reuse the same provider, never nest it. */
export function CommunityWorkspaceNavigationBoundary({ children }: { children: ReactNode }): JSX.Element {
  const existing = useContext(NavigationContext);
  return existing ? <>{children}</> : <CommunityWorkspaceNavigationProvider>{children}</CommunityWorkspaceNavigationProvider>;
}

export function CommunityWorkspaceNavigationProvider({ children }: { children: ReactNode }): JSX.Element {
  // Subscribe to the whole auth transition, including an explicit same-account login.
  const auth = useCommunityAuthStore();
  const generation = getCommunitySessionGeneration();
  const owner = auth.user?.publicId && auth.phase !== 'guest' && auth.phase !== 'bootstrapping' ? auth.user.publicId : null;
  const scope = `${owner ?? 'guest'}:${auth.phase}:${generation}`;
  const location = useLocation();
  const developmentAccess = useDevelopmentAccessState();
  const developmentAllowed = auth.phase === 'active' && developmentAccess.status === 'allowed' && developmentAccess.subjectPublicId === owner;
  const [stored, setStored] = useState(() => ({ scope, ...(owner ? readCommunityNavigationPreferences(owner) : { value: defaultCommunityNavigationPreferences(), failed: false }) }));
  const [editor, setEditor] = useState<Editor | null>(null);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const preferences = stored.scope === scope ? stored.value : defaultCommunityNavigationPreferences();
  const visibleEditor = editor?.scope === scope && editor.route === location.key ? editor : null;
  const current = (): boolean => {
    const latest = useCommunityAuthStore.getState();
    return latest.user?.publicId === owner && latest.phase === auth.phase && getCommunitySessionGeneration() === generation;
  };
  const close = useCallback(() => { setEditor(null); setQuery(''); setNotice(''); }, []);
  useEffect(() => { close(); }, [scope, location.key, close]);
  useEffect(() => {
    const load = (): void => {
      const latest = useCommunityAuthStore.getState();
      if (latest.user?.publicId !== owner || latest.phase !== auth.phase || getCommunitySessionGeneration() !== generation) return;
      setStored({ scope, ...(owner ? readCommunityNavigationPreferences(owner) : { value: defaultCommunityNavigationPreferences(), failed: false }) });
    };
    if (!owner) setStored({ scope, value: defaultCommunityNavigationPreferences(), failed: false });
    else load();
    const storage = (event: StorageEvent): void => {
      if (owner && (event.key === null || event.key === communityNavigationStorageKey(owner))) load();
    };
    const local = (event: Event): void => {
      if ((event as CustomEvent<{ owner?: string }>).detail?.owner === owner) load();
    };
    window.addEventListener('storage', storage);
    window.addEventListener(COMMUNITY_NAVIGATION_PREFERENCES_EVENT, local);
    return () => { window.removeEventListener('storage', storage); window.removeEventListener(COMMUNITY_NAVIGATION_PREFERENCES_EVENT, local); };
  }, [owner, scope, auth.phase, generation]);

  // Account-required links keep their existing login redirects. Only feature and
  // management permissions determine availability; preferences never grant access.
  const allowed = COMMUNITY_SYSTEM_NAV.filter(item => item.enabled);
  const ordered = preferences.order.map(id => allowed.find(item => item.id === id)).filter((item): item is CommunitySystemNavItem => Boolean(item));
  const items = ordered.filter(item => !preferences.hidden.includes(item.id));
  const show = (mode: Panel = 'directory'): void => {
    setQuery(''); setNotice('');
    setEditor({ scope, route: location.key, mode: mode === 'settings' && !owner ? 'directory' : mode, draft: normalizeCommunityNavigationPreferences(preferences), baseline: JSON.stringify(preferences) });
  };
  const changedElsewhere = visibleEditor?.mode === 'settings' && visibleEditor.baseline !== JSON.stringify(preferences);
  const save = (reset: boolean): void => {
    if (!owner || !visibleEditor || !current()) { close(); return; }
    // A second tab must not be silently overwritten by a stale editor.
    const latest = readCommunityNavigationPreferences(owner);
    if (latest.failed && !reset) {
      setStored({ scope, ...latest });
      setNotice('当前目录偏好无法读取，未覆盖已有设置。请稍后重试，或明确选择“恢复默认”。');
      return;
    }
    if (JSON.stringify(latest.value) !== visibleEditor.baseline) {
      setStored({ scope, ...latest });
      setNotice('另一个页面已更新目录。请载入最新设置后再修改。');
      return;
    }
    const value = reset ? defaultCommunityNavigationPreferences() : normalizeCommunityNavigationPreferences(visibleEditor.draft);
    const success = reset ? resetCommunityNavigationPreferences(owner) : writeCommunityNavigationPreferences(owner, value);
    if (!success) {
      setStored({ scope, value: defaultCommunityNavigationPreferences(), failed: true });
      setNotice('浏览器未允许保存，侧目录已使用默认设置；账号和栏目仍可正常访问。');
      return;
    }
    setStored({ scope, value, failed: false });
    setEditor({ ...visibleEditor, draft: value, baseline: JSON.stringify(value) });
    setNotice(reset ? '已恢复默认目录，仅影响当前账号在本浏览器的目录。' : '目录已保存，仅在当前账号的本浏览器生效。');
  };
  const move = (id: CommunitySystemId, direction: -1 | 1): void => {
    if (!visibleEditor) return;
    const available = visibleEditor.draft.order.filter(item => allowed.some(candidate => candidate.id === item));
    const neighbor = available[available.indexOf(id) + direction];
    if (!neighbor) return;
    const order = [...visibleEditor.draft.order];
    const from = order.indexOf(id); const to = order.indexOf(neighbor);
    [order[from], order[to]] = [order[to], order[from]];
    setEditor({ ...visibleEditor, draft: { ...visibleEditor.draft, order } });
    setNotice('');
  };
  const canModerate = auth.phase === 'active' && auth.user?.roles?.some(role => role === 'moderator' || role === 'admin');
  const directory = allowed.filter(item => `${item.label} ${item.description}`.includes(query.trim()));
  const currentSystem = communitySystemByPath(location.pathname);
  const settingsItems = visibleEditor?.draft.order.map(id => allowed.find(item => item.id === id)).filter((item): item is CommunitySystemNavItem => Boolean(item)) ?? [];

  return <NavigationContext.Provider value={{ items, developmentAccess, developmentAllowed, canCustomize: Boolean(owner), open: Boolean(visibleEditor), show, close }}>
    <DevelopmentAccessProvider value={developmentAccess}>
      {children}
      <NavigationDialog open={Boolean(visibleEditor)} title={visibleEditor?.mode === 'settings' ? '目录设置' : '全部栏目'} onClose={close}>
        {visibleEditor?.mode === 'settings' ? <>
          <p className={styles.hint}>仅保存当前账号在本浏览器的侧目录，不跨设备同步。隐藏不会关闭功能，仍可从“全部栏目”访问。</p>
          <p className={styles.fixedHint}>“全部栏目”和“目录设置”始终保留；管理入口按账号权限显示。</p>
          {changedElsewhere ? <div className={styles.warning} role="status">另一个页面已更新目录，未保存草稿不会自动覆盖它。<button type="button" onClick={() => { setEditor({ ...visibleEditor, draft: normalizeCommunityNavigationPreferences(preferences), baseline: JSON.stringify(preferences) }); setNotice('已载入最新设置，原草稿已丢弃。'); }}>载入最新设置</button></div> : null}
          <ol className={styles.settingsList} aria-label="侧目录显示与顺序">
            {settingsItems.map((item, index) => <li key={item.id}>
              <label><input type="checkbox" checked={!visibleEditor.draft.hidden.includes(item.id)} onChange={event => {
                const hidden = event.target.checked ? visibleEditor.draft.hidden.filter(id => id !== item.id) : [...visibleEditor.draft.hidden, item.id];
                setEditor({ ...visibleEditor, draft: { ...visibleEditor.draft, hidden } }); setNotice('');
              }} /><SystemIcon name={item.id} /><span>{item.label}</span></label>
              <div><button type="button" aria-label={`上移${item.label}`} disabled={index === 0} onClick={() => move(item.id, -1)}>↑</button><button type="button" aria-label={`下移${item.label}`} disabled={index === settingsItems.length - 1} onClick={() => move(item.id, 1)}>↓</button></div>
            </li>)}
          </ol>
          <div className={styles.editorActions}><button type="button" onClick={() => save(true)} disabled={Boolean(changedElsewhere)}>恢复默认</button><span /><button type="button" onClick={close}>取消编辑</button><button type="button" className={styles.primary} onClick={() => save(false)} disabled={Boolean(changedElsewhere)}>保存目录</button></div>
        </> : <>
          <div className={shell.navigationSearch}><label htmlFor="workspace-navigation-search">查找栏目</label><input id="workspace-navigation-search" type="search" placeholder="例如：工具、聊天室、排行榜" maxLength={80} value={query} onChange={event => setQuery(event.target.value)} /></div>
          <nav className={shell.navigationGrid} aria-label="栏目目录">{directory.map(item => <Link key={item.id} to={item.path} onClick={close} aria-current={currentSystem?.id === item.id ? 'page' : undefined}><SystemIcon name={item.id} /><span>{item.label}</span></Link>)}{developmentAllowed && '开发协作'.includes(query.trim()) ? <Link to="/development" onClick={close}><SystemIcon name="development" /><span>开发协作</span></Link> : null}</nav>
          {!directory.length && !(developmentAllowed && '开发协作'.includes(query.trim())) ? <p role="status">没有匹配的栏目，试试更短的关键词。</p> : null}
          <div className={shell.navigationFooter}>
            {owner ? <button type="button" className={styles.smallButton} onClick={() => show('settings')}>目录设置</button> : null}
            {canModerate && COMMUNITY_FEATURE_FLAGS.community && COMMUNITY_FEATURE_FLAGS.moderation ? <Link to="/moderation" onClick={close}>审核台</Link> : null}
            {canModerate && COMMUNITY_FEATURE_FLAGS.news && COMMUNITY_FEATURE_FLAGS.newsAdmin ? <Link to="/news/admin" onClick={close}>资讯台</Link> : null}
            {owner ? <><Link to="/account/security" onClick={close}>账号与安全</Link><Link to="/notifications" onClick={close}>通知中心</Link><button className={styles.smallButton} type="button" onClick={() => { close(); void auth.logout(); }}>退出登录</button></> : <Link to="/login" onClick={close}>登录账号</Link>}
          </div>
        </>}
        {notice ? <p role="status" className={styles.hint}>{notice}</p> : stored.scope === scope && stored.failed ? <p role="status" className={styles.hint}>目录偏好未能读取，当前使用默认目录。</p> : null}
      </NavigationDialog>
    </DevelopmentAccessProvider>
  </NavigationContext.Provider>;
}

export function CommunityDirectoryTrigger({ neutral = false }: { neutral?: boolean }): JSX.Element {
  const nav = useCommunityWorkspaceNavigation();
  return <button type="button" className={shell.navigationTrigger} aria-label="浏览全部栏目" aria-haspopup="dialog" aria-expanded={nav.open} onClick={() => nav.show()}><SystemIcon name="menu" /><span>{neutral ? '工作台目录' : '全部栏目'}</span></button>;
}

export function CommunitySidebarLinks({ unreadCount = 0 }: { unreadCount?: number }): JSX.Element {
  const nav = useCommunityWorkspaceNavigation();
  const location = useLocation();
  const current = communitySystemByPath(location.pathname);
  return <>
    <nav className={shell.sideNav} aria-label="全部系统"><p>工作台</p>
      {nav.items.map(item => <Link key={item.id} to={item.path} aria-label={item.id === 'messages' && unreadCount > 0 ? `${item.label}，${unreadCount} 条未读` : undefined} data-current={current?.id === item.id} aria-current={current?.id === item.id ? 'page' : undefined}><span aria-hidden="true"><SystemIcon name={item.id} /></span><b>{item.label}</b>{item.id === 'messages' && unreadCount > 0 ? <em className={shell.unreadBadge}>{Math.min(unreadCount, 99)}</em> : null}</Link>)}
      {nav.developmentAllowed ? <Link to="/development" data-current={location.pathname.startsWith('/development')} aria-current={location.pathname.startsWith('/development') ? 'page' : undefined}><span aria-hidden="true"><SystemIcon name="development" /></span><b>开发协作</b></Link> : null}
    </nav>
    {!nav.items.length ? <p className={styles.hint}>已隐藏全部可选栏目，可从下方找回。</p> : null}
    <div className={styles.fixedActions}><button type="button" onClick={() => nav.show()}>全部栏目</button>{nav.canCustomize ? <button type="button" onClick={() => nav.show('settings')}>目录设置</button> : null}</div>
  </>;
}

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
/** One dialog for catalog/settings: focus and body locking do not stack between these views. */
function NavigationDialog({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }): JSX.Element | null {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const escape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.isComposing) return;
      // Capture precedes game shortcuts registered on window; do not also open the privacy cover.
      event.preventDefault(); event.stopImmediatePropagation(); onClose();
    };
    window.addEventListener('keydown', escape, true);
    return () => {
      window.removeEventListener('keydown', escape, true);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open, onClose]);
  useEffect(() => { if (open) panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus(); }, [open, title]);
  if (!open) return null;
  return createPortal(<div className={styles.overlay} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }} onKeyDown={event => {
    event.stopPropagation();
    if (event.key !== 'Tab') return;
    const nodes = Array.from(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    const first = nodes[0]; const last = nodes[nodes.length - 1];
    if (!first) { event.preventDefault(); panel.current?.focus(); }
    else if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }}><div ref={panel} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}><div className={styles.dialogHeader}><h2 id={titleId}>{title}</h2><button type="button" aria-label="关闭" onClick={onClose}>×</button></div><div className={styles.dialogBody}>{children}</div></div></div>, document.body);
}
