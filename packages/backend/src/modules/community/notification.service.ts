import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, SelectQueryBuilder } from 'typeorm';

import {
  CommunityNotification,
  CommunityNotificationCategory,
} from '../../database/entities/community-notification.entity';
import { UserBlock } from '../../database/entities/user-block.entity';

const RETENTION_MS = 90 * 24 * 60 * 60 * 1_000;
const PAGE_SIZE = 30;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const NOTIFICATION_CATEGORIES: readonly CommunityNotificationCategory[] = [
  'security',
  'system',
  'reply',
  'friend',
  'feed',
  'invite',
  'farm',
  'battle',
];

export interface CreateNotificationInput {
  userId: string;
  actorUserId?: string | null;
  category: CommunityNotificationCategory;
  eventType: string;
  title: string;
  summary: string;
  resourceType?: string | null;
  resourceId?: string | null;
  resourcePath?: string | null;
  dedupeKey: string;
  availableAt?: Date;
  expiresAt?: Date | null;
}

export interface NotificationItemView {
  id: string;
  category: CommunityNotificationCategory;
  title: string;
  summary: string;
  createdAt: string;
  readAt: string | null;
  resourcePath: string | null;
}

@Injectable()
export class NotificationService {
  constructor(private readonly dataSource: DataSource) {}

  async create(
    manager: EntityManager,
    input: CreateNotificationInput,
  ): Promise<CommunityNotification> {
    const repo = manager.getRepository(CommunityNotification);
    const existing = await repo.findOne({
      where: { userId: input.userId, dedupeKey: input.dedupeKey },
    });
    if (existing) return existing;

    const availableAt = input.availableAt ?? new Date();
    const permanent = input.category === 'security' || input.category === 'system';
    return repo.save(
      repo.create({
        userId: input.userId,
        actorUserId: input.actorUserId ?? null,
        category: input.category,
        eventType: input.eventType,
        resourceType: input.resourceType ?? null,
        resourceId: input.resourceId ?? null,
        payload: {
          title: input.title.slice(0, 120),
          summary: input.summary.slice(0, 240),
          resourcePath: input.resourcePath ?? null,
        },
        dedupeKey: input.dedupeKey,
        readAt: null,
        availableAt,
        expiresAt:
          input.expiresAt === undefined
            ? permanent
              ? null
              : new Date(availableAt.getTime() + RETENTION_MS)
            : input.expiresAt,
      }),
    );
  }

  async list(
    userId: string,
    cursor?: string,
  ): Promise<{
    items: NotificationItemView[];
    unreadCount: number;
    nextCursor: string | null;
  }> {
    const now = new Date();
    const blocked = await this.blockedUserIds(userId);
    const cursorPosition = this.decodeCursor(cursor);
    const pageQuery = this.visibleQuery(userId, now, blocked);
    if (cursorPosition) {
      pageQuery.andWhere(
        '(notification.created_at < :cursorCreatedAt OR (notification.created_at = :cursorCreatedAt AND notification.id < :cursorId))',
        {
          cursorCreatedAt: cursorPosition.createdAt,
          cursorId: cursorPosition.id,
        },
      );
    }
    const rows = await pageQuery
      .orderBy('notification.created_at', 'DESC')
      .addOrderBy('notification.id', 'DESC')
      .take(PAGE_SIZE + 1)
      .getMany();
    const unreadCount = Math.min(
      100,
      await this.visibleQuery(userId, now, blocked)
        .andWhere('notification.read_at IS NULL')
        .getCount(),
    );
    const hasMore = rows.length > PAGE_SIZE;
    const page = rows.slice(0, PAGE_SIZE);
    return {
      items: page.map((row) => this.view(row)),
      unreadCount,
      nextCursor: hasMore && page.length > 0 ? this.cursor(page.at(-1)!) : null,
    };
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    const repo = this.dataSource.getRepository(CommunityNotification);
    const row = await repo.findOne({
      where: { id: notificationId, userId },
    });
    if (!row) throw new NotFoundException({ code: 'NOTIFICATION_NOT_FOUND' });
    if (row.readAt === null) {
      row.readAt = new Date();
      await repo.save(row);
    }
  }

