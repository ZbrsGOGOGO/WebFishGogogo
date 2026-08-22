import { randomUUID, timingSafeEqual } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { SocialVerificationCallbackReceipt } from '../../database/entities/social-verification-callback-receipt.entity';
import { SocialVerificationSession } from '../../database/entities/social-verification-session.entity';
import { User } from '../../database/entities/user.entity';
import { hashAuthMetadata } from './auth-crypto';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthRequestMetadata } from './auth.service';
import {
  assertFeatureEnabled,
  SocialVerificationCallbackInput,
} from './auth-security-validation';
import {
  SocialVerificationProviderService,
  VerificationCallbackHeaders,
} from './social-verification-provider.service';
import { AuthSensitiveDataService } from './auth-sensitive-data.service';

export interface SocialVerificationView {
  status: 'not_started' | 'pending' | 'verified' | 'failed' | 'expired';
  provider?: string | null;
  submittedAt?: string | null;
  verifiedAt?: string | null;
  failureCode?: string | null;
}

export interface SocialVerificationSessionView {
  sessionId: string;
  launchUrl: string;
  expiresAt: string;
}

@Injectable()
export class SocialVerificationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly provider: SocialVerificationProviderService,
    private readonly sensitive: AuthSensitiveDataService,
    private readonly rateLimits: AuthRateLimitService,
  ) {}

  async get(userId: string): Promise<SocialVerificationView> {
    assertFeatureEnabled('FEATURE_SOCIAL_VERIFICATION_ENABLED');
    const latest = await this.dataSource
      .getRepository(SocialVerificationSession)
      .findOne({ where: { userId }, order: { createdAt: 'DESC' } });
    if (!latest) return { status: 'not_started' };
    if (
      latest.status === 'pending' &&
      latest.expiresAt.getTime() <= Date.now()
    ) {
      return this.expire(latest.id, new Date());
    }
    return this.view(latest);
  }

  async create(
    userId: string,
    metadata: AuthRequestMetadata = {},
  ): Promise<SocialVerificationSessionView> {
    assertFeatureEnabled('FEATURE_SOCIAL_VERIFICATION_ENABLED');
    this.sensitive.assertAvailable();
    const now = new Date();
    await this.rateLimits.assertSocialVerificationSessionAllowed(
      userId,
      metadata.ipAddress,
      now,
    );
    const providerName = this.provider.providerName();
    const sessionId = randomUUID();
    try {
      await this.dataSource.transaction(async (manager) => {
        const user = await manager.getRepository(User).findOne({
          where: { id: userId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!user || user.accountStatus !== 'active') {
          throw new ForbiddenException({ code: 'ACCOUNT_UNAVAILABLE' });
        }
        if (user.socialVerificationStatus === 'verified') {
          throw new ConflictException({ code: 'SOCIAL_VERIFICATION_ALREADY_VERIFIED' });
        }
        const repository = manager.getRepository(SocialVerificationSession);
        const pending = await repository.findOne({
          where: { userId, status: 'pending' },
          lock: { mode: 'pessimistic_write' },
        });
        if (pending && pending.expiresAt.getTime() > now.getTime()) {
          throw new ConflictException({ code: 'SOCIAL_VERIFICATION_ALREADY_PENDING' });
        }
        if (pending) {
          pending.status = 'expired';
          pending.failureCode = 'SESSION_EXPIRED';
          await repository.save(pending);
        }
        user.socialVerificationStatus = 'pending';
        await manager.getRepository(User).save(user);
        await repository.save(
          repository.create({
            id: sessionId,
            userId,
            provider: providerName,
            providerReferenceHash: hashAuthMetadata(
              'social-verification-provider-reference',
              `pending:${sessionId}`,
            ),
            status: 'pending',
            submittedAt: now,
            verifiedAt: null,
            expiresAt: new Date(now.getTime() + 5 * 60_000),
            failureCode: null,
            auditKeyId: null,
            auditCiphertext: null,
            auditNonce: null,
            auditAuthTag: null,
          }),
        );
      });
    } catch (error) {
      if (!this.isUniqueViolation(error)) throw error;
      throw new ConflictException({ code: 'SOCIAL_VERIFICATION_ALREADY_PENDING' });
    }

    let remote;
    try {
      remote = await this.provider.createSession(
        sessionId,
        '/settings/verification',
        now,
      );
    } catch (error) {
      await this.failProvisioning(sessionId, new Date());
      throw error;
    }
    if (remote.provider !== providerName) {
      await this.failProvisioning(sessionId, new Date());
      throw new ServiceUnavailableException({
        code: 'SOCIAL_VERIFICATION_PROVIDER_INVALID_RESPONSE',
      });
    }

    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(SocialVerificationSession);
      const session = await repository.findOne({
        where: { id: sessionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!session || session.status !== 'pending') {
        throw new ConflictException({ code: 'SOCIAL_VERIFICATION_SESSION_CHANGED' });
      }
      session.providerReferenceHash = hashAuthMetadata(
        'social-verification-provider-reference',
        remote.providerReference,
      );
      session.expiresAt = remote.expiresAt;
      await repository.save(session);
    });
    return {
      sessionId,
      launchUrl: remote.launchUrl,
      expiresAt: remote.expiresAt.toISOString(),
    };
  }

  async callback(
    input: SocialVerificationCallbackInput,
    headers: VerificationCallbackHeaders,
    rawBody: Buffer,
    metadata: AuthRequestMetadata = {},
  ): Promise<{ accepted: true; status: SocialVerificationView['status'] }> {
    assertFeatureEnabled('FEATURE_SOCIAL_VERIFICATION_ENABLED');
    await this.rateLimits.assertSocialVerificationCallbackAllowed(
      metadata.ipAddress,
    );
    const now = new Date();
    this.provider.verifyCallback(headers, rawBody, now);
    if (Math.abs(input.occurredAt.getTime() - now.getTime()) > 10 * 60_000) {
      throw new BadRequestException({ code: 'VERIFICATION_CALLBACK_STALE' });
    }
    const eventKeyHash = hashAuthMetadata(
      'social-verification-event',
      `${this.provider.providerName()}:${headers.eventId}`,
    );
    const nonceHash = hashAuthMetadata(
      'social-verification-nonce',
      headers.nonce,
    );
    const bodyHash = hashAuthMetadata(
      'social-verification-callback-body',
      rawBody.toString('base64'),
    );

    try {
      return await this.dataSource.transaction(async (manager) => {
        const receiptRepository = manager.getRepository(
          SocialVerificationCallbackReceipt,
        );
        const existingEvent = await receiptRepository.findOne({
          where: { eventKeyHash },
          lock: { mode: 'pessimistic_write' },
        });
        if (existingEvent) {
          if (existingEvent.bodyHash !== bodyHash) this.replayed();
          const existingSession = await manager
            .getRepository(SocialVerificationSession)
            .findOneByOrFail({ id: existingEvent.sessionId });
          return { accepted: true, status: this.view(existingSession).status };
        }
        if (await receiptRepository.exist({ where: { nonceHash } })) {
          this.replayed();
        }

        const sessions = manager.getRepository(SocialVerificationSession);
        const session = await sessions.findOne({
          where: { id: input.sessionId },
          lock: { mode: 'pessimistic_write' },
        });
        if (
          !session ||
          session.provider !== this.provider.providerName() ||
          !this.equalHash(
            session.providerReferenceHash,
            hashAuthMetadata(
              'social-verification-provider-reference',
              input.providerReference,
            ),
          )
        ) {
          throw new BadRequestException({ code: 'VERIFICATION_CALLBACK_INVALID' });
        }
        const user = await manager.getRepository(User).findOne({
          where: { id: session.userId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!user) {
          throw new BadRequestException({ code: 'VERIFICATION_CALLBACK_INVALID' });
        }
        await receiptRepository.save(
          receiptRepository.create({
            sessionId: session.id,
            eventKeyHash,
            nonceHash,
            bodyHash,
            occurredAt: input.occurredAt,
          }),
        );

        if (session.status === 'pending') {
          if (
            session.expiresAt.getTime() < input.occurredAt.getTime() ||
            now.getTime() > session.expiresAt.getTime() + 5 * 60_000
          ) {
            session.status = 'expired';
            session.failureCode = 'SESSION_EXPIRED';
            user.socialVerificationStatus = 'expired';
          } else if (input.status === 'verified') {
            session.status = 'verified';
            session.verifiedAt = input.occurredAt;
            session.failureCode = null;
            user.socialVerificationStatus = 'verified';
          } else {
            session.status = 'failed';
            session.failureCode = input.resultCode ?? 'PROVIDER_REJECTED';
            user.socialVerificationStatus = 'rejected';
          }
          const audit = this.sensitive.encrypt(
            'social-verification-audit',
            session.id,
            {
              status: session.status,
              occurredAt: input.occurredAt.toISOString(),
              resultCode: input.resultCode,
            },
          );
          session.auditKeyId = audit.keyId;
          session.auditCiphertext = audit.ciphertext;
          session.auditNonce = audit.nonce;
          session.auditAuthTag = audit.authTag;
          await sessions.save(session);
          await manager.getRepository(User).save(user);
        }
        return { accepted: true, status: this.view(session).status };
      });
    } catch (error) {
      if (!this.isUniqueViolation(error)) throw error;
      const existing = await this.dataSource
        .getRepository(SocialVerificationCallbackReceipt)
        .findOne({ where: { eventKeyHash } });
      if (!existing || existing.bodyHash !== bodyHash) this.replayed();
      const session = await this.dataSource
        .getRepository(SocialVerificationSession)
        .findOneByOrFail({ id: existing.sessionId });
      return { accepted: true, status: this.view(session).status };
    }
  }

  private async expire(
    sessionId: string,
    now: Date,
  ): Promise<SocialVerificationView> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(SocialVerificationSession);
      const session = await repository.findOne({
        where: { id: sessionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!session) return { status: 'not_started' };
      if (session.status === 'pending' && session.expiresAt <= now) {
        session.status = 'expired';
        session.failureCode = 'SESSION_EXPIRED';
        await repository.save(session);
        await manager.getRepository(User).update(
          { id: session.userId, socialVerificationStatus: 'pending' },
          { socialVerificationStatus: 'expired' },
        );
      }
      return this.view(session);
    });
  }

  private async failProvisioning(sessionId: string, now: Date): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(SocialVerificationSession);
      const session = await repository.findOne({
        where: { id: sessionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!session || session.status !== 'pending') return;
      session.status = 'failed';
      session.failureCode = 'PROVIDER_UNAVAILABLE';
      session.expiresAt = now;
      await repository.save(session);
      await manager.getRepository(User).update(
        { id: session.userId, socialVerificationStatus: 'pending' },
        { socialVerificationStatus: 'rejected' },
      );
    });
  }

  private view(session: SocialVerificationSession): SocialVerificationView {
    return {
      status: session.status,
      provider: session.provider,
      submittedAt: session.submittedAt.toISOString(),
      verifiedAt: session.verifiedAt?.toISOString() ?? null,
      failureCode: session.failureCode,
    };
  }

  private equalHash(left: string, right: string): boolean {
    const a = Buffer.from(left, 'hex');
    const b = Buffer.from(right, 'hex');
    return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
  }

  private replayed(): never {
    throw new ConflictException({ code: 'VERIFICATION_CALLBACK_REPLAYED' });
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    );
  }
}
