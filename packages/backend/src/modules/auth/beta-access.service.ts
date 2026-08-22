import {
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EntityManager, IsNull, MoreThan } from 'typeorm';

import { BetaAccessCode } from '../../database/entities/beta-access-code.entity';
import { BetaAccessReservation } from '../../database/entities/beta-access-reservation.entity';
import { User } from '../../database/entities/user.entity';
import { hashBetaAccessCode } from './auth-crypto';

export const LOCAL_DEV_BETA_ACCESS_CODE = 'DEV-BETA-100';
const RESERVATION_TTL_MS = 30 * 60 * 1_000;

@Injectable()
export class BetaAccessService {
  async reserve(
    manager: EntityManager,
    user: User,
    submittedCode: string,
    now: Date,
  ): Promise<BetaAccessReservation> {
    const codeHash = hashBetaAccessCode(submittedCode);
    await this.ensureBootstrapCode(manager, codeHash);

    const code = await manager.getRepository(BetaAccessCode).findOne({
      where: { codeHash },
      lock: { mode: 'pessimistic_write' },
    });
    if (
      !code ||
      code.status !== 'active' ||
      (code.expiresAt !== null && code.expiresAt.getTime() <= now.getTime())
    ) {
      throw new ForbiddenException({ code: 'INVALID_BETA_ACCESS_CODE' });
    }

    const activeReservations = await manager
      .getRepository(BetaAccessReservation)
      .count({
        where: {
          codeId: code.id,
          redeemedAt: IsNull(),
          reservedUntil: MoreThan(now),
        },
      });
    if (code.usedCount + activeReservations >= code.maxUses) {
      throw new ConflictException({ code: 'BETA_ACCESS_CAPACITY_FULL' });
    }

    const repo = manager.getRepository(BetaAccessReservation);
    return repo.save(
      repo.create({
        codeId: code.id,
        userId: user.id,
        emailNormalized: user.emailNormalized,
        reservedUntil: new Date(now.getTime() + RESERVATION_TTL_MS),
        redeemedAt: null,
      }),
    );
  }

  async redeem(
    manager: EntityManager,
    userId: string,
    now: Date,
  ): Promise<void> {
    const reservationRepo = manager.getRepository(BetaAccessReservation);
    const reservation = await reservationRepo.findOne({
      where: { userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (
      !reservation ||
      reservation.redeemedAt !== null ||
      reservation.reservedUntil.getTime() <= now.getTime()
    ) {
      throw new ForbiddenException({ code: 'BETA_RESERVATION_EXPIRED' });
    }

    const codeRepo = manager.getRepository(BetaAccessCode);
    const code = await codeRepo.findOne({
      where: { id: reservation.codeId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!code || code.status === 'revoked' || code.usedCount >= code.maxUses) {
      throw new ForbiddenException({ code: 'INVALID_BETA_ACCESS_CODE' });
    }

    reservation.redeemedAt = now;
    code.usedCount += 1;
    if (code.usedCount >= code.maxUses) code.status = 'exhausted';
    await codeRepo.save(code);
    await reservationRepo.save(reservation);
  }

  /**
   * 幂等引导：本地默认开发码；生产只有显式 BETA_BOOTSTRAP_CODE 才可创建。
   * 数据库仅保存 SHA-256 摘要。
   */
  private async ensureBootstrapCode(
    manager: EntityManager,
    submittedHash: string,
  ): Promise<void> {
    const configured =
      process.env.BETA_BOOTSTRAP_CODE ??
      (process.env.LOCAL_DEV === 'true' ? LOCAL_DEV_BETA_ACCESS_CODE : null);
    if (!configured || hashBetaAccessCode(configured) !== submittedHash) return;

    if (
      process.env.NODE_ENV === 'production' &&
      [...configured].length < 16
    ) {
      throw new ServiceUnavailableException({
        code: 'BETA_BOOTSTRAP_CODE_TOO_SHORT',
      });
    }

    const maxUses = this.bootstrapUses();
    await manager
      .createQueryBuilder()
      .insert()
      .into(BetaAccessCode)
      .values({
        codeHash: submittedHash,
        purpose: 'beta_registration',
        maxUses,
        usedCount: 0,
        status: 'active',
        expiresAt: null,
      })
      .orIgnore()
      .execute();
  }

  private bootstrapUses(): number {
    const raw = process.env.BETA_BOOTSTRAP_USES ?? '100';
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 1 || value > 10_000) {
      throw new ServiceUnavailableException({
        code: 'BETA_BOOTSTRAP_USES_INVALID',
      });
    }
    return value;
  }
}
