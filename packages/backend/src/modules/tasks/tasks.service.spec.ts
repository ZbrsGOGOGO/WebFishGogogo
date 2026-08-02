import { ConflictException } from '@nestjs/common';
import type { DataSource } from 'typeorm';

import { PlayerProgression } from '../../database/entities/player-progression.entity';
import { RewardGrant } from '../../database/entities/reward-grant.entity';
import { UserTaskProgress } from '../../database/entities/user-task-progress.entity';
import { User } from '../../database/entities/user.entity';
import { createLocalDevDataSource } from '../../database/local-dev-datasource';
import {
  PlatformAssetsService,
  type PlatformClock,
} from '../platform';
import type { TasksClock } from './tasks.constants';
import { TasksService } from './tasks.service';

class FixedClock implements PlatformClock, TasksClock {
  constructor(private readonly current: Date) {}

  now(): Date {
    return new Date(this.current);
  }
}

describe('TasksService integration', () => {
  let dataSource: DataSource;
  let service: TasksService;
  let userId: string;
  let otherUserId: string;

  beforeEach(async () => {
    dataSource = await createLocalDevDataSource();
    const clock = new FixedClock(new Date('2026-07-25T02:00:00.000Z'));
    service = new TasksService(
      dataSource,
      new PlatformAssetsService(clock),
      clock,
    );
    userId = await createUser(dataSource, 'tasks@example.com');
    otherUserId = await createUser(dataSource, 'other-tasks@example.com');
  });

  afterEach(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('hides the locked arena task and reports server-derived daily state', async () => {
    const today = await service.getToday(userId);

    expect(today.localDate).toBe('2026-07-25');
    expect(today.tasks.map((task) => task.key)).toEqual([
      'daily_checkin',
      'daily_reading',
      'daily_harvest',
    ]);
    expect(today.summary).toEqual({
      completedCount: 0,
      totalCount: 3,
      claimableCount: 0,
    });

    await dataSource.getRepository(PlayerProgression).save(
      dataSource.getRepository(PlayerProgression).create({
        userId,
        level: 3,
        experience: '300',
      }),
    );
    const unlocked = await service.getToday(userId);
    expect(unlocked.tasks.map((task) => task.key)).toContain('daily_arena');
    expect(unlocked.summary.totalCount).toBe(4);
  });

  it('rejects incomplete claims and grants a completed task only once', async () => {
    await expect(
      service.claimToday(userId, 'daily_checkin'),
    ).rejects.toBeInstanceOf(ConflictException);

    const completedAt = new Date('2026-07-25T02:00:00.000Z');
    await dataSource.getRepository(UserTaskProgress).save(
      dataSource.getRepository(UserTaskProgress).create({
        userId,
        taskKey: 'daily_checkin',
        localDate: '2026-07-25',
        timezone: 'Asia/Shanghai',
        progress: 1,
        completedAt,
        claimedAt: null,
        rewardGrantId: null,
      }),
    );

    const first = await service.claimToday(userId, 'daily_checkin');
    expect(first).toMatchObject({
      taskKey: 'daily_checkin',
      claimed: true,
      alreadyClaimed: false,
      reward: { experience: 10 },
    });
    const replay = await service.claimToday(userId, 'daily_checkin');
    expect(replay).toMatchObject({
      taskKey: 'daily_checkin',
      claimed: true,
      alreadyClaimed: true,
    });

    const progression = await dataSource
      .getRepository(PlayerProgression)
      .findOneByOrFail({ userId });
    expect(Number(progression.experience)).toBe(10);
    await expect(
      dataSource.getRepository(RewardGrant).count({
        where: { userId, sourceType: 'daily_task' },
      }),
    ).resolves.toBe(1);

    const today = await service.getToday(userId);
    expect(
      today.tasks.find((task) => task.key === 'daily_checkin'),
    ).toMatchObject({
      progress: 1,
      status: 'claimed',
    });

    // 另一名用户不能读取或领取当前用户的完成进度。
    const otherToday = await service.getToday(otherUserId);
    expect(
      otherToday.tasks.find((task) => task.key === 'daily_checkin'),
    ).toMatchObject({
      progress: 0,
      status: 'in_progress',
    });
    await expect(
      service.claimToday(otherUserId, 'daily_checkin'),
    ).rejects.toBeInstanceOf(ConflictException);
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
