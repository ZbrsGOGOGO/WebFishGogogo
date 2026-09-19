import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ArcadeGameRun, User, WordFrontProgress } from '../../../database/entities';
import { assertCommunityWritesEnabled } from '../community-write-gate';

export const WORD_FRONT_DAILY_MERIT_CAP = 100;
export const WORD_FRONT_PROGRESS_CAP = 1_000_000_000;
export const WORD_FRONT_SHOP = [
  { id: 'ledger_theme', name: '台账主题', cost: 80, description: '已收藏后，V4战场自动启用低调台账配色。' },
  { id: 'changban_badge', name: '长坂徽记', cost: 160, description: '战功档案展示纪念徽记，不增加战力。' },
  { id: 'zhaoyun_frame', name: '子龙头像框', cost: 300, description: '战功档案启用子龙展示框，不进入战斗数值。' },
] as const;

export const wordFrontServiceDate = (now = new Date()): string => new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);

@Injectable()
export class WordFrontProgressService {
  constructor(private readonly db: DataSource) {}

  private async active(id: string): Promise<User> {
    const user = await this.db.getRepository(User).findOneBy({ id });
    if (!user || user.accountStatus !== 'active') throw new UnauthorizedException({ code: 'INVALID_SESSION' });
    return user;
  }

  private view(value: WordFrontProgress | null, now = new Date()) {
    const unlocks = value?.unlocks ?? [];
    return {
      merit: value?.merit ?? 0,
      wins: value?.wins ?? 0,
      losses: value?.losses ?? 0,
      dailyEarned: value?.dailyDate === wordFrontServiceDate(now) ? value.dailyEarned : 0,
      dailyCap: WORD_FRONT_DAILY_MERIT_CAP,
      unlocks: [...unlocks],
      shop: WORD_FRONT_SHOP.map(item => ({ ...item, owned: unlocks.includes(item.id) })),
    };
  }

  async get(userId: string) {
    await this.active(userId);
    return this.view(await this.db.getRepository(WordFrontProgress).findOneBy({ userId }));
  }

  async buy(userId: string, raw: unknown) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length !== 1 || typeof (raw as { itemId?: unknown }).itemId !== 'string') {
      throw new BadRequestException({ code: 'WORD_FRONT_SHOP_INVALID' });
    }
    const offer = WORD_FRONT_SHOP.find(item => item.id === (raw as { itemId: string }).itemId);
    if (!offer) throw new BadRequestException({ code: 'WORD_FRONT_SHOP_INVALID' });
    assertCommunityWritesEnabled();
    return this.db.transaction(async manager => {
      // The account lock serializes the first insert as well as later purchases.
      const user = await manager.getRepository(User).findOne({ where: { id: userId }, lock: { mode: 'pessimistic_write' } });
      if (!user || user.accountStatus !== 'active') throw new UnauthorizedException({ code: 'INVALID_SESSION' });
      const repo = manager.getRepository(WordFrontProgress);
      let value = await repo.findOne({ where: { userId }, lock: { mode: 'pessimistic_write' } });
      const now = new Date();
      value ??= repo.create({ userId, merit: 0, wins: 0, losses: 0, dailyDate: wordFrontServiceDate(now), dailyEarned: 0, unlocks: [], updatedAt: now });
      if (value.unlocks.includes(offer.id)) throw new BadRequestException({ code: 'WORD_FRONT_ITEM_OWNED' });
      if (value.merit < offer.cost) throw new BadRequestException({ code: 'WORD_FRONT_MERIT_REQUIRED' });
      value.merit -= offer.cost;
      value.unlocks = [...value.unlocks, offer.id];
      value.updatedAt = now;
      return this.view(await repo.save(value), now);
    });
  }

  async balance(userId: string) {
    const user = await this.active(userId);
    if (user.communityRole !== 'admin') throw new ForbiddenException({ code: 'ADMIN_ACCESS_REQUIRED' });
    const rows = await this.db.getRepository(ArcadeGameRun).createQueryBuilder('run')
      .select("run.metrics->>'chapter'", 'map')
      .addSelect("run.metrics->>'outcome'", 'outcome')
      .addSelect('COUNT(*)::int', 'runs')
      .addSelect("ROUND(AVG((run.metrics->>'wave')::numeric), 1)", 'averageWave')
      .where("run.game_key IN ('word_story_v4','word_endless_v4')")
      .andWhere("run.status = 'completed'")
      .andWhere("run.completed_at >= now() - interval '30 days'")
      .andWhere("run.metrics->>'wave' ~ '^[0-9]+$'")
      .andWhere("run.metrics->>'outcome' IN ('won','lost')")
      .groupBy("run.metrics->>'chapter'")
      .addGroupBy("run.metrics->>'outcome'")
      .orderBy('map', 'ASC')
      .getRawMany();
    return { periodDays: 30, generatedAt: new Date().toISOString(), rows };
  }
}
