import { createHmac } from 'node:crypto';

import type { DataSource } from 'typeorm';

import { createLocalDevDataSource } from '../../database/local-dev-datasource';
import { SocialVerificationCallbackReceipt } from '../../database/entities/social-verification-callback-receipt.entity';
import { SocialVerificationSession } from '../../database/entities/social-verification-session.entity';
import { User } from '../../database/entities/user.entity';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { parseSocialVerificationCallback } from './auth-security-validation';
import { AuthSensitiveDataService } from './auth-sensitive-data.service';
import { SocialVerificationProviderService } from './social-verification-provider.service';
import { SocialVerificationService } from './social-verification.service';
import { hashPassword } from './password.util';

const PEPPER = 'social-verification-test-pepper-at-least-32-chars';
const CALLBACK_SECRET = 'callback-secret-at-least-thirty-two-characters';

describe('SocialVerificationService', () => {
  let dataSource: DataSource;
  let provider: SocialVerificationProviderService;
  let service: SocialVerificationService;
  let user: User;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    process.env.LOCAL_DEV = 'true';
    process.env.NODE_ENV = 'test';
    process.env.AUTH_TOKEN_PEPPER = PEPPER;
    process.env.FEATURE_SOCIAL_VERIFICATION_ENABLED = 'true';
    process.env.SOCIAL_VERIFICATION_LOCAL_TEST_ADAPTER = 'true';
    process.env.SOCIAL_VERIFICATION_CALLBACK_SECRET = CALLBACK_SECRET;
    delete process.env.AUTH_EMAIL_OUTBOX_ENCRYPTION_KEY;
    dataSource = await createLocalDevDataSource();
    user = await seedUser(dataSource);
    provider = new SocialVerificationProviderService();
    service = new SocialVerificationService(
      dataSource,
      provider,
      new AuthSensitiveDataService(),
      new AuthRateLimitService(dataSource),
    );
  });

  afterEach(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('creates only an HTTPS launch session and stores an HMACed provider reference', async () => {
    jest.spyOn(provider, 'createSession').mockResolvedValue({
      provider: 'local-test',
      providerReference: 'provider-reference-private-001',
      launchUrl: 'https://verification.local.test/start/1',
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });
    const created = await service.create(user.id);
    expect(created.launchUrl).toMatch(/^https:\/\//);
    const persisted = JSON.stringify(
      await dataSource.getRepository(SocialVerificationSession).find(),
    );
    expect(persisted).not.toContain('provider-reference-private-001');
    expect(await service.get(user.id)).toMatchObject({
      status: 'pending',
      provider: 'local-test',
    });
  });

  it('verifies signed raw callbacks once and stores no event, nonce or audit plaintext', async () => {
    const providerReference = 'provider-reference-private-002';
    jest.spyOn(provider, 'createSession').mockResolvedValue({
      provider: 'local-test',
      providerReference,
      launchUrl: 'https://verification.local.test/start/2',
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });
    const created = await service.create(user.id);
    const callbackBody = {
      sessionId: created.sessionId,
      providerReference,
      status: 'verified',
      occurredAt: new Date().toISOString(),
      resultCode: 'VERIFIED_OK',
    } as const;
    const raw = Buffer.from(JSON.stringify(callbackBody), 'utf8');
    const headers = signedHeaders(raw, 'event-private-001', 'nonce-private-0001');

    await expect(
      service.callback(
        parseSocialVerificationCallback(callbackBody),
        headers,
        raw,
      ),
    ).resolves.toEqual({ accepted: true, status: 'verified' });
    await expect(
      service.callback(
        parseSocialVerificationCallback(callbackBody),
        headers,
        raw,
      ),
    ).resolves.toEqual({ accepted: true, status: 'verified' });
    expect(await service.get(user.id)).toMatchObject({
      status: 'verified',
      failureCode: null,
    });

    const persisted = JSON.stringify({
      sessions: await dataSource.getRepository(SocialVerificationSession).find(),
      receipts: await dataSource
        .getRepository(SocialVerificationCallbackReceipt)
        .find(),
    });
    expect(persisted).not.toContain(providerReference);
    expect(persisted).not.toContain('event-private-001');
    expect(persisted).not.toContain('nonce-private-0001');
    expect(persisted).not.toContain('VERIFIED_OK');
  });

  it('rejects a reused nonce and invalid signatures without changing the terminal state', async () => {
    const providerReference = 'provider-reference-private-003';
    jest.spyOn(provider, 'createSession').mockResolvedValue({
      provider: 'local-test',
      providerReference,
      launchUrl: 'https://verification.local.test/start/3',
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });
    const created = await service.create(user.id);
    const body = {
      sessionId: created.sessionId,
      providerReference,
      status: 'failed',
      occurredAt: new Date().toISOString(),
      resultCode: 'CHECK_FAILED',
    } as const;
    const raw = Buffer.from(JSON.stringify(body));
    const headers = signedHeaders(raw, 'event-private-002', 'nonce-private-0002');
    await service.callback(parseSocialVerificationCallback(body), headers, raw);

    const replayBody = { ...body, resultCode: 'OTHER_FAILURE' };
    const replayRaw = Buffer.from(JSON.stringify(replayBody));
    await expect(
      service.callback(
        parseSocialVerificationCallback(replayBody),
        signedHeaders(replayRaw, 'event-private-003', 'nonce-private-0002'),
        replayRaw,
      ),
    ).rejects.toMatchObject({
      response: { code: 'VERIFICATION_CALLBACK_REPLAYED' },
    });
    await expect(
      service.callback(
        parseSocialVerificationCallback(body),
        { ...headers, signature: '0'.repeat(64) },
        raw,
      ),
    ).rejects.toMatchObject({ status: 401 });
    expect((await service.get(user.id)).status).toBe('failed');
  });

  it('rejects callback fields that could carry raw identity documents', () => {
    expect(() =>
      parseSocialVerificationCallback({
        sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        providerReference: 'provider-reference',
        status: 'verified',
        occurredAt: new Date().toISOString(),
        legalName: 'must-not-enter-backend',
      }),
    ).toThrow();
  });

  it('fails closed when the feature or explicit provider adapter is absent', async () => {
    process.env.FEATURE_SOCIAL_VERIFICATION_ENABLED = 'false';
    await expect(service.get(user.id)).rejects.toMatchObject({ status: 503 });
    process.env.FEATURE_SOCIAL_VERIFICATION_ENABLED = 'true';
    delete process.env.SOCIAL_VERIFICATION_LOCAL_TEST_ADAPTER;
    await expect(service.create(user.id)).rejects.toMatchObject({
      response: { code: 'SOCIAL_VERIFICATION_PROVIDER_NOT_CONFIGURED' },
    });
  });
});

function signedHeaders(raw: Buffer, eventId: string, nonce: string) {
  const timestamp = Math.floor(Date.now() / 1_000).toString();
  const signature = createHmac('sha256', CALLBACK_SECRET)
    .update(timestamp)
    .update('.')
    .update(nonce)
    .update('.')
    .update(raw)
    .digest('hex');
  return { timestamp, nonce, eventId, signature };
}

async function seedUser(dataSource: DataSource): Promise<User> {
  const repository = dataSource.getRepository(User);
  return repository.save(
    repository.create({
      email: 'verify@example.com',
      emailNormalized: 'verify@example.com',
      passwordHash: await hashPassword('Strong-old-password#2026'),
      displayName: 'Verification Tester',
      accountStatus: 'active',
      socialVerificationStatus: 'unverified',
      communityRole: 'user',
      emailVerifiedAt: new Date(),
      passwordChangedAt: new Date(),
      onboardingCompleted: true,
    }),
  );
}
