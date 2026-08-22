import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { DeskPlant } from '../../database/entities/desk-plant.entity';
import {
  EncouragementType,
  FriendEncouragement,
} from '../../database/entities/friend-encouragement.entity';
import { Friendship } from '../../database/entities/friendship.entity';
import { PlayerProfile } from '../../database/entities/player-profile.entity';
import { User } from '../../database/entities/user.entity';
import { COMMUNITY_CLOCK, CommunityClock } from './community-clock';
import { toCommunityServiceDate } from './community-time';
import { requestHash } from './community-validation';
import { assertCommunityWritesEnabled } from './community-write-gate';
import { NotificationService } from './notification.service';
import { RelationshipPolicyService } from './relationship-policy.service';

const SEND_DAILY_LIMIT = 5;
const RECEIVE_DAILY_LIMIT = 10;
const PAGE_SIZE = 30;

@Injectable()
export class FeedService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly policy: RelationshipPolicyService,
    private readonly notifications: NotificationService,
    @Inject(COMMUNITY_CLOCK) private readonly clock: CommunityClock,
  ) {}

  async send(
    senderId: string,
    recipientPublicId: string,
    type: EncouragementType,
    idempotencyKey: string,
  ) {
    assertCommunityWritesEnabled();
    const hash = requestHash({ recipientPublicId, type });
    return this.dataSource.transaction(async (manager) => {
      const recipient = await this.policy.activeUserByPublicId(
        manager,
        recipientPublicId,
      );
      if (recipient.id === senderId) {
        throw new BadRequestException({ code: 'CANNOT_FEED_SELF' });
      }
      await this.policy.lockActiveUsers(manager, [senderId, recipient.id]);
      const repo = manager.getRepository(FriendEncouragement);
      const replay = await repo.findOne({
        where: { senderId, idempotencyKey },
        lock: { mode: 'pessimistic_write' },
      });
      if (replay) {
        if (replay.requestHash !== hash) {
          throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' });
        }
        return this.sendResult(manager, replay);
      }
      if (
        (await this.policy.isBlocked(manager, senderId, recipient.id)) ||
        !(await this.policy.isFriend(manager, senderId, recipient.id))
      ) {
        throw new ForbiddenException({ code: 'FEED_NOT_ALLOWED' });
      }

      const plant = await this.ensurePlant(manager, recipient.id);
      if (!plant.feedingEnabled) {
        throw new ForbiddenException({ code: 'FEED_DISABLED_BY_RECIPIENT' });
      }
      const serviceDate = toCommunityServiceDate(this.clock.now());
      if (
        await repo.exist({
          where: { senderId, recipientId: recipient.id, serviceDate },
        })
      ) {
        throw new ConflictException({ code: 'ALREADY_FED_TODAY' });
      }
      const [sentToday, receivedToday] = await Promise.all([
        repo.count({ where: { senderId, serviceDate } }),
        repo.count({ where: { recipientId: recipient.id, serviceDate } }),
      ]);
      if (sentToday >= SEND_DAILY_LIMIT) {
        throw new ConflictException({ code: 'FEED_SEND_DAILY_LIMIT' });
      }
      if (receivedToday >= RECEIVE_DAILY_LIMIT) {
        throw new ConflictException({ code: 'FEED_RECEIVE_DAILY_LIMIT' });
      }

      const event = await repo.save(
        repo.create({
          senderId,
          recipientId: recipient.id,
          serviceDate,
          type,
          idempotencyKey,
          requestHash: hash,
          animationEnabled: plant.feedAnimationEnabled,
        }),
      );
      const sender = await manager.getRepository(User).findOneByOrFail({
        id: senderId,
      });
      if (plant.feedNotificationsEnabled) {
        await this.notifications.create(manager, {
          userId: recipient.id,
          actorUserId: senderId,
          category: 'feed',
          eventType: 'feed.sent',
          title: '收到好友鼓励',
          summary: `${sender.displayName ?? '一位好友'}送来${this.typeLabel(type)}`,
          resourceType: 'feed',
          resourceId: event.id,
          resourcePath: '/feed',
          dedupeKey: `feed:${event.id}`,
        });
      }
      return this.sendResult(manager, event);
    });
  }

  async overview(userId: string, cursor?: string) {
    const serviceDate = toCommunityServiceDate(this.clock.now());
    const repo = this.dataSource.getRepository(FriendEncouragement);
    const all = await repo
      .createQueryBuilder('feed')
      .where('(feed.sender_id = :userId OR feed.recipient_id = :userId)', {
        userId,
      })
      .orderBy('feed.created_at', 'DESC')
      .addOrderBy('feed.id', 'DESC')
      .getMany();
    const visible: FriendEncouragement[] = [];
    for (const event of all) {
      const other = event.senderId === userId ? event.recipientId : event.senderId;
      if (!(await this.policy.isBlocked(this.dataSource.manager, userId, other))) {
        visible.push(event);
      }
    }
    const start = this.pageStart(visible, cursor);
    const page = visible.slice(start, start + PAGE_SIZE);
    const items = [];
    for (const event of page) {
      const sent = event.senderId === userId;
      items.push({
        id: event.id,
        direction: sent ? ('sent' as const) : ('received' as const),
        type: event.type,
        user: await this.summary(
          this.dataSource.manager,
          sent ? event.recipientId : event.senderId,
        ),
        createdAt: event.createdAt.toISOString(),
      });
    }
    const todays = all.filter((event) => event.serviceDate === serviceDate);
    return {
      sentToday: todays.filter((event) => event.senderId === userId).length,
      sendDailyLimit: SEND_DAILY_LIMIT,
      receivedToday: todays.filter((event) => event.recipientId === userId).length,
      receiveDailyLimit: RECEIVE_DAILY_LIMIT,
      eligibleFriends: await this.eligibleFriends(userId, serviceDate),
      items,
      nextCursor:
        start + PAGE_SIZE < visible.length && page.length > 0
          ? this.cursor(page.at(-1)!)
          : null,
    };
  }

  async setPreferences(
    userId: string,
    input: {
      feedingEnabled: boolean;
      feedAnimationEnabled: boolean;
      feedNotificationsEnabled: boolean;
    },
  ): Promise<void> {
    assertCommunityWritesEnabled();
    await this.dataSource.transaction(async (manager) => {
      await this.policy.lockActiveUsers(manager, [userId]);
      const plant = await this.ensurePlant(manager, userId);
      Object.assign(plant, input);
      await manager.getRepository(DeskPlant).save(plant);
    });
  }

  async pendingForPlant(userId: string): Promise<number> {
    const serviceDate = toCommunityServiceDate(this.clock.now());
    return this.dataSource.getRepository(FriendEncouragement).count({
      where: { recipientId: userId, serviceDate },
    });
  }

  assertType(value: unknown): EncouragementType {
    if (value !== 'coffee' && value !== 'cookie' && value !== 'cheer_note') {
      throw new BadRequestException('type 不受支持');
    }
    return value;
  }

  private async sendResult(
    manager: EntityManager,
    event: FriendEncouragement,
  ) {
    const sentToday = await manager.getRepository(FriendEncouragement).count({
      where: { senderId: event.senderId, serviceDate: event.serviceDate },
    });
    return {
      event: {
        id: event.id,
        direction: 'sent' as const,
        type: event.type,
        user: await this.summary(manager, event.recipientId),
        createdAt: event.createdAt.toISOString(),
      },
      sentToday,
      sendDailyLimit: SEND_DAILY_LIMIT,
    };
  }

  private async eligibleFriends(userId: string, serviceDate: string) {
    const friendships = await this.dataSource
      .getRepository(Friendship)
      .createQueryBuilder('friendship')
      .where('friendship.ended_at IS NULL')
      .andWhere(
        '(friendship.user_low_id = :userId OR friendship.user_high_id = :userId)',
        { userId },
      )
      .getMany();
    const result = [];
    for (const friendship of friendships) {
      const friendId =
        friendship.userLowId === userId
          ? friendship.userHighId
          : friendship.userLowId;
      if (await this.policy.isBlocked(this.dataSource.manager, userId, friendId)) {
        continue;
      }
      const plant = await this.dataSource.getRepository(DeskPlant).findOne({
        where: { userId: friendId },
      });
      if (plant && !plant.feedingEnabled) continue;
      const fedToday = await this.dataSource
        .getRepository(FriendEncouragement)
        .exist({ where: { senderId: userId, recipientId: friendId, serviceDate } });
      result.push({
        ...(await this.summary(this.dataSource.manager, friendId)),
        fedToday,
      });
    }
    return result;
  }

  private async ensurePlant(
    manager: EntityManager,
    userId: string,
  ): Promise<DeskPlant> {
    const repo = manager.getRepository(DeskPlant);
    const existing = await repo.findOne({ where: { userId } });
    if (existing) return existing;
    return repo.save(
      repo.create({
        userId,
        state: 'idle',
        appearanceKey: 'desk_sprout',
        plantExperience: 0,
        level: 1,
        streakDays: 0,
        lastStandardRewardServiceDate: null,
        firstHarvestedAt: null,
        feedingEnabled: true,
        feedAnimationEnabled: true,
        feedNotificationsEnabled: true,
      }),
    );
  }

  private async summary(manager: EntityManager, userId: string) {
    const user = await manager.getRepository(User).findOne({ where: { id: userId } });
    if (!user || user.accountStatus !== 'active') {
      throw new NotFoundException({ code: 'USER_NOT_FOUND' });
    }
    const profile = await manager.getRepository(PlayerProfile).findOne({
      where: { userId },
    });
    return {
      publicId: user.publicId,
      displayName: user.displayName ?? '办公室同事',
      avatarKey: profile?.avatarKey ?? 'violet',
      battleProfession: profile?.battleProfession ?? 'developer',
      bio: profile?.bio ?? null,
    };
  }

  private typeLabel(type: EncouragementType): string {
    return type === 'coffee'
      ? '一杯咖啡'
      : type === 'cookie'
        ? '一块小饼干'
        : '一张加油便签';
  }

  private pageStart(rows: FriendEncouragement[], cursor?: string): number {
    if (!cursor) return 0;
    try {
      const parsed = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      ) as { id?: unknown; createdAt?: unknown };
      const index = rows.findIndex(
        (row) =>
          row.id === parsed.id && row.createdAt.toISOString() === parsed.createdAt,
      );
      if (index < 0) throw new Error('invalid');
      return index + 1;
    } catch {
      throw new BadRequestException({ code: 'INVALID_CURSOR' });
    }
  }

  private cursor(row: FriendEncouragement): string {
    return Buffer.from(
      JSON.stringify({ id: row.id, createdAt: row.createdAt.toISOString() }),
    ).toString('base64url');
  }
}
