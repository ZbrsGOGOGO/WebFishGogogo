import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EntityManager, In, IsNull, MoreThan } from 'typeorm';

import { BetaAccessReservation } from '../../database/entities/beta-access-reservation.entity';
import { CommunityCapacityGuard } from '../../database/entities/community-capacity-guard.entity';
import { User } from '../../database/entities/user.entity';

const CAPACITY_SCOPE: CommunityCapacityGuard['scope'] = 'active-users';
const LOCAL_DEV_MAX_ACTIVE_USERS = 100;

/**
 * Global account-capacity gate. Every allocation locks one singleton row before
 * counting active accounts and live pending reservations, preventing oversell
 * across access codes and API replicas.
 */
@Injectable()
export class CommunityCapacityService {
  async assertReservationAvailable(
    manager: EntityManager,
    now: Date,
  ): Promise<void> {
    const { allocated, limit } = await this.lockAndCount(manager, now);
    if (allocated >= limit) this.capacityReached(limit);
  }

  async assertActivationAllowed(
    manager: EntityManager,
    now: Date,
  ): Promise<void> {
    const { allocated, limit } = await this.lockAndCount(manager, now);
    // Activation converts an already-counted reservation into an active user.
    if (allocated > limit) this.capacityReached(limit);
  }

  maxActiveUsers(): number {
    const configured = process.env.COMMUNITY_MAX_ACTIVE_USERS;
    if (!configured && process.env.LOCAL_DEV === 'true') {
      return LOCAL_DEV_MAX_ACTIVE_USERS;
    }
    const parsed = Number(configured);
    if (
      !configured ||
      !Number.isSafeInteger(parsed) ||
      parsed < 1 ||
      parsed > 1_000_000
    ) {
      throw new ServiceUnavailableException({
        code: 'COMMUNITY_CAPACITY_NOT_CONFIGURED',
      });
    }
    return parsed;
  }

  private async lockAndCount(
    manager: EntityManager,
    now: Date,
  ): Promise<{ allocated: number; limit: number }> {
    const limit = this.maxActiveUsers();
    await manager
      .createQueryBuilder()
      .insert()
      .into(CommunityCapacityGuard)
      .values({ scope: CAPACITY_SCOPE, updatedAt: now })
      .orIgnore()
      .execute();
    const guardRepository = manager.getRepository(CommunityCapacityGuard);
    const guard = await guardRepository.findOne({
      where: { scope: CAPACITY_SCOPE },
      lock: { mode: 'pessimistic_write' },
    });
    if (!guard) {
      throw new ServiceUnavailableException({
        code: 'COMMUNITY_CAPACITY_UNAVAILABLE',
      });
    }

    const activeAccounts = await manager.getRepository(User).count({
      where: {
        accountStatus: In(['active', 'suspended', 'banned', 'deleting']),
      },
    });
    const liveReservations = await manager
      .getRepository(BetaAccessReservation)
      .count({
        where: {
          redeemedAt: IsNull(),
          reservedUntil: MoreThan(now),
        },
      });
    guard.updatedAt = now;
    await guardRepository.save(guard);
    return { allocated: activeAccounts + liveReservations, limit };
  }

  private capacityReached(limit: number): never {
    throw new ConflictException({ code: 'CAPACITY_REACHED', limit });
  }
}
