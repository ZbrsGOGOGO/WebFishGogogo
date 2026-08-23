import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, IsNull, Like } from 'typeorm';

import { CommunityCommandReceipt } from '../../database/entities/community-command-receipt.entity';
import { DeskPlantCycle } from '../../database/entities/desk-plant-cycle.entity';
import { DeskPlantRewardClaim } from '../../database/entities/desk-plant-reward-claim.entity';
import {
  DeskPlant,
  type DeskPlantSkillId,
  type DeskPlantToolId,
} from '../../database/entities/desk-plant.entity';
import { FriendEncouragement } from '../../database/entities/friend-encouragement.entity';
import { Guild } from '../../database/entities/guild.entity';
import { GuildMember } from '../../database/entities/guild-member.entity';
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
import { normalizeGuildBuildings } from './guild.rules';
import {
  calculateFarmCycle,
  FARM_DAILY_ORDER_LIMIT,
  FARM_CROPS,
  FARM_FIRST_CYCLE_SECONDS,
  FARM_MAX_PLOTS,
  FARM_SKILLS,
  FARM_SKILL_MAX_LEVEL,
  FARM_TOOLS,
  FARM_TOOL_MAX_LEVEL,
  farmCrop,
  farmLevelSnapshot,
  farmOfficeCoinLevelBonusPercent,
  farmOrderReward,
  farmPlotCount,
  farmSkillPointsAvailable,
  farmSkillPointsEarned,
  farmToolUpgradeCost,
  nextFarmUnlock,
  nextFarmPlotUnlock,
  normalizeFarmSkillLevels,
  normalizeFarmToolLevels,
} from './farm-growth-rules';
import { NotificationService } from './notification.service';
import { RelationshipPolicyService } from './relationship-policy.service';

const ONBOARDING_PLANT_EXPERIENCE = 40;

