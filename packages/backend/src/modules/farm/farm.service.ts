import { createHash } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';

import { CropDefinition } from '../../database/entities/crop-definition.entity';
import { FarmPlanting } from '../../database/entities/farm-planting.entity';
import { FarmPlot } from '../../database/entities/farm-plot.entity';
import { UserFarm } from '../../database/entities/user-farm.entity';
import {
  PlatformAssetsService,
  type PlatformAssetState,
} from '../platform';
import { OutboxService } from '../outbox';
import {
  FARM_CLOCK,
  FARM_ONBOARDING_REWARD,
  FARM_PLOT_SLOTS,
  FIFTH_PLOT_UNLOCK_LEVEL,
  INITIAL_UNLOCKED_PLOTS,
  LEVEL_UNLOCKED_PLOTS,
  type FarmClock,
} from './farm.constants';
import {
  farmExpToNextLevel,
  farmLevelForExperience,
} from './farm-level.rules';

const SEED_SLUGS = [
  'seed_wheat',
  'seed_strawberry',
  'seed_coffee',
] as const;

export type FarmPlotState = 'locked' | 'empty' | 'growing' | 'ready';

export interface FarmOverview {
  serverTime: string;
  farm: {
    level: number;
    experience: number;
    expToNextLevel: number | null;
    plotCount: number;
  };
  assets: {
    water: number;
    sunlight: number;
    fertilizer: number;
  };
  inventory: {
    wheatSeed: number;
    strawberrySeed: number;
    coffeeSeed: number;
    seed_wheat: number;
    seed_strawberry: number;
    seed_coffee: number;
  };
  crops: Array<{
    slug: string;
    name: string;
    emoji: string;
    growSeconds: number;
    requiredLevel: number;
    plantCost: {
      water: number;
      seedSlug: string;
      seedQuantity: number;
    };
    rewards: {
      experience?: number;
      officeCoin?: number;
      decorationCoin?: number;
      energy?: number;
    };
  }>;
  plots: Array<{
    id: string;
    /** API 使用 0-based，前端展示时加 1。 */
    slotIndex: number;
    state: FarmPlotState;
    crop: { slug: string; name: string; emoji: string } | null;
    plantedAt: string | null;
    maturesAt: string | null;
  }>;
}

interface FarmContext {
  farm: UserFarm;
  plots: FarmPlot[];
  assets: PlatformAssetState;
}

/**
 * 农场 MVP 应用服务。
 *
 * 所有写操作在一个事务内同时提交地块状态、成本流水和奖励流水；
 * 成熟状态只由服务器时钟派生，不创建每块地的后台定时器。
 */
