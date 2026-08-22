import { timingSafeEqual } from 'node:crypto';

import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { DataSource, In, IsNull, LessThan, MoreThan } from 'typeorm';

import { AuthRefreshToken } from '../../database/entities/auth-refresh-token.entity';
import { AuthSession } from '../../database/entities/auth-session.entity';
import { PasswordResetToken } from '../../database/entities/password-reset-token.entity';
import { User } from '../../database/entities/user.entity';
import {
  generatePasswordResetToken,
  hashAuthMetadata,
  hashPasswordResetToken,
} from './auth-crypto';
import { AuthEmailOutboxService } from './auth-email-outbox.service';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthRequestMetadata } from './auth.service';
import { assertFeatureEnabled } from './auth-security-validation';
import { hashPassword } from './password.util';

const PASSWORD_RESET_TTL_MS = 30 * 60_000;
const RESETTABLE_STATUSES: User['accountStatus'][] = [
  'active',
  'suspended',
  'banned',
  'deleting',
];

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly rateLimits: AuthRateLimitService,
    private readonly emailOutbox: AuthEmailOutboxService,
  ) {}

  /** Always resolves without revealing whether the normalized email exists. */
  async request(
    emailNormalized: string,
    metadata: AuthRequestMetadata = {},
  ): Promise<void> {
    assertFeatureEnabled('FEATURE_PASSWORD_RESET_ENABLED');
    this.emailOutbox.assertPasswordResetDeliveryAvailable();
    const email = emailNormalized.trim().normalize('NFC').toLowerCase();
    const now = new Date();
    await this.rateLimits.assertPasswordResetRequestAllowed(
      email,
      metadata.ipAddress,
      now,
    );
    const candidate = await this.dataSource.getRepository(User).findOne({
      where: { emailNormalized: email },
    });
    if (!candidate || !RESETTABLE_STATUSES.includes(candidate.accountStatus)) {
      // Equal cryptographic work without retaining attacker-supplied plaintext.
      hashAuthMetadata('password-reset-nonexistent', email);
      return;
    }

    const generated = generatePasswordResetToken();
    const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TTL_MS);
    try {
      await this.dataSource.transaction(async (manager) => {
        const user = await manager.getRepository(User).findOne({
          where: { id: candidate.id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!user || !RESETTABLE_STATUSES.includes(user.accountStatus)) return;
        const repository = manager.getRepository(PasswordResetToken);
        await repository.update(
          { userId: user.id, usedAt: IsNull() },
          { usedAt: now },
        );
        await repository.save(
          repository.create({
            id: generated.id,
            userId: user.id,
            tokenHash: generated.hash,
            expiresAt,
            usedAt: null,
          }),
        );
        await this.emailOutbox.enqueuePasswordReset(
          manager,
          {
            userId: user.id,
            email: user.email,
            token: generated.raw,
            expiresAt,
          },
          now,
        );
      });
    } catch (error) {
      // A concurrent request may win the one-unused-token constraint. Both
      // callers retain the same enumeration-safe 202 contract.
      if (!this.isUniqueViolation(error)) throw error;
    }
    // Deliberately no immediate webhook call: both account-exists branches
    // return after local durable work, while the shared pump performs delivery.
  }

  async reset(
    rawToken: string,
    newPassword: string,
    metadata: AuthRequestMetadata = {},
  ): Promise<void> {
    assertFeatureEnabled('FEATURE_PASSWORD_RESET_ENABLED');
    const separator = rawToken.indexOf('.');
    const tokenId = separator > 0 ? rawToken.slice(0, separator) : 'invalid';
    await this.rateLimits.assertPasswordResetAllowed(
      tokenId,
      metadata.ipAddress,
    );
    const passwordHash = await hashPassword(newPassword);
    const suppliedHash = hashPasswordResetToken(rawToken);
    const now = new Date();

    // Validate a snapshot only after doing the same password work for valid and
    // invalid tokens. The transaction below still performs an atomic consume;
    // this read is never the source of truth for one-time use.
    const candidate = await this.dataSource
      .getRepository(PasswordResetToken)
      .findOne({ where: { id: tokenId } });
    if (
      !candidate ||
      candidate.usedAt !== null ||
      candidate.expiresAt.getTime() <= now.getTime() ||
      !this.equalHash(candidate.tokenHash, suppliedHash)
    ) {
      throw new BadRequestException({ code: 'PASSWORD_RESET_TOKEN_INVALID' });
    }

    const consumed = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(PasswordResetToken);
      const user = await manager.getRepository(User).findOne({
        where: { id: candidate.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user || !RESETTABLE_STATUSES.includes(user.accountStatus)) {
        return false;
      }

      const claimed = await repository.update(
        {
          id: candidate.id,
          tokenHash: suppliedHash,
          usedAt: IsNull(),
          expiresAt: MoreThan(now),
        },
        { usedAt: now },
      );
      if (claimed.affected !== 1) return false;
      user.passwordHash = passwordHash;
      user.passwordChangedAt = now;
      await repository.update(
        { userId: user.id, usedAt: IsNull() },
        { usedAt: now },
      );
      await manager.getRepository(User).save(user);

      const sessions = await manager.getRepository(AuthSession).find({
        where: { userId: user.id },
      });
      if (sessions.length > 0) {
        const sessionIds = sessions.map((session) => session.id);
        await manager.getRepository(AuthSession).update(
          { id: In(sessionIds) },
          { revokedAt: now, revokeReason: 'password_reset' },
        );
        await manager.getRepository(AuthRefreshToken).update(
          { sessionId: In(sessionIds), status: 'active' },
          { status: 'revoked', revokedAt: now },
        );
      }
      await this.emailOutbox.cancelPasswordReset(
        manager,
        user.id,
        'PASSWORD_RESET_CONSUMED',
      );
      return true;
    });

    if (!consumed) {
      throw new BadRequestException({ code: 'PASSWORD_RESET_TOKEN_INVALID' });
    }
  }

  cleanup(now = new Date()): Promise<unknown> {
    return this.dataSource.getRepository(PasswordResetToken).delete({
      expiresAt: LessThan(new Date(now.getTime() - 7 * 24 * 60 * 60_000)),
    });
  }

  private equalHash(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, 'hex');
    const rightBuffer = Buffer.from(right, 'hex');
    return (
      leftBuffer.length === rightBuffer.length &&
      leftBuffer.length > 0 &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
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
