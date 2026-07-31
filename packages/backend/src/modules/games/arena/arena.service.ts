import { createHash, randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { ArenaBattle } from '../../../database/entities/arena-battle.entity';
import {
  ArenaOpponentOffer,
  ArenaOpponentTier,
} from '../../../database/entities/arena-opponent-offer.entity';
import { ArenaProfile } from '../../../database/entities/arena-profile.entity';
import type { RewardSnapshot } from '../../../database/entities/reward-grant.entity';
import {
  PlatformAssetsService,
  type PlatformAssetState,
} from '../../platform';
import { OutboxService } from '../../outbox';
import {
  ARENA_CLOCK,
  ARENA_ENERGY_COST,
  ARENA_ENGINE_VERSION,
  ARENA_LOSS_REWARD,
  ARENA_OFFER_TTL_MILLISECONDS,
  ARENA_UNLOCK_LEVEL,
  ARENA_WIN_REWARD,
  type ArenaClock,
} from './arena.constants';
import {
  deriveArenaStats,
  resolveArenaBattle,
  type ArenaAttributes,
  type ArenaBattleLogEntry,
  type ArenaBattleResult,
  type ArenaFighterSnapshot,
} from './engine';

const TIERS: readonly ArenaOpponentTier[] = ['easy', 'even', 'risky'];

const OPPONENT_NAMES: Record<ArenaOpponentTier, readonly string[]> = {
  easy: ['摸鱼实习生', '茶水间观察员', '会议记录员'],
  even: ['需求评审员', '排期协调师', '周报质检员'],
  risky: ['周五上线负责人', '临时需求总监', '季度复盘专家'],
};

const TIER_LEVEL_OFFSET: Record<ArenaOpponentTier, number> = {
  easy: -1,
  even: 0,
  risky: 1,
};

const TIER_ATTRIBUTE_SCALE: Record<ArenaOpponentTier, number> = {
  easy: 0.82,
  even: 1,
  risky: 1.2,
};

export interface ArenaBootstrapResponse {
  serverTime: string;
  unlocked: boolean;
  unlockLevel: number;
  profile: {
    level: number;
    title: string;
    energy: number;
    energyCap: number;
    battleClass: string | null;
    attributes: ArenaAttributes;
  };
  offers: Array<{
    id: string;
    tier: ArenaOpponentTier;
    opponentName: string;
    opponentLevel: number;
    power: number;
    expiresAt: string;
  }>;
  recentBattles: Array<{
    id: string;
    result: 'win' | 'loss';
    opponentName: string;
    createdAt: string;
  }>;
}

export interface ArenaBattleResponse {
  battle: {
    id: string;
    winnerSide: 'player' | 'opponent';
    result: 'win' | 'loss';
    roundsPlayed: number;
    logs: Array<{
      round: number;
      text: string;
    }>;
  };
  reward: {
    experience: number;
    currencies: {
      officeCoin: number;
    };
  };
  energy: number;
}

/**
 * 午休斗技场应用服务。
 *
 * bootstrap 和 battle 都先通过 PlatformAssetsService 锁定 users 行，因此同一
 * 用户的邀约刷新、精力扣除、战斗记录和奖励发放遵循相同锁顺序并原子提交。
 */
@Injectable()
export class ArenaService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly platformAssets: PlatformAssetsService,
    private readonly outbox: OutboxService,
    @Inject(ARENA_CLOCK) private readonly clock: ArenaClock,
  ) {}

  async getBootstrap(userId: string): Promise<ArenaBootstrapResponse> {
    return this.dataSource.transaction(async (manager) => {
      const now = this.clock.now();
      const assets = await this.platformAssets.ensurePlatformState(
        manager,
        userId,
      );
      const profile = await this.ensureArenaProfile(manager, userId);
      const unlocked = assets.progression.level >= ARENA_UNLOCK_LEVEL;
      const offers = unlocked
        ? await this.getOrCreateOffers(manager, userId, profile, assets, now)
        : [];
      const recentBattles = await this.readRecentBattles(manager, userId);

      return {
        serverTime: now.toISOString(),
        unlocked,
        unlockLevel: ARENA_UNLOCK_LEVEL,
        profile: this.toProfileResponse(profile, assets),
        offers: offers.map((offer) => this.toOfferResponse(offer)),
        recentBattles,
      };
    });
  }

  async startBattle(
    userId: string,
    rawOfferId: string,
    requestKey: string | undefined,
  ): Promise<ArenaBattleResponse> {
    const offerId = this.requiredUuid(rawOfferId, 'offerId');
    const idempotencyKey = this.commandKey(userId, requestKey);

    return this.dataSource.transaction(async (manager) => {
      const assets = await this.platformAssets.ensurePlatformState(
        manager,
        userId,
      );
      const battleRepo = manager.getRepository(ArenaBattle);
      const replay = await battleRepo.findOne({
        where: { idempotencyKey },
      });
      if (replay) {
        if (replay.offerId !== offerId) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSED',
          });
        }
        return this.toBattleResponse(replay, assets.energy.balance);
      }

      if (assets.progression.level < ARENA_UNLOCK_LEVEL) {
        throw new ConflictException({
          code: 'ARENA_LOCKED',
          unlockLevel: ARENA_UNLOCK_LEVEL,
        });
      }

      const profile = await this.ensureArenaProfile(manager, userId);
      const offer = await manager.getRepository(ArenaOpponentOffer).findOne({
        where: { id: offerId, userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!offer) {
        throw new NotFoundException({ code: 'ARENA_OFFER_NOT_FOUND' });
      }
      if (offer.consumedAt) {
        throw new ConflictException({
          code: 'ARENA_OFFER_ALREADY_CONSUMED',
        });
      }

      const now = this.clock.now();
      if (offer.expiresAt.getTime() <= now.getTime()) {
        throw new ConflictException({ code: 'ARENA_OFFER_EXPIRED' });
      }

      const energy = await this.platformAssets.changeEnergy(
        manager,
        userId,
        -ARENA_ENERGY_COST,
      );
      const battleId = randomUUID();
      const attacker = this.playerSnapshot(userId, profile, assets);
      const seed = this.battleSeed(battleId, userId, offer.id);
      const engineResult = resolveArenaBattle({
        attacker,
        defender: offer.opponentSnapshot,
        seed,
      });
      const result = engineResult.winnerSide === 'attacker' ? 'win' : 'loss';
      const reward = this.cloneReward(
        result === 'win' ? ARENA_WIN_REWARD : ARENA_LOSS_REWARD,
      );

      const battle = battleRepo.create({
        id: battleId,
        userId,
        offerId: offer.id,
        result,
        seed,
        engineVersion: ARENA_ENGINE_VERSION,
        attackerSnapshot: attacker,
        opponentSnapshot: offer.opponentSnapshot,
        battleLog: engineResult,
        rewardSnapshot: reward,
        idempotencyKey,
      });
      await battleRepo.save(battle);

      await this.consumeCurrentOfferSet(manager, userId, now);

      if (result === 'win') {
        profile.wins += 1;
      } else {
        profile.losses += 1;
      }
      await manager.getRepository(ArenaProfile).save(profile);

      await this.platformAssets.grantReward(manager, {
        userId,
        sourceType: 'arena_battle',
        sourceId: battle.id,
        ruleKey: result === 'win' ? 'arena_win_v1' : 'arena_loss_v1',
        reward,
      });

      await this.outbox.enqueue(manager, {
        userId,
        eventType: 'arena.battle.completed',
        aggregateType: 'arena_battle',
        aggregateId: battle.id,
        idempotencyKey: `arena:battle:${battle.id}`,
        payload: {
          title: result === 'win' ? '斗技场获胜' : '完成斗技场挑战',
          description:
            result === 'win'
              ? '赢得本场工位较量并获得胜利奖励'
              : '完成本场工位较量并获得参与奖励',
          sourceType: 'arena_battle',
          sourceId: battle.id,
          occurredAt: now.toISOString(),
          metadata: {
            result,
            offerId: offer.id,
            reward,
          },
        },
      });

      return this.toBattleResponse(battle, energy.state.balance);
    });
  }

  private async ensureArenaProfile(
    manager: EntityManager,
    userId: string,
  ): Promise<ArenaProfile> {
    const repo = manager.getRepository(ArenaProfile);
    const existing = await repo.findOne({
      where: { userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (existing) return existing;

    return repo.save(
      repo.create({
        userId,
        battleClass: null,
        focus: 10,
        inspiration: 10,
        mindset: 10,
        slacking: 10,
        execution: 10,
        wins: 0,
        losses: 0,
      }),
    );
  }

  private async getOrCreateOffers(
    manager: EntityManager,
    userId: string,
    profile: ArenaProfile,
    assets: PlatformAssetState,
    now: Date,
  ): Promise<ArenaOpponentOffer[]> {
    const repo = manager.getRepository(ArenaOpponentOffer);
    const candidates = await repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 24,
    });
    const valid = candidates.filter(
      (offer) =>
        offer.consumedAt === null &&
        offer.expiresAt.getTime() > now.getTime(),
    );
    const byTier = new Map<ArenaOpponentTier, ArenaOpponentOffer>();
    for (const offer of valid) {
      if (!byTier.has(offer.tier)) {
        byTier.set(offer.tier, offer);
      }
    }
    if (TIERS.every((tier) => byTier.has(tier))) {
      return TIERS.map((tier) => byTier.get(tier)!);
    }

    const expiresAt = new Date(
      now.getTime() + ARENA_OFFER_TTL_MILLISECONDS,
    );
    const created = TIERS.map((tier) => {
      const opponentLevel = this.clampLevel(
        assets.progression.level + TIER_LEVEL_OFFSET[tier],
      );
      const opponentName = this.opponentName(
        userId,
        tier,
        now,
      );
      return repo.create({
        userId,
        tier,
        opponentName,
        opponentLevel,
        opponentSnapshot: this.opponentSnapshot(
          userId,
          tier,
          opponentName,
          opponentLevel,
          profile,
          now,
        ),
        expiresAt,
        consumedAt: null,
      });
    });
    return repo.save(created);
  }

  private async readRecentBattles(
    manager: EntityManager,
    userId: string,
  ): Promise<ArenaBootstrapResponse['recentBattles']> {
    const battles = await manager.getRepository(ArenaBattle).find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 5,
    });
    return battles.map((battle) => ({
      id: battle.id,
      result: battle.result,
      opponentName:
        battle.opponentSnapshot.displayName ?? '神秘工位对手',
      createdAt: battle.createdAt.toISOString(),
    }));
  }

  /**
   * 三档邀约是一组“三选一”。users 行已由 PlatformAssetsService 锁定，因此
   * 同一用户无法并行消费两个旧 ID；结算时将当前仍有效的整组邀约一起失效。
   */
  private async consumeCurrentOfferSet(
    manager: EntityManager,
    userId: string,
    now: Date,
  ): Promise<void> {
    const repo = manager.getRepository(ArenaOpponentOffer);
    const offers = await repo.find({ where: { userId } });
    const current = offers.filter(
      (offer) =>
        offer.consumedAt === null &&
        offer.expiresAt.getTime() > now.getTime(),
    );
    for (const offer of current) {
      offer.consumedAt = now;
    }
    if (current.length > 0) {
      await repo.save(current);
    }
  }

  private toProfileResponse(
    profile: ArenaProfile,
    assets: PlatformAssetState,
  ): ArenaBootstrapResponse['profile'] {
    return {
      level: assets.progression.level,
      title: assets.profile.title,
      energy: assets.energy.balance,
      energyCap: assets.energy.capacity,
      battleClass: profile.battleClass,
      attributes: this.profileAttributes(profile),
    };
  }

  private toOfferResponse(
    offer: ArenaOpponentOffer,
  ): ArenaBootstrapResponse['offers'][number] {
    return {
      id: offer.id,
      tier: offer.tier,
      opponentName: offer.opponentName,
      opponentLevel: offer.opponentLevel,
      power: this.fighterPower(offer.opponentSnapshot),
      expiresAt: offer.expiresAt.toISOString(),
    };
  }

  private toBattleResponse(
    battle: ArenaBattle,
    energy: number,
  ): ArenaBattleResponse {
    const reward = battle.rewardSnapshot;
    return {
      battle: {
        id: battle.id,
        winnerSide:
          battle.battleLog.winnerSide === 'attacker'
            ? 'player'
            : 'opponent',
        result: battle.result,
        roundsPlayed: battle.battleLog.roundsPlayed,
        logs: battle.battleLog.logs.map((entry) => ({
          round: entry.round,
          text: this.battleLogText(
            entry,
            battle.attackerSnapshot,
            battle.opponentSnapshot,
          ),
        })),
      },
      reward: {
        experience: reward.experience ?? 0,
        currencies: {
          officeCoin: reward.currencies?.office_coin ?? 0,
        },
      },
      energy,
    };
  }

  private playerSnapshot(
    userId: string,
    profile: ArenaProfile,
    assets: PlatformAssetState,
  ): ArenaFighterSnapshot {
    return {
      id: userId,
      displayName:
        assets.profile.nickname ?? assets.profile.title ?? '打工人',
      attributes: this.profileAttributes(profile),
    };
  }

  private opponentSnapshot(
    userId: string,
    tier: ArenaOpponentTier,
    displayName: string,
    opponentLevel: number,
    profile: ArenaProfile,
    now: Date,
  ): ArenaFighterSnapshot {
    const scale = TIER_ATTRIBUTE_SCALE[tier];
    const bucket = Math.floor(
      now.getTime() / ARENA_OFFER_TTL_MILLISECONDS,
    );
    const jitter = this.hashNumber(
      `${userId}:${bucket}:attributes`,
    );
    const source = this.profileAttributes(profile);
    const keys = Object.keys(source) as Array<keyof ArenaAttributes>;
    const attributes = {} as ArenaAttributes;
    keys.forEach((key, index) => {
      const offset = ((jitter >>> (index * 4)) & 0x7) - 3;
      attributes[key] = Math.max(
        1,
        Math.round(source[key] * scale + offset),
      );
    });
    return {
      id: `npc:${tier}:${opponentLevel}:${bucket}`,
      displayName,
      attributes,
    };
  }

  private profileAttributes(profile: ArenaProfile): ArenaAttributes {
    return {
      focus: profile.focus,
      inspiration: profile.inspiration,
      mindset: profile.mindset,
      slacking: profile.slacking,
      execution: profile.execution,
    };
  }

  private fighterPower(snapshot: ArenaFighterSnapshot): number {
    const stats = deriveArenaStats(snapshot);
    return Math.round(
      stats.maxHealth +
        stats.attack * 12 +
        stats.defense * 8 +
        stats.initiative * 5 +
        stats.criticalRate * 500 +
        stats.dodgeRate * 500,
    );
  }

  private battleLogText(
    entry: ArenaBattleLogEntry,
    attacker: ArenaFighterSnapshot,
    opponent: ArenaFighterSnapshot,
  ): string {
    const actor =
      entry.actorSide === 'attacker'
        ? attacker.displayName ?? '你'
        : opponent.displayName ?? '对手';
    const target =
      entry.targetSide === 'attacker'
        ? attacker.displayName ?? '你'
        : opponent.displayName ?? '对手';
    if (entry.dodged) {
      return `${target}识破了${actor}的工位攻势，轻松闪过。`;
    }
    return `${actor}${entry.critical ? '灵感爆发，' : ''}让${target}损失 ${entry.damage} 点状态。`;
  }

  private opponentName(
    userId: string,
    tier: ArenaOpponentTier,
    now: Date,
  ): string {
    const names = OPPONENT_NAMES[tier];
    const bucket = Math.floor(
      now.getTime() / ARENA_OFFER_TTL_MILLISECONDS,
    );
    return names[this.hashNumber(`${userId}:${tier}:${bucket}`) % names.length];
  }

  private battleSeed(
    battleId: string,
    userId: string,
    offerId: string,
  ): string {
    return createHash('sha256')
      .update(`${ARENA_ENGINE_VERSION}:${battleId}:${userId}:${offerId}`)
      .digest('hex');
  }

  private hashNumber(value: string): number {
    return createHash('sha256').update(value).digest().readUInt32BE(0);
  }

  private cloneReward(reward: Readonly<RewardSnapshot>): RewardSnapshot {
    return {
      experience: reward.experience,
      currencies: { ...(reward.currencies ?? {}) },
    };
  }

  private clampLevel(level: number): number {
    return Math.min(100, Math.max(1, level));
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

  private requiredUuid(value: string, field: string): string {
    if (
      typeof value !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      )
    ) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        field,
      });
    }
    return value;
  }
}
