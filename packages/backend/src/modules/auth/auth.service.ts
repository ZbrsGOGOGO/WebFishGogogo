import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource, EntityManager, In, IsNull, MoreThan } from 'typeorm';

import { AuthRefreshToken } from '../../database/entities/auth-refresh-token.entity';
import { AuthSession } from '../../database/entities/auth-session.entity';
import { BetaAccessReservation } from '../../database/entities/beta-access-reservation.entity';
import {
  ConsentRecord,
  ConsentType,
} from '../../database/entities/consent-record.entity';
import { EmailVerification } from '../../database/entities/email-verification.entity';
import {
  CommunityPrivacySettings,
  DEFAULT_COMMUNITY_PRIVACY,
  PlayerProfile,
} from '../../database/entities/player-profile.entity';
import { User } from '../../database/entities/user.entity';
import { ReferralClaimToken } from '../../database/entities/referral-claim-token.entity';
import { ReferralCode } from '../../database/entities/referral-code.entity';
import { ReferralRedemption } from '../../database/entities/referral-redemption.entity';
import { secretHash } from '../community/community-validation';
import { assertCommunityWritesEnabled } from '../community/community-write-gate';
import {
  generateEmailVerificationCode,
  generateRefreshToken,
  hashEmailVerificationCode,
  hashIpAddress,
  hashRefreshToken,
} from './auth-crypto';
import { REFRESH_TOKEN_TTL_MS } from './auth-cookie';
import { AuthEmailOutboxService } from './auth-email-outbox.service';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { BetaAccessService } from './beta-access.service';
import { CommunityCapacityService } from './community-capacity.service';
import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  verifyPassword,
} from './password.util';

const EMAIL_VERIFICATION_TTL_MS = 10 * 60 * 1_000;
const EMAIL_RESEND_DELAY_MS = 60 * 1_000;
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_ROTATION_RACE_GRACE_MS = 10 * 1_000;

export interface RegistrationConsents {
  termsVersion: string;
  privacyVersion: string;
  communityGuidelinesVersion: string;
  adultDeclarationVersion: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  betaAccessCode: string;
  referralToken?: string;
  consents: RegistrationConsents;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AccountRegisterInput {
  username: string;
  password: string;
  referralToken?: string;
  consents: RegistrationConsents;
}

export interface AccountLoginInput {
  username: string;
  password: string;
}

export interface VerifyEmailInput {
  registrationId: string;
  code: string;
}

export interface ResendVerificationInput {
  registrationId: string;
}

export interface UpdateProfileInput {
  displayName?: string;
  bio?: string | null;
  avatarKey?: string;
  battleProfession?: string;
  onboardingCompleted?: true;
}

export interface AuthRequestMetadata {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface RegistrationResult {
  registrationId: string;
  emailMasked: string;
  verificationExpiresAt: string;
  resendAvailableAt: string;
  accountStatus: 'pending_email';
  /** 仅 LOCAL_DEV=true 返回。生产路径始终为 undefined。 */
  devVerificationCode?: string;
}

export interface VerificationDeliveryResult {
  verificationExpiresAt: string;
  resendAvailableAt: string;
  devVerificationCode?: string;
}

export interface AuthUserView {
  /** 兼容既有前端的 id 字段，但值为 publicId，不暴露数据库 UUID。 */
  id: string;
  publicId: string;
  email: string;
  username: string | null;
  displayName: string | null;
  accountStatus: User['accountStatus'];
  onboardingCompleted: boolean;
  socialVerificationStatus: User['socialVerificationStatus'];
  avatarKey: string | null;
  battleProfession: string | null;
  bio: string | null;
  privacy: CommunityPrivacySettings;
  /** 面向本人会话的产品角色；内部 user 映射为 member。 */
  roles: Array<'member' | 'moderator' | 'admin' | 'safety'>;
}

export interface AuthDeviceSessionView {
  id: string;
  current: boolean;
  createdAt: string;
  lastActiveAt: string;
  deviceLabel: string;
  region: null;
}

export interface LoginResult {
  accessToken: string;
  user: AuthUserView;
}

export interface AuthSessionResult extends LoginResult {
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface JwtPayload {
  sub: string;
  sid: string;
  typ: 'access';
}

type VerificationOutcome =
  | { kind: 'success'; result: AuthSessionResult }
  | { kind: 'invalid' | 'expired' | 'locked' | 'used' };

type RefreshOutcome =
  | { kind: 'success'; result: AuthSessionResult }
  | { kind: 'invalid' | 'race' | 'reused' | 'account_unavailable' };

@Injectable()
export class AuthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly betaAccess: BetaAccessService,
    private readonly authEmailOutbox: AuthEmailOutboxService,
    private readonly rateLimits: AuthRateLimitService,
    private readonly capacity: CommunityCapacityService,
  ) {}