@Injectable()
export class FarmService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly platformAssets: PlatformAssetsService,
    private readonly outbox: OutboxService,
    @Inject(FARM_CLOCK) private readonly clock: FarmClock,
  ) {}

  async getFarm(userId: string): Promise<FarmOverview> {
    return this.dataSource.transaction(async (manager) => {
      const context = await this.ensureFarmContext(manager, userId);
      return this.buildOverview(manager, context, this.clock.now());
    });
  }

  async plant(
    userId: string,
    plotId: string,
    cropSlug: string,
    requestKey: string | undefined,
  ): Promise<FarmOverview> {
    const idempotencyKey = this.commandKey(userId, requestKey);
    const normalizedCropSlug = this.requiredSlug(cropSlug, 'cropSlug');

    return this.dataSource.transaction(async (manager) => {
      const context = await this.ensureFarmContext(manager, userId);
      const plantingRepo = manager.getRepository(FarmPlanting);

      const replay = await plantingRepo.findOne({
        where: { plantIdempotencyKey: idempotencyKey },
      });
      if (replay) {
        return this.buildOverview(manager, context, this.clock.now());
      }

      const plot = await manager.getRepository(FarmPlot).findOne({
        where: { id: plotId, userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!plot) {
        throw new NotFoundException({ code: 'PLOT_NOT_FOUND' });
      }
      if (plot.slotIndex > context.farm.plotCount) {
        throw new ConflictException({ code: 'PLOT_LOCKED' });
      }
      const active = await plantingRepo.findOne({
        where: { plotId, status: 'growing' },
        lock: { mode: 'pessimistic_write' },
      });
      if (active) {
        throw new ConflictException({ code: 'PLOT_OCCUPIED' });
      }

      const crop = await manager.getRepository(CropDefinition).findOne({
        where: { slug: normalizedCropSlug, enabled: true },
      });
      if (!crop) {
        throw new NotFoundException({ code: 'CROP_NOT_FOUND' });
      }
      if (context.farm.level < crop.requiredFarmLevel) {
        throw new ConflictException({
          code: 'CROP_LOCKED',
          requiredLevel: crop.requiredFarmLevel,
        });
      }

      // 资产流水的 source_id 数据库列上限为 100。客户端请求键与 userId
      // 拼接后可能超过该上限，因此使用稳定摘要作为审计来源标识。
      const sourceId = createHash('sha256')
        .update(idempotencyKey)
        .digest('hex');
      if (crop.waterCost > 0) {
        const waterResult = await this.platformAssets.debitWallet(
          manager,
          userId,
          'water',
          crop.waterCost,
          {
            sourceType: 'farm_plant',
            sourceId,
            reason: crop.slug,
            idempotencyKey: `${idempotencyKey}:water`,
          },
        );
        const waterBalance = context.assets.balances.get('water');
        if (waterBalance) {
          waterBalance.balance = String(waterResult.balance);
        }
      }
      await this.platformAssets.debitInventory(
        manager,
        userId,
        crop.seedItemSlug,
        crop.seedQuantity,
        {
          sourceType: 'farm_plant',
          sourceId,
          reason: crop.slug,
          idempotencyKey: `${idempotencyKey}:seed`,
        },
      );

      const now = this.clock.now();
      const planting = await plantingRepo.save(
        plantingRepo.create({
          userId,
          plotId,
          cropSlug: crop.slug,
          status: 'growing',
          plantedAt: now,
          maturesAt: new Date(now.getTime() + crop.growSeconds * 1000),
          harvestedAt: null,
          costSnapshot: {
            water: crop.waterCost,
            seedItemSlug: crop.seedItemSlug,
            seedQuantity: crop.seedQuantity,
          },
          rewardSnapshot: crop.harvestRewards,
          farmExpReward: crop.farmExpReward,
          plantIdempotencyKey: idempotencyKey,
          harvestIdempotencyKey: null,
          harvestResult: null,
        }),
      );

      await this.outbox.enqueue(manager, {
        userId,
        eventType: 'farm.crop.planted',
        aggregateType: 'farm_planting',
        aggregateId: planting.id,
        idempotencyKey: `farm:plant:${planting.id}`,
        payload: {
          title: `种下${crop.name}`,
          description: `第 ${plot.slotIndex} 块土地开始生长`,
          sourceType: 'farm_plant',
          sourceId: planting.id,
          occurredAt: now.toISOString(),
          metadata: {
            cropSlug: crop.slug,
            cropName: crop.name,
            plotId,
          },
        },
      });

      return this.buildOverview(manager, context, now);
    });
  }

  async harvest(
    userId: string,
    plotId: string,
    requestKey: string | undefined,
  ): Promise<FarmOverview> {
    const idempotencyKey = this.commandKey(userId, requestKey);

    return this.dataSource.transaction(async (manager) => {
      const context = await this.ensureFarmContext(manager, userId);
      const plantingRepo = manager.getRepository(FarmPlanting);

      const replay = await plantingRepo.findOne({
        where: { harvestIdempotencyKey: idempotencyKey },
      });
      if (replay) {
        return this.buildOverview(manager, context, this.clock.now());
      }

      const plot = await manager.getRepository(FarmPlot).findOne({
        where: { id: plotId, userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!plot) {
        throw new NotFoundException({ code: 'PLOT_NOT_FOUND' });
      }
      const planting = await plantingRepo.findOne({
        where: { plotId, userId, status: 'growing' },
        lock: { mode: 'pessimistic_write' },
      });
      if (!planting) {
        throw new ConflictException({ code: 'PLOT_EMPTY' });
      }

      const now = this.clock.now();
      if (planting.maturesAt.getTime() > now.getTime()) {
        throw new ConflictException({
          code: 'CROP_NOT_READY',
          maturesAt: planting.maturesAt.toISOString(),
        });
      }

      const reward = await this.platformAssets.grantReward(manager, {
        userId,
        sourceType: 'farm_harvest',
        sourceId: planting.id,
        ruleKey: 'farm_harvest_v1',
        reward: planting.rewardSnapshot,
      });

      const currentFarmExperience = this.safeInteger(
        context.farm.experience,
        'farm experience',
      );
      const nextFarmExperience =
        currentFarmExperience + planting.farmExpReward;
      context.farm.experience = String(nextFarmExperience);
      context.farm.level = farmLevelForExperience(nextFarmExperience);
      context.farm.plotCount =
        context.farm.level >= FIFTH_PLOT_UNLOCK_LEVEL
          ? LEVEL_UNLOCKED_PLOTS
          : INITIAL_UNLOCKED_PLOTS;
      await manager.getRepository(UserFarm).save(context.farm);

      planting.status = 'harvested';
      planting.harvestedAt = now;
      planting.harvestIdempotencyKey = idempotencyKey;
      planting.harvestResult = {
        reward: reward.snapshot,
        farmLevel: context.farm.level,
        farmExperience: nextFarmExperience,
      };
      await plantingRepo.save(planting);
      const crop = await manager.getRepository(CropDefinition).findOne({
        where: { slug: planting.cropSlug },
      });

      await this.outbox.enqueue(manager, {
        userId,
        eventType: 'farm.crop.harvested',
        aggregateType: 'farm_planting',
        aggregateId: planting.id,
        idempotencyKey: `farm:harvest:${planting.id}`,
        payload: {
          title: `收获${crop?.name ?? planting.cropSlug}`,
          description: '成熟作物已收入仓库，农场经验同步增加',
          sourceType: 'farm_harvest',
          sourceId: planting.id,
          occurredAt: now.toISOString(),
          metadata: {
            cropSlug: planting.cropSlug,
            cropName: crop?.name ?? planting.cropSlug,
            plotId,
            farmExperience: nextFarmExperience,
          },
        },
      });

      return this.buildOverview(
        manager,
        { ...context, assets: reward.state },
        now,
      );
    });
  }

  private async ensureFarmContext(
    manager: EntityManager,
    userId: string,
  ): Promise<FarmContext> {
    // PlatformAssetsService 首先锁 users 行，形成全站统一的锁顺序。
    let assets = await this.platformAssets.ensurePlatformState(manager, userId);
    const farmRepo = manager.getRepository(UserFarm);
    let farm = await farmRepo.findOne({
      where: { userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!farm) {
      farm = await farmRepo.save(
        farmRepo.create({
          userId,
          level: 1,
          experience: '0',
          plotCount: INITIAL_UNLOCKED_PLOTS,
        }),
      );
    }

    const plotRepo = manager.getRepository(FarmPlot);
    const existingPlots = await plotRepo.find({
      where: { userId },
      order: { slotIndex: 'ASC' },
    });
    const existingSlots = new Set(existingPlots.map((plot) => plot.slotIndex));
    for (let slotIndex = 1; slotIndex <= FARM_PLOT_SLOTS; slotIndex += 1) {
      if (existingSlots.has(slotIndex)) continue;
      await plotRepo.save(
        plotRepo.create({
          userId,
          slotIndex,
          unlockType:
            slotIndex <= INITIAL_UNLOCKED_PLOTS
              ? 'default'
              : slotIndex === LEVEL_UNLOCKED_PLOTS
                ? 'level'
                : 'membership',
          unlockLevel:
            slotIndex === LEVEL_UNLOCKED_PLOTS
              ? FIFTH_PLOT_UNLOCK_LEVEL
              : null,
        }),
      );
    }

    // GET 首次进入也能安全执行：RewardGrant 唯一来源保证只发一次教学资产。
    const onboarding = await this.platformAssets.grantReward(manager, {
      userId,
      sourceType: 'farm_onboarding',
      sourceId: userId,
      ruleKey: 'farm_onboarding_v1',
      reward: FARM_ONBOARDING_REWARD,
    });
    assets = onboarding.state;

    return {
      farm,
      plots: await plotRepo.find({
        where: { userId },
        order: { slotIndex: 'ASC' },
      }),
      assets,
    };
  }

  private async buildOverview(
    manager: EntityManager,
    context: FarmContext,
    now: Date,
  ): Promise<FarmOverview> {
    const crops = await manager.getRepository(CropDefinition).find({
      where: { enabled: true },
      order: { requiredFarmLevel: 'ASC', growSeconds: 'ASC' },
    });
    const cropMap = new Map(crops.map((crop) => [crop.slug, crop]));
    const plotIds = context.plots.map((plot) => plot.id);
    const plantings =
      plotIds.length === 0
        ? []
        : await manager.getRepository(FarmPlanting).find({
            where: { plotId: In(plotIds), status: 'growing' },
          });
    const plantingByPlot = new Map(
      plantings.map((planting) => [planting.plotId, planting]),
    );
    const inventory = await this.platformAssets.readInventoryQuantities(
      manager,
      context.farm.userId,
      [...SEED_SLUGS],
    );
    const farmExperience = this.safeInteger(
      context.farm.experience,
      'farm experience',
    );

    return {
      serverTime: now.toISOString(),
      farm: {
        level: context.farm.level,
        experience: farmExperience,
        expToNextLevel: farmExpToNextLevel(farmExperience),
        plotCount: context.farm.plotCount,
      },
      assets: {
        water: this.walletAmount(context.assets, 'water'),
        sunlight: this.walletAmount(context.assets, 'sunlight'),
        fertilizer: this.walletAmount(context.assets, 'fertilizer'),
      },
      inventory: {
        wheatSeed: inventory.seed_wheat ?? 0,
        strawberrySeed: inventory.seed_strawberry ?? 0,
        coffeeSeed: inventory.seed_coffee ?? 0,
        seed_wheat: inventory.seed_wheat ?? 0,
        seed_strawberry: inventory.seed_strawberry ?? 0,
        seed_coffee: inventory.seed_coffee ?? 0,
      },
      crops: crops.map((crop) => ({
        slug: crop.slug,
        name: crop.name,
        emoji: crop.emoji,
        growSeconds: crop.growSeconds,
        requiredLevel: crop.requiredFarmLevel,
        plantCost: {
          water: crop.waterCost,
          seedSlug: crop.seedItemSlug,
          seedQuantity: crop.seedQuantity,
        },
        rewards: {
          experience: crop.harvestRewards.experience,
          officeCoin: crop.harvestRewards.currencies?.office_coin,
          decorationCoin: crop.harvestRewards.currencies?.decor_coin,
          energy: crop.harvestRewards.energy,
        },
      })),
      plots: context.plots.map((plot) => {
        const planting = plantingByPlot.get(plot.id);
        const locked = plot.slotIndex > context.farm.plotCount;
        const crop = planting ? cropMap.get(planting.cropSlug) : undefined;
        return {
          id: plot.id,
          slotIndex: plot.slotIndex - 1,
          state: locked
            ? 'locked'
            : !planting
              ? 'empty'
              : planting.maturesAt.getTime() <= now.getTime()
                ? 'ready'
                : 'growing',
          crop:
            planting && crop
              ? { slug: crop.slug, name: crop.name, emoji: crop.emoji }
              : null,
          plantedAt: planting?.plantedAt.toISOString() ?? null,
          maturesAt: planting?.maturesAt.toISOString() ?? null,
        };
      }),
    };
  }

  private walletAmount(
    assets: PlatformAssetState,
    currency: 'water' | 'sunlight' | 'fertilizer',
  ): number {
    const balance = assets.balances.get(currency);
    return balance ? this.safeInteger(balance.balance, currency) : 0;
  }

  private commandKey(userId: string, requestKey: string | undefined): string {
    if (
      typeof requestKey !== 'string' ||
      !/^[A-Za-z0-9:_-]{8,80}$/.test(requestKey)
    ) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key must contain 8-80 safe characters',
      });
    }
    return `${userId}:${requestKey}`;
  }

  private requiredSlug(value: string, field: string): string {
    if (typeof value !== 'string' || !/^[a-z0-9_-]{1,64}$/.test(value)) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        field,
      });
    }
    return value;
  }

  private safeInteger(value: string, field: string): number {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      throw new Error(`${field} is outside the safe integer range`);
    }
    return parsed;
  }
}
