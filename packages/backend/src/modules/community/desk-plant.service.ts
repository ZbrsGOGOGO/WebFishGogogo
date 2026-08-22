import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, IsNull } from 'typeorm';

import { CommunityCommandReceipt } from '../../database/entities/community-command-receipt.entity';
import { DeskPlantCycle } from '../../database/entities/desk-plant-cycle.entity';
import { DeskPlantRewardClaim } from '../../database/entities/desk-plant-reward-claim.entity';
import { DeskPlant } from '../../database/entities/desk-plant.entity';
import { FriendEncouragement } from '../../database/entities/friend-encouragement.entity';
import { User } from '../../database/entities/user.entity';
import { PlatformAssetsService } from '../platform';
import { COMMUNITY_CLOCK, CommunityClock } from './community-clock';
import {
  serviceDateDistance,
  toCommunityServiceDate,
} from './community-time';
import { requestHash } from './community-validation';
import { assertCommunityWritesEnabled } from './community-write-gate';
import { FeedService } from './feed.service';
import { NotificationService } from './notification.service';
import { RelationshipPolicyService } from './relationship-policy.service';

const FIRST_CYCLE_SECONDS = 30;
const STANDARD_CYCLE_SECONDS = 20 * 60 * 60;
const STANDARD_PLANT_EXPERIENCE = 10;
const ONBOARDING_PLANT_EXPERIENCE = 40;

export interface FarmRewardView {
  standardRewardGranted: boolean;
  onboardingRewardGranted: boolean;
  summary: string | null;
}

