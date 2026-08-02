import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { DataSource } from 'typeorm';

import { ActivityEvent } from '../../database/entities/activity-event.entity';
import { Document } from '../../database/entities/document.entity';
import { OutboxEvent } from '../../database/entities/outbox-event.entity';
import { PlayerProgression } from '../../database/entities/player-progression.entity';
import { ReadingDailyUsage } from '../../database/entities/reading-daily-usage.entity';
import { ReadingSession } from '../../database/entities/reading-session.entity';
import { RewardGrant } from '../../database/entities/reward-grant.entity';
import { UserTaskProgress } from '../../database/entities/user-task-progress.entity';
import { User } from '../../database/entities/user.entity';
import { createLocalDevDataSource } from '../../database/local-dev-datasource';
import { ActivityProjectorService } from '../engagement/activity-projector.service';
import { OutboxProcessorService, OutboxService } from '../outbox';
import {
  PlatformAssetsService,
  type PlatformClock,
} from '../platform';
import type { TasksClock } from '../tasks/tasks.constants';
import { TasksService } from '../tasks/tasks.service';
import type { ReadingSessionClock } from './reading-session.constants';
import { ReadingSessionsService } from './reading-sessions.service';

class MutableClock
  implements ReadingSessionClock, PlatformClock, TasksClock
{
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current);
  }

  advance(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1_000);
  }
}

describe('ReadingSessionsService integration', () => {
  let dataSource: DataSource;
  let clock: MutableClock;
  let sessions: ReadingSessionsService;
  let outboxProcessor: OutboxProcessorService;
  let tasks: TasksService;
  let userId: string;
  let otherUserId: string;
  let documentId: string;

  beforeEach(async () => {
    dataSource = await createLocalDevDataSource();
    clock = new MutableClock(new Date('2026-07-26T02:00:00.000Z'));
    const outbox = new OutboxService();
    sessions = new ReadingSessionsService(dataSource, outbox, clock);
    outboxProcessor = new OutboxProcessorService(
      dataSource,
      new ActivityProjectorService(),
    );
    tasks = new TasksService(
      dataSource,
      new PlatformAssetsService(clock),
      clock,
    );
    userId = await createUser(dataSource, 'reader-session@example.com');
    otherUserId = await createUser(dataSource, 'other-reader@example.com');
    documentId = await createDocument(dataSource, userId);
  });

  afterEach(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('turns 10 server-timed minutes into one activity, task and idempotent reward', async () => {
    const started = await sessions.start(userId, {
      documentId,
      clientSessionId: 'reader-session-0001',
    });
    expect(started).toMatchObject({
      status: 'active',
      state: 'active',
      effectiveSeconds: 0,
      qualified: false,
      eventQueued: false,
    });

    let heartbeat = started;
    for (let sequence = 1; sequence <= 30; sequence += 1) {
      clock.advance(20);
      heartbeat = await sessions.heartbeat(userId, started.sessionId, {
        state: 'active',
        sequence,
        chapterIdx: 0,
        charOffset: sequence * 100,
      });
    }
    expect(heartbeat).toMatchObject({
      effectiveSeconds: 600,
      dailyEffectiveSeconds: 600,
      qualified: true,
      eventQueued: true,
    });
    await expect(
      dataSource.getRepository(OutboxEvent).count({
        where: { userId, eventType: 'reading.session.completed' },
      }),
    ).resolves.toBe(1);

    clock.advance(20);
    const replay = await sessions.heartbeat(userId, started.sessionId, {
      state: 'active',
      sequence: 30,
    });
    expect(replay.effectiveSeconds).toBe(600);
    expect(replay.eventQueued).toBe(false);

    await expect(outboxProcessor.processBatch()).resolves.toBe(1);
    await expect(
      dataSource.getRepository(ActivityEvent).count({
        where: { userId, eventType: 'reading.session.completed' },
      }),
    ).resolves.toBe(1);
    const progress = await dataSource
      .getRepository(UserTaskProgress)
      .findOneByOrFail({
        userId,
        taskKey: 'daily_reading',
        localDate: '2026-07-26',
      });
    expect(progress.progress).toBe(1);
    expect(progress.completedAt).not.toBeNull();

    const firstClaim = await tasks.claimToday(userId, 'daily_reading');
    const replayedClaim = await tasks.claimToday(userId, 'daily_reading');
    expect(firstClaim.alreadyClaimed).toBe(false);
    expect(replayedClaim.alreadyClaimed).toBe(true);
    await expect(
      dataSource.getRepository(RewardGrant).count({
        where: { userId, sourceType: 'daily_task' },
      }),
    ).resolves.toBe(1);
    const progression = await dataSource
      .getRepository(PlayerProgression)
      .findOneByOrFail({ userId });
    expect(Number(progression.experience)).toBe(15);
  });

  it('pauses hidden time, caps stale gaps, closes idempotently and isolates users', async () => {
    const started = await sessions.start(userId, { documentId });
    clock.advance(20);
    const hidden = await sessions.heartbeat(userId, started.sessionId, {
      state: 'hidden',
      sequence: 1,
    });
    expect(hidden).toMatchObject({
      status: 'paused',
      state: 'hidden',
      effectiveSeconds: 20,
    });

    clock.advance(120);
    const resumed = await sessions.heartbeat(userId, started.sessionId, {
      state: 'active',
      sequence: 2,
    });
    expect(resumed.effectiveSeconds).toBe(20);
    clock.advance(20);
    const active = await sessions.heartbeat(userId, started.sessionId, {
      state: 'active',
      sequence: 3,
    });
    expect(active.effectiveSeconds).toBe(40);

    const ended = await sessions.end(userId, started.sessionId, {
      state: 'active',
      sequence: 4,
    });
    const endReplay = await sessions.end(userId, started.sessionId, {
      state: 'active',
      sequence: 4,
    });
    expect(ended.status).toBe('ended');
    expect(endReplay.status).toBe('ended');
    await expect(
      dataSource.getRepository(ReadingSession).count({ where: { userId } }),
    ).resolves.toBe(1);
    await expect(
      dataSource.getRepository(ReadingDailyUsage).findOneByOrFail({
        userId,
        localDate: '2026-07-26',
      }),
    ).resolves.toMatchObject({ effectiveSeconds: 40 });

    await expect(
      sessions.heartbeat(otherUserId, started.sessionId, {
        state: 'active',
        sequence: 5,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      sessions.start(otherUserId, { documentId }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

async function createUser(
  dataSource: DataSource,
  email: string,
): Promise<string> {
  const user = await dataSource.getRepository(User).save(
    dataSource.getRepository(User).create({
      email,
      passwordHash: 'not-used-in-this-test',
      displayName: email.split('@')[0],
    }),
  );
  return user.id;
}

async function createDocument(
  dataSource: DataSource,
  ownerId: string,
): Promise<string> {
  const document = await dataSource.getRepository(Document).save(
    dataSource.getRepository(Document).create({
      ownerId,
      title: '可信阅读测试文档',
      originalName: 'reading.txt',
      encoding: 'utf-8',
      charCount: '10000',
      chapterCount: 1,
      storageKey: 'tests/reading.txt',
      status: 'ready',
      deletedAt: null,
    }),
  );
  return document.id;
}
