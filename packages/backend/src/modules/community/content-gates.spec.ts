import {
  assertCommunityContentEnabled,
  assertContentWritesEnabled,
  assertModerationOperationsEnabled,
  communityContentEnabled,
  contentWritesEnabled,
  moderationOperationsEnabled,
} from './content-gates';
import {
  lowRiskAutoPublishEnabled,
  parseSavePostInput,
} from './content-validation';

describe('community content production gates', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('defaults all three capabilities on only in LOCAL_DEV', () => {
    process.env.LOCAL_DEV = 'true';
    delete process.env.FEATURE_COMMUNITY_CONTENT_ENABLED;
    delete process.env.FEATURE_CONTENT_WRITES_ENABLED;
    delete process.env.FEATURE_MODERATION_OPERATIONS_ENABLED;
    expect(communityContentEnabled()).toBe(true);
    expect(contentWritesEnabled()).toBe(true);
    expect(moderationOperationsEnabled()).toBe(true);
    expect(() => assertCommunityContentEnabled()).not.toThrow();
    expect(() => assertContentWritesEnabled()).not.toThrow();
    expect(() => assertModerationOperationsEnabled()).not.toThrow();
  });

  it('fails closed for reads, writes, and moderation when production flags are missing', () => {
    process.env.LOCAL_DEV = 'false';
    delete process.env.FEATURE_COMMUNITY_CONTENT_ENABLED;
    delete process.env.FEATURE_CONTENT_WRITES_ENABLED;
    delete process.env.FEATURE_MODERATION_OPERATIONS_ENABLED;
    expect(communityContentEnabled()).toBe(false);
    expect(contentWritesEnabled()).toBe(false);
    expect(moderationOperationsEnabled()).toBe(false);
    expect(() => assertCommunityContentEnabled()).toThrow(
      expect.objectContaining({ response: { code: 'COMMUNITY_CONTENT_DISABLED' } }),
    );
    expect(() => assertContentWritesEnabled()).toThrow(
      expect.objectContaining({ response: { code: 'COMMUNITY_CONTENT_DISABLED' } }),
    );

    process.env.FEATURE_COMMUNITY_CONTENT_ENABLED = 'true';
    expect(() => assertContentWritesEnabled()).toThrow(
      expect.objectContaining({ response: { code: 'CONTENT_WRITES_DISABLED' } }),
    );
    expect(() => assertModerationOperationsEnabled()).toThrow(
      expect.objectContaining({ response: { code: 'MODERATION_OPERATIONS_DISABLED' } }),
    );
  });

  it('never treats configured webhook credentials as a production approval', () => {
    process.env.LOCAL_DEV = 'false';
    process.env.CONTENT_MODERATION_STAFFED = 'true';
    process.env.CONTENT_LOW_RISK_AUTO_PUBLISH_ENABLED = 'true';
    process.env.CONTENT_MODERATION_WEBHOOK_URL = 'https://moderation.example.test/hook';
    process.env.CONTENT_MODERATION_WEBHOOK_TOKEN = 'x'.repeat(64);
    expect(lowRiskAutoPublishEnabled('low')).toBe(false);

    process.env.LOCAL_DEV = 'true';
    expect(lowRiskAutoPublishEnabled('low')).toBe(true);
    expect(lowRiskAutoPublishEnabled('medium')).toBe(false);
  });

  it('rejects attachments, embedded HTML, and dangerous links', () => {
    const base = {
      type: 'experience',
      channel: 'general',
      title: 'A valid workplace title',
      tags: [],
      bodyFormat: 'restricted_markdown',
    };
    expectContentError(
      {
        ...base,
        body: 'This contains an image ![private](https://example.test/a.png)',
      },
      'UNSUPPORTED_CONTENT',
    );
    expectContentError(
      {
        ...base,
        body: '<strong>This HTML body must not be accepted.</strong>',
      },
      'UNSUPPORTED_CONTENT',
    );
    expectContentError(
      {
        ...base,
        body: 'This body includes javascript:alert(1) and is unsafe.',
      },
      'UNSAFE_LINK',
    );
  });

  function expectContentError(value: unknown, code: string): void {
    try {
      parseSavePostInput(value);
      throw new Error('Expected content validation to fail');
    } catch (error) {
      expect(error).toMatchObject({ response: { code } });
    }
  }
});