@Injectable()
export class DeskPlantService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly policy: RelationshipPolicyService,
    private readonly assets: PlatformAssetsService,
    private readonly notifications: NotificationService,
    private readonly feeds: FeedService,
    @Inject(COMMUNITY_CLOCK) private readonly clock: CommunityClock,
  ) {}

  async overview(userId: string) {
    const now = this.clock.now();
    const plant = await this.dataSource.getRepository(DeskPlant).findOne({
      where: { userId },
    });
    return this.view(this.dataSource.manager, userId, plant, now, null);
  }

  async care(userId: string, idempotencyKey: string) {
    assertCommunityWritesEnabled();
    const hash = requestHash({});
    return this.dataSource.transaction(async (manager) => {
      const users = await this.policy.lockActiveUsers(manager, [userId]);
      const replay = await this.replay(
        manager,
        userId,
        'farm.care',
        idempotencyKey,
        hash,
      );
      if (replay) return replay;
      const now = this.clock.now();
      const plant = await this.ensurePlant(manager, userId);
      let cycle = await manager.getRepository(DeskPlantCycle).findOne({
        where: { userId, harvestedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!cycle) {
        const previousCount = await manager
          .getRepository(DeskPlantCycle)
          .count({ where: { userId } });
        cycle = await this.startCycle(
          manager,
          users.get(userId)!,
          plant,
          previousCount + 1,
          previousCount === 0 ? FIRST_CYCLE_SECONDS : STANDARD_CYCLE_SECONDS,
          now,
        );
      }
      const result = {
        farm: await this.view(manager, userId, plant, now, null),
        reward: null,
      };
      return this.record(
        manager,
        userId,
        'farm.care',
        idempotencyKey,
        hash,
        result,
      );
    });
  }

  async harvestAndCare(userId: string, idempotencyKey: string) {
    assertCommunityWritesEnabled();
    const hash = requestHash({});
    return this.dataSource.transaction(async (manager) => {
      const users = await this.policy.lockActiveUsers(manager, [userId]);
      const replay = await this.replay(
        manager,
        userId,
        'farm.harvest-and-care',
        idempotencyKey,
        hash,
      );
      if (replay) return replay;
      const now = this.clock.now();
      const plant = await this.ensurePlant(manager, userId);
      const cycleRepo = manager.getRepository(DeskPlantCycle);
      const cycle = await cycleRepo.findOne({
        where: { userId, harvestedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!cycle) throw new NotFoundException({ code: 'PLANT_CYCLE_NOT_FOUND' });
      if (cycle.maturesAt.getTime() > now.getTime()) {
        throw new ConflictException({
          code: 'PLANT_NOT_READY',
          maturesAt: cycle.maturesAt.toISOString(),
        });
      }

      cycle.harvestedAt = now;
      await cycleRepo.save(cycle);
      const serviceDate = toCommunityServiceDate(now);
      const standardRewardGranted = await this.claimReward(
        manager,
        userId,
        cycle,
        'standard',
        `STANDARD:${serviceDate}`,
        serviceDate,
      );
      if (standardRewardGranted) {
        await this.assets.grantReward(manager, {
          userId,
          sourceType: 'desk_plant',
          sourceId: serviceDate,
          ruleKey: 'standard-v1',
          reward: {
            experience: 20,
            currencies: { office_coin: 5 },
          },
        });
        plant.plantExperience += STANDARD_PLANT_EXPERIENCE;
        plant.streakDays = this.nextStreak(
          plant.lastStandardRewardServiceDate,
          serviceDate,
          plant.streakDays,
        );
        plant.lastStandardRewardServiceDate = serviceDate;
      }
      const onboardingRewardGranted = await this.claimReward(
        manager,
        userId,
        cycle,
        'onboarding',
        'ONBOARDING',
        serviceDate,
      );
      if (onboardingRewardGranted) {
        plant.plantExperience += ONBOARDING_PLANT_EXPERIENCE;
        plant.firstHarvestedAt = now;
        plant.appearanceKey = 'desk_leaf';
      }
      plant.level = Math.min(100, 1 + Math.floor(plant.plantExperience / 50));
      await manager.getRepository(DeskPlant).save(plant);
      await this.startCycle(
        manager,
        users.get(userId)!,
        plant,
        cycle.sequence + 1,
        STANDARD_CYCLE_SECONDS,
        now,
      );

      const reward: FarmRewardView = {
        standardRewardGranted,
        onboardingRewardGranted,
        summary:
          standardRewardGranted || onboardingRewardGranted
            ? [
                standardRewardGranted ? '20 经验、5 办公币、10 绿植经验' : null,
                onboardingRewardGranted ? '新人额外 40 绿植经验' : null,
              ]
                .filter(Boolean)
                .join('；')
            : '今日标准奖励已领取，本次仅继续成长',
      };
      const result = {
        farm: await this.view(manager, userId, plant, now, reward),
        reward,
      };
      return this.record(
        manager,
        userId,
        'farm.harvest-and-care',
        idempotencyKey,
        hash,
        result,
      );
    });
  }

  async encourage(
    userId: string,
    targetPublicId: string,
    idempotencyKey: string,
  ): Promise<{ acknowledged: true }> {
    await this.feeds.send(userId, targetPublicId, 'cheer_note', idempotencyKey);
    return { acknowledged: true };
  }

  private async startCycle(
    manager: EntityManager,
    user: User,
    plant: DeskPlant,
    sequence: number,
    durationSeconds: number,
    now: Date,
  ): Promise<DeskPlantCycle> {
    const maturesAt = new Date(now.getTime() + durationSeconds * 1_000);
    const repo = manager.getRepository(DeskPlantCycle);
    const cycle = await repo.save(
      repo.create({
        userId: user.id,
        sequence,
        durationSeconds,
        startedAt: now,
        maturesAt,
        harvestedAt: null,
      }),
    );
    plant.state = 'growing';
    await manager.getRepository(DeskPlant).save(plant);
    await this.notifications.create(manager, {
      userId: user.id,
      category: 'farm',
      eventType: 'farm.plant.matured',
      title: '工位绿植成熟了',
      summary: '点击主按钮即可收获并自动开始下一轮照料',
      resourceType: 'desk_plant_cycle',
      resourceId: cycle.id,
      resourcePath: '/farm',
      dedupeKey: `farm-matured:${cycle.id}`,
      availableAt: maturesAt,
    });
    return cycle;
  }

  private async claimReward(
    manager: EntityManager,
    userId: string,
    cycle: DeskPlantCycle,
    rewardType: 'standard' | 'onboarding',
    rewardKey: string,
    serviceDate: string,
  ): Promise<boolean> {
    const repo = manager.getRepository(DeskPlantRewardClaim);
    if (await repo.exist({ where: { userId, rewardKey } })) return false;
    await repo.save(
      repo.create({
        userId,
        cycleId: cycle.id,
        rewardType,
        rewardKey,
        serviceDate,
      }),
    );
    return true;
  }

  private nextStreak(
    previousDate: string | null,
    currentDate: string,
    currentStreak: number,
  ): number {
    return previousDate && serviceDateDistance(previousDate, currentDate) === 1
      ? currentStreak + 1
      : 1;
  }

  private async view(
    manager: EntityManager,
    userId: string,
    plant: DeskPlant | null,
    now: Date,
    lastReward: FarmRewardView | null,
  ) {
    const cycle = await manager.getRepository(DeskPlantCycle).findOne({
      where: { userId, harvestedAt: IsNull() },
    });
    const serviceDate = toCommunityServiceDate(now);
    const dailyRewardClaimed = await manager
      .getRepository(DeskPlantRewardClaim)
      .exist({ where: { userId, rewardKey: `STANDARD:${serviceDate}` } });
    const pendingEncouragements = await manager
      .getRepository(FriendEncouragement)
      .count({ where: { recipientId: userId, serviceDate } });
    const state = cycle
      ? cycle.maturesAt.getTime() <= now.getTime()
        ? ('ready' as const)
        : ('growing' as const)
      : ('idle' as const);
    return {
      serverTime: now.toISOString(),
      state,
      plant: {
        name: '工位新芽',
        appearanceKey: plant?.appearanceKey ?? 'desk_sprout',
        level: plant?.level ?? 1,
        experience: plant?.plantExperience ?? 0,
        careStreak: plant?.streakDays ?? 0,
        cycleStartedAt: cycle?.startedAt.toISOString() ?? null,
        maturesAt: cycle?.maturesAt.toISOString() ?? null,
        cycleSeconds: cycle?.durationSeconds ?? null,
        firstCycle: cycle ? cycle.sequence === 1 : true,
      },
      standardCycleSeconds: STANDARD_CYCLE_SECONDS,
      firstCycleSeconds: FIRST_CYCLE_SECONDS,
      dailyRewardClaimed,
      lastReward,
      encouragementAnimationEnabled: plant?.feedAnimationEnabled ?? true,
      pendingEncouragements,
    };
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

  private async replay(
    manager: EntityManager,
    userId: string,
    commandType: string,
    idempotencyKey: string,
    hash: string,
  ): Promise<Record<string, unknown> | null> {
    const receipt = await manager.getRepository(CommunityCommandReceipt).findOne({
      where: { userId, commandType, idempotencyKey },
      lock: { mode: 'pessimistic_write' },
    });
    if (!receipt) return null;
    if (receipt.requestHash !== hash) {
      throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' });
    }
    return receipt.result;
  }

  private async record<T extends Record<string, unknown>>(
    manager: EntityManager,
    userId: string,
    commandType: string,
    idempotencyKey: string,
    hash: string,
    result: T,
  ): Promise<T> {
    const repo = manager.getRepository(CommunityCommandReceipt);
    await repo.save(
      repo.create({
        userId,
        commandType,
        idempotencyKey,
        requestHash: hash,
        result,
      }),
    );
    return result;
  }

}
