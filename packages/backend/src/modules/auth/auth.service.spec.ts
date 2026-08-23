import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { DataSource } from 'typeorm';

import { createLocalDevDataSource } from '../../database/local-dev-datasource';
import { AuthRefreshToken } from '../../database/entities/auth-refresh-token.entity';
import { AuthEmailOutbox } from '../../database/entities/auth-email-outbox.entity';
import { AuthSession } from '../../database/entities/auth-session.entity';
import { BetaAccessCode } from '../../database/entities/beta-access-code.entity';
import { BetaAccessReservation } from '../../database/entities/beta-access-reservation.entity';
import { ConsentRecord } from '../../database/entities/consent-record.entity';
import { EmailVerification } from '../../database/entities/email-verification.entity';
import { OutboxEvent } from '../../database/entities/outbox-event.entity';
import { User } from '../../database/entities/user.entity';
import { hashBetaAccessCode, hashRefreshToken } from './auth-crypto';
import { AuthEmailOutboxService } from './auth-email-outbox.service';
import { AuthRateLimitService } from './auth-rate-limit.service';
import {
  AccountRegisterInput,
  AuthService,
  RegisterInput,
} from './auth.service';
import {
  BetaAccessService,
  LOCAL_DEV_BETA_ACCESS_CODE,
} from './beta-access.service';
import { EmailDeliveryService } from './email-delivery.service';
import { CommunityCapacityService } from './community-capacity.service';
import * as passwordUtil from './password.util';

const PASSWORD = 'Strong-Office#2026';
const JWT_SECRET = 'test-jwt-secret-with-at-least-32-characters';
const TOKEN_PEPPER = 'test-auth-token-pepper-with-32-plus-characters';

function registration(email = 'person@example.com'): RegisterInput {
  return {
    email,
    password: PASSWORD,
    displayName: '测试同事',
    betaAccessCode: LOCAL_DEV_BETA_ACCESS_CODE,
    consents: {
      termsVersion: '2026-08-22',
      privacyVersion: '2026-08-22',
      communityGuidelinesVersion: '2026-08-22',
      adultDeclarationVersion: '2026-08-22',
    },
  };
}

function accountRegistration(username = 'office_user'): AccountRegisterInput {
  return {
    username,
    password: PASSWORD,
    consents: {
      termsVersion: '2026-08-22',
      privacyVersion: '2026-08-22',
      communityGuidelinesVersion: '2026-08-22',
      adultDeclarationVersion: '2026-08-22',
    },
  };
}

