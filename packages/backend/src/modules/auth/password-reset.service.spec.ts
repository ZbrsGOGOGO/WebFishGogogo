import type { DataSource } from 'typeorm';

import { createLocalDevDataSource } from '../../database/local-dev-datasource';
import { AuthEmailOutbox } from '../../database/entities/auth-email-outbox.entity';
import { AuthRefreshToken } from '../../database/entities/auth-refresh-token.entity';
import { AuthSession } from '../../database/entities/auth-session.entity';
import { PasswordResetToken } from '../../database/entities/password-reset-token.entity';
import { User } from '../../database/entities/user.entity';
import { AuthEmailOutboxService } from './auth-email-outbox.service';
import { AuthRateLimitService } from './auth-rate-limit.service';
import type { EmailDeliveryService } from './email-delivery.service';
import { PasswordResetService } from './password-reset.service';
import { hashPassword, verifyPassword } from './password.util';

const PEPPER = 'password-reset-test-pepper-at-least-32-characters';

describe('PasswordResetService', () => {
  let dataSource: DataSource;
  let outbox: AuthEmailOutboxService;
  let service: PasswordResetService;
  let capturedToken: string | null;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    process.env.LOCAL_DEV = 'true';
    process.env.NODE_ENV = 'test';
    process.env.AUTH_TOKEN_PEPPER = PEPPER;
    process.env.FEATURE_PASSWORD_RESET_ENABLED = 'true';
    delete process.env.AUTH_EMAIL_OUTBOX_ENCRYPTION_KEY;
    dataSource = await createLocalDevDataSource();
    const delivery = {
      assertPasswordResetDeliveryAvailable: jest.fn(),
      assertRegistrationDeliveryAvailable: jest.fn(),
      sendPasswordReset: jest.fn().mockResolvedValue(undefined),
      sendRegistrationCode: jest.fn().mockResolvedValue(undefined),
    } as unknown as EmailDeliveryService;
    outbox = new AuthEmailOutboxService(dataSource, delivery);
    const originalEnqueue = outbox.enqueuePasswordReset.bind(outbox);
    capturedToken = null;
    jest.spyOn(outbox, 'enqueuePasswordReset').mockImplementation(
      async (manager, command, now) => {
        capturedToken = command.token;
        return originalEnqueue(manager, command, now);
      },
    );
    service = new PasswordResetService(
      dataSource,
      new AuthRateLimitService(dataSource),
      outbox,
    );
  });

  afterEach(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns the same void contract for existing and absent accounts without plaintext persistence', async () => {
    await seedUser(dataSource, 'reset@example.com');
    await expect(service.request('reset@example.com')).resolves.toBeUndefined();
    expect(capturedToken).toBeTruthy();
    const tokenCount = await dataSource.getRepository(PasswordResetToken).count();
    const persisted = JSON.stringify(
      await dataSource.getRepository(AuthEmailOutbox).find(),
    );
    expect(persisted).not.toContain('reset@example.com');
    expect(persisted).not.toContain(capturedToken!);

    capturedToken = null;
    await expect(service.request('absent@example.com')).resolves.toBeUndefined();
    expect(capturedToken).toBeNull();
    expect(await dataSource.getRepository(PasswordResetToken).count()).toBe(
      tokenCount,
    );
  });

  it('keeps one unused capability while concurrent requests retain the same 202 contract', async () => {
    const user = await seedUser(dataSource, 'concurrent-request@example.com');
    await expect(
      Promise.all([
        service.request(user.email, { ipAddress: '203.0.113.10' }),
        service.request(user.email, { ipAddress: '203.0.113.11' }),
      ]),
    ).resolves.toEqual([undefined, undefined]);
    const tokens = await dataSource.getRepository(PasswordResetToken).find({
      where: { userId: user.id },
    });
    expect(tokens.filter((token) => token.usedAt === null)).toHaveLength(1);
  });

  it('consumes one token, changes the password and immediately revokes every session', async () => {
    const user = await seedUser(dataSource, 'reset@example.com');
    const session = await seedSession(dataSource, user.id);
    await service.request(user.email);
    const token = capturedToken!;

    await expect(
      service.reset(token, 'A-new-strong-password#2026'),
    ).resolves.toBeUndefined();
    const updated = await dataSource.getRepository(User).findOneByOrFail({ id: user.id });
    await expect(
      verifyPassword('A-new-strong-password#2026', updated.passwordHash),
    ).resolves.toBe(true);
    await expect(
      dataSource.getRepository(AuthSession).findOneByOrFail({ id: session.id }),
    ).resolves.toMatchObject({ revokeReason: 'password_reset' });
    await expect(
      dataSource.getRepository(AuthRefreshToken).findOneByOrFail({ sessionId: session.id }),
    ).resolves.toMatchObject({ status: 'revoked' });

    await expect(service.reset(token, 'Another-strong-password#2026')).rejects.toMatchObject({
      response: { code: 'PASSWORD_RESET_TOKEN_INVALID' },
    });
  });

  it('allows exactly one winner when the same reset token is consumed concurrently', async () => {
    const user = await seedUser(dataSource, 'concurrent-reset@example.com');
    await service.request(user.email);
    const token = capturedToken!;
    const results = await Promise.allSettled([
      service.reset(token, 'Concurrent-strong-password#2026'),
      service.reset(token, 'Concurrent-strong-password#2026'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const stored = await dataSource
      .getRepository(PasswordResetToken)
      .findOneByOrFail({ userId: user.id });
    expect(stored.usedAt).toBeInstanceOf(Date);
  });

  it('fails closed when the release gate is disabled', async () => {
    process.env.FEATURE_PASSWORD_RESET_ENABLED = 'false';
    await expect(service.request('reset@example.com')).rejects.toMatchObject({
      status: 503,
      response: { code: 'FEATURE_NOT_AVAILABLE' },
    });
  });
});

async function seedUser(dataSource: DataSource, email: string): Promise<User> {
  const repository = dataSource.getRepository(User);
  return repository.save(
    repository.create({
      email,
      emailNormalized: email,
      passwordHash: await hashPassword('Old-strong-password#2026'),
      displayName: 'Reset Tester',
      accountStatus: 'active',
      socialVerificationStatus: 'unverified',
      communityRole: 'user',
      emailVerifiedAt: new Date(),
      passwordChangedAt: new Date(),
      onboardingCompleted: true,
    }),
  );
}

async function seedSession(
  dataSource: DataSource,
  userId: string,
): Promise<AuthSession> {
  const sessions = dataSource.getRepository(AuthSession);
  const session = await sessions.save(
    sessions.create({
      userId,
      userAgent: 'jest',
      ipHash: null,
      lastSeenAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      revokeReason: null,
    }),
  );
  const tokens = dataSource.getRepository(AuthRefreshToken);
  await tokens.save(
    tokens.create({
      sessionId: session.id,
      tokenHash: 'a'.repeat(64),
      status: 'active',
      expiresAt: session.expiresAt,
      consumedAt: null,
      replacedById: null,
      revokedAt: null,
    }),
  );
  return session;
}
