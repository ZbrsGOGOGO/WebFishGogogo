import { describe, expect, it } from 'vitest';

import { COMMUNITY_FEATURE_FLAGS, COMMUNITY_SYSTEM_NAV, communitySystemByPath } from './community-nav';

describe('community relationship and growth release gates', () => {
  it('keeps API-dependent second-batch features disabled by default', () => {
    expect(COMMUNITY_FEATURE_FLAGS).toMatchObject({
      publicProfile: false,
      friends: false,
      invite: false,
      feed: false,
      farm: false,
      community: false,
      moderation: false,
      chat: false,
      news: false,
      newsAdmin: false,
      passwordReset: false,
      socialVerification: false,
      accountDeletion: false,
      towerDefense: true,
      demonTower: false,
      battleServer: false,
    });
  });
  it('exposes a dedicated account-only leaderboard sidebar entry', () => {
    expect(COMMUNITY_SYSTEM_NAV.find((item) => item.id === 'leaderboards')).toMatchObject({ path: '/leaderboards', label: '排行榜', enabled: true, requiresAccount: true });
    expect(communitySystemByPath('/leaderboards')?.id).toBe('leaderboards');
  });
  it('keeps the new tower gated without replacing the existing local defense game', () => {
    expect(COMMUNITY_SYSTEM_NAV.find((item) => item.id === 'demonTower')).toMatchObject({
      path: '/games/demon-tower', label: '九层妖塔', enabled: false, requiresAccount: true,
    });
    expect(COMMUNITY_SYSTEM_NAV.find((item) => item.id === 'towerDefense')).toMatchObject({
      path: '/tower-defense', enabled: true,
    });
    expect(communitySystemByPath('/games/demon-tower/leaderboard')?.id).toBe('demonTower');
  });
});