  async markAllRead(
    userId: string,
    category?: CommunityNotificationCategory,
  ): Promise<void> {
    const query = this.dataSource
      .getRepository(CommunityNotification)
      .createQueryBuilder()
      .update(CommunityNotification)
      .set({ readAt: new Date() })
      .where('user_id = :userId', { userId })
      .andWhere('read_at IS NULL');
    if (category) query.andWhere('category = :category', { category });
    await query.execute();
  }

  async removeBetween(
    manager: EntityManager,
    firstUserId: string,
    secondUserId: string,
  ): Promise<void> {
    await manager
      .getRepository(CommunityNotification)
      .createQueryBuilder()
      .delete()
      .where(
        '(user_id = :first AND actor_user_id = :second) OR (user_id = :second AND actor_user_id = :first)',
        { first: firstUserId, second: secondUserId },
      )
      .execute();
  }

  async removeByDedupeKey(
    manager: EntityManager,
    userId: string,
    dedupeKey: string,
  ): Promise<void> {
    await manager.getRepository(CommunityNotification).delete({
      userId,
      dedupeKey,
    });
  }

  assertCategory(value: unknown): CommunityNotificationCategory {
    if (
      typeof value !== 'string' ||
      !NOTIFICATION_CATEGORIES.includes(value as CommunityNotificationCategory)
    ) {
      throw new BadRequestException('category 不受支持');
    }
    return value as CommunityNotificationCategory;
  }

  private async blockedUserIds(userId: string): Promise<Set<string>> {
    const rows = await this.dataSource.getRepository(UserBlock).find({
      where: [{ blockerId: userId }, { blockedId: userId }],
    });
    return new Set(
      rows.map((row) =>
        row.blockerId === userId ? row.blockedId : row.blockerId,
      ),
    );
  }

  private visibleQuery(
    userId: string,
    now: Date,
    blocked: ReadonlySet<string>,
  ): SelectQueryBuilder<CommunityNotification> {
    const query = this.dataSource
      .getRepository(CommunityNotification)
      .createQueryBuilder('notification')
      .where('notification.user_id = :userId', { userId })
      .andWhere('notification.available_at <= :now', { now })
      .andWhere(
        '(notification.expires_at IS NULL OR notification.expires_at > :now)',
        { now },
      );
    if (blocked.size > 0) {
      query.andWhere(
        '(notification.actor_user_id IS NULL OR notification.actor_user_id NOT IN (:...blocked))',
        { blocked: [...blocked] },
      );
    }
    return query;
  }

  private decodeCursor(
    raw: string | undefined,
  ): { id: string; createdAt: Date } | null {
    if (!raw) return null;
    try {
      const decoded = JSON.parse(
        Buffer.from(raw, 'base64url').toString('utf8'),
      ) as { id?: unknown; createdAt?: unknown };
      if (
        typeof decoded.id !== 'string' ||
        !UUID_PATTERN.test(decoded.id) ||
        typeof decoded.createdAt !== 'string'
      ) {
        throw new Error('invalid cursor');
      }
      const createdAt = new Date(decoded.createdAt);
      if (
        Number.isNaN(createdAt.getTime()) ||
        createdAt.toISOString() !== decoded.createdAt
      ) {
        throw new Error('invalid cursor');
      }
      return { id: decoded.id, createdAt };
    } catch {
      throw new BadRequestException({ code: 'INVALID_CURSOR' });
    }
  }

  private cursor(row: CommunityNotification): string {
    return Buffer.from(
      JSON.stringify({ id: row.id, createdAt: row.createdAt.toISOString() }),
    ).toString('base64url');
  }

  private view(row: CommunityNotification): NotificationItemView {
    const title =
      typeof row.payload.title === 'string' ? row.payload.title : '站内通知';
    const summary =
      typeof row.payload.summary === 'string' ? row.payload.summary : '';
    const resourcePath =
      typeof row.payload.resourcePath === 'string'
        ? row.payload.resourcePath
        : null;
    return {
      id: row.id,
      category: row.category,
      title,
      summary,
      createdAt: row.createdAt.toISOString(),
      readAt: row.readAt?.toISOString() ?? null,
      resourcePath,
    };
  }
}
