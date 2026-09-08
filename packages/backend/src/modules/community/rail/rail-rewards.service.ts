import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { RAIL_DAILY_CHAMPION_COINS, type RailLeaderboard, type RailPersonalStats } from '@stealth-reader/shared';
import { RailDailyAward, RailDailyScore, RailPlayerStats, User } from '../../../database/entities';
import { PlatformAssetsService } from '../../platform/platform-assets.service';
import { toBusinessLocalDate } from '../../platform/platform-time';
import { communityWritesEnabled } from '../community-write-gate';
import { NotificationService } from '../notification.service';
import { RAIL_RANKING_RULES, RAIL_REWARD_RULES, railPerson } from './rail.rules';

/** One strict claim per date, wallet credit and notification in the same transaction. */
@Injectable()
export class RailRewardsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RailRewardsService.name);
  private timer?: ReturnType<typeof setInterval>;
  private settling = false;
  constructor(private readonly db: DataSource, private readonly assets: PlatformAssetsService, private readonly notifications: NotificationService) {}
  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => { void this.settleDue(); }, 30_000);
    this.timer.unref();
  }
  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }
  async me(userId: string): Promise<RailPersonalStats> {
    if (!await this.db.getRepository(User).exist({ where: { id: userId, accountStatus: 'active' } })) throw new UnauthorizedException({ code: 'RAIL_ACTIVE_ACCOUNT_REQUIRED' });
    const stats = await this.db.getRepository(RailPlayerStats).findOneBy({ userId });
    return {
      completedGames: stats?.completedGames ?? 0, survived: stats?.survived ?? 0, eligibleRounds: stats?.eligibleRounds ?? 0,
      rateBasisPoints: stats?.eligibleRounds ? Math.floor(stats.survived * 10_000 / stats.eligibleRounds) : 0,
      demonTotal: stats?.demonTotal ?? 0, demonMvpCount: stats?.demonMvpCount ?? 0, rankedGames: stats?.rankedGames ?? 0,
    };
  }
  async leaderboard(rawDate?: string): Promise<RailLeaderboard> {
    const today = toBusinessLocalDate(new Date());
    const date = this.date(rawDate === undefined ? today : rawDate, today);
    const scores = await this.ranking(this.db.manager, date).take(50).getMany();
    const award = await this.db.getRepository(RailDailyAward).findOne({ where: { serviceDate: date }, relations: ['winner'] });
    return {
      date, items: scores.map((score, index) => ({
        ...railPerson(score.user), rank: index + 1, survived: score.survived, eligibleRounds: score.eligibleRounds,
        rateBasisPoints: score.rateBasisPoints, demonTotal: score.demonTotal, achievedAt: score.achievedAt.toISOString(),
      })),
      dailyChampionCoins: RAIL_DAILY_CHAMPION_COINS, rules: `${RAIL_RANKING_RULES} ${RAIL_REWARD_RULES}`,
      award: { status: award ? award.coins > 0 ? 'awarded' : 'no_eligible_score' : date < today && scores.length === 0 ? 'no_eligible_score' : 'pending', winner: award?.winner ? railPerson(award.winner) : null, coins: award?.coins ?? 0, awardedAt: award?.awardedAt.toISOString() ?? null },
    };
  }
  async settleDue(): Promise<void> {
    if (this.settling || !communityWritesEnabled()) return;
    this.settling = true;
    try {
      const cutoff = toBusinessLocalDate(new Date(Date.now() - 300_000));
      const pending = await this.db.getRepository(RailDailyScore).createQueryBuilder('score')
        .select('CAST(score.service_date AS text)', 'serviceDate')
        .leftJoin(RailDailyAward, 'award', 'award.service_date = score.service_date')
        .where('score.service_date < :cutoff', { cutoff }).andWhere('award.service_date IS NULL')
        .groupBy('score.service_date').orderBy('score.service_date', 'ASC').limit(30).getRawMany<{ serviceDate: string }>();
      for (const row of pending) {
        try { await this.settleDay(row.serviceDate); }
        catch { this.logger.warn(`Rail reward deferred for ${row.serviceDate}; retained for retry.`); }
      }
    } catch { this.logger.warn('Rail daily reward scan deferred; retained for retry.'); }
    finally { this.settling = false; }
  }
  async settleDay(rawDate: string): Promise<boolean> {
    const today = toBusinessLocalDate(new Date());
    const date = this.date(rawDate, today);
    if (!communityWritesEnabled() || date >= toBusinessLocalDate(new Date(Date.now() - 300_000))) return false;
    try {
      return await this.db.transaction(async (manager) => {
        if (await manager.getRepository(RailDailyAward).exist({ where: { serviceDate: date } })) return false;
        const now = new Date();
        await manager.getRepository(RailDailyAward).insert({ serviceDate: date, winnerUserId: null, rateBasisPoints: 0, coins: 0, awardedAt: now });
        const candidates = await this.ranking(manager, date).getMany();
        for (const candidate of candidates) {
          const user = await manager.getRepository(User).createQueryBuilder('user')
            .where('user.id = :id AND user.account_status = :status', { id: candidate.userId, status: 'active' }).setLock('for_no_key_update').getOne();
          if (!user || user.accountStatus !== 'active') continue;
          await this.assets.grantReward(manager, {
            userId: user.id, sourceType: 'rail_daily_champion', sourceId: date, ruleKey: 'rail-daily-champion-v1',
            reward: { currencies: { office_coin: RAIL_DAILY_CHAMPION_COINS } },
          });
          await manager.getRepository(RailDailyAward).update({ serviceDate: date }, { winnerUserId: user.id, rateBasisPoints: candidate.rateBasisPoints, coins: RAIL_DAILY_CHAMPION_COINS });
          await this.notifications.create(manager, {
            userId: user.id, actorUserId: null, category: 'system', eventType: 'rail_daily_champion',
            title: '轨道难题日榜第一名', summary: `${date} 日榜生存率 ${(candidate.rateBasisPoints / 100).toFixed(2)}%，奖励 ${RAIL_DAILY_CHAMPION_COINS} 办公币已到账。`,
            resourceType: 'game_leaderboard', resourceId: null, resourcePath: `/games/rail/leaderboard?date=${date}`, dedupeKey: `rail_daily_champion:${date}`,
          });
          return true;
        }
        return true;
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505' && await this.db.getRepository(RailDailyAward).exist({ where: { serviceDate: date } })) return false;
      throw error;
    }
  }
  private date(value: string, latest: string): string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value || value > latest) throw new BadRequestException({ code: 'RAIL_DATE_INVALID' });
    return value;
  }
  private ranking(manager: EntityManager, date: string) {
    return manager.getRepository(RailDailyScore).createQueryBuilder('score').innerJoinAndSelect('score.user', 'user')
      .where('score.service_date = :date', { date }).andWhere('score.rate_basis_points > 0 AND user.account_status = :active', { active: 'active' })
      .orderBy('score.rateBasisPoints', 'DESC').addOrderBy('score.achievedAt', 'ASC').addOrderBy('score.userId', 'ASC');
  }
}
