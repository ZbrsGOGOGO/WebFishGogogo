import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager, IsNull } from 'typeorm';

import { Friendship } from '../../database/entities/friendship.entity';
import { UserBlock } from '../../database/entities/user-block.entity';
import { User } from '../../database/entities/user.entity';

@Injectable()
export class RelationshipPolicyService {
  assertProactiveSocialWriteAllowed(user: User): void {
    if (
      process.env.FEATURE_SOCIAL_VERIFICATION_ENABLED === 'true' &&
      user.socialVerificationStatus !== 'verified'
    ) {
      throw new ForbiddenException({ code: 'SOCIAL_VERIFICATION_REQUIRED' });
    }
  }

  pair(left: string, right: string): [string, string] {
    return left < right ? [left, right] : [right, left];
  }

  async lockActiveUsers(
    manager: EntityManager,
    userIds: readonly string[],
  ): Promise<Map<string, User>> {
    const users = new Map<string, User>();
    for (const id of [...new Set(userIds)].sort()) {
      const user = await manager.getRepository(User).findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user || user.accountStatus !== 'active') {
        throw new NotFoundException({ code: 'USER_NOT_FOUND' });
      }
      users.set(id, user);
    }
    return users;
  }

  async activeUserByPublicId(
    manager: EntityManager,
    value: string,
  ): Promise<User> {
    const user = await manager.getRepository(User).findOne({
      where: { publicId: value },
    });
    if (!user || user.accountStatus !== 'active') {
      throw new NotFoundException({ code: 'USER_NOT_FOUND' });
    }
    return user;
  }

  async isBlocked(
    manager: EntityManager,
    left: string,
    right: string,
  ): Promise<boolean> {
    return manager.getRepository(UserBlock).exist({
      where: [
        { blockerId: left, blockedId: right },
        { blockerId: right, blockedId: left },
      ],
    });
  }

  async isFriend(
    manager: EntityManager,
    left: string,
    right: string,
  ): Promise<boolean> {
    const [userLowId, userHighId] = this.pair(left, right);
    return manager.getRepository(Friendship).exist({
      where: { userLowId, userHighId, endedAt: IsNull() },
    });
  }
}
