import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { ActivityEvent } from '../../database/entities/activity-event.entity';
import { OutboxEvent } from '../../database/entities/outbox-event.entity';
import { TaskDefinition } from '../../database/entities/task-definition.entity';
import { UserTaskProgress } from '../../database/entities/user-task-progress.entity';
import { PLATFORM_TIME_ZONE } from '../platform/platform.constants';
import { toBusinessLocalDate } from '../platform/platform-time';

interface ActivityOutboxPayload {
  title?: unknown;
  description?: unknown;
  sourceType?: unknown;
  sourceId?: unknown;
  occurredAt?: unknown;
  metadata?: unknown;
  increment?: unknown;
  recordActivity?: unknown;
}

/**
 * Outbox 的首个可信投影器。
 *
 * 领域事件会推进当天匹配的任务；除非 payload.recordActivity=false，
 * 同时生成一条活动记录。ActivityEvent 或 OutboxReceipt 提供消费幂等，
 * Worker 重启、超时或重复投递都不会重复增加任务进度。
 */
@Injectable()
export class ActivityProjectorService {
  async project(
    manager: EntityManager,
    outboxEvent: OutboxEvent,
  ): Promise<void> {
    const payload = this.payload(outboxEvent.payload);
    const occurredAt = this.date(payload.occurredAt, outboxEvent.createdAt);
    const localDate = toBusinessLocalDate(occurredAt);
    if (payload.recordActivity !== false) {
      const activityRepo = manager.getRepository(ActivityEvent);
      const existing = await activityRepo.findOne({
        where: { idempotencyKey: outboxEvent.idempotencyKey },
        lock: { mode: 'pessimistic_write' },
      });
      if (existing) return;

      const sourceType = this.optionalText(payload.sourceType, 50);
      const sourceId = this.optionalText(payload.sourceId, 100);
      await activityRepo.save(
        activityRepo.create({
          userId: outboxEvent.userId,
          eventType: outboxEvent.eventType,
          title:
            this.optionalText(payload.title, 120) ??
            this.defaultTitle(outboxEvent.eventType),
          description: this.optionalText(payload.description, 300),
          sourceType,
          sourceId,
          metadata: this.metadata(payload.metadata),
          localDate,
          occurredAt,
          idempotencyKey: outboxEvent.idempotencyKey,
        }),
      );
    }

    const definitions = await manager.getRepository(TaskDefinition).find({
      where: { eventType: outboxEvent.eventType, enabled: true },
      order: { displayOrder: 'ASC' },
    });
    if (definitions.length === 0) return;

    const increment = this.increment(payload.increment);
    const progressRepo = manager.getRepository(UserTaskProgress);
    for (const definition of definitions) {
      let progress = await progressRepo.findOne({
        where: {
          userId: outboxEvent.userId,
          taskKey: definition.key,
          localDate,
        },
        lock: { mode: 'pessimistic_write' },
      });

      if (!progress) {
        progress = progressRepo.create({
          userId: outboxEvent.userId,
          taskKey: definition.key,
          localDate,
          timezone: PLATFORM_TIME_ZONE,
          progress: 0,
          completedAt: null,
          claimedAt: null,
          rewardGrantId: null,
        });
      }

      const nextProgress = Math.min(
        definition.targetCount,
        progress.progress + increment,
      );
      progress.progress = nextProgress;
      if (
        progress.completedAt == null &&
        nextProgress >= definition.targetCount
      ) {
        progress.completedAt = occurredAt;
      }
      await progressRepo.save(progress);
    }
  }

  private payload(value: unknown): ActivityOutboxPayload {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as ActivityOutboxPayload;
  }

  private metadata(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
  }

  private optionalText(value: unknown, maxLength: number): string | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    if (!normalized) return null;
    return normalized.slice(0, maxLength);
  }

  private date(value: unknown, fallback: Date): Date {
    if (typeof value !== 'string') return fallback;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? fallback : parsed;
  }

  private increment(value: unknown): number {
    return Number.isSafeInteger(value) && Number(value) > 0
      ? Number(value)
      : 1;
  }

  private defaultTitle(eventType: string): string {
    const titles: Record<string, string> = {
      'checkin.completed': '完成今日签到',
      'farm.crop.planted': '种下一株作物',
      'farm.crop.harvested': '收获成熟作物',
      'arena.battle.completed': '完成午休斗技场',
      'reading.session.completed': '完成今日专注阅读',
    };
    return titles[eventType] ?? '完成一项站内活动';
  }
}