describe('AuthService community account flow', () => {
  let dataSource: DataSource;
  let jwtService: JwtService;
  let service: AuthService;
  let rateLimits: AuthRateLimitService;
  let betaAccess: BetaAccessService;
  let capacity: CommunityCapacityService;
  const originalEnv = { ...process.env };

  beforeAll(() => {
    process.env.LOCAL_DEV = 'true';
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.AUTH_TOKEN_PEPPER = TOKEN_PEPPER;
    delete process.env.BETA_BOOTSTRAP_CODE;
    delete process.env.BETA_BOOTSTRAP_USES;
    delete process.env.FEATURE_REGISTRATION_ENABLED;
  });

  beforeEach(async () => {
    process.env.LOCAL_DEV = 'true';
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.AUTH_TOKEN_PEPPER = TOKEN_PEPPER;
    delete process.env.FEATURE_REGISTRATION_ENABLED;
    delete process.env.AUTH_EMAIL_WEBHOOK_URL;
    delete process.env.AUTH_EMAIL_WEBHOOK_TOKEN;
    delete process.env.AUTH_EMAIL_OUTBOX_ENCRYPTION_KEY;
    delete process.env.AUTH_EMAIL_OUTBOX_ENCRYPTION_KEY_ID;
    delete process.env.COMMUNITY_MAX_ACTIVE_USERS;
    dataSource = await createLocalDevDataSource();
    jwtService = new JwtService({ secret: JWT_SECRET });
    const emailDelivery = new EmailDeliveryService();
    rateLimits = new AuthRateLimitService(dataSource);
    betaAccess = new BetaAccessService();
    capacity = new CommunityCapacityService();
    service = new AuthService(
      dataSource,
      jwtService,
      betaAccess,
      new AuthEmailOutboxService(dataSource, emailDelivery),
      rateLimits,
      capacity,
    );
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('creates a normalized pending account, four consents and a hashed dev Beta code', async () => {
    const result = await service.register(registration('person@example.com'));

    expect(result.accountStatus).toBe('pending_email');
    expect(result.devVerificationCode).toMatch(/^\d{6}$/);
    const user = await dataSource.getRepository(User).findOneByOrFail({
      emailNormalized: 'person@example.com',
    });
    expect(user.accountStatus).toBe('pending_email');
    expect(user.emailVerifiedAt).toBeNull();
    expect(await dataSource.getRepository(ConsentRecord).countBy({ userId: user.id })).toBe(4);

    const beta = await dataSource.getRepository(BetaAccessCode).findOneByOrFail({
      codeHash: hashBetaAccessCode(LOCAL_DEV_BETA_ACCESS_CODE),
    });
    expect(beta.usedCount).toBe(0);
    expect(JSON.stringify(beta)).not.toContain(LOCAL_DEV_BETA_ACCESS_CODE);

    const email = await dataSource
      .getRepository(AuthEmailOutbox)
      .findOneByOrFail({ template: 'registration-verification' });
    expect(email.status).toBe('delivered');
    expect(JSON.stringify(email)).not.toContain('person@example.com');
    expect(JSON.stringify(email)).not.toContain(result.devVerificationCode);
  });

  it('creates an active username account, records consents and persists a device session', async () => {
    const result = await service.registerAccount(
      accountRegistration('Office_User'),
      { ipAddress: '203.0.113.8', userAgent: 'Mozilla/5.0 Chrome/120.0' },
    );

    expect(result.user).toMatchObject({
      username: 'Office_User',
      email: '',
      displayName: 'Office_User',
      accountStatus: 'active',
      onboardingCompleted: false,
    });
    const user = await dataSource.getRepository(User).findOneByOrFail({
      usernameNormalized: 'office_user',
    });
    expect(user.email).toMatch(/^account-[0-9a-f-]+@users\.invalid$/);
    expect(user.passwordHash).not.toBe(PASSWORD);
    expect(await dataSource.getRepository(ConsentRecord).countBy({ userId: user.id })).toBe(4);
    expect(await dataSource.getRepository(AuthSession).countBy({ userId: user.id })).toBe(1);
    await expect(
      service.loginAccount({ username: 'office_user', password: PASSWORD }),
    ).resolves.toMatchObject({ user: { publicId: user.publicId } });
  });

  it('enforces normalized username uniqueness and global account capacity', async () => {
    await service.registerAccount(accountRegistration('Office_User'));
    await expect(
      service.registerAccount(accountRegistration('office_user')),
    ).rejects.toMatchObject({ response: { code: 'USERNAME_ALREADY_EXISTS' } });
    process.env.COMMUNITY_MAX_ACTIVE_USERS = '1';
    await expect(
      service.registerAccount(accountRegistration('second_user')),
    ).rejects.toMatchObject({ response: { code: 'CAPACITY_REACHED', limit: 1 } });
  });

  it('does not allow login until email verification, then issues a 15-minute sid token', async () => {
    const pending = await service.register(registration());
    await expect(
      service.login({ email: 'person@example.com', password: PASSWORD }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const verified = await service.verifyEmail({
      registrationId: pending.registrationId,
      code: pending.devVerificationCode!,
    });
    const payload = jwtService.verify<{
      sub: string;
      sid: string;
      typ: string;
      iat: number;
      exp: number;
    }>(verified.accessToken);
    expect(payload.typ).toBe('access');
    expect(payload.sid).toBeTruthy();
    expect(payload.exp - payload.iat).toBe(15 * 60);
    expect(verified.user.accountStatus).toBe('active');
    expect(verified.user.id).toBe(verified.user.publicId);
    expect(await dataSource.getRepository(AuthSession).count()).toBe(1);
    expect(await dataSource.getRepository(OutboxEvent).count()).toBe(0);
  });

  it.each(['suspended', 'banned', 'deleting'] as const)(
    'issues and refreshes a restricted session for a %s account without enabling ordinary me access',
    async (accountStatus) => {
      const pending = await service.register(registration());
      const verified = await service.verifyEmail({
        registrationId: pending.registrationId,
        code: pending.devVerificationCode!,
      });
      const user = await dataSource.getRepository(User).findOneByOrFail({
        emailNormalized: 'person@example.com',
      });
      user.accountStatus = accountStatus;
      await dataSource.getRepository(User).save(user);

      const restricted = await service.login({
        email: user.email,
        password: PASSWORD,
      });
      expect(restricted.user.accountStatus).toBe(accountStatus);
      await expect(service.refresh(restricted.refreshToken)).resolves.toMatchObject({
        user: { accountStatus },
      });
      await expect(service.getCurrentUser(user.id)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(verified.user.accountStatus).toBe('active');
    },
  );

  it('rate-limits verification resend, rotates the code and keeps the account pending', async () => {
    const pending = await service.register(registration());
    await expect(
      service.resendVerification({ registrationId: pending.registrationId }),
    ).rejects.toMatchObject({
      response: { code: 'VERIFICATION_RESEND_TOO_SOON' },
    });

    const repo = dataSource.getRepository(EmailVerification);
    const verification = await repo.findOneByOrFail({
      id: pending.registrationId,
    });
    verification.resendAvailableAt = new Date(Date.now() - 1_000);
    await repo.save(verification);

    const resent = await service.resendVerification({
      registrationId: pending.registrationId,
    });
    expect(resent.devVerificationCode).toMatch(/^\d{6}$/);
    expect(resent.devVerificationCode).not.toBe(pending.devVerificationCode);
    await expect(
      service.verifyEmail({
        registrationId: pending.registrationId,
        code: pending.devVerificationCode!,
      }),
    ).rejects.toMatchObject({
      response: { code: 'VERIFICATION_CODE_INVALID' },
    });
    const verified = await service.verifyEmail({
      registrationId: pending.registrationId,
      code: resent.devVerificationCode!,
    });
    expect(verified.user.accountStatus).toBe('active');
  });

  it('does not revoke the session for a just-consumed token from another tab', async () => {
    const pending = await service.register(registration());
    const first = await service.verifyEmail({
      registrationId: pending.registrationId,
      code: pending.devVerificationCode!,
    });
    const second = await service.refresh(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);

    await expect(service.refresh(first.refreshToken)).rejects.toMatchObject({
      response: { code: 'REFRESH_TOKEN_ROTATION_RACE', retryAfterMs: 150 },
    });
    const session = await dataSource.getRepository(AuthSession).findOneByOrFail({
      id: jwtService.decode<{ sid: string }>(second.accessToken).sid,
    });
    expect(session.revokedAt).toBeNull();
    await expect(service.refresh(second.refreshToken)).resolves.toMatchObject({
      user: { accountStatus: 'active' },
    });
  });

  it('revokes the session when a consumed token is replayed outside the race window', async () => {
    const pending = await service.register(registration());
    const first = await service.verifyEmail({
      registrationId: pending.registrationId,
      code: pending.devVerificationCode!,
    });
    const second = await service.refresh(first.refreshToken);
    const tokenRepo = dataSource.getRepository(AuthRefreshToken);
    const consumed = await tokenRepo.findOneByOrFail({
      tokenHash: hashRefreshToken(first.refreshToken),
    });
    consumed.consumedAt = new Date(Date.now() - 11_000);
    await tokenRepo.save(consumed);

    await expect(service.refresh(first.refreshToken)).rejects.toMatchObject({
      response: { code: 'REFRESH_TOKEN_REUSED' },
    });
    const session = await dataSource.getRepository(AuthSession).findOneByOrFail({
      id: jwtService.decode<{ sid: string }>(second.accessToken).sid,
    });
    expect(session.revokedAt).toBeInstanceOf(Date);
    await expect(service.refresh(second.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('stores only refresh token hashes and logout-all revokes every device', async () => {
    const pending = await service.register(registration());
    const first = await service.verifyEmail({
      registrationId: pending.registrationId,
      code: pending.devVerificationCode!,
    });
    const second = await service.login({
      email: 'person@example.com',
      password: PASSWORD,
    });
    const stored = await dataSource.getRepository(AuthRefreshToken).find();
    expect(stored).toHaveLength(2);
    expect(stored.map((row) => row.tokenHash)).toContain(
      hashRefreshToken(first.refreshToken),
    );
    expect(JSON.stringify(stored)).not.toContain(first.refreshToken);

    const user = await dataSource.getRepository(User).findOneByOrFail({
      emailNormalized: 'person@example.com',
    });
    await service.logoutAll(user.id);
    await expect(service.refresh(first.refreshToken)).rejects.toMatchObject({
      response: { code: 'INVALID_REFRESH_TOKEN' },
    });
    await expect(service.refresh(second.refreshToken)).rejects.toMatchObject({
      response: { code: 'INVALID_REFRESH_TOKEN' },
    });
  });

  it('persists onboarding profile and privacy fields across me and refresh', async () => {
    const pending = await service.register(registration());
    const session = await service.verifyEmail({
      registrationId: pending.registrationId,
      code: pending.devVerificationCode!,
    });
    const user = await dataSource.getRepository(User).findOneByOrFail({
      emailNormalized: 'person@example.com',
    });

    const profile = await service.updateProfile(user.id, {
      displayName: '质量同事',
      bio: '稳定复现每一个问题',
      avatarKey: 'blue',
      battleProfession: 'qa',
      onboardingCompleted: true,
    });
    expect(profile).toMatchObject({
      displayName: '质量同事',
      bio: '稳定复现每一个问题',
      avatarKey: 'blue',
      battleProfession: 'qa',
      onboardingCompleted: true,
    });

    const privacy = {
      equipment: 'everyone',
      battleRecord: 'friends',
      plant: 'self',
      honors: 'everyone',
      friendCount: 'self',
      recentActivity: 'friends',
    } as const;
    await expect(service.updatePrivacy(user.id, privacy)).resolves.toMatchObject({
      privacy,
    });
    await expect(service.getCurrentUser(user.id)).resolves.toMatchObject({
      onboardingCompleted: true,
      battleProfession: 'qa',
      privacy,
    });
    await expect(service.refresh(session.refreshToken)).resolves.toMatchObject({
      user: {
        onboardingCompleted: true,
        avatarKey: 'blue',
        battleProfession: 'qa',
      },
    });
  });

  it('lists devices and lets a user revoke only an owned session', async () => {
    const pending = await service.register(registration());
    const first = await service.verifyEmail(
      {
        registrationId: pending.registrationId,
        code: pending.devVerificationCode!,
      },
      { userAgent: 'Mozilla/5.0 (Windows) Chrome/120.0' },
    );
    const second = await service.login(
      { email: 'person@example.com', password: PASSWORD },
      { userAgent: 'Mozilla/5.0 (Linux) Firefox/120.0' },
    );
    const firstPayload = jwtService.decode<{ sub: string; sid: string }>(
      first.accessToken,
    );
    const secondPayload = jwtService.decode<{ sid: string }>(second.accessToken);

    await dataSource.getRepository(AuthSession).save(
      dataSource.getRepository(AuthSession).create({
        userId: firstPayload.sub,
        userAgent: 'expired-session',
        ipHash: null,
        lastSeenAt: new Date(Date.now() - 60_000),
        expiresAt: new Date(Date.now() - 1_000),
        revokedAt: null,
        revokeReason: null,
      }),
    );

    const sessions = await service.listSessions(
      firstPayload.sub,
      firstPayload.sid,
    );
    expect(sessions).toHaveLength(2);
    expect(sessions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: firstPayload.sid,
          current: true,
          deviceLabel: 'Chrome · Windows',
        }),
        expect.objectContaining({
          id: secondPayload.sid,
          current: false,
          deviceLabel: 'Firefox · Linux',
        }),
      ]),
    );

    await expect(
      service.revokeDeviceSession(
        firstPayload.sub,
        firstPayload.sid,
        secondPayload.sid,
      ),
    ).resolves.toEqual({ current: false });
    await expect(service.refresh(second.refreshToken)).rejects.toMatchObject({
      response: { code: 'INVALID_REFRESH_TOKEN' },
    });
    await expect(
      service.revokeDeviceSession(
        '00000000-0000-4000-8000-000000000000',
        firstPayload.sid,
        firstPayload.sid,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects normalized duplicate emails', async () => {
    await service.register(registration('person@example.com'));
    await expect(
      service.register(registration('person@example.com')),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('performs the fixed dummy bcrypt path for an unknown login email', async () => {
    const verify = jest
      .spyOn(passwordUtil, 'verifyPassword')
      .mockResolvedValueOnce(false);
    await expect(
      service.login({ email: 'missing@example.com', password: PASSWORD }),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_CREDENTIALS' },
    });
    expect(verify).toHaveBeenCalledWith(
      PASSWORD,
      passwordUtil.DUMMY_PASSWORD_HASH,
    );
    verify.mockRestore();
  });

  it('rejects a limited login before bcrypt or account lookup work', async () => {
    const email = 'limited@example.com';
    const ip = '203.0.113.50';
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await rateLimits.assertLoginAllowed(email, ip);
    }
    const verify = jest.spyOn(passwordUtil, 'verifyPassword');
    await expect(
      service.login(
        { email, password: PASSWORD },
        { ipAddress: ip },
      ),
    ).rejects.toMatchObject({
      status: 429,
      response: {
        code: 'AUTH_RATE_LIMITED',
        retryAfter: expect.any(Number),
      },
    });
    expect(verify).not.toHaveBeenCalled();
    verify.mockRestore();
  });

  it('keeps email failure outside the account transaction and leaves a durable retry', async () => {
    const sendRegistrationCode = jest.fn().mockImplementation(async () => {
      expect(await dataSource.getRepository(User).count()).toBe(1);
      throw new Error('mailer unavailable');
    });
    const delivery = {
      assertRegistrationDeliveryAvailable: jest.fn(),
      sendRegistrationCode,
    } as unknown as EmailDeliveryService;
    const failureSafeService = new AuthService(
      dataSource,
      jwtService,
      new BetaAccessService(),
      new AuthEmailOutboxService(dataSource, delivery),
      new AuthRateLimitService(dataSource),
      new CommunityCapacityService(),
    );

    await expect(
      failureSafeService.register(registration('queued@example.com')),
    ).resolves.toMatchObject({ accountStatus: 'pending_email' });
    expect(sendRegistrationCode).toHaveBeenCalledTimes(1);
    await expect(
      dataSource.getRepository(AuthEmailOutbox).findOneByOrFail({
        template: 'registration-verification',
      }),
    ).resolves.toMatchObject({
      status: 'pending',
      attempts: 1,
      lastErrorCode: 'EMAIL_DELIVERY_FAILED',
    });
  });

  it('enforces cumulative resend and verification-attempt ceilings', async () => {
    const pending = await service.register(registration());
    const repository = dataSource.getRepository(EmailVerification);
    let verification = await repository.findOneByOrFail({
      id: pending.registrationId,
    });
    verification.resendCount = verification.maxResends - 1;
    verification.attempts = verification.maxAttempts - 1;
    verification.totalAttempts = verification.maxTotalAttempts - 1;
    verification.resendAvailableAt = new Date(Date.now() - 1_000);
    await repository.save(verification);

    const resent = await service.resendVerification({
      registrationId: pending.registrationId,
    });
    verification = await repository.findOneByOrFail({
      id: pending.registrationId,
    });
    expect(verification).toMatchObject({
      resendCount: verification.maxResends,
      attempts: 0,
      totalAttempts: verification.maxTotalAttempts - 1,
    });
    await expect(
      service.resendVerification({ registrationId: pending.registrationId }),
    ).rejects.toMatchObject({
      status: 429,
      response: {
        code: 'VERIFICATION_RESENDS_EXCEEDED',
        retryAfter: expect.any(Number),
      },
    });

    const wrongCode = resent.devVerificationCode === '000000' ? '000001' : '000000';
    await expect(
      service.verifyEmail({
        registrationId: pending.registrationId,
        code: wrongCode,
      }),
    ).rejects.toMatchObject({
      status: 429,
      response: { code: 'VERIFICATION_ATTEMPTS_EXCEEDED' },
    });
    await expect(
      repository.findOneByOrFail({ id: pending.registrationId }),
    ).resolves.toMatchObject({
      attempts: 1,
      totalAttempts: verification.maxTotalAttempts,
    });
  });

  it('reclaims an expired pending account and releases its Beta reservation', async () => {
    const first = await service.register(registration());
    const users = dataSource.getRepository(User);
    const oldUser = await users.findOneByOrFail({
      emailNormalized: 'person@example.com',
    });
    const verifications = dataSource.getRepository(EmailVerification);
    const expired = await verifications.findOneByOrFail({ id: first.registrationId });
    expired.expiresAt = new Date(Date.now() - 1_000);
    await verifications.save(expired);

    const restarted = await service.register(registration());
    expect(restarted.registrationId).not.toBe(first.registrationId);
    expect(await users.exist({ where: { id: oldUser.id } })).toBe(false);
    expect(await users.countBy({ emailNormalized: 'person@example.com' })).toBe(1);
    expect(
      await dataSource
        .getRepository(BetaAccessReservation)
        .countBy({ emailNormalized: 'person@example.com' }),
    ).toBe(1);
  });

  it('counts live reservations and active accounts against the global capacity', async () => {
    process.env.COMMUNITY_MAX_ACTIVE_USERS = '1';
    const first = await service.register(registration('first@example.com'));
    await expect(
      service.register(registration('second@example.com')),
    ).rejects.toMatchObject({
      response: { code: 'CAPACITY_REACHED', limit: 1 },
    });
    await expect(
      service.verifyEmail({
        registrationId: first.registrationId,
        code: first.devVerificationCode!,
      }),
    ).resolves.toMatchObject({ user: { accountStatus: 'active' } });
    await expect(
      service.register(registration('third@example.com')),
    ).rejects.toMatchObject({
      response: { code: 'CAPACITY_REACHED', limit: 1 },
    });
  });

  it('locks global capacity before Beta code allocation during reserve and activation', async () => {
    const order: string[] = [];
    const reserveCapacity = capacity.assertReservationAvailable.bind(capacity);
    const activateCapacity = capacity.assertActivationAllowed.bind(capacity);
    const reserveBeta = betaAccess.reserve.bind(betaAccess);
    const redeemBeta = betaAccess.redeem.bind(betaAccess);
    jest
      .spyOn(capacity, 'assertReservationAvailable')
      .mockImplementation(async (...args) => {
        order.push('capacity:reserve');
        return reserveCapacity(...args);
      });
    jest.spyOn(betaAccess, 'reserve').mockImplementation(async (...args) => {
      order.push('beta:reserve');
      return reserveBeta(...args);
    });
    jest
      .spyOn(capacity, 'assertActivationAllowed')
      .mockImplementation(async (...args) => {
        order.push('capacity:activate');
        return activateCapacity(...args);
      });
    jest.spyOn(betaAccess, 'redeem').mockImplementation(async (...args) => {
      order.push('beta:activate');
      return redeemBeta(...args);
    });

    const pending = await service.register(registration());
    await service.verifyEmail({
      registrationId: pending.registrationId,
      code: pending.devVerificationCode!,
    });
    expect(order).toEqual([
      'capacity:reserve',
      'beta:reserve',
      'capacity:activate',
      'beta:activate',
    ]);
  });

  it.each(['pending_email', 'banned', 'suspended', 'deleting', 'deleted'] as const)(
    'does not expose me for a %s account',
    async (accountStatus) => {
      const pending = await service.register(registration());
      const user = await dataSource.getRepository(User).findOneByOrFail({
        emailNormalized: 'person@example.com',
      });
      user.accountStatus = accountStatus;
      await dataSource.getRepository(User).save(user);
      await expect(service.getCurrentUser(user.id)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(pending.accountStatus).toBe('pending_email');
    },
  );

  it('fails closed in production when email delivery or the independent token pepper is absent', async () => {
    process.env.LOCAL_DEV = 'false';
    process.env.NODE_ENV = 'production';
    process.env.FEATURE_REGISTRATION_ENABLED = 'true';
    delete process.env.AUTH_EMAIL_WEBHOOK_URL;
    delete process.env.AUTH_EMAIL_WEBHOOK_TOKEN;
    await expect(service.register(registration())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    process.env.AUTH_EMAIL_WEBHOOK_URL = 'https://mailer.example.test/send';
    process.env.AUTH_EMAIL_WEBHOOK_TOKEN = 'webhook-token-with-16-plus';
    process.env.AUTH_EMAIL_OUTBOX_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
      'base64',
    );
    delete process.env.COMMUNITY_MAX_ACTIVE_USERS;
    await expect(service.register(registration())).rejects.toMatchObject({
      response: { code: 'COMMUNITY_CAPACITY_NOT_CONFIGURED' },
    });

    delete process.env.AUTH_TOKEN_PEPPER;
    expect(() => hashRefreshToken('opaque')).toThrow(
      ServiceUnavailableException,
    );

    process.env.LOCAL_DEV = 'true';
    process.env.NODE_ENV = 'test';
    process.env.AUTH_TOKEN_PEPPER = TOKEN_PEPPER;
    delete process.env.FEATURE_REGISTRATION_ENABLED;
    delete process.env.AUTH_EMAIL_WEBHOOK_URL;
    delete process.env.AUTH_EMAIL_WEBHOOK_TOKEN;
    delete process.env.AUTH_EMAIL_OUTBOX_ENCRYPTION_KEY;
  });

  it('fails closed when production registration is not explicitly enabled', async () => {
    process.env.LOCAL_DEV = 'false';
    process.env.NODE_ENV = 'production';
    delete process.env.FEATURE_REGISTRATION_ENABLED;

    await expect(service.register(registration())).rejects.toMatchObject({
      response: { code: 'REGISTRATION_DISABLED' },
    });
    process.env.FEATURE_REGISTRATION_ENABLED = 'false';
    await expect(service.register(registration())).rejects.toMatchObject({
      response: { code: 'REGISTRATION_DISABLED' },
    });
    expect(await dataSource.getRepository(User).count()).toBe(0);

    process.env.LOCAL_DEV = 'true';
    process.env.NODE_ENV = 'test';
  });
});
