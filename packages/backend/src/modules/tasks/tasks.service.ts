import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, In } from 'typeorm';

import { TaskDefinition } from '../../database/entities/task-definition.entity';
import { UserTaskProgress } from '../../database/entities/user-task-progress.entity';
import { RewardSnapshot } from '../../database/entities/reward-grant.entity';
import { PlayerProgression } from '../../database/entities/player-progression.entity';
import { ARENA_UNLOCK_LEVEL } from '../games/arena/arena.constants';
import { PlatformAssetsService } from '../platform/platform-assets.service';
import { PLATFORM_TIME_ZONE } from '../platform/platform.constants';
import { toBusinessLocalDate } from '../platform/platform-time';
import {
  DAILY_TASK_REWARD_RULE_KEY,
  TASKS_CLOCK,
  TasksClock,
} from './tasks.constants';

export type DailyTaskState = 'in_progress' | 'claimable' | 'claimed';

export interface DailyTaskItem {
  key: string;
  title: string;
  description: string;
  eventType: string;
  progress: number;
  targetCount: number;
  status: DailyTaskState;
  reward: RewardSnapshot;
  completedAt: string | null;
  claimedAt: string | null;
}

export interface TodayTasksResponse {
  serverTime: string;
  localDate: string;
  summary: {
    completedCount: number;
    totalCount: number;
    claimableCount: number;
  };
  tasks: DailyTaskItem[];
}

export interface ClaimTaskResult {
  taskKey: string;
  claimed: true;
  alreadyClaimed: boolean;
  reward: RewardSnapshot;
}

@Injectable()
export class TasksService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly platformAssets: PlatformAssetsService,
    @Inject(TASKS_CLOCK) private readonly clock: TasksClock,
  ) {}

  async getToday(userId: string): Promise<TodayTasksResponse> {
    const now = this.clock.now();
    const localDate = toBusinessLocalDate(now);
    const allDefinitions = await this.dataSource
      .getRepository(TaskDefinition)
      .find({
        where: { enabled: true },
        order: { displayOrder: 'ASC', key: 'ASC' },
      });
    const progression = await this.dataSource
      .getRepository(PlayerProgression)
      .findOne({ where: { userId } });
    const definitions = allDefinitions.filter(
      (definition) =>
        definition.key !== 'daily_arena' ||
        (progression?.level ?? 1) >= ARENA_UNLOCK_LEVEL,
    );

    const progresses =
      definitions.length === 0
        ? []
        : await this.dataSource.getRepository(UserTaskProgress).find({
            where: {
              userId,
              localDate,
              taskKey: In(definitions.map((definition) => definition.key)),
            },
          });
    const progressByTask = new Map(
      progresses.map((progress) => [progress.taskKey, progress]),
    );
    const tasks = definitions.map((definition) =>
      this.toTaskItem(definition, progressByTask.get(definition.key)),
    );

    return {
      serverTime: now.toISOString(),
      localDate,
      summary: {
        completedCount: tasks.filter(
          (task) => task.status !== 'in_progress',
        ).length,
        totalCount: tasks.length,
        claimableCount: tasks.filter(
          (task) => task.status === 'claimable',
        ).length,
      },
      tasks,
    };
  }

  async claimToday(
    userId: string,
    rawTaskKey: string,
  ): Promise<ClaimTaskResult> {
    const taskKey = rawTaskKey.trim();
    if (!taskKey || taskKey.length > 64) {
      throw new NotFoundException({ code: 'TASK_NOT_FOUND' });
    }
    const now = this.clock.now();
    const localDate = toBusinessLocalDate(now);

    return this.dataSource.transaction(async (manager) => {
      await this.platformAssets.ensurePlatformState(manager, userId);
      const definition = await manager.getRepository(TaskDefinition).findOne({
        where: { key: taskKey, enabled: true },
      });
      if (!definition) {
        throw new NotFoundException({ code: 'TASK_NOT_FOUND' });
      }
      if (definition.key === 'daily_arena') {
        const progression = await manager
          .getRepository(PlayerProgression)
          .findOne({ where: { userId } });
        if ((progression?.level ?? 1) < ARENA_UNLOCK_LEVEL) {
          throw new NotFoundException({ code: 'TASK_NOT_FOUND' });
        }
      }

      const progress = await manager
        .getRepository(UserTaskProgress)
        .findOne({
          where: { userId, taskKey, localDate },
          lock: { mode: 'pessimistic_write' },
        });
      if (
        !progress ||
        progress.progress < definition.targetCount ||
        progress.completedAt == null
      ) {
        throw new ConflictException({ code: 'TASK_NOT_COMPLETED' });
      }

      if (progress.claimedAt) {
        return {
          taskKey,
          claimed: true,
          alreadyClaimed: true,
          reward: definition.rewardSnapshot,
        };
      }

      const grant = await this.platformAssets.grantReward(manager, {
        userId,
        sourceType: 'daily_task',
        sourceId: `${localDate}:${taskKey}`,
        ruleKey: DAILY_TASK_REWARD_RULE_KEY,
        reward: definition.rewardSnapshot,
      });

      progress.claimedAt = now;
      progress.rewardGrantId = grant.grant.id;
      progress.timezone = PLATFORM_TIME_ZONE;
      await manager.getRepository(UserTaskProgress).save(progress);

      return {
        taskKey,
        claimed: true,
        alreadyClaimed: !grant.applied,
        reward: grant.snapshot,
      };
    });
  }

  private toTaskItem(
    definition: TaskDefinition,
    progress: UserTaskProgress | undefined,
  ): DailyTaskItem {
    const current = Math.min(progress?.progress ?? 0, definition.targetCount);
    const status: DailyTaskState = progress?.claimedAt
      ? 'claimed'
      : current >= definition.targetCount
        ? 'claimable'
        : 'in_progress';

    return {
      key: definition.key,
      title: definition.title,
      description: definition.description,
      eventType: definition.eventType,
      progress: current,
      targetCount: definition.targetCount,
      status,
      reward: definition.rewardSnapshot,
      completedAt: progress?.completedAt?.toISOString() ?? null,
      claimedAt: progress?.claimedAt?.toISOString() ?? null,
    };
  }
}
