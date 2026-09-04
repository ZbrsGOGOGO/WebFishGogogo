import { describe, expect, it } from 'vitest';

import { COMMUNITY_FEATURE_FLAGS } from './community-nav';

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
      battleServer: false,
    });
  });
});