  /** 创建 pending_email 账号；验证码成功前不签发任何会话。 */
  async register(
    input: RegisterInput,
    metadata: AuthRequestMetadata = {},
  ): Promise<RegistrationResult> {
    this.assertRegistrationEnabled();
    this.authEmailOutbox.assertRegistrationDeliveryAvailable();
    this.capacity.maxActiveUsers();
    const email = input.email.trim().normalize('NFC').toLowerCase();
    const now = new Date();
    await this.rateLimits.assertRegisterAllowed(
      email,
      metadata.ipAddress,
      now,
    );
    await this.reclaimExpiredPendingRegistration(email, now);
    const verificationId = randomUUID();
    const verificationCode = generateEmailVerificationCode();
    const expiresAt = new Date(now.getTime() + EMAIL_VERIFICATION_TTL_MS);
    const resendAvailableAt = new Date(now.getTime() + EMAIL_RESEND_DELAY_MS);
    const passwordHash = await hashPassword(input.password);
    const ipHash = hashIpAddress(metadata.ipAddress);
    let emailOutboxId: string | null = null;

    try {
      await this.dataSource.transaction(async (manager) => {
        const users = manager.getRepository(User);
        if (await users.exist({ where: { emailNormalized: email } })) {
          throw new ConflictException({ code: 'ACCOUNT_ALREADY_EXISTS' });
        }

        const user = await users.save(
          users.create({
            email,
            emailNormalized: email,
            passwordHash,
            displayName: input.displayName,
            publicId: randomUUID(),
            accountStatus: 'pending_email',
            socialVerificationStatus: 'unverified',
            emailVerifiedAt: null,
            passwordChangedAt: now,
            onboardingCompleted: false,
          }),
        );

        // All registrations take the global capacity lock before a Beta-code
        // lock, keeping one lock order across replicas and access codes.
        await this.capacity.assertReservationAvailable(manager, now);
        await this.betaAccess.reserve(
          manager,
          user,
          input.betaAccessCode,
          now,
        );

        if (input.referralToken) {
          await this.bindReferral(
            manager,
            user,
            input.referralToken,
            now,
          );
        }

        await this.saveConsents(manager, user.id, input.consents, ipHash, now);

        const profiles = manager.getRepository(PlayerProfile);
        await profiles.save(
          profiles.create({
            userId: user.id,
            nickname: input.displayName,
            avatarKey: null,
            bio: null,
            battleProfession: null,
            privacySettings: { ...DEFAULT_COMMUNITY_PRIVACY },
            title: '初入工位',
          }),
        );

        await manager.getRepository(EmailVerification).save(
          manager.getRepository(EmailVerification).create({
            id: verificationId,
            userId: user.id,
            purpose: 'registration',
            codeHash: hashEmailVerificationCode(
              verificationId,
              verificationCode,
            ),
            attempts: 0,
            maxAttempts: 5,
            resendCount: 0,
            maxResends: 5,
            totalAttempts: 0,
            maxTotalAttempts: 15,
            expiresAt,
            resendAvailableAt,
            usedAt: null,
          }),
        );

        // Persist the encrypted command in the same transaction. No network
        // call or verification code leaves this transaction boundary.
        const queued = await this.authEmailOutbox.enqueueRegistrationCode(
          manager,
          {
            registrationId: verificationId,
            email,
            code: verificationCode,
            expiresAt,
          },
          now,
        );
        emailOutboxId = queued.id;
      });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({ code: 'ACCOUNT_ALREADY_EXISTS' });
      }
      throw error;
    }

    if (emailOutboxId) {
      await this.authEmailOutbox.dispatchNow(emailOutboxId);
    }

    return {
      registrationId: verificationId,
      emailMasked: this.maskEmail(email),
      verificationExpiresAt: expiresAt.toISOString(),
      resendAvailableAt: resendAvailableAt.toISOString(),
      accountStatus: 'pending_email',
      ...(process.env.LOCAL_DEV === 'true'
        ? { devVerificationCode: verificationCode }
        : {}),
    };
  }

