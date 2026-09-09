import { BadRequestException, ConflictException, Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { COMMUNITY_ACHIEVEMENTS, OFFICE_COLLECTION, type CommunityAchievementMetric, type CommunityAchievementRefreshReceipt, type CommunityProgressionCatalog, type CommunityProgressionView, type CommunityTitleInput, type CommunityTitleReceipt } from '@stealth-reader/shared';
import { CommunityAchievementUnlock, CommunityUserPresentation } from '../../../database/entities/community-progression.entity';
import { DeskPlant } from '../../../database/entities/desk-plant.entity';
import { PlayerProgression } from '../../../database/entities/player-progression.entity';
import { RailDailyAward, RailPlayerStats } from '../../../database/entities/rail-room.entity';
import { PlayDailyAward } from '../../../database/entities/play-room.entity';
import { DemonTowerContribution, DemonTowerDailyAward, DemonTowerProfile } from '../../../database/entities/demon-tower.entity';
import { DevelopmentRequest } from '../../../database/entities/development.entity';
import { User } from '../../../database/entities/user.entity';
import { COMMUNITY_CLOCK, type CommunityClock } from '../community-clock';
import { assertCommunityWritesEnabled, communityWritesEnabled } from '../community-write-gate';
import { MembershipService, communityProgressionEnabled } from './membership.service';
import { titleBadge } from './title-projection';

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
      membership: { giftDays: 30, automaticRenewal: false, paid: false, benefit: 'demon_tower_auto_explore', existingAccountsOnly: true },
      historicalDataNotice: '成就依据服务器保留的真实记录回补；解锁时间是本次确认时间。已丢失或未记录的历史不会推测补造。称号仅装饰，不发币或增加管理权限。' };
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
    const [metrics, unlocks, presentation, vip] = await Promise.all([
      knownMetrics ?? this.metrics(manager, userId), manager.getRepository(CommunityAchievementUnlock).findBy({ userId }),
      manager.getRepository(CommunityUserPresentation).findOneBy({ userId }), this.membership.view(manager, userId, now),
    ]);
    const owned = new Map(unlocks.map((row) => [row.achievementKey, row]));
    return { serverNow: now.toISOString(), enabled: communityProgressionEnabled(), writesEnabled: communityProgressionEnabled() && communityWritesEnabled(), vip,
      presentation: { version: presentation?.version ?? 0, equippedTitle: presentation?.equippedTitleKey && owned.has(presentation.equippedTitleKey) ? titleBadge(presentation.equippedTitleKey) : null },
      achievements: COMMUNITY_ACHIEVEMENTS.map((item) => ({ key: item.key, progress: Math.min(item.target, metrics[item.metric]), target: item.target, eligible: owned.has(item.key) || metrics[item.metric] >= item.target, unlockedAt: owned.get(item.key)?.unlockedAt.toISOString() ?? null })) };
  }
  private async metrics(manager: EntityManager, userId: string): Promise<Metrics> {
    const [farm, progression, rail, tower, contribution, playWins, railWins, towerWins, development] = await Promise.all([
      manager.getRepository(DeskPlant).findOneBy({ userId }), manager.getRepository(PlayerProgression).findOneBy({ userId }), manager.getRepository(RailPlayerStats).findOneBy({ userId }),
      manager.getRepository(DemonTowerProfile).createQueryBuilder('profile').select(['profile.userId', 'profile.state']).where('profile.user_id = :userId', { userId }).getOne(),
      manager.getRepository(DemonTowerContribution).findBy({ userId }),
      manager.getRepository(PlayDailyAward).countBy({ winnerUserId: userId, coins: 100 }), manager.getRepository(RailDailyAward).countBy({ winnerUserId: userId, coins: 100 }), manager.getRepository(DemonTowerDailyAward).countBy({ winnerUserId: userId, coins: 100 }),
      manager.getRepository(DevelopmentRequest).countBy({ authorId: userId, status: 'done' }),
    ]);
    const state = tower?.state;
    const expansion = objectValue(state?.expansion);
    const arena = objectValue(expansion.arena);
    const bossFloors = new Set(Array.isArray(expansion.claimedBossFloors) ? expansion.claimedBossFloors.filter(floor => Number.isInteger(floor) && floor >= 1 && floor <= 9) : []);
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
    const ids = new Set<string>();
    for (const [field, pattern] of [['weapons', /^w(?:[1-9]|1\d|20)$/], ['skills', /^s(?:[1-9]|1[0-6])$/]] as const) {
      const values: unknown = state?.[field];
      if (Array.isArray(values)) for (const value of values.slice(0, 36)) if (value && typeof value === 'object' && typeof value.id === 'string' && pattern.test(value.id)) ids.add(value.id);
    }
    return { farmHarvests: safeCount(farm?.totalHarvests), platformLevel: safeCount(progression?.level), railCompleted: safeCount(rail?.completedGames), towerLevel: safeCount(state?.level), towerCollection: ids.size,
      towerContribution: contribution.reduce((sum, row) => sum + safeCount(row.bossDamage) + safeCount(row.passageContribution), 0), dailyChampionships: playWins + railWins + towerWins + safeCount(workstationWins), developmentCompleted: development,
      workstationFirstThree: Number(achievements.has('tower_first_three')), workstationPerfect: Number(achievements.has('tower_perfect')),
      workstationSpeed: Number(achievements.has('tower_speed')), workstationOvertime: Number(achievements.has('tower_overtime')),
      workstationTenThousand: Number(achievements.has('tower_score_10000')), workstationTier: Object.keys(workstation).length ? safeCount(workstation.promotion_tier, 7) + 1 : 0,
      demonFirstBoss: Number(bossFloors.has(1)), demonBossFloors: bossFloors.size, demonHonorSkin: Number(arena.skinUnlocked === true),
      demonFiveStar: Number(Array.isArray(state?.weapons) && state.weapons.some(weapon => /^w(?:[1-9]|1\d|20)$/.test(String(objectValue(weapon).id)) && safeCount(objectValue(weapon).star, 5) >= 5)),
      officeCollection: OFFICE_COLLECTION.filter(item => safeCount(officeOwned[item.id]) > 0).length,
      officeStories: safeCount(officeStats.stories), officeDrawings: safeCount(officeStats.drawings), officeDepartmentWins: safeCount(officeStats.departmentWins),
      officeBossDays: safeCount(officeStats.bossDays), officeWeeklyWins: safeCount(officeStats.weeklyWins),
    };
  }
}
