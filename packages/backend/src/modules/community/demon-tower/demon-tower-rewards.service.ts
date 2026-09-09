import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import type { DemonTowerContributions, DemonTowerLeaderboard, DemonTowerLeaderboardEntry } from '@stealth-reader/shared';
import { DataSource, EntityManager } from 'typeorm';
import { DemonTowerContribution, DemonTowerDailyAward, DemonTowerDailyProgress, User } from '../../../database/entities';
import { PlatformAssetsService } from '../../platform/platform-assets.service';
import { PLATFORM_CLOCK, systemPlatformClock, type PlatformClock } from '../../platform/platform.constants';
import { toBusinessLocalDate } from '../../platform/platform-time';
import { NotificationService } from '../notification.service';
import { assertDemonTowerWrites, DEMON_TOWER_CHAMPION_COINS, DEMON_TOWER_RANKING_RULES, demonTowerDate, demonTowerFloor, demonTowerWritesEnabled } from './demon-tower.rules';

@Injectable()
export class DemonTowerRewardsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DemonTowerRewardsService.name);
  private timer?: ReturnType<typeof setInterval>;
  private settling = false;
  constructor(
    private readonly db: DataSource,
    private readonly assets: PlatformAssetsService,
    private readonly notifications: NotificationService,
    @Inject(PLATFORM_CLOCK) private readonly clock: PlatformClock = systemPlatformClock,
  ) {}
  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => { void this.settleDue(); }, 30_000);
    this.timer.unref();
  }
  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }

  async leaderboard(rawDate?: string, userId?: string | null): Promise<DemonTowerLeaderboard> {
    if (userId) await this.activeReader(userId);
    const now = this.clock.now();
    const serviceDate = demonTowerDate(rawDate, now);
    const rows = await this.ranking(this.db.manager, serviceDate).take(50).getMany();
    const award = await this.db.getRepository(DemonTowerDailyAward).findOne({ where: { serviceDate }, relations: ['winner'] });
    const entries = rows.map((row, index) => this.entry(row, index + 1));
    let me = userId ? entries.find((entry) => rows[entry.rank - 1].userId === userId) ?? null : null;
    if (userId && !me) {
      const own = await this.ranking(this.db.manager, serviceDate).andWhere('score.user_id = :userId', { userId }).getOne();
      if (own) {
        const ahead = await this.ranking(this.db.manager, serviceDate).andWhere('(score.boss_damage > :damage OR (score.boss_damage = :damage AND score.achieved_at < :at) OR (score.boss_damage = :damage AND score.achieved_at = :at AND score.user_id < :userId))', { damage: own.bossDamage, at: own.achievedAt, userId }).getCount();
        me = this.entry(own, ahead + 1);
      }
    }
    return {
      serverNow: now.getTime(), serviceDate, entries, me, rewardDescription: DEMON_TOWER_RANKING_RULES,
      award: {
        officeCoins: award?.coins ?? 0,
        status: award ? award.coins > 0 ? 'awarded' : 'no_eligible_player' : serviceDate < toBusinessLocalDate(now) && rows.length === 0 ? 'no_eligible_player' : 'pending',
        winnerPublicId: award?.winner?.accountStatus === 'active' ? award.winner.publicId : null,
      },
    };
  }

  async contributions(rawFloor?: unknown, userId?: string | null): Promise<DemonTowerContributions> {
    if (userId) await this.activeReader(userId);
    const floor = demonTowerFloor(rawFloor);
    const base = () => this.db.getRepository(DemonTowerContribution).createQueryBuilder('score').innerJoinAndSelect('score.user', 'user')
      .where('score.floor = :floor', { floor }).andWhere('user.account_status = :status', { status: 'active' })
      .andWhere('(score.boss_damage > 0 OR score.passage_contribution > 0)')
      .orderBy('score.bossDamage', 'DESC').addOrderBy('score.passageContribution', 'DESC').addOrderBy('score.userId', 'ASC');
    const rows = await base().take(50).getMany();
    const entries = rows.map((row, index) => this.entry(row, index + 1));
    let me = userId ? entries.find((entry) => rows[entry.rank - 1].userId === userId) ?? null : null;
    if (userId && !me) {
      const own = await base().andWhere('score.user_id = :userId', { userId }).getOne();
      if (own) {
        const ahead = await base().andWhere('(score.boss_damage > :damage OR (score.boss_damage = :damage AND score.passage_contribution > :passage) OR (score.boss_damage = :damage AND score.passage_contribution = :passage AND score.user_id < :userId))', { damage: own.bossDamage, passage: own.passageContribution, userId }).getCount();
        me = this.entry(own, ahead + 1);
      }
    }
    return { serverNow: this.clock.now().getTime(), floor, entries, me, rewardDescription: '本层累计有效首领伤害与通道建设贡献，仅展示活跃账号。建设不折算日榜伤害，不单独重复发放办公币。' };
  }

  async settleDue(): Promise<void> {
    if (this.settling || !demonTowerWritesEnabled()) return;
    this.settling = true;
    try {
      const cutoff = toBusinessLocalDate(new Date(this.clock.now().getTime() - 300_000));
      const pending = await this.db.getRepository(DemonTowerDailyProgress).createQueryBuilder('score')
        .select('CAST(score.service_date AS text)', 'serviceDate')
        .leftJoin(DemonTowerDailyAward, 'award', 'award.service_date = score.service_date')
        .where('score.service_date < :cutoff', { cutoff }).andWhere('award.service_date IS NULL')
        .groupBy('score.service_date').orderBy('score.service_date', 'ASC').limit(30)
        .getRawMany<{ serviceDate: string }>();
      for (const row of pending) {
        try { await this.settleDay(row.serviceDate); }
        catch { this.logger.warn(`Demon tower daily reward deferred for ${row.serviceDate}; retained for retry.`); }
      }
    } catch { this.logger.warn('Demon tower daily reward scan deferred; retained for retry.'); }
    finally { this.settling = false; }
  }

  async settleDay(rawDate: string): Promise<boolean> {
    const date = demonTowerDate(rawDate, this.clock.now());
    if (!demonTowerWritesEnabled() || !this.pastCutoff(date)) return false;
    try {
      return await this.db.transaction(async (manager) => {
        if (await manager.getRepository(DemonTowerDailyAward).exist({ where: { serviceDate: date } })) return false;
        const candidates = await this.ranking(manager, date).getMany();
        let winner: { user: User; score: DemonTowerDailyProgress } | null = null;
        for (const candidate of candidates) {
          // User first, just like account lifecycle and normal game commands. Never award-lock → user-lock.
          const user = await manager.getRepository(User).createQueryBuilder('user')
            .where('user.id = :id AND user.account_status = :status', { id: candidate.userId, status: 'active' })
            .setLock('for_no_key_update').getOne();
          if (user?.accountStatus === 'active') { winner = { user, score: candidate }; break; }
        }
        if (!demonTowerWritesEnabled() || !this.pastCutoff(date)) return false;
        const now = this.clock.now();
        // INSERT is the cross-process arbiter. The losing transaction must not overwrite or credit anything.
        await manager.getRepository(DemonTowerDailyAward).insert({ serviceDate: date, winnerUserId: winner?.user.id ?? null, bossDamage: winner?.score.bossDamage ?? 0, coins: winner ? DEMON_TOWER_CHAMPION_COINS : 0, awardedAt: now });
        assertDemonTowerWrites();
        if (!winner) return true;
        await this.assets.grantReward(manager, {
          userId: winner.user.id, sourceType: 'demon_tower_daily_champion', sourceId: date, ruleKey: 'demon-tower-daily-champion-v1',
          reward: { currencies: { office_coin: DEMON_TOWER_CHAMPION_COINS } },
        });
        await this.notifications.create(manager, {
          userId: winner.user.id, actorUserId: null, category: 'system', eventType: 'demon_tower_daily_champion',
          title: '九层妖塔日榜第一名', summary: `${date} 有效首领伤害 ${winner.score.bossDamage}，奖励100办公币已到账。`,
          resourceType: 'game_leaderboard', resourceId: null, resourcePath: `/games/demon-tower/leaderboard?date=${date}`,
          dedupeKey: `demon_tower_daily_champion:${date}`,
        });
        assertDemonTowerWrites();
        return true;
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505' && await this.db.getRepository(DemonTowerDailyAward).exist({ where: { serviceDate: date } })) return false;
      throw error;
    }
  }

  private pastCutoff(date: string): boolean { return date < toBusinessLocalDate(new Date(this.clock.now().getTime() - 300_000)); }
  private async activeReader(userId: string): Promise<void> {
    if (!await this.db.getRepository(User).exist({ where: { id: userId, accountStatus: 'active' } })) throw new UnauthorizedException({ code: 'DEMON_TOWER_ACTIVE_ACCOUNT_REQUIRED' });
  }
  private ranking(manager: EntityManager, date: string) {
    return manager.getRepository(DemonTowerDailyProgress).createQueryBuilder('score').innerJoinAndSelect('score.user', 'user')
      .where('score.service_date = :date', { date }).andWhere('score.boss_damage > 0 AND user.account_status = :status', { status: 'active' })
      .orderBy('score.bossDamage', 'DESC').addOrderBy('score.achievedAt', 'ASC').addOrderBy('score.userId', 'ASC');
  }
  private entry(row: DemonTowerDailyProgress | DemonTowerContribution, rank: number): DemonTowerLeaderboardEntry {
    return { rank, publicId: row.user.publicId, displayName: (row.user.displayName || row.user.username || '同事').slice(0, 80), level: row.level, bossDamage: row.bossDamage, passageContribution: row.passageContribution, score: row.bossDamage };
  }
}
