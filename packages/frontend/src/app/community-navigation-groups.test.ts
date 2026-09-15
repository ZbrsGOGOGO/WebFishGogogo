import { describe, expect, it } from 'vitest';
import { COMMUNITY_SYSTEM_NAV } from './community-nav';
import { COMMUNITY_NAVIGATION_GROUPS, communityNavigationGroup, groupedCommunityNavigation } from './community-navigation-groups';

describe('workspace navigation groups', () => {
  it('covers each original system exactly once without introducing routes', () => {
    const ids = COMMUNITY_NAVIGATION_GROUPS.flatMap(group => group.items);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(COMMUNITY_SYSTEM_NAV.map(item => item.id).sort());
    COMMUNITY_NAVIGATION_GROUPS.forEach(group => expect(group.items).toContain(group.primaryId));
  });
  it('groups only supplied items, retaining their original route and capability', () => {
    const entries = COMMUNITY_SYSTEM_NAV.filter(item => ['games', 'tools'].includes(item.id));
    const groups = groupedCommunityNavigation(entries);
    expect(groups.map(group => group.id)).toEqual(['games', 'tools']);
    expect(groups.flatMap(group => group.entries)).toEqual(entries);
    expect(groupedCommunityNavigation([])).toEqual([]);
    expect(communityNavigationGroup('demonTower')).toBe('games');
    expect(communityNavigationGroup()).toBeUndefined();
  });
});