export interface FarmRewardView {
  standardRewardGranted: boolean;
  onboardingRewardGranted: boolean;
  orderRewardGranted: boolean;
  ordersCompleted: number;
  ordersTotal: number;
  farmExperience: number;
  officeCoins: number;
  levelUp: boolean;
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
    return this.dataSource.transaction(async (manager) => {
      await this.assets.ensurePlatformState(manager, userId);
      const plant = await manager.getRepository(DeskPlant).findOne({
        where: { userId },
      });
      return this.view(manager, userId, plant, now, null);
    });
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
          previousCount === 0,
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
      const previousLevel = farmLevelSnapshot(plant.plantExperience).level;
      const crop = farmCrop(cycle.cropKey) ?? FARM_CROPS[0];
      const plotCount = farmPlotCount(previousLevel);
      const harvest = calculateFarmCycle(
        crop,
        normalizeFarmToolLevels(plant.toolLevels),
        normalizeFarmSkillLevels(plant.skillLevels),
      );
      plant.plantExperience += harvest.experience * plotCount;
      plant.totalHarvests = Math.max(0, Number(plant.totalHarvests ?? 0)) + 1;
      plant.state = 'idle';
      const serviceDate = toCommunityServiceDate(now);
      const completedBefore = await manager
        .getRepository(DeskPlantRewardClaim)
        .count({
          where: {
            userId,
            rewardKey: Like(`ORDER:${serviceDate}:%`),
          },
        });
      let officeCoins = 0;
      let orderRewardGranted = false;
      if (completedBefore < FARM_DAILY_ORDER_LIMIT) {
        orderRewardGranted = await this.claimReward(
          manager,
          userId,
          cycle,
          'standard',
          `ORDER:${serviceDate}:${completedBefore + 1}`,
          serviceDate,
        );
      }
      if (orderRewardGranted) {
        officeCoins = farmOrderReward(
          completedBefore,
          normalizeFarmToolLevels(plant.toolLevels),
          normalizeFarmSkillLevels(plant.skillLevels),
          previousLevel,
        );
        await this.assets.grantReward(manager, {
          userId,
          sourceType: 'farm_order',
          sourceId: `${serviceDate}:${completedBefore + 1}`,
          ruleKey: 'farm-order-v1',
          reward: {
            experience: 8,
            currencies: { office_coin: officeCoins },
          },
        });
        if (completedBefore === 0) {
          plant.streakDays = this.nextStreak(
            plant.lastStandardRewardServiceDate,
            serviceDate,
            plant.streakDays,
          );
          plant.lastStandardRewardServiceDate = serviceDate;
        }
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
      plant.level = farmLevelSnapshot(plant.plantExperience).level;
      plant.farmVersion = Math.max(1, Number(plant.farmVersion ?? 1)) + 1;
      await manager.getRepository(DeskPlant).save(plant);
      await this.startCycle(
        manager,
        users.get(userId)!,
        plant,
        cycle.sequence + 1,
        false,
        now,
        true,
      );

      const farmExperience = harvest.experience * plotCount +
        (onboardingRewardGranted ? ONBOARDING_PLANT_EXPERIENCE : 0);
      const reward: FarmRewardView = {
        standardRewardGranted: orderRewardGranted,
        onboardingRewardGranted,
        orderRewardGranted,
        ordersCompleted: Math.min(
          FARM_DAILY_ORDER_LIMIT,
          completedBefore + (orderRewardGranted ? 1 : 0),
        ),
        ordersTotal: FARM_DAILY_ORDER_LIMIT,
        farmExperience,
        officeCoins,
        levelUp: plant.level > previousLevel,
        summary: [
          `${plotCount} 块地的${crop.name}收获：农场经验 +${farmExperience}`,
          orderRewardGranted
            ? `今日订单 ${completedBefore + 1}/${FARM_DAILY_ORDER_LIMIT}：职场经验 +8、办公币 +${officeCoins}`
            : '今日三份办公币订单已完成，作物继续进入仓库进度',
          plant.level > previousLevel ? `农场升到 Lv.${plant.level}` : null,
        ].filter(Boolean).join('；'),
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

  async selectCrop(
    userId: string,
    cropKey: string,
    expectedVersion: number,
    idempotencyKey: string,
  ) {
    assertCommunityWritesEnabled();
    const hash = requestHash({ cropKey, expectedVersion });
    return this.dataSource.transaction(async (manager) => {
      await this.policy.lockActiveUsers(manager, [userId]);
      const replay = await this.replay(manager, userId, 'farm.crop.select', idempotencyKey, hash);
      if (replay) return replay;
      const plant = await this.ensurePlant(manager, userId);
      this.assertVersion(plant, expectedVersion);
      const crop = farmCrop(cropKey);
      if (!crop) throw new NotFoundException({ code: 'FARM_CROP_NOT_FOUND' });
      const level = farmLevelSnapshot(plant.plantExperience).level;
      if (crop.unlockLevel > level) {
        throw new ConflictException({ code: 'FARM_CROP_LOCKED', unlockLevel: crop.unlockLevel });
      }
      plant.selectedCropKey = crop.key;
      plant.farmVersion = Math.max(1, Number(plant.farmVersion ?? 1)) + 1;
      await manager.getRepository(DeskPlant).save(plant);
      const result = { farm: await this.view(manager, userId, plant, this.clock.now(), null) };
      return this.record(manager, userId, 'farm.crop.select', idempotencyKey, hash, result);
    });
  }

  async upgradeTool(
    userId: string,
    toolId: DeskPlantToolId,
    expectedVersion: number,
    idempotencyKey: string,
  ) {
    assertCommunityWritesEnabled();
    const hash = requestHash({ toolId, expectedVersion });
    return this.dataSource.transaction(async (manager) => {
      await this.policy.lockActiveUsers(manager, [userId]);
      const replay = await this.replay(manager, userId, 'farm.tool.upgrade', idempotencyKey, hash);
      if (replay) return replay;
      const plant = await this.ensurePlant(manager, userId);
      this.assertVersion(plant, expectedVersion);
      if (!FARM_TOOLS.some((tool) => tool.id === toolId)) {
        throw new NotFoundException({ code: 'FARM_TOOL_NOT_FOUND' });
      }
      const levels = normalizeFarmToolLevels(plant.toolLevels);
      const currentLevel = levels[toolId];
      if (currentLevel >= FARM_TOOL_MAX_LEVEL) {
        throw new ConflictException({ code: 'FARM_TOOL_MAX_LEVEL' });
      }
      const cost = farmToolUpgradeCost(currentLevel);
      await this.assets.debitWallet(manager, userId, 'office_coin', cost, {
        sourceType: 'farm_tool',
        sourceId: toolId,
        reason: `farm-tool-upgrade-${currentLevel + 1}`,
        idempotencyKey: `${idempotencyKey}:office-coin`,
      });
      plant.toolLevels = { ...levels, [toolId]: currentLevel + 1 };
      plant.farmVersion = Math.max(1, Number(plant.farmVersion ?? 1)) + 1;
      await manager.getRepository(DeskPlant).save(plant);
      const result = { farm: await this.view(manager, userId, plant, this.clock.now(), null), cost };
      return this.record(manager, userId, 'farm.tool.upgrade', idempotencyKey, hash, result);
    });
  }

  async upgradeSkill(
    userId: string,
    skillId: DeskPlantSkillId,
    expectedVersion: number,
    idempotencyKey: string,
  ) {
    assertCommunityWritesEnabled();
    const hash = requestHash({ skillId, expectedVersion });
    return this.dataSource.transaction(async (manager) => {
      await this.policy.lockActiveUsers(manager, [userId]);
      const replay = await this.replay(manager, userId, 'farm.skill.upgrade', idempotencyKey, hash);
      if (replay) return replay;
      const plant = await this.ensurePlant(manager, userId);
      this.assertVersion(plant, expectedVersion);
      const definition = FARM_SKILLS.find((skill) => skill.id === skillId);
      if (!definition) throw new NotFoundException({ code: 'FARM_SKILL_NOT_FOUND' });
      const level = farmLevelSnapshot(plant.plantExperience).level;
      if (definition.unlockLevel > level) {
        throw new ConflictException({ code: 'FARM_SKILL_LOCKED', unlockLevel: definition.unlockLevel });
      }
      const levels = normalizeFarmSkillLevels(plant.skillLevels);
      if (levels[skillId] >= FARM_SKILL_MAX_LEVEL) {
        throw new ConflictException({ code: 'FARM_SKILL_MAX_LEVEL' });
      }
      if (farmSkillPointsAvailable(level, levels) < 1) {
        throw new ConflictException({ code: 'FARM_SKILL_POINTS_INSUFFICIENT' });
      }
      plant.skillLevels = { ...levels, [skillId]: levels[skillId] + 1 };
      plant.farmVersion = Math.max(1, Number(plant.farmVersion ?? 1)) + 1;
      await manager.getRepository(DeskPlant).save(plant);
      const result = { farm: await this.view(manager, userId, plant, this.clock.now(), null) };
      return this.record(manager, userId, 'farm.skill.upgrade', idempotencyKey, hash, result);
    });
  }

  private async startCycle(
    manager: EntityManager,
    user: User,
    plant: DeskPlant,
    sequence: number,
    firstCycle: boolean,
    now: Date,
    allowInsufficientBalance = false,
  ): Promise<DeskPlantCycle | null> {
    const crop = farmCrop(plant.selectedCropKey) ?? FARM_CROPS[0];
    const calculated = calculateFarmCycle(
      crop,
      normalizeFarmToolLevels(plant.toolLevels),
      normalizeFarmSkillLevels(plant.skillLevels),
    );
    const guildReduction = firstCycle
      ? 0
      : await this.guildFarmDurationReductionPercent(manager, user.id);
    const durationSeconds = firstCycle
      ? FARM_FIRST_CYCLE_SECONDS
      : Math.max(30, Math.ceil(calculated.durationSeconds * (100 - guildReduction) / 100));
    if (!firstCycle) {
      const plotCount = farmPlotCount(farmLevelSnapshot(plant.plantExperience).level);
      const totalSeedCost = crop.seedCost * plotCount;
      const state = await this.assets.ensurePlatformState(manager, user.id);
      const current = Number(state.balances.get('office_coin')?.balance ?? 0);
      if (current < totalSeedCost) {
        if (!allowInsufficientBalance) {
          throw new ConflictException({
            code: 'OFFICE_COIN_INSUFFICIENT',
            required: totalSeedCost,
            current,
          });
        }
        plant.state = 'idle';
        await manager.getRepository(DeskPlant).save(plant);
        return null;
      }
      await this.assets.debitWallet(
        manager,
        user.id,
        'office_coin',
        totalSeedCost,
        {
          sourceType: 'farm_seed',
          sourceId: `${user.id}:${sequence}`,
          reason: `plant-${crop.key}`,
          idempotencyKey: `farm-seed:${user.id}:${sequence}`,
        },
      );
    }
    const maturesAt = new Date(now.getTime() + durationSeconds * 1_000);
    const repo = manager.getRepository(DeskPlantCycle);
    const cycle = await repo.save(
      repo.create({
        userId: user.id,
        sequence,
        durationSeconds,
        cropKey: crop.key,
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

  private async guildFarmDurationReductionPercent(
    manager: EntityManager,
    userId: string,
  ): Promise<number> {
    const member = await manager.getRepository(GuildMember).findOne({ where: { userId } });
    if (!member) return 0;
    const guild = await manager.getRepository(Guild).findOne({ where: { id: member.guildId } });
    return normalizeGuildBuildings(guild?.buildings).pantry;
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
    const ordersCompleted = await manager
      .getRepository(DeskPlantRewardClaim)
      .count({
        where: { userId, rewardKey: Like(`ORDER:${serviceDate}:%`) },
      });
    const dailyRewardClaimed = ordersCompleted >= FARM_DAILY_ORDER_LIMIT;
    const pendingEncouragements = await manager
      .getRepository(FriendEncouragement)
      .count({ where: { recipientId: userId, serviceDate } });
    const state = cycle
      ? cycle.maturesAt.getTime() <= now.getTime()
        ? ('ready' as const)
        : ('growing' as const)
      : ('idle' as const);
    const level = farmLevelSnapshot(plant?.plantExperience ?? 0);
    const toolLevels = normalizeFarmToolLevels(plant?.toolLevels);
    const skillLevels = normalizeFarmSkillLevels(plant?.skillLevels);
    const selectedCrop = farmCrop(plant?.selectedCropKey ?? '') ?? FARM_CROPS[0];
    const currentCrop = farmCrop(cycle?.cropKey ?? selectedCrop.key) ?? selectedCrop;
    const selectedCycle = calculateFarmCycle(selectedCrop, toolLevels, skillLevels);
    const plotCount = farmPlotCount(level.level);
    const assets = await this.assets.ensurePlatformState(manager, userId);
    const officeCoins = Number(
      assets.balances.get('office_coin')?.balance ?? 0,
    );
    return {
      serverTime: now.toISOString(),
      state,
      plant: {
        name: currentCrop.name,
        appearanceKey: currentCrop.key,
        level: level.level,
        experience: plant?.plantExperience ?? 0,
        experienceInLevel: level.experienceInLevel,
        experienceToNextLevel: level.experienceToNextLevel,
        careStreak: plant?.streakDays ?? 0,
        cycleStartedAt: cycle?.startedAt.toISOString() ?? null,
        maturesAt: cycle?.maturesAt.toISOString() ?? null,
        cycleSeconds: cycle?.durationSeconds ?? null,
        firstCycle: cycle ? cycle.sequence === 1 : true,
      },
      growth: {
        farmCoins: 0,
        officeCoins,
        totalHarvests: plant?.totalHarvests ?? 0,
        farmVersion: plant?.farmVersion ?? 1,
        skillPointsEarned: farmSkillPointsEarned(level.level),
        skillPointsAvailable: farmSkillPointsAvailable(level.level, skillLevels),
        nextUnlock: nextFarmUnlock(level.level),
        plotCount,
        maxPlotCount: FARM_MAX_PLOTS,
        nextPlotUnlock: nextFarmPlotUnlock(level.level),
        officeCoinLevelBonusPercent: farmOfficeCoinLevelBonusPercent(level.level),
        ordersCompleted,
        ordersTotal: FARM_DAILY_ORDER_LIMIT,
      },
      crops: FARM_CROPS.map((crop) => {
        const reward = calculateFarmCycle(crop, toolLevels, skillLevels);
        return {
          ...crop,
          durationSeconds: reward.durationSeconds,
          experience: reward.experience * plotCount,
          coins: reward.coins,
          seedCostPerPlot: crop.seedCost,
          seedCost: crop.seedCost * plotCount,
          unlocked: level.level >= crop.unlockLevel,
          selected: selectedCrop.key === crop.key,
          growing: currentCrop.key === crop.key && state !== 'idle',
        };
      }),
      tools: FARM_TOOLS.map((tool) => ({
        ...tool,
        level: toolLevels[tool.id],
        maxLevel: FARM_TOOL_MAX_LEVEL,
        nextCost: farmToolUpgradeCost(toolLevels[tool.id]),
      })),
      skills: FARM_SKILLS.map((skill) => ({
        ...skill,
        level: skillLevels[skill.id],
        maxLevel: FARM_SKILL_MAX_LEVEL,
        unlocked: level.level >= skill.unlockLevel,
      })),
      standardCycleSeconds: selectedCycle.durationSeconds,
      firstCycleSeconds: FARM_FIRST_CYCLE_SECONDS,
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
        farmCoins: 0,
        totalHarvests: 0,
        selectedCropKey: FARM_CROPS[0].key,
        toolLevels: normalizeFarmToolLevels(null),
        skillLevels: normalizeFarmSkillLevels(null),
        farmVersion: 1,
        streakDays: 0,
        lastStandardRewardServiceDate: null,
        firstHarvestedAt: null,
        feedingEnabled: true,
        feedAnimationEnabled: true,
        feedNotificationsEnabled: true,
      }),
    );
  }

  private assertVersion(plant: DeskPlant, expectedVersion: number): void {
    const currentVersion = Math.max(1, Number(plant.farmVersion ?? 1));
    if (currentVersion !== expectedVersion) {
      throw new ConflictException({ code: 'FARM_VERSION_CONFLICT', currentVersion });
    }
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
