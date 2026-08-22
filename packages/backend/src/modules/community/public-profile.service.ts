import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';

import { ActivityEvent } from '../../database/entities/activity-event.entity';
import { DeskPlantCycle } from '../../database/entities/desk-plant-cycle.entity';
import { DeskPlant } from '../../database/entities/desk-plant.entity';
import { FriendRequest } from '../../database/entities/friend-request.entity';
import { Friendship } from '../../database/entities/friendship.entity';
import {
  CommunityPrivacyLevel,
  DEFAULT_COMMUNITY_PRIVACY,
  PlayerProfile,
} from '../../database/entities/player-profile.entity';
import { PlayerProgression } from '../../database/entities/player-progression.entity';
import { User } from '../../database/entities/user.entity';
import { RelationshipPolicyService } from './relationship-policy.service';

@Injectable()
export class PublicProfileService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly policy: RelationshipPolicyService,
  ) {}

  async get(publicId: string, viewerId: string | null) {
    const manager = this.dataSource.manager;
    const user = await manager.getRepository(User).findOne({
      where: { publicId, accountStatus: 'active' },
    });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND' });
    const self = viewerId === user.id;
    if (viewerId && !self && (await this.policy.isBlocked(manager, viewerId, user.id))) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND' });
    }
    const friend =
      viewerId !== null && !self
        ? await this.policy.isFriend(manager, viewerId, user.id)
        : false;
    const profile = await manager.getRepository(PlayerProfile).findOne({
      where: { userId: user.id },
    });
    const privacy = {
      ...DEFAULT_COMMUNITY_PRIVACY,
      ...profile?.privacySettings,
    };
    const pending = viewerId && !self && !friend
      ? await manager.getRepository(FriendRequest).findOne({
          where: {
            userLowId: this.policy.pair(viewerId, user.id)[0],
            userHighId: this.policy.pair(viewerId, user.id)[1],
            status: 'pending',
          },
        })
      : null;

    const result: Record<string, unknown> = {
      publicId: user.publicId,
      displayName: user.displayName ?? '办公室同事',
      avatarKey: profile?.avatarKey ?? 'violet',
      battleProfession: profile?.battleProfession ?? 'developer',
      bio: profile?.bio ?? null,
      ipRegion: null,
      relationship: {
        status: self
          ? 'self'
          : friend
            ? 'friend'
            : pending?.requesterId === viewerId
              ? 'outgoing_pending'
              : pending
                ? 'incoming_pending'
                : 'none',
        requestId: pending?.id ?? null,
        canRequest: Boolean(viewerId && !self && !friend && !pending),
        canFeed: friend,
        canEncouragePlant: friend,
        canBlock: Boolean(viewerId && !self),
      },
    };

    if (this.canView(privacy.battleRecord, self, friend)) {
      const progression = await manager.getRepository(PlayerProgression).findOne({
        where: { userId: user.id },
      });
      result.battleLevel = progression?.level ?? 1;
    }
    if (this.canView(privacy.equipment, self, friend)) result.equipment = [];
    if (this.canView(privacy.honors, self, friend)) result.honors = [];
    if (this.canView(privacy.friendCount, self, friend)) {
      result.friendCount = await manager
        .getRepository(Friendship)
        .createQueryBuilder('friendship')
        .where('friendship.ended_at IS NULL')
        .andWhere(
          '(friendship.user_low_id = :userId OR friendship.user_high_id = :userId)',
          { userId: user.id },
        )
        .getCount();
    }
    if (this.canView(privacy.plant, self, friend)) {
      result.plant = await this.plantView(user.id);
    }
    if (this.canView(privacy.recentActivity, self, friend)) {
      const activities = await manager.getRepository(ActivityEvent).find({
        where: { userId: user.id },
        order: { occurredAt: 'DESC' },
        take: 5,
      });
      result.recentActivity = activities.map((activity) => ({
        id: activity.id,
        summary: activity.title,
        createdAt: activity.occurredAt.toISOString(),
      }));
    }
    return result;
  }

  private canView(
    level: CommunityPrivacyLevel,
    self: boolean,
    friend: boolean,
  ): boolean {
    return self || level === 'everyone' || (level === 'friends' && friend);
  }

  private async plantView(userId: string) {
    const plant = await this.dataSource.getRepository(DeskPlant).findOne({
      where: { userId },
    });
    if (!plant) return null;
    const cycle = await this.dataSource.getRepository(DeskPlantCycle).findOne({
      where: { userId, harvestedAt: IsNull() },
    });
    return {
      name: '工位新芽',
      appearanceKey: plant.appearanceKey,
      careStreak: plant.streakDays,
      state:
        cycle && cycle.maturesAt.getTime() <= Date.now()
          ? 'ready'
          : plant.state,
    };
  }
}
