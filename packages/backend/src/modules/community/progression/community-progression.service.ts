import { BadRequestException, ConflictException, Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { COMMUNITY_ACHIEVEMENTS, OFFICE_COLLECTION, type CommunityAchievementMetric, type CommunityAchievementRefreshReceipt, type CommunityProgressionCatalog, type CommunityProgressionView, type CommunityTitleInput, type CommunityTitleReceipt } from '@stealth-reader/shared';
import { CommunityAchievementUnlock, CommunityUserPresentation } from '../../../database/entities/community-progression.entity';
import { DeskPlant } from '../../../database/entities/desk-plant.entity';
import { PlayerProgression } from '../../../database/entities/player-progression.entity';
import { RailDailyAward, RailPlayerStats } from '../../../database/entities/rail-room.entity';
import { PlayDailyAward } from '../../../database/entities/play-room.entity';
import { DevelopmentRequest } from '../../../database/entities/development.entity';
import { User } from '../../../database/entities/user.entity';
import { COMMUNITY_CLOCK, type CommunityClock } from '../community-clock';
import { assertCommunityWritesEnabled, communityWritesEnabled } from '../community-write-gate';
import { MembershipService, communityProgressionEnabled } from './membership.service';
import { titleBadge } from './title-projection';
import { readFishProgress } from './fish-growth.service';
import { supportTotals } from './support-ledger.service';

type Metrics = Record<CommunityAchievementMetric, number>;
const safeCount = (value: unknown, cap = 1_000_000_000): number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? Math.min(cap, value) : 0;
const objectValue = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function strictObject(raw: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.getPrototypeOf(raw) !== Object.prototype || Object.keys(raw).length !== keys.length || keys.some((key) => !Object.prototype.hasOwnProperty.call(raw, key)) || Object.keys(raw).some((key) => !keys.includes(key))) throw new BadRequestException({ code: 'PROGRESSION_REQUEST_INVALID' });
  return raw as Record<string, unknown>;
}

@Injectable()
export class CommunityProgressionService {
  constructor(private readonly db: DataSource, private readonly membership: MembershipService, @Inject(COMMUNITY_CLOCK) private readonly clock: CommunityClock) {}

