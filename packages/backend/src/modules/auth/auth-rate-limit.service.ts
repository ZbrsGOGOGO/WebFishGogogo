import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource, LessThan } from 'typeorm';

import { AuthRateLimitBucket } from '../../database/entities/auth-rate-limit-bucket.entity';
import { hashAuthRateLimitKey } from './auth-crypto';
import { AuthRateLimitException } from './auth-rate-limit.exception';

const CLEANUP_INTERVAL_MS = 10 * 60 * 1_000;
const EXPIRY_RETENTION_MS = 60 * 60 * 1_000;

export interface AuthRateLimitAttempt {
  scope: string;
  dimension: string;
  limit: number;
  windowMs: number;
  blockMs?: number;
}

interface RateLimitDecision {
  allowed: boolean;
  retryAfter: number;
}

/**
 * Fixed-window auth limiter backed by PostgreSQL row locks. It is deliberately
 * independent of process memory so horizontally scaled API replicas share the
 * same counters.
 */
@Injectable()
export class AuthRateLimitService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(AuthRateLimitService.name);
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(private readonly dataSource: DataSource) {}

  onApplicationBootstrap(): void {
    this.cleanupTimer = setInterval(() => {
      void this.cleanupExpired();
    }, CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
  }

  assertRegisterAllowed(
    emailNormalized: string,
    ipAddress: string | null | undefined,
    now = new Date(),
  ): Promise<void> {
    return this.consume(
      [
        this.attempt('register:ip', this.ip(ipAddress), 20, 60 * 60_000),
        this.attempt('register:email', emailNormalized, 5, 60 * 60_000),
      ],
      now,
    );
  }

  assertResendAllowed(
    registrationId: string,
    ipAddress: string | null | undefined,
    now = new Date(),
  ): Promise<void> {
    return this.consume(
      [
        this.attempt('resend:ip', this.ip(ipAddress), 30, 60 * 60_000),
        this.attempt('resend:registration', registrationId, 6, 60 * 60_000),
      ],
      now,
    );
  }

  assertVerificationAllowed(
    registrationId: string,
    ipAddress: string | null | undefined,
    now = new Date(),
  ): Promise<void> {
    return this.consume(
      [
        this.attempt('verify:ip', this.ip(ipAddress), 100, 15 * 60_000),
        this.attempt('verify:registration', registrationId, 20, 15 * 60_000),
      ],
      now,
    );
  }

  assertLoginAllowed(
    emailNormalized: string,
    ipAddress: string | null | undefined,
    now = new Date(),
  ): Promise<void> {
    return this.consume(
      [
        this.attempt('login:ip', this.ip(ipAddress), 120, 15 * 60_000),
        this.attempt('login:email', emailNormalized, 10, 15 * 60_000),
      ],
      now,
    );
  }

  assertRefreshAllowed(
    ipAddress: string | null | undefined,
    now = new Date(),
  ): Promise<void> {
    return this.consume(
      [this.attempt('refresh:ip', this.ip(ipAddress), 600, 15 * 60_000)],
      now,
    );
  }

  assertPasswordResetRequestAllowed(
    emailNormalized: string,
    ipAddress: string | null | undefined,
    now = new Date(),
  ): Promise<void> {
    return this.consume(
      [
        this.attempt('password-reset-request:ip', this.ip(ipAddress), 20, 60 * 60_000),
        this.attempt('password-reset-request:email', emailNormalized, 5, 60 * 60_000),
      ],
      now,
    );
  }

  assertPasswordResetAllowed(
    tokenId: string,
    ipAddress: string | null | undefined,
    now = new Date(),
  ): Promise<void> {
    return this.consume(
      [
        this.attempt('password-reset:ip', this.ip(ipAddress), 30, 60 * 60_000),
        this.attempt('password-reset:token', tokenId, 10, 60 * 60_000),
      ],
      now,
    );
  }

  assertPasswordChangeAllowed(
    userId: string,
    ipAddress: string | null | undefined,
    now = new Date(),
  ): Promise<void> {
    return this.consume(
      [
        this.attempt('password-change:ip', this.ip(ipAddress), 30, 15 * 60_000),
        this.attempt('password-change:user', userId, 5, 15 * 60_000),
      ],
      now,
    );
  }

  assertSocialVerificationSessionAllowed(
    userId: string,
    ipAddress: string | null | undefined,
    now = new Date(),
  ): Promise<void> {
    return this.consume(
      [
        this.attempt('social-verification:ip', this.ip(ipAddress), 20, 60 * 60_000),
        this.attempt('social-verification:user', userId, 5, 60 * 60_000),
      ],
      now,
    );
  }

  assertSocialVerificationCallbackAllowed(
    ipAddress: string | null | undefined,
    now = new Date(),
  ): Promise<void> {
    return this.consume(
      [
        this.attempt('social-callback:ip', this.ip(ipAddress), 300, 15 * 60_000),
      ],
      now,
    );
  }

  /** Public for deterministic policy tests; callers must pass normalized values. */
  async consume(
    attempts: readonly AuthRateLimitAttempt[],
    now = new Date(),
  ): Promise<void> {
    if (attempts.length === 0) return;
    const normalized = this.normalizeAttempts(attempts);
    let decision: RateLimitDecision;
    try {
      decision = await this.dataSource.transaction(async (manager) => {
        const repository = manager.getRepository(AuthRateLimitBucket);
        let retryAfter = 0;

        for (const attempt of normalized) {
          const windowEndsAt = new Date(now.getTime() + attempt.windowMs);
          const keyHash = hashAuthRateLimitKey(
            attempt.scope,
            attempt.dimension,
          );
          await manager
            .createQueryBuilder()
            .insert()
            .into(AuthRateLimitBucket)
            .values({
              keyHash,
              scope: attempt.scope,
              count: 0,
              windowStartedAt: now,
              windowEndsAt,
              blockedUntil: null,
              expiresAt: new Date(
                windowEndsAt.getTime() + EXPIRY_RETENTION_MS,
              ),
              updatedAt: now,
            })
            .orIgnore()
            .execute();

          const bucket = await repository.findOne({
            where: { keyHash },
            lock: { mode: 'pessimistic_write' },
          });
          if (!bucket) throw new Error('rate limit bucket was not created');

          if (bucket.windowEndsAt.getTime() <= now.getTime()) {
            bucket.count = 0;
            bucket.windowStartedAt = now;
            bucket.windowEndsAt = windowEndsAt;
            bucket.blockedUntil = null;
          }

          if (
            bucket.blockedUntil !== null &&
            bucket.blockedUntil.getTime() > now.getTime()
          ) {
            retryAfter = Math.max(
              retryAfter,
              this.retrySeconds(bucket.blockedUntil, now),
            );
          } else {
            bucket.count += 1;
            if (bucket.count > attempt.limit) {
              bucket.blockedUntil = new Date(
                Math.max(
                  bucket.windowEndsAt.getTime(),
                  now.getTime() + (attempt.blockMs ?? attempt.windowMs),
                ),
              );
              retryAfter = Math.max(
                retryAfter,
                this.retrySeconds(bucket.blockedUntil, now),
              );
            }
          }

          const retentionBase = Math.max(
            bucket.windowEndsAt.getTime(),
            bucket.blockedUntil?.getTime() ?? 0,
          );
          bucket.expiresAt = new Date(retentionBase + EXPIRY_RETENTION_MS);
          bucket.updatedAt = now;
          await repository.save(bucket);
        }

        return { allowed: retryAfter === 0, retryAfter };
      });
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException({
        code: 'AUTH_RATE_LIMIT_UNAVAILABLE',
      });
    }

    if (!decision.allowed) {
      throw new AuthRateLimitException(decision.retryAfter);
    }
  }

  private attempt(
    scope: string,
    dimension: string,
    limit: number,
    windowMs: number,
  ): AuthRateLimitAttempt {
    return { scope, dimension, limit, windowMs };
  }

  private ip(value: string | null | undefined): string {
    return value?.trim() || 'unknown';
  }

  private normalizeAttempts(
    attempts: readonly AuthRateLimitAttempt[],
  ): AuthRateLimitAttempt[] {
    const unique = new Map<string, AuthRateLimitAttempt>();
    for (const attempt of attempts) {
      if (
        !/^[a-z][a-z0-9:-]{0,63}$/.test(attempt.scope) ||
        attempt.dimension.length === 0 ||
        !Number.isSafeInteger(attempt.limit) ||
        attempt.limit < 1 ||
        !Number.isSafeInteger(attempt.windowMs) ||
        attempt.windowMs < 1_000
      ) {
        throw new ServiceUnavailableException({
          code: 'AUTH_RATE_LIMIT_POLICY_INVALID',
        });
      }
      const key = hashAuthRateLimitKey(attempt.scope, attempt.dimension);
      unique.set(key, attempt);
    }
    return [...unique.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, attempt]) => attempt);
  }

  private retrySeconds(until: Date, now: Date): number {
    return Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 1_000));
  }

  private async cleanupExpired(): Promise<void> {
    try {
      await this.dataSource
        .getRepository(AuthRateLimitBucket)
        .delete({ expiresAt: LessThan(new Date()) });
    } catch {
      this.logger.error('Auth rate-limit cleanup failed');
    }
  }
}
