import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { PLAY_DAILY_CHAMPION_COINS, PLAY_GAME_NAMES, type ArcadeGameKey, type PlayLeaderboard, type PlayOfficeCoinLeaderboard } from '@stealth-reader/shared';
import { PlayDailyAward, PlayDailyScore, User, WalletBalance } from '../../../database/entities';
import { PlatformAssetsService } from '../../platform/platform-assets.service';
import { toBusinessLocalDate } from '../../platform/platform-time';
import { communityWritesEnabled } from '../community-write-gate';
import { NotificationService } from '../notification.service';
import { person, RANKING_RULES, REWARD_RULES } from './play.rules';

/** Prize rows, wallet ledger and notification commit together; replicas race on a strict INSERT. */
@Injectable()
export class PlayRewardsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlayRewardsService.name);
  private timer?: ReturnType<typeof setInterval>;
  private settling = false;
  constructor(private readonly db: DataSource, private readonly assets: PlatformAssetsService, private readonly notifications: NotificationService) {}
  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => { void this.settleDue(); }, 30_000);
    this.timer.unref();
  }
  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }

  async officeCoins(userId: string): Promise<PlayOfficeCoinLeaderboard> {
    const user = await this.db.getRepository(User).findOneBy({ id: userId, accountStatus: 'active' });
    if (!user) throw new UnauthorizedException({ code: 'PLAY_ACTIVE_ACCOUNT_REQUIRED' });
    const base = () => this.db.getRepository(User).createQueryBuilder('user')
      .leftJoin(WalletBalance, 'wallet', "wallet.user_id = user.id AND wallet.currency = 'office_coin'")
      .where('user.account_status = :active', { active: 'active' });
    const rows = await base().select('user.public_id', 'publicId').addSelect('user.username', 'username')
      .addSelect('user.display_name', 'displayName').addSelect('COALESCE(wallet.balance, 0)', 'balance')
      .orderBy('COALESCE(wallet.balance, 0)', 'DESC').addOrderBy('user.public_id', 'ASC').limit(50)
      .getRawMany<{ publicId: string; username: string | null; displayName: string | null; balance: string }>();
    const own = await this.db.getRepository(WalletBalance).findOneBy({ userId, currency: 'office_coin' });
    const balance = this.balanceNumber(own?.balance ?? '0');
    const ahead = await base().andWhere('(COALESCE(wallet.balance, 0) > :balance OR (COALESCE(wallet.balance, 0) = :balance AND user.public_id < :publicId))', { balance: String(balance), publicId: user.publicId }).getCount();
    return {
      items: rows.map((row, index) => ({ publicId: row.publicId, username: row.username, displayName: (row.displayName || row.username || '同事').slice(0, 80), balance: this.balanceNumber(row.balance), rank: index + 1 })),
      me: { rank: ahead + 1, balance }, updatedAt: new Date().toISOString(),
      rules: '按当前办公币余额排序，展示前 50 名活跃账号；同余额按公开账号 ID 稳定排序。消费后排名会变化。余额榜只展示，不发放额外奖励。',
    };
  }
  private balanceNumber(raw: string): number {
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('Invalid wallet balance');
    return value;
  }

  async leaderboard(gameKey: ArcadeGameKey, rawDate?: string): Promise<PlayLeaderboard> {
    const today = toBusinessLocalDate(new Date());
    const date = rawDate ?? today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date || date > today) throw new BadRequestException({ code: 'PLAY_DATE_INVALID' });
    const scores = await this.ranking(this.db.manager, date, gameKey).take(50).getMany();
    const award = await this.db.getRepository(PlayDailyAward).findOne({ where: { serviceDate: date, gameKey }, relations: ['winner'] });
    return {
      gameKey, date, items: scores.map((row, index) => ({ ...person(row.user), rank: index + 1, score: row.score, mode: row.mode, achievedAt: row.achievedAt.toISOString() })),
      award: { status: award ? award.coins > 0 ? 'awarded' : 'no_eligible_score' : date < today && scores.length === 0 ? 'no_eligible_score' : 'pending', winner: award?.winner ? person(award.winner) : null, coins: award?.coins ?? 0, awardedAt: award?.awardedAt.toISOString() ?? null },
      rules: `${RANKING_RULES} ${REWARD_RULES}`, dailyChampionCoins: PLAY_DAILY_CHAMPION_COINS,
    };
  }

  async settleDue(): Promise<void> {
    if (this.settling || !communityWritesEnabled()) return;
    this.settling = true;
    try {
      // Until 00:05 local, yesterday stays open for settlement (not for additional scores).
      const cutoff = toBusinessLocalDate(new Date(Date.now() - 5 * 60_000));
      const pending = await this.db.getRepository(PlayDailyScore).createQueryBuilder('score')
        .select('CAST(score.service_date AS text)', 'serviceDate').addSelect('score.game_key', 'gameKey')
        .leftJoin(PlayDailyAward, 'award', 'award.service_date = score.service_date AND award.game_key = score.game_key')
        .where('score.service_date < :cutoff', { cutoff }).andWhere('award.service_date IS NULL')
        .groupBy('score.service_date').addGroupBy('score.game_key').orderBy('score.service_date', 'ASC').limit(30)
        .getRawMany<{ serviceDate: string; gameKey: ArcadeGameKey }>();
      for (const row of pending) {
        try { await this.settleDay(row.serviceDate, row.gameKey); }
        catch {
          // Each award owns a separate transaction. A failed award stays pending
          // for the next scan and must not starve unrelated games or dates.
          this.logger.warn(`Daily game reward deferred for ${row.serviceDate}/${row.gameKey}; retained for retry without duplicate credit.`);
        }
      }
    } catch {
      this.logger.warn('Daily game reward scan deferred; will retry without duplicate credit.');
    } finally { this.settling = false; }
  }

  async settleDay(date: string, gameKey: ArcadeGameKey): Promise<boolean> {
    if (!communityWritesEnabled() || date >= toBusinessLocalDate(new Date(Date.now() - 300_000))) return false;
    try {
      return await this.db.transaction(async (manager) => {
        if (await manager.getRepository(PlayDailyAward).exist({ where: { serviceDate: date, gameKey } })) return false;
        const now = new Date();
        // Do not use save/upsert: a concurrent loser must roll back, never overwrite a winner's claim.
        await manager.getRepository(PlayDailyAward).insert({ serviceDate: date, gameKey, winnerUserId: null, score: 0, coins: 0, awardedAt: now });
        const candidates = await this.ranking(manager, date, gameKey).getMany();
        for (const candidate of candidates) {
          const user = await manager.getRepository(User).createQueryBuilder('user').where('user.id = :id AND user.account_status = :status', { id: candidate.userId, status: 'active' }).setLock('for_no_key_update').getOne();
          if (!user || user.accountStatus !== 'active') continue;
          const sourceId = `${date}:${gameKey}`;
          await this.assets.grantReward(manager, {
            userId: user.id, sourceType: 'arcade_daily_champion', sourceId, ruleKey: 'arcade-daily-champion-v1',
            reward: { currencies: { office_coin: PLAY_DAILY_CHAMPION_COINS } },
          });
          await manager.getRepository(PlayDailyAward).update({ serviceDate: date, gameKey }, { winnerUserId: user.id, score: candidate.score, coins: PLAY_DAILY_CHAMPION_COINS });
          await this.notifications.create(manager, {
            userId: user.id, actorUserId: null, category: 'system', eventType: 'arcade_daily_champion',
            title: `${PLAY_GAME_NAMES[gameKey]}日榜第一名`, summary: `${date} 日榜成绩 ${candidate.score}，奖励 ${PLAY_DAILY_CHAMPION_COINS} 办公币已到账。`,
            resourceType: 'game_leaderboard', resourceId: null, resourcePath: `/games/leaderboards/${gameKey}?date=${date}`, dedupeKey: `arcade_daily_champion:${sourceId}`,
          });
          return true;
        }
        return true; // No eligible active player: a zero-coin terminal claim.
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505' && await this.db.getRepository(PlayDailyAward).exist({ where: { serviceDate: date, gameKey } })) return false;
      throw error;
    }
  }

  private ranking(manager: EntityManager, date: string, gameKey: ArcadeGameKey) {
    return manager.getRepository(PlayDailyScore).createQueryBuilder('score').innerJoinAndSelect('score.user', 'user')
      .where('score.service_date = :date AND score.game_key = :gameKey', { date, gameKey })
      .andWhere('score.score > 0 AND user.account_status = :status', { status: 'active' })
      .orderBy('score.score', 'DESC').addOrderBy('score.achievedAt', 'ASC').addOrderBy('score.userId', 'ASC');
  }
}