  /**
   * 用户名密码注册：账号在同一事务内直接激活并签发会话，不依赖邮箱或 Beta 码。
   * 旧邮箱注册路径继续保留，避免影响既有账号和管理工具。
   */
  async registerAccount(
    input: AccountRegisterInput,
    metadata: AuthRequestMetadata = {},
  ): Promise<AuthSessionResult> {
    this.assertRegistrationEnabled();
    this.capacity.maxActiveUsers();
    const username = input.username.trim().normalize('NFC');
    const usernameNormalized = username.toLowerCase();
    const now = new Date();
    await this.rateLimits.assertRegisterAllowed(
      `username:${usernameNormalized}`,
      metadata.ipAddress,
      now,
    );
    const passwordHash = await hashPassword(input.password);
    const ipHash = hashIpAddress(metadata.ipAddress);
    const publicId = randomUUID();
    const internalEmail = `account-${publicId}@users.invalid`;

    try {
      return await this.dataSource.transaction(async (manager) => {
        // The singleton capacity row stays locked until the active account and
        // its session have committed, preventing concurrent replicas overselling.
        await this.capacity.assertReservationAvailable(manager, now);
        const users = manager.getRepository(User);
        if (await users.exist({ where: { usernameNormalized } })) {
          throw new ConflictException({ code: 'USERNAME_ALREADY_EXISTS' });
        }

        const user = await users.save(
          users.create({
            email: internalEmail,
            emailNormalized: internalEmail,
            username,
            usernameNormalized,
            passwordHash,
            displayName: username,
            publicId,
            accountStatus: 'active',
            socialVerificationStatus: 'unverified',
            emailVerifiedAt: null,
            passwordChangedAt: now,
            onboardingCompleted: false,
          }),
        );

        if (input.referralToken) {
          await this.bindReferral(
            manager,
            user,
            input.referralToken,
            now,
          );
        }
        await this.saveConsents(manager, user.id, input.consents, ipHash, now);
        await manager.getRepository(PlayerProfile).save(
          manager.getRepository(PlayerProfile).create({
            userId: user.id,
            nickname: username,
            avatarKey: null,
            bio: null,
            battleProfession: null,
            privacySettings: { ...DEFAULT_COMMUNITY_PRIVACY },
            title: '初入工位',
          }),
        );
        return this.createSession(manager, user, metadata, now);
      });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({ code: 'USERNAME_ALREADY_EXISTS' });
      }
      throw error;
    }
  }

  /** 对同一随机 registrationId 轮换验证码；旧验证码立即失效。 */
  async resendVerification(
    input: ResendVerificationInput,
    metadata: AuthRequestMetadata = {},
  ): Promise<VerificationDeliveryResult> {
    this.authEmailOutbox.assertRegistrationDeliveryAvailable();
    const now = new Date();
    await this.rateLimits.assertResendAllowed(
      input.registrationId,
      metadata.ipAddress,
      now,
    );
    let verificationCode = generateEmailVerificationCode();
    const expiresAt = new Date(now.getTime() + EMAIL_VERIFICATION_TTL_MS);
    const resendAvailableAt = new Date(now.getTime() + EMAIL_RESEND_DELAY_MS);
    let emailOutboxId: string | null = null;

    await this.dataSource.transaction(async (manager) => {
      const verificationRepo = manager.getRepository(EmailVerification);
      const verification = await verificationRepo.findOne({
        where: { id: input.registrationId, purpose: 'registration' },
        lock: { mode: 'pessimistic_write' },
      });
      if (!verification || verification.usedAt !== null) {
        throw new BadRequestException({ code: 'REGISTRATION_NOT_PENDING' });
      }
      if (verification.resendCount >= verification.maxResends) {
        throw new HttpException(
          {
            code: 'VERIFICATION_RESENDS_EXCEEDED',
            retryAfter: Math.max(
              1,
              Math.ceil(
                (verification.expiresAt.getTime() - now.getTime()) / 1_000,
              ),
            ),
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      if (verification.resendAvailableAt.getTime() > now.getTime()) {
        throw new HttpException(
          {
            code: 'VERIFICATION_RESEND_TOO_SOON',
            resendAvailableAt: verification.resendAvailableAt.toISOString(),
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      while (
        verification.codeHash ===
        hashEmailVerificationCode(verification.id, verificationCode)
      ) {
        verificationCode = generateEmailVerificationCode();
      }

      const user = await manager.getRepository(User).findOne({
        where: { id: verification.userId },
        lock: { mode: 'pessimistic_write' },
      });
      const reservation = await manager
        .getRepository(BetaAccessReservation)
        .findOne({
          where: { userId: verification.userId },
          lock: { mode: 'pessimistic_write' },
        });
      if (!user || user.accountStatus !== 'pending_email') {
        throw new BadRequestException({ code: 'REGISTRATION_NOT_PENDING' });
      }
      if (
        !reservation ||
        reservation.redeemedAt !== null ||
        reservation.reservedUntil.getTime() <= now.getTime()
      ) {
        throw new ForbiddenException({ code: 'BETA_RESERVATION_EXPIRED' });
      }

      verification.codeHash = hashEmailVerificationCode(
        verification.id,
        verificationCode,
      );
      verification.attempts = 0;
      verification.resendCount += 1;
      verification.expiresAt = expiresAt;
      verification.resendAvailableAt = resendAvailableAt;
      await verificationRepo.save(verification);
      const queued = await this.authEmailOutbox.enqueueRegistrationCode(
        manager,
        {
          registrationId: verification.id,
          email: user.email,
          code: verificationCode,
          expiresAt,
        },
        now,
      );
      emailOutboxId = queued.id;
    });

    if (emailOutboxId) {
      await this.authEmailOutbox.dispatchNow(emailOutboxId);
    }

    return {
      verificationExpiresAt: expiresAt.toISOString(),
      resendAvailableAt: resendAvailableAt.toISOString(),
      ...(process.env.LOCAL_DEV === 'true'
        ? { devVerificationCode: verificationCode }
        : {}),
    };
  }

  async verifyEmail(
    input: VerifyEmailInput,
    metadata: AuthRequestMetadata = {},
  ): Promise<AuthSessionResult> {
    const now = new Date();
    await this.rateLimits.assertVerificationAllowed(
      input.registrationId,
      metadata.ipAddress,
      now,
    );
    const outcome = await this.dataSource.transaction(async (manager) => {
      const verificationRepo = manager.getRepository(EmailVerification);
      const verification = await verificationRepo.findOne({
        where: { id: input.registrationId, purpose: 'registration' },
        lock: { mode: 'pessimistic_write' },
      });
      if (!verification) return { kind: 'invalid' } as VerificationOutcome;
      if (verification.usedAt !== null) {
        return { kind: 'used' } as VerificationOutcome;
      }
      if (verification.expiresAt.getTime() <= now.getTime()) {
        return { kind: 'expired' } as VerificationOutcome;
      }
      if (
        verification.attempts >= verification.maxAttempts ||
        verification.totalAttempts >= verification.maxTotalAttempts
      ) {
        return { kind: 'locked' } as VerificationOutcome;
      }
      if (
        verification.codeHash !==
        hashEmailVerificationCode(verification.id, input.code)
      ) {
        verification.attempts = Math.min(
          verification.maxAttempts,
          verification.attempts + 1,
        );
        verification.totalAttempts = Math.min(
          verification.maxTotalAttempts,
          verification.totalAttempts + 1,
        );
        await verificationRepo.save(verification);
        return {
          kind:
            verification.attempts >= verification.maxAttempts ||
            verification.totalAttempts >= verification.maxTotalAttempts
              ? 'locked'
              : 'invalid',
        } as VerificationOutcome;
      }

      const user = await manager.getRepository(User).findOne({
        where: { id: verification.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user || user.accountStatus !== 'pending_email') {
        return { kind: 'used' } as VerificationOutcome;
      }

      await this.capacity.assertActivationAllowed(manager, now);
      await this.betaAccess.redeem(manager, user.id, now);
      verification.usedAt = now;
      user.accountStatus = 'active';
      user.emailVerifiedAt = now;
      await verificationRepo.save(verification);
      await manager.getRepository(User).save(user);
      await this.authEmailOutbox.cancelRegistration(
        manager,
        verification.id,
        'AUTH_EMAIL_VERIFIED',
      );

      const result = await this.createSession(manager, user, metadata, now);
      return { kind: 'success', result } as VerificationOutcome;
    });

    if (outcome.kind === 'success') return outcome.result;
    if (outcome.kind === 'expired') {
      throw new BadRequestException({ code: 'VERIFICATION_CODE_EXPIRED' });
    }
    if (outcome.kind === 'locked') {
      throw new HttpException(
        { code: 'VERIFICATION_ATTEMPTS_EXCEEDED' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (outcome.kind === 'used') {
      throw new ConflictException({ code: 'VERIFICATION_ALREADY_USED' });
    }
    throw new BadRequestException({ code: 'VERIFICATION_CODE_INVALID' });
  }

  async login(
    input: LoginInput,
    metadata: AuthRequestMetadata = {},
  ): Promise<AuthSessionResult> {
    const email = input.email.trim().normalize('NFC').toLowerCase();
    await this.rateLimits.assertLoginAllowed(email, metadata.ipAddress);
    const candidate = await this.dataSource.getRepository(User).findOne({
      where: { emailNormalized: email },
    });
    const passwordMatches = await verifyPassword(
      input.password,
      candidate?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!candidate || !passwordMatches) {
      throw this.invalidCredentials();
    }

    return this.dataSource.transaction(async (manager) => {
      const user = await manager.getRepository(User).findOne({
        where: { id: candidate.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) throw this.invalidCredentials();
      this.assertLoginAllowed(user);
      return this.createSession(manager, user, metadata, new Date());
    });
  }

  async loginAccount(
    input: AccountLoginInput,
    metadata: AuthRequestMetadata = {},
  ): Promise<AuthSessionResult> {
    const usernameNormalized = input.username.trim().normalize('NFC').toLowerCase();
    await this.rateLimits.assertLoginAllowed(
      `username:${usernameNormalized}`,
      metadata.ipAddress,
    );
    const candidate = await this.dataSource.getRepository(User).findOne({
      where: { usernameNormalized },
    });
    const passwordMatches = await verifyPassword(
      input.password,
      candidate?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!candidate || !passwordMatches) throw this.invalidCredentials();

    return this.dataSource.transaction(async (manager) => {
      const user = await manager.getRepository(User).findOne({
        where: { id: candidate.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) throw this.invalidCredentials();
      this.assertLoginAllowed(user);
      return this.createSession(manager, user, metadata, new Date());
    });
  }

  async refresh(
    rawRefreshToken: string | null,
    metadata: AuthRequestMetadata = {},
  ): Promise<AuthSessionResult> {
    await this.rateLimits.assertRefreshAllowed(metadata.ipAddress);
    const parsed = this.parseRefreshToken(rawRefreshToken);
    if (!parsed) throw this.invalidRefresh();
    const now = new Date();
    const tokenHash = hashRefreshToken(parsed.raw);

    const outcome = await this.dataSource.transaction(async (manager) => {
      const tokenRepo = manager.getRepository(AuthRefreshToken);
      const token = await tokenRepo.findOne({
        where: { id: parsed.id },
        lock: { mode: 'pessimistic_write' },
      });
      // 知道 token id 但不知道 secret 不能借此撤销别人的会话。
      if (!token || token.tokenHash !== tokenHash) {
        return { kind: 'invalid' } as RefreshOutcome;
      }

      const session = await manager.getRepository(AuthSession).findOne({
        where: { id: token.sessionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!session) return { kind: 'invalid' } as RefreshOutcome;

      if (token.status === 'consumed') {
        if (
          token.consumedAt !== null &&
          now.getTime() - token.consumedAt.getTime() <=
            REFRESH_ROTATION_RACE_GRACE_MS
        ) {
          // 另一个标签页可能在 Set-Cookie 生效前携带刚消费的旧值到达。
          // 短窗口内让客户端读取最新 Cookie 后重试，不能误撤销整台设备。
          return { kind: 'race' } as RefreshOutcome;
        }
        await this.revokeSession(
          manager,
          session,
          'refresh_token_reuse',
          now,
        );
        return { kind: 'reused' } as RefreshOutcome;
      }
      if (token.status !== 'active') {
        return { kind: 'invalid' } as RefreshOutcome;
      }
      if (
        session.revokedAt !== null ||
        session.expiresAt.getTime() <= now.getTime() ||
        token.expiresAt.getTime() <= now.getTime()
      ) {
        await this.revokeSession(manager, session, 'expired', now);
        return { kind: 'invalid' } as RefreshOutcome;
      }

      const user = await manager.getRepository(User).findOne({
        where: { id: session.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user || !this.isSessionEligibleStatus(user.accountStatus)) {
        await this.revokeSession(manager, session, 'account_unavailable', now);
        return { kind: 'account_unavailable' } as RefreshOutcome;
      }

      token.status = 'consumed';
      token.consumedAt = now;
      const next = generateRefreshToken();
      token.replacedById = next.id;
      await tokenRepo.save(token);

      const refreshExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_MS);
      await tokenRepo.save(
        tokenRepo.create({
          id: next.id,
          sessionId: session.id,
          tokenHash: next.hash,
          status: 'active',
          expiresAt: refreshExpiresAt,
          consumedAt: null,
          replacedById: null,
          revokedAt: null,
        }),
      );
      session.lastSeenAt = now;
      session.expiresAt = refreshExpiresAt;
      session.userAgent = this.userAgent(metadata.userAgent);
      session.ipHash = hashIpAddress(metadata.ipAddress);
      await manager.getRepository(AuthSession).save(session);
      const profile = await this.ensureProfile(manager, user);

      return {
        kind: 'success',
        result: {
          accessToken: await this.signAccessToken(user.id, session.id),
          refreshToken: next.raw,
          refreshExpiresAt,
          user: this.toUserView(user, profile),
        },
      } as RefreshOutcome;
    });

    if (outcome.kind === 'success') return outcome.result;
    if (outcome.kind === 'race') {
      throw new ConflictException({
        code: 'REFRESH_TOKEN_ROTATION_RACE',
        retryAfterMs: 150,
      });
    }
    if (outcome.kind === 'reused') {
      throw new UnauthorizedException({ code: 'REFRESH_TOKEN_REUSED' });
    }
    if (outcome.kind === 'account_unavailable') {
      throw new ForbiddenException({ code: 'ACCOUNT_UNAVAILABLE' });
    }
    throw this.invalidRefresh();
  }

  async logout(rawRefreshToken: string | null): Promise<void> {
    const parsed = this.parseRefreshToken(rawRefreshToken);
    if (!parsed) return;
    const tokenHash = hashRefreshToken(parsed.raw);
    await this.dataSource.transaction(async (manager) => {
      const token = await manager.getRepository(AuthRefreshToken).findOne({
        where: { id: parsed.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!token || token.tokenHash !== tokenHash) return;
      const session = await manager.getRepository(AuthSession).findOne({
        where: { id: token.sessionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (session) {
        await this.revokeSession(manager, session, 'logout', new Date());
      }
    });
  }

  async logoutAll(userId: string): Promise<void> {
    const now = new Date();
    await this.dataSource.transaction(async (manager) => {
      const sessions = await manager.getRepository(AuthSession).find({
        where: { userId, revokedAt: IsNull() },
      });
      if (sessions.length === 0) return;
      const ids = sessions.map((session) => session.id);
      await manager.getRepository(AuthSession).update(
        { id: In(ids) },
        { revokedAt: now, revokeReason: 'logout_all' },
      );
      await manager.getRepository(AuthRefreshToken).update(
        { sessionId: In(ids), status: 'active' },
        { status: 'revoked', revokedAt: now },
      );
    });
  }

  async listSessions(
    userId: string,
    currentSessionId: string,
  ): Promise<AuthDeviceSessionView[]> {
    const sessions = await this.dataSource.getRepository(AuthSession).find({
      where: { userId, revokedAt: IsNull(), expiresAt: MoreThan(new Date()) },
      order: { lastSeenAt: 'DESC', createdAt: 'DESC' },
    });
    return sessions.map((session) => ({
        id: session.id,
        current: session.id === currentSessionId,
        createdAt: session.createdAt.toISOString(),
        lastActiveAt: session.lastSeenAt.toISOString(),
        deviceLabel: this.deviceLabel(session.userAgent),
        region: null,
      }));
  }

  async revokeDeviceSession(
    userId: string,
    currentSessionId: string,
    sessionId: string,
  ): Promise<{ current: boolean }> {
    return this.dataSource.transaction(async (manager) => {
      const session = await manager.getRepository(AuthSession).findOne({
        where: { id: sessionId, userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!session || session.revokedAt !== null) {
        throw new NotFoundException({ code: 'SESSION_NOT_FOUND' });
      }
      await this.revokeSession(manager, session, 'device_revoked', new Date());
      return { current: session.id === currentSessionId };
    });
  }

  async getCurrentUser(userId: string): Promise<AuthUserView> {
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.getRepository(User).findOne({
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user || user.accountStatus !== 'active') {
        throw new UnauthorizedException({ code: 'INVALID_SESSION' });
      }
      const profile = await this.ensureProfile(manager, user);
      return this.toUserView(user, profile);
    });
  }

  async updateProfile(
    userId: string,
    input: UpdateProfileInput,
  ): Promise<AuthUserView> {
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.getRepository(User).findOne({
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user || user.accountStatus !== 'active') {
        throw new UnauthorizedException({ code: 'INVALID_SESSION' });
      }
      const profile = await this.ensureProfile(manager, user);

      if (input.displayName !== undefined) {
        user.displayName = input.displayName;
        profile.nickname = input.displayName;
      }
      if (input.bio !== undefined) profile.bio = input.bio;
      if (input.avatarKey !== undefined) profile.avatarKey = input.avatarKey;
      if (input.battleProfession !== undefined) {
        profile.battleProfession = input.battleProfession;
      }
      if (input.onboardingCompleted === true) {
        if (!user.displayName || !profile.avatarKey || !profile.battleProfession) {
          throw new BadRequestException({ code: 'ONBOARDING_FIELDS_REQUIRED' });
        }
        user.onboardingCompleted = true;
      }

      await manager.getRepository(User).save(user);
      await manager.getRepository(PlayerProfile).save(profile);
      return this.toUserView(user, profile);
    });
  }

  async updatePrivacy(
    userId: string,
    privacy: CommunityPrivacySettings,
  ): Promise<AuthUserView> {
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.getRepository(User).findOne({
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user || user.accountStatus !== 'active') {
        throw new UnauthorizedException({ code: 'INVALID_SESSION' });
      }
      const profile = await this.ensureProfile(manager, user);
      profile.privacySettings = { ...privacy };
      await manager.getRepository(PlayerProfile).save(profile);
      return this.toUserView(user, profile);
    });
  }

  private async createSession(
    manager: EntityManager,
    user: User,
    metadata: AuthRequestMetadata,
    now: Date,
  ): Promise<AuthSessionResult> {
    const refreshExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_MS);
    const sessionRepo = manager.getRepository(AuthSession);
    const session = await sessionRepo.save(
      sessionRepo.create({
        userId: user.id,
        userAgent: this.userAgent(metadata.userAgent),
        ipHash: hashIpAddress(metadata.ipAddress),
        lastSeenAt: now,
        expiresAt: refreshExpiresAt,
        revokedAt: null,
        revokeReason: null,
      }),
    );
    const refresh = generateRefreshToken();
    const refreshRepo = manager.getRepository(AuthRefreshToken);
    await refreshRepo.save(
      refreshRepo.create({
        id: refresh.id,
        sessionId: session.id,
        tokenHash: refresh.hash,
        status: 'active',
        expiresAt: refreshExpiresAt,
        consumedAt: null,
        replacedById: null,
        revokedAt: null,
      }),
    );
    const profile = await this.ensureProfile(manager, user);
    return {
      accessToken: await this.signAccessToken(user.id, session.id),
      refreshToken: refresh.raw,
      refreshExpiresAt,
      user: this.toUserView(user, profile),
    };
  }

  private async revokeSession(
    manager: EntityManager,
    session: AuthSession,
    reason: string,
    now: Date,
  ): Promise<void> {
    if (session.revokedAt === null) {
      session.revokedAt = now;
      session.revokeReason = reason;
      await manager.getRepository(AuthSession).save(session);
    }
    await manager.getRepository(AuthRefreshToken).update(
      { sessionId: session.id, status: 'active' },
      { status: 'revoked', revokedAt: now },
    );
  }

  private saveConsents(
    manager: EntityManager,
    userId: string,
    input: RegistrationConsents,
    ipHash: string | null,
    now: Date,
  ): Promise<ConsentRecord[]> {
    const versions: Array<[ConsentType, string]> = [
      ['terms', input.termsVersion],
      ['privacy', input.privacyVersion],
      ['community_guidelines', input.communityGuidelinesVersion],
      ['adult_declaration', input.adultDeclarationVersion],
    ];
    const repo = manager.getRepository(ConsentRecord);
    return repo.save(
      versions.map(([consentType, version]) =>
        repo.create({
          userId,
          consentType,
          version,
          source: 'registration',
          ipHash,
          acceptedAt: now,
        }),
      ),
    );
  }

  private signAccessToken(userId: string, sessionId: string): Promise<string> {
    const payload: JwtPayload = { sub: userId, sid: sessionId, typ: 'access' };
    return this.jwtService.signAsync(payload, {
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });
  }

  /**
   * Reclaims only an expired, never-activated registration. Lock order matches
   * verify/resend (verification, then user), and referral claim state is reset
   * before the user cascade removes its redemption and Beta reservation.
   */
  private async reclaimExpiredPendingRegistration(
    emailNormalized: string,
    now: Date,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const userRepository = manager.getRepository(User);
      const snapshot = await userRepository.findOne({
        where: { emailNormalized },
      });
      if (!snapshot) return;

      const verificationRepository = manager.getRepository(EmailVerification);
      const verification = await verificationRepository.findOne({
        where: { userId: snapshot.id, purpose: 'registration' },
        order: { createdAt: 'DESC' },
        lock: { mode: 'pessimistic_write' },
      });
      const user = await userRepository.findOne({
        where: { id: snapshot.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user || user.emailNormalized !== emailNormalized) return;
      if (user.accountStatus !== 'pending_email') {
        throw new ConflictException({ code: 'ACCOUNT_ALREADY_EXISTS' });
      }

      const pendingStillValid =
        verification !== null &&
        verification.usedAt === null &&
        verification.expiresAt.getTime() > now.getTime();
      const malformedButStillFresh =
        verification === null &&
        user.createdAt.getTime() + EMAIL_VERIFICATION_TTL_MS > now.getTime();
      if (
        pendingStillValid ||
        malformedButStillFresh ||
        (verification !== null && verification.usedAt !== null)
      ) {
        throw new ConflictException({ code: 'ACCOUNT_ALREADY_EXISTS' });
      }

      const reservation = await manager
        .getRepository(BetaAccessReservation)
        .findOne({
          where: { userId: user.id },
          lock: { mode: 'pessimistic_write' },
        });
      if (reservation && reservation.redeemedAt !== null) {
        throw new ConflictException({ code: 'ACCOUNT_ALREADY_EXISTS' });
      }

      const claimTokenRepository = manager.getRepository(ReferralClaimToken);
      const consumedClaims = await claimTokenRepository.find({
        where: { consumedByUserId: user.id },
        lock: { mode: 'pessimistic_write' },
      });
      for (const claim of consumedClaims) {
        claim.consumedAt = null;
        claim.consumedByUserId = null;
      }
      if (consumedClaims.length > 0) {
        await claimTokenRepository.save(consumedClaims);
      }
      if (verification) {
        await this.authEmailOutbox.cancelRegistration(
          manager,
          verification.id,
          'AUTH_EMAIL_EXPIRED',
        );
      }
      await userRepository.delete(user.id);
    });
  }

  private async bindReferral(
    manager: EntityManager,
    user: User,
    rawToken: string,
    now: Date,
  ): Promise<void> {
    assertCommunityWritesEnabled();
    const tokenRepo = manager.getRepository(ReferralClaimToken);
    const token = await tokenRepo.findOne({
      where: { tokenHash: secretHash('referral-claim', rawToken) },
      lock: { mode: 'pessimistic_write' },
    });
    if (
      !token ||
      token.consumedAt !== null ||
      token.expiresAt.getTime() <= now.getTime()
    ) {
      throw new BadRequestException({ code: 'REFERRAL_TOKEN_INVALID' });
    }
      const codeSnapshot = await manager.getRepository(ReferralCode).findOne({
        where: {
          id: token.codeId,
          purpose: 'user_referral',
        },
      });
      if (
        !codeSnapshot ||
        (codeSnapshot.status !== 'active' &&
          codeSnapshot.status !== 'rotated') ||
        codeSnapshot.inviterId === user.id ||
        (codeSnapshot.expiresAt !== null &&
          codeSnapshot.expiresAt.getTime() <= now.getTime())
    ) {
      throw new BadRequestException({ code: 'REFERRAL_TOKEN_INVALID' });
    }
    const inviter = await manager.getRepository(User).findOne({
      where: { id: codeSnapshot.inviterId, accountStatus: 'active' },
      lock: { mode: 'pessimistic_write' },
    });
    if (!inviter) {
      throw new BadRequestException({ code: 'REFERRAL_TOKEN_INVALID' });
    }
      const code = await manager.getRepository(ReferralCode).findOne({
        where: {
          id: codeSnapshot.id,
          purpose: 'user_referral',
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !code ||
        (code.status !== 'active' && code.status !== 'rotated') ||
        (code.expiresAt && code.expiresAt.getTime() <= now.getTime())
      ) {
        throw new BadRequestException({ code: 'REFERRAL_TOKEN_INVALID' });
      }
    const redemptionRepo = manager.getRepository(ReferralRedemption);
    if (await redemptionRepo.exist({ where: { inviteeId: user.id } })) {
      throw new ConflictException({ code: 'REFERRAL_ALREADY_BOUND' });
    }
    await redemptionRepo.save(
      redemptionRepo.create({
        inviterId: inviter.id,
        inviteeId: user.id,
        codeId: code.id,
        status: 'bound',
        riskStatus: 'pending',
        boundAt: now,
        qualifiedAt: null,
        rewardGrantedAt: null,
        rejectionReason: null,
      }),
    );
    token.consumedAt = now;
    token.consumedByUserId = user.id;
    await tokenRepo.save(token);
  }

  private async ensureProfile(
    manager: EntityManager,
    user: User,
  ): Promise<PlayerProfile> {
    const repo = manager.getRepository(PlayerProfile);
    const existing = await repo.findOne({ where: { userId: user.id } });
    if (existing) return existing;
    return repo.save(
      repo.create({
        userId: user.id,
        nickname: user.displayName,
        avatarKey: null,
        bio: null,
        battleProfession: null,
        privacySettings: { ...DEFAULT_COMMUNITY_PRIVACY },
        title: '初入工位',
      }),
    );
  }

  private toUserView(user: User, profile: PlayerProfile): AuthUserView {
    return {
      id: user.publicId,
      publicId: user.publicId,
      email: user.username ? '' : user.email,
      username: user.username,
      displayName: user.displayName,
      accountStatus: user.accountStatus,
      onboardingCompleted: user.onboardingCompleted,
      socialVerificationStatus: user.socialVerificationStatus,
      avatarKey: profile.avatarKey,
      battleProfession: profile.battleProfession,
      bio: profile.bio,
      privacy: {
        ...DEFAULT_COMMUNITY_PRIVACY,
        ...profile.privacySettings,
      },
      roles: [user.communityRole === 'user' ? 'member' : user.communityRole],
    };
  }

  private assertRegistrationEnabled(): void {
    const configured = process.env.FEATURE_REGISTRATION_ENABLED;
    const enabled =
      configured === 'true' ||
      (configured === undefined && process.env.LOCAL_DEV === 'true');
    if (!enabled) {
      throw new ServiceUnavailableException({ code: 'REGISTRATION_DISABLED' });
    }
  }

  private assertLoginAllowed(user: User): void {
    if (user.accountStatus === 'pending_email') {
      throw new ForbiddenException({ code: 'EMAIL_NOT_VERIFIED' });
    }
    if (!this.isSessionEligibleStatus(user.accountStatus)) {
      throw new ForbiddenException({ code: 'ACCOUNT_UNAVAILABLE' });
    }
  }

  private isSessionEligibleStatus(status: User['accountStatus']): boolean {
    return (
      status === 'active' ||
      status === 'suspended' ||
      status === 'banned' ||
      status === 'deleting'
    );
  }

  private invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
  }

  private invalidRefresh(): UnauthorizedException {
    return new UnauthorizedException({ code: 'INVALID_REFRESH_TOKEN' });
  }

  private parseRefreshToken(
    raw: string | null,
  ): { id: string; raw: string } | null {
    if (!raw || raw.length > 200) return null;
    const separator = raw.indexOf('.');
    if (separator <= 0 || separator === raw.length - 1) return null;
    const id = raw.slice(0, separator);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    return { id, raw };
  }

  private userAgent(value: string | null | undefined): string | null {
    const normalized = value?.trim();
    return normalized ? normalized.slice(0, 500) : null;
  }

  private deviceLabel(userAgent: string | null): string {
    if (!userAgent) return '未知设备';
    const browser = /Edg\//.test(userAgent)
      ? 'Edge'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Chrome\//.test(userAgent)
          ? 'Chrome'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : '浏览器';
    const system = /Windows/i.test(userAgent)
      ? 'Windows'
      : /Android/i.test(userAgent)
        ? 'Android'
        : /iPhone|iPad/i.test(userAgent)
          ? 'iOS'
          : /Mac OS/i.test(userAgent)
            ? 'macOS'
            : /Linux/i.test(userAgent)
              ? 'Linux'
              : '未知系统';
    return `${browser} · ${system}`;
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    const visible = local.slice(0, Math.min(2, local.length));
    return `${visible}${'*'.repeat(
      Math.max(2, local.length - visible.length),
    )}@${domain}`;
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const record = error as {
      code?: unknown;
      driverError?: { code?: unknown };
    };
    return record.code === '23505' || record.driverError?.code === '23505';
  }
}
