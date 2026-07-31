import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { Checkin } from '../../database/entities/checkin.entity';
import { RewardSnapshot } from '../../database/entities/reward-grant.entity';
import { WalletBalance } from '../../database/entities/wallet-balance.entity';
import { OutboxService } from '../outbox';
import { getPlayerLevelSnapshot } from './level.rules';
import {
  DAILY_CHECKIN_EXP_REWARD,
  DAILY_CHECKIN_RULE_KEY,
  DAILY_CHECKIN_WATER_REWARD,
  PLATFORM_CLOCK,
  PLATFORM_TIME_ZONE,
  PlatformClock,
  WalletCurrency,
} from './platform.constants';
import {
  PlatformAssetsService,
  PlatformAssetState,
} from './platform-assets.service';
import { toBusinessLocalDate } from './platform-time';

export interface PlatformOverview {
  serverTime: string;
  profile: {
    level: number;
    /** 累计 EXP。 */
    exp: number;
    /** 距离下一等级仍需的 EXP；满级为 null。 */
    expToNextLevel: number | null;
    title: string;
    energy: number;
    energyCap: number;
  };
  balances: {
    officeCoin: number;
    decorationCoin: number;
    water: number;
    sunlight: number;
    fertilizer: number;
  };
  checkin: {
    checkedInToday: boolean;
  };
}

export interface CheckinTodayResult {
  checkedInToday: true;
  /** true 表示同一上海自然日已签到，本次没有再次发奖。 */
  alreadyCheckedIn: boolean;
  localDate: string;
  rewardGrantId: string;
  reward: {
    exp: number;
    water: number;
  };
}

/**
 * 平台聚合查询与签到用例。
 *
 * 资产规则和流水写入统一委托 PlatformAssetsService，本服务只负责业务事务、
 * 签到记录以及 API 视图组装。
 */
@Injectable()
export class PlatformService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(PLATFORM_CLOCK) private readonly clock: PlatformClock,
    private readonly assets: PlatformAssetsService,
    private readonly outbox: OutboxService,
  ) {}

  async getOverview(userId: string): Promise<PlatformOverview> {
    const now = this.clock.now();
    const localDate = toBusinessLocalDate(now);

    return this.dataSource.transaction(async (manager) => {
      const state = await this.assets.ensurePlatformState(manager, userId);
      const checkedInToday = await manager.getRepository(Checkin).exist({
        where: { userId, localDate },
      });
      return this.toOverview(now, state, checkedInToday);
    });
  }

  async checkinToday(userId: string): Promise<CheckinTodayResult> {
    const now = this.clock.now();
    const localDate = toBusinessLocalDate(now);
    const reward: RewardSnapshot = {
      experience: DAILY_CHECKIN_EXP_REWARD,
      currencies: { water: DAILY_CHECKIN_WATER_REWARD },
    };

    return this.dataSource.transaction(async (manager) => {
      const grantResult = await this.assets.grantReward(manager, {
        userId,
        sourceType: 'checkin',
        sourceId: localDate,
        ruleKey: DAILY_CHECKIN_RULE_KEY,
        reward,
      });

      const checkinRepo = manager.getRepository(Checkin);
      let checkin = await checkinRepo.findOne({
        where: { userId, localDate },
      });
      if (!checkin) {
        checkin = await checkinRepo.save(
          checkinRepo.create({
            userId,
            localDate,
            timezone: PLATFORM_TIME_ZONE,
            rewardGrantId: grantResult.grant.id,
          }),
        );
      }

      await this.outbox.enqueue(manager, {
        userId,
        eventType: 'checkin.completed',
        aggregateType: 'checkin',
        aggregateId: localDate,
        idempotencyKey: `checkin:${userId}:${localDate}`,
        payload: {
          title: '完成今日签到',
          description: '领取了今日签到奖励',
          sourceType: 'checkin',
          sourceId: localDate,
          occurredAt: now.toISOString(),
          metadata: {
            experience: DAILY_CHECKIN_EXP_REWARD,
            water: DAILY_CHECKIN_WATER_REWARD,
          },
        },
      });

      return this.toCheckinResult(
        checkin.rewardGrantId,
        localDate,
        !grantResult.applied,
      );
    });
  }

  private toOverview(
    now: Date,
    state: PlatformAssetState,
    checkedInToday: boolean,
  ): PlatformOverview {
    const experience = this.toSafeInteger(
      state.progression.experience,
      'experience',
    );
    const level = getPlayerLevelSnapshot(experience);

    return {
      serverTime: now.toISOString(),
      profile: {
        level: level.level,
        exp: level.experience,
        expToNextLevel: level.expToNextLevel,
        title: state.profile.title,
        energy: state.energy.balance,
        energyCap: state.energy.capacity,
      },
      balances: {
        officeCoin: this.getBalance(state.balances, 'office_coin'),
        decorationCoin: this.getBalance(state.balances, 'decor_coin'),
        water: this.getBalance(state.balances, 'water'),
        sunlight: this.getBalance(state.balances, 'sunlight'),
        fertilizer: this.getBalance(state.balances, 'fertilizer'),
      },
      checkin: { checkedInToday },
    };
  }

  private getBalance(
    balances: Map<WalletCurrency, WalletBalance>,
    currency: WalletCurrency,
  ): number {
    const value = balances.get(currency);
    return value ? this.toSafeInteger(value.balance, `${currency} balance`) : 0;
  }

  private toSafeInteger(value: string, field: string): number {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      throw new Error(`${field} is outside the safe integer range`);
    }
    return parsed;
  }

  private toCheckinResult(
    rewardGrantId: string,
    localDate: string,
    alreadyCheckedIn: boolean,
  ): CheckinTodayResult {
    return {
      checkedInToday: true,
      alreadyCheckedIn,
      localDate,
      rewardGrantId,
      reward: {
        exp: DAILY_CHECKIN_EXP_REWARD,
        water: DAILY_CHECKIN_WATER_REWARD,
      },
    };
  }
}
