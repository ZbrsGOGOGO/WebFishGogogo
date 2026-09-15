import { type CommunitySystemId, type CommunitySystemNavItem } from './community-nav';

export type CommunityNavigationGroupId = 'today' | 'social' | 'games' | 'tools' | 'personal';
export const COMMUNITY_NAVIGATION_GROUPS: readonly {
  id: CommunityNavigationGroupId; label: string; primaryId: CommunitySystemId; primaryLabel: string; items: readonly CommunitySystemId[];
}[] = [
  { id: 'today', label: '今日工作台', primaryId: 'home', primaryLabel: '今日', items: ['home', 'news'] },
  { id: 'social', label: '同事与交流', primaryId: 'community', primaryLabel: '交流', items: ['community', 'messages', 'friends'] },
  { id: 'games', label: '游戏与挑战', primaryId: 'games', primaryLabel: '游戏', items: ['games', 'demonTower', 'towerDefense', 'officeHub', 'leaderboards'] },
  { id: 'tools', label: '随手工具', primaryId: 'tools', primaryLabel: '工具', items: ['tools', 'deskPet'] },
  { id: 'personal', label: '我的工位', primaryId: 'profile', primaryLabel: '我的', items: ['profile', 'achievements', 'farm', 'feed', 'invite'] },
];

export function communityNavigationGroup(systemId?: CommunitySystemId): CommunityNavigationGroupId | undefined {
  return COMMUNITY_NAVIGATION_GROUPS.find(group => systemId && group.items.includes(systemId))?.id;
}

/** Feature filtering stays with the caller. Grouping never grants a capability. */
export function groupedCommunityNavigation(items: readonly CommunitySystemNavItem[]) {
  return COMMUNITY_NAVIGATION_GROUPS.map(group => ({
    ...group,
    entries: group.items.map(id => items.find(item => item.id === id)).filter((item): item is CommunitySystemNavItem => Boolean(item)),
  })).filter(group => group.entries.length > 0);
}
