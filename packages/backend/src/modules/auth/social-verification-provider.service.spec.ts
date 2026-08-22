import { SocialVerificationProviderService } from './social-verification-provider.service';

describe('SocialVerificationProviderService local adapter', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('uses a reproducible provider reference only behind the explicit local gate', async () => {
    process.env.NODE_ENV = 'development';
    process.env.LOCAL_DEV = 'true';
    process.env.SOCIAL_VERIFICATION_LOCAL_TEST_ADAPTER = 'true';
    process.env.SOCIAL_VERIFICATION_CALLBACK_SECRET =
      'local-callback-secret-at-least-32-characters';

    const sessionId = '16c686f4-fc63-40ab-8b36-7148a51f46ee';
    await expect(
      new SocialVerificationProviderService().createSession(
        sessionId,
        '/settings/verification',
      ),
    ).resolves.toMatchObject({
      provider: 'local-test',
      providerReference: `local-${sessionId}`,
      launchUrl: `https://verification.local.test/start/${sessionId}`,
    });
  });

  it('never enables the local adapter in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.LOCAL_DEV = 'true';
    process.env.SOCIAL_VERIFICATION_LOCAL_TEST_ADAPTER = 'true';
    process.env.SOCIAL_VERIFICATION_CALLBACK_SECRET =
      'local-callback-secret-at-least-32-characters';

    await expect(
      new SocialVerificationProviderService().createSession(
        '16c686f4-fc63-40ab-8b36-7148a51f46ee',
        '/settings/verification',
      ),
    ).rejects.toMatchObject({
      response: { code: 'SOCIAL_VERIFICATION_PROVIDER_NOT_CONFIGURED' },
    });
  });
});
