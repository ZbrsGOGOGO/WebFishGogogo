import { useEffect, useRef, type JSX } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { COMMUNITY_SYSTEM_NAV, communitySystemByPath } from '../../app/community-nav';
import { COMMUNITY_NAVIGATION_GROUPS, communityNavigationGroup } from '../../app/community-navigation-groups';
import { attachWorkspaceDockMotion } from './workspace-dock-motion';
import { SystemIcon } from './SystemIcon';
import styles from './CommunityShell.module.css';

export function CommunityPrimaryNavigation({ unreadCount = 0, mobile = false }: { unreadCount?: number; mobile?: boolean }): JSX.Element {
  const location = useLocation();
  const ref = useRef<HTMLElement>(null);
  const current = communityNavigationGroup(communitySystemByPath(location.pathname)?.id)
    ?? (location.pathname.startsWith('/account') || location.pathname.startsWith('/settings') || location.pathname === '/notifications' ? 'personal' : undefined);
  const groups = COMMUNITY_NAVIGATION_GROUPS.filter(group => COMMUNITY_SYSTEM_NAV.some(item => item.id === group.primaryId && item.enabled));
  const ids = groups.map(group => group.id).join(',');
  useEffect(() => {
    if (!mobile && ref.current) return attachWorkspaceDockMotion(ref.current);
  }, [ids, mobile]);
  return <nav ref={ref} className={mobile ? styles.mobileDock : styles.topNav} aria-label={mobile ? '移动端快捷导航' : '快捷导航'}>
    {groups.map(group => {
      const item = COMMUNITY_SYSTEM_NAV.find(entry => entry.id === group.primaryId)!;
      const unread = group.id === 'social' ? unreadCount : 0;
      return <Link key={group.id} to={item.path} data-dock-item data-current={current === group.id}
        aria-current={current === group.id ? 'page' : undefined}
        aria-label={unread ? `${group.primaryLabel}，${unread} 条未读` : group.primaryLabel}>
        <span aria-hidden="true"><SystemIcon name={item.id} /></span><b>{group.primaryLabel}</b>
        {unread > 0 ? <em className={styles.unreadBadge}>{Math.min(unread, 99)}</em> : null}
      </Link>;
    })}
  </nav>;
}