  catalog(): CommunityProgressionCatalog {
    return { enabled: communityProgressionEnabled(), achievements: COMMUNITY_ACHIEVEMENTS,
      membership: { giftDays: 30, automaticRenewal: false, paid: false, benefit: null, existingAccountsOnly: true },
      historicalDataNotice: '成就依据服务器保留的真实记录回补；解锁时间是本次确认时间。旧版妖塔成就已冻结，只保留既有解锁，不读取新源码版存档补发。称号仅装饰，不发币或增加管理权限。' };
  }
  async me(userId: string): Promise<CommunityProgressionView> {
    return this.db.transaction(async (manager) => { await this.active(manager, userId, false); return this.view(manager, userId, this.clock.now()); });
  }
  async refresh(userId: string, raw: unknown): Promise<CommunityAchievementRefreshReceipt> {
    strictObject(raw, []); this.assertWrites();
    return this.db.transaction(async (manager) => {
      await this.active(manager, userId, true); this.assertWrites(); const now = this.clock.now();
      const metrics = await this.metrics(manager, userId);
      const newlyUnlocked = await this.sync(manager, userId, metrics, now);
      return { newlyUnlocked, overview: await this.view(manager, userId, now, metrics) };
    });
  }
  async equip(userId: string, raw: unknown): Promise<CommunityTitleReceipt> {
    const input = this.input(raw); this.assertWrites();
    const requestHash = createHash('sha256').update(JSON.stringify({ expectedVersion: input.expectedVersion, titleKey: input.titleKey })).digest('hex');
    return this.db.transaction(async (manager) => {
      await this.active(manager, userId, true); this.assertWrites(); const now = this.clock.now();
      const repo = manager.getRepository(CommunityUserPresentation);
      const previous = await repo.createQueryBuilder('presentation').addSelect(['presentation.lastRequestId', 'presentation.lastRequestHash']).where('presentation.user_id = :id', { id: userId }).getOne();
      if (previous?.lastRequestId === input.requestId) {
        if (previous.lastRequestHash !== requestHash) throw new ConflictException({ code: 'PROGRESSION_IDEMPOTENCY_CONFLICT' });
        return { requestId: input.requestId, replayed: true, overview: await this.view(manager, userId, now) };
      }
      if ((previous?.version ?? 0) !== input.expectedVersion) throw new ConflictException({ code: 'PROGRESSION_VERSION_CONFLICT', currentVersion: previous?.version ?? 0 });
      if ((previous?.equippedTitleKey ?? null) === input.titleKey) throw new ConflictException({ code: 'TITLE_UNCHANGED' });
      const metrics = await this.metrics(manager, userId);
      // Validate before writing anything (also preserves no-op behavior on non-transactional test adapters).
      if (input.titleKey !== null) {
        const unlocked = await manager.getRepository(CommunityAchievementUnlock).findOneBy({ userId, achievementKey: input.titleKey });
        const definition = COMMUNITY_ACHIEVEMENTS.find((entry) => entry.key === input.titleKey)!;
        if (!unlocked && metrics[definition.metric] < definition.target) throw new ConflictException({ code: 'TITLE_NOT_UNLOCKED' });
      }
      await this.sync(manager, userId, metrics, now);
      await repo.save(repo.create({ userId, equippedTitleKey: input.titleKey, version: input.expectedVersion + 1, lastRequestId: input.requestId, lastRequestHash: requestHash, updatedAt: now }));
      return { requestId: input.requestId, replayed: false, overview: await this.view(manager, userId, now, metrics) };
    });
  }
  private input(raw: unknown): CommunityTitleInput {
    const value = strictObject(raw, ['requestId', 'expectedVersion', 'titleKey']);
    if (typeof value.requestId !== 'string' || !UUID.test(value.requestId) || typeof value.expectedVersion !== 'number' || !Number.isSafeInteger(value.expectedVersion) || value.expectedVersion < 0 || value.expectedVersion >= 2_147_483_647 || (value.titleKey !== null && (typeof value.titleKey !== 'string' || !COMMUNITY_ACHIEVEMENTS.some((entry) => entry.key === value.titleKey)))) throw new BadRequestException({ code: 'PROGRESSION_REQUEST_INVALID' });
    return { requestId: value.requestId.toLowerCase(), expectedVersion: value.expectedVersion, titleKey: value.titleKey as string | null };
  }
  private assertWrites(): void { if (!communityProgressionEnabled()) throw new ServiceUnavailableException({ code: 'PROGRESSION_DISABLED' }); assertCommunityWritesEnabled(); }
  private async active(manager: EntityManager, userId: string, lock: boolean): Promise<void> {
    const query = manager.getRepository(User).createQueryBuilder('user').where('user.id = :id', { id: userId });
    if (lock) query.setLock('for_no_key_update');
    const user = await query.getOne();
    if (!user || user.accountStatus !== 'active') throw new UnauthorizedException({ code: 'PROGRESSION_ACTIVE_ACCOUNT_REQUIRED' });
  }
  private async sync(manager: EntityManager, userId: string, metrics: Metrics, now: Date): Promise<string[]> {
    const repo = manager.getRepository(CommunityAchievementUnlock);
    const existing = new Set((await repo.findBy({ userId })).map((row) => row.achievementKey));
    const keys = COMMUNITY_ACHIEVEMENTS.filter((item) => metrics[item.metric] >= item.target && !existing.has(item.key)).map((item) => item.key);
    if (keys.length) await repo.createQueryBuilder().insert().values(keys.map((achievementKey) => ({ userId, achievementKey, unlockedAt: now, sourceVersion: 1 }))).orIgnore().execute();
    return keys;
  }
  private async view(manager: EntityManager, userId: string, now: Date, knownMetrics?: Metrics): Promise<CommunityProgressionView> {
    const [metrics, unlocks, presentation, vip, fish, support] = await Promise.all([
      knownMetrics ?? this.metrics(manager, userId), manager.getRepository(CommunityAchievementUnlock).findBy({ userId }),
      manager.getRepository(CommunityUserPresentation).findOneBy({ userId }), this.membership.view(manager, userId, now),
      readFishProgress(manager, userId, now), supportTotals(manager, userId),
    ]);
    const owned = new Map(unlocks.map((row) => [row.achievementKey, row]));
    return { serverNow: now.toISOString(), enabled: communityProgressionEnabled(), writesEnabled: communityProgressionEnabled() && communityWritesEnabled(), vip, fish, support,
      presentation: { version: presentation?.version ?? 0, equippedTitle: presentation?.equippedTitleKey && owned.has(presentation.equippedTitleKey) ? titleBadge(presentation.equippedTitleKey) : null },
      achievements: COMMUNITY_ACHIEVEMENTS.map((item) => ({ key: item.key, progress: owned.has(item.key) ? item.target : Math.min(item.target, metrics[item.metric]), target: item.target, eligible: owned.has(item.key) || metrics[item.metric] >= item.target, unlockedAt: owned.get(item.key)?.unlockedAt.toISOString() ?? null })) };
  }
  private async metrics(manager: EntityManager, userId: string): Promise<Metrics> {
    const [farm, progression, rail, playWins, railWins, development] = await Promise.all([
      manager.getRepository(DeskPlant).findOneBy({ userId }), manager.getRepository(PlayerProgression).findOneBy({ userId }), manager.getRepository(RailPlayerStats).findOneBy({ userId }),
      manager.getRepository(PlayDailyAward).countBy({ winnerUserId: userId, coins: 100 }), manager.getRepository(RailDailyAward).countBy({ winnerUserId: userId, coins: 100 }),
      manager.getRepository(DevelopmentRequest).countBy({ authorId: userId, status: 'done' }),
    ]);
    let workstation: Record<string, unknown> = {};
    let workstationWins = 0;
    if (process.env.FEATURE_WORKSTATION_CAMPAIGN_ENABLED === 'true') {
      const profiles = await manager.query('SELECT promotion_tier,stats FROM tower_defense_profiles WHERE user_id=$1', [userId]);
      workstation = profiles[0] ?? {};
      const awards = await manager.query('SELECT count(*) total FROM tower_defense_daily_awards WHERE user_id=$1 AND coins>0', [userId]);
      workstationWins = Number(awards[0]?.total ?? 0);
    }
    const stats = objectValue(workstation.stats);
    const achievements = new Set(Array.isArray(stats.achievements) ? stats.achievements : []);
    let office: Record<string, unknown> = {};
    if (process.env.FEATURE_OFFICE_HUB_ENABLED === 'true') {
      const profiles = await manager.query('SELECT state FROM office_hub_profiles WHERE user_id=$1', [userId]);
      office = objectValue(profiles[0]?.state);
    }
    const officeStats = objectValue(office.stats), officeOwned = objectValue(office.owned);
    const relief = objectValue(office.relief);
    // Only a retained versioned, server-owned prize flag unlocks each title.
    // A count, display label, another user's record or an unknown key cannot.
    const reliefTitles = new Set(relief.schemaVersion === 1 && Array.isArray(relief.titles)
      ? relief.titles.filter((key: unknown) => typeof key === 'string' && ['office_relief_fish', 'office_relief_rebel', 'office_relief_rest'].includes(key)) : []);
    return { farmHarvests: safeCount(farm?.totalHarvests), platformLevel: safeCount(progression?.level), railCompleted: safeCount(rail?.completedGames),
      // The old tower catalog is retained only so already-unlocked titles remain wearable.
      // New ZIP saves are opaque and intentionally cannot unlock all-site achievements.
      towerLevel: 0, towerCollection: 0, towerContribution: 0,
      dailyChampionships: playWins + railWins + safeCount(workstationWins), developmentCompleted: development,
      workstationFirstThree: Number(achievements.has('tower_first_three')), workstationPerfect: Number(achievements.has('tower_perfect')),
      workstationSpeed: Number(achievements.has('tower_speed')), workstationOvertime: Number(achievements.has('tower_overtime')),
      workstationTenThousand: Number(achievements.has('tower_score_10000')), workstationTier: Object.keys(workstation).length ? safeCount(workstation.promotion_tier, 7) + 1 : 0,
      demonFirstBoss: 0, demonBossFloors: 0, demonHonorSkin: 0, demonFiveStar: 0,
      officeCollection: OFFICE_COLLECTION.filter(item => safeCount(officeOwned[item.id]) > 0).length,
      officeStories: safeCount(officeStats.stories), officeDrawings: safeCount(officeStats.drawings), officeDepartmentWins: safeCount(officeStats.departmentWins),
      officeBossDays: safeCount(officeStats.bossDays), officeWeeklyWins: safeCount(officeStats.weeklyWins),
      officeReliefFish: Number(reliefTitles.has('office_relief_fish')), officeReliefRebel: Number(reliefTitles.has('office_relief_rebel')), officeReliefRest: Number(reliefTitles.has('office_relief_rest')),
      fishExperience: (await readFishProgress(manager, userId, this.clock.now())).experience,
    };
  }
}
