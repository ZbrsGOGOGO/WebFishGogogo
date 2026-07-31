import type { DataSource } from 'typeorm';

import { ActivityEvent } from '../../database/entities/activity-event.entity';
import { OutboxEvent } from '../../database/entities/outbox-event.entity';
import { OutboxReceipt } from '../../database/entities/outbox-receipt.entity';
import { UserTaskProgress } from '../../database/entities/user-task-progress.entity';
import { User } from '../../database/entities/user.entity';
import { createLocalDevDataSource } from '../../database/local-dev-datasource';
import { ActivityProjectorService } from '../engagement/activity-projector.service';
import { OutboxProcessorService } from './outbox-processor.service';
import { OutboxService } from './outbox.service';

describe('OutboxProcessorService integration', () => {
  let dataSource: DataSource;
  let processor: OutboxProcessorService;
  let outbox: OutboxService;
  let userId: string;

  beforeEach(async () => {
    dataSource = await createLocalDevDataSource();
    outbox = new OutboxService();
    processor = new OutboxProcessorService(
      dataSource,
      new ActivityProjectorService(),
    );

    const user = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        email: 'outbox-test@example.com',
        passwordHash: 'not-used-in-this-test',
        displayName: '可靠事件测试用户',
      }),
    );
    userId = user.id;
  });

  afterEach(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('projects a trusted event into activity and daily progress exactly once', async () => {
    await dataSource.transaction((manager) =>
      outbox.enqueue(manager, {
        userId,
        eventType: 'checkin.completed',
        aggregateType: 'checkin',
        aggregateId: '2026-07-25',
        idempotencyKey: `checkin:${userId}:2026-07-25`,
        availableAt: new Date('2026-07-25T02:00:00.000Z'),
        payload: {
          title: '完成今日签到',
          description: '领取了今日签到奖励',
          sourceType: 'checkin',
          sourceId: '2026-07-25',
          occurredAt: '2026-07-25T02:00:00.000Z',
        },
      }),
    );

    await expect(processor.processBatch()).resolves.toBe(1);

    const event = await dataSource.getRepository(OutboxEvent).findOneByOrFail({
      idempotencyKey: `checkin:${userId}:2026-07-25`,
    });
    expect(event.status).toBe('processed');
    expect(event.attempts).toBe(1);

    const activities = await dataSource.getRepository(ActivityEvent).find({
      where: { userId },
    });
    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({
      eventType: 'checkin.completed',
      title: '完成今日签到',
      localDate: '2026-07-25',
    });

    const progress = await dataSource
      .getRepository(UserTaskProgress)
      .findOneByOrFail({
        userId,
        taskKey: 'daily_checkin',
        localDate: '2026-07-25',
      });
    expect(progress.progress).toBe(1);
    expect(progress.completedAt?.toISOString()).toBe(
      '2026-07-25T02:00:00.000Z',
    );
    await expect(
      dataSource.getRepository(OutboxReceipt).count(),
    ).resolves.toBe(1);

    // 模拟消息在标记完成后被再次投递；消费回执必须阻止二次投影。
    event.status = 'pending';
    event.processedAt = null;
    event.availableAt = new Date('2026-07-25T02:00:00.000Z');
    await dataSource.getRepository(OutboxEvent).save(event);

    await expect(processor.processBatch()).resolves.toBe(1);
    await expect(
      dataSource.getRepository(ActivityEvent).count({ where: { userId } }),
    ).resolves.toBe(1);
    await expect(
      dataSource.getRepository(UserTaskProgress).count({
        where: { userId, taskKey: 'daily_checkin' },
      }),
    ).resolves.toBe(1);
    await expect(
      dataSource.getRepository(OutboxReceipt).count(),
    ).resolves.toBe(1);

    const replayed = await dataSource
      .getRepository(OutboxEvent)
      .findOneByOrFail({ id: event.id });
    expect(replayed.status).toBe('processed');
    expect(replayed.attempts).toBe(2);
  });

  it('can advance a task without adding a noisy recent-activity row', async () => {
    await dataSource.transaction((manager) =>
      outbox.enqueue(manager, {
        userId,
        eventType: 'reading.session.completed',
        aggregateType: 'reading_daily_usage',
        aggregateId: `${userId}:2026-07-25`,
        idempotencyKey: `reading:quiet:${userId}:2026-07-25`,
        availableAt: new Date('2026-07-25T02:00:00.000Z'),
        payload: {
          recordActivity: false,
          occurredAt: '2026-07-25T02:00:00.000Z',
        },
      }),
    );

    await expect(processor.processBatch()).resolves.toBe(1);
    await expect(
      dataSource.getRepository(ActivityEvent).count({ where: { userId } }),
    ).resolves.toBe(0);
    await expect(
      dataSource.getRepository(UserTaskProgress).findOneByOrFail({
        userId,
        taskKey: 'daily_reading',
        localDate: '2026-07-25',
      }),
    ).resolves.toMatchObject({
      progress: 1,
    });
  });
});
