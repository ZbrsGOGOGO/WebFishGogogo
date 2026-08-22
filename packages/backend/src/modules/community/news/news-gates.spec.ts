import {
  assertCommunityNewsEnabled,
  assertNewsAdminEnabled,
  communityNewsEnabled,
  newsAdminEnabled,
} from './news-gates';

describe('editorial news feature gates', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('fails closed when either capability is missing, including in LOCAL_DEV', () => {
    process.env.LOCAL_DEV = 'true';
    delete process.env.FEATURE_COMMUNITY_NEWS_ENABLED;
    delete process.env.FEATURE_NEWS_ADMIN_ENABLED;

    expect(communityNewsEnabled()).toBe(false);
    expect(newsAdminEnabled()).toBe(false);
    expect(() => assertCommunityNewsEnabled()).toThrow(
      expect.objectContaining({ response: { code: 'COMMUNITY_NEWS_DISABLED' } }),
    );
    expect(() => assertNewsAdminEnabled()).toThrow(
      expect.objectContaining({ response: { code: 'COMMUNITY_NEWS_DISABLED' } }),
    );
  });

  it('requires exact lowercase true and keeps the admin switch independent', () => {
    process.env.FEATURE_COMMUNITY_NEWS_ENABLED = 'TRUE';
    process.env.FEATURE_NEWS_ADMIN_ENABLED = 'true';
    expect(communityNewsEnabled()).toBe(false);

    process.env.FEATURE_COMMUNITY_NEWS_ENABLED = 'true';
    delete process.env.FEATURE_NEWS_ADMIN_ENABLED;
    expect(() => assertCommunityNewsEnabled()).not.toThrow();
    expect(() => assertNewsAdminEnabled()).toThrow(
      expect.objectContaining({ response: { code: 'NEWS_ADMIN_DISABLED' } }),
    );

    process.env.FEATURE_NEWS_ADMIN_ENABLED = 'true';
    expect(() => assertNewsAdminEnabled()).not.toThrow();
  });
});
