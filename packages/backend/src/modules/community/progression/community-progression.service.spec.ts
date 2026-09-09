import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { randomUUID } from 'node:crypto';
import type { DataSource, QueryRunner } from 'typeorm';
import { COMMUNITY_ACHIEVEMENTS } from '@stealth-reader/shared';
import { CommunityAchievementUnlock, CommunityMembershipGrant, CommunityUserPresentation } from '../../../database/entities/community-progression.entity';
import { DeskPlant, PlayerProgression, RailPlayerStats, RailDailyAward, PlayDailyAward, User, WalletBalance } from '../../../database/entities';
import { DemonTowerContribution, DemonTowerDailyAward, DemonTowerProfile, DemonTowerWorldFloor } from '../../../database/entities/demon-tower.entity';
import { DevelopmentRequest } from '../../../database/entities/development.entity';
import { createLocalDevDataSource } from '../../../database/local-dev-datasource';
import { AddCommunityProgression1700000000031 } from '../../../database/migrations/1700000000031-AddCommunityProgression';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { createDemonTowerState } from '../demon-tower/demon-tower.engine';
import { CommunityProgressionController } from './community-progression.controller';
import { CommunityProgressionService } from './community-progression.service';
import { MembershipService } from './membership.service';
import { loadTitleBadges, titleBadge } from './title-projection';

/** Real entity/query tests on pg-mem; PostgreSQL lock ordering and campaign time need the isolated PG rehearsal. */
describe('Community progression: free gifts, cosmetic unlocks and title ownership', () => {
  let db: DataSource; let service: CommunityProgressionService; let membership: MembershipService; let now: Date;
  const env = { ...process.env };
  beforeEach(async () => {
    process.env.FEATURE_COMMUNITY_PROGRESSION_ENABLED = 'true'; process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true';
    now = new Date('2099-09-09T01:00:00.000Z'); db = await createLocalDevDataSource();
    membership = new MembershipService(); service = new CommunityProgressionService(db, membership, { now: () => now });
  });
  afterEach(async () => { jest.restoreAllMocks(); if (db?.isInitialized) await db.destroy(); process.env = { ...env }; });
  async function user(name: string, accountStatus: User['accountStatus'] = 'active') {
    return db.getRepository(User).save(db.getRepository(User).create({ username: name, email: `${name}@progression.invalid`, passwordHash: 'synthetic-only', accountStatus, displayName: name }));
  }
  async function farm(actor: User, totalHarvests: number) {
    await db.getRepository(DeskPlant).save(db.getRepository(DeskPlant).create({ userId: actor.id, totalHarvests }));
  }
  async function gift(actor: User, startsAt = now) {
    const expiresAt = new Date(startsAt.getTime() + 30 * 86_400_000);
    await db.getRepository(CommunityMembershipGrant).insert({ userId: actor.id, campaignKey: 'launch_vip_202609', startsAt, expiresAt, createdAt: startsAt });
    return expiresAt;
  }
  const titleInput = (titleKey: string | null = 'farm_first', expectedVersion = 0) => ({ requestId: randomUUID(), expectedVersion, titleKey });

  it('has exactly twelve fixed, unique, plain-text title definitions and guarded private endpoints', () => {
    const catalog = service.catalog(); expect(catalog.achievements).toHaveLength(12);
    expect(new Set(catalog.achievements.map((item) => item.key)).size).toBe(12);
    for (const item of catalog.achievements) {
      expect(item.title.key).toBe(item.key); expect(item.title.label).not.toMatch(/[<>]/); expect(item.title.label.length).toBeLessThan(20);
      expect(titleBadge(item.key)).toEqual(item.title);
    }
    expect(titleBadge('<img onerror=alert(1)>')).toBeNull();
    for (const endpoint of ['me', 'refresh', 'title'] as const) expect(Reflect.getMetadata(GUARDS_METADATA, CommunityProgressionController.prototype[endpoint])).toContain(JwtAuthGuard);
    expect(Reflect.getMetadata(GUARDS_METADATA, CommunityProgressionController.prototype.catalog)).toBeUndefined();
    expect(catalog.membership).toMatchObject({ giftDays: 30, paid: false, automaticRenewal: false, existingAccountsOnly: true });
  });
  it('GET never grants membership, initializes a wallet, unlocks achievements or creates presentation state', async () => {
    const a = await user('reader'); await farm(a, 100);
    const first = await service.me(a.id); const second = await service.me(a.id);
    expect(second).toEqual(first); expect(first.vip.active).toBe(false); expect(first.presentation).toEqual({ version: 0, equippedTitle: null });
    expect(first.achievements.find((item) => item.key === 'farm_100')).toMatchObject({ progress: 100, eligible: true, unlockedAt: null });
    for (const entity of [CommunityMembershipGrant, CommunityAchievementUnlock, CommunityUserPresentation, WalletBalance]) expect(await db.getRepository(entity).count()).toBe(0);
  });
  it('keeps a gift exactly 720 hours, never extends it on reads or refresh and expires at the boundary', async () => {
    const a = await user('gifted'); const expiry = await gift(a); const saved = await db.getRepository(CommunityMembershipGrant).findOneByOrFail({ userId: a.id });
    expect(expiry.getTime() - now.getTime()).toBe(720 * 3_600_000);
    expect(await membership.requireVip(db.manager, a.id, now)).toMatchObject({ active: true, benefits: ['demon_tower_auto_explore'] });
    now = new Date(expiry.getTime() - 1); expect((await service.me(a.id)).vip.active).toBe(true); await service.refresh(a.id, {});
    now = expiry; expect((await service.me(a.id)).vip).toMatchObject({ active: false, expiresAt: expiry.toISOString(), benefits: [] });
    await expect(membership.requireVip(db.manager, a.id, now)).rejects.toMatchObject({ response: { code: 'VIP_REQUIRED' } });
    expect(await db.getRepository(CommunityMembershipGrant).findOneByOrFail({ userId: a.id })).toEqual(saved);
    expect((await db.getRepository(User).findOneByOrFail({ id: a.id })).communityRole).toBe('user');
    expect(await db.getRepository(WalletBalance).count()).toBe(0);
  });
  it('does not activate future gifts or infer VIP from management roles, and never gifts post-migration accounts', async () => {
    const a = await user('future'); await gift(a, new Date(now.getTime() + 1000));
    await expect(membership.requireVip(db.manager, a.id, now)).rejects.toMatchObject({ response: { code: 'VIP_REQUIRED' } });
    const admin = await user('admin'); await db.getRepository(User).update(admin.id, { communityRole: 'admin' });
    await expect(membership.requireVip(db.manager, admin.id, now)).rejects.toMatchObject({ response: { code: 'VIP_REQUIRED' } });
    await service.refresh(admin.id, {}); expect((await service.me(admin.id)).vip.source).toBeNull();
    expect(await db.getRepository(CommunityMembershipGrant).countBy({ userId: admin.id })).toBe(0);
  });
  it.each(['pending_email', 'suspended', 'banned', 'deleting', 'deleted'] as const)('rejects %s users even when a valid gift exists', async (status) => {
    const a = await user(status, status); await gift(a);
    for (const task of [() => service.me(a.id), () => service.refresh(a.id, {}), () => service.equip(a.id, titleInput()), () => membership.requireVip(db.manager, a.id, now)]) await expect(task()).rejects.toMatchObject({ response: { code: 'PROGRESSION_ACTIVE_ACCOUNT_REQUIRED' } });
    expect(await db.getRepository(CommunityUserPresentation).count()).toBe(0);
  });
  it('backfills only authoritative retained counters and makes repeated refresh a no-op', async () => {
    const a = await user('history'); await farm(a, 100);
    await db.getRepository(PlayerProgression).insert({ userId: a.id, level: 10, experience: '10000' });
    await db.getRepository(RailPlayerStats).insert({ userId: a.id, completedGames: 10, rankedGames: 0 });
    const state = createDemonTowerState(now.getTime(), '2099-09-09', 'synthetic-history'); state.level = 20;
    state.weapons.push({ ...state.weapons[0], id: 'w2' }, { ...state.weapons[0], id: 'w3' }, { ...state.weapons[0], id: 'w4' });
    await db.getRepository(DemonTowerProfile).save(db.getRepository(DemonTowerProfile).create({ userId: a.id, version: 1, state: state as unknown as Record<string, unknown>, createdAt: now, updatedAt: now }));
    const first = await service.refresh(a.id, {});
    expect(first.newlyUnlocked).toEqual(expect.arrayContaining(['farm_first', 'farm_25', 'farm_100', 'community_10', 'rail_first', 'rail_10', 'tower_5', 'tower_20', 'tower_collection']));
    expect(first.newlyUnlocked).toHaveLength(9); expect(first.overview.achievements.find((item) => item.key === 'daily_champion')?.eligible).toBe(false);
    expect(first.overview.achievements.filter((item) => item.unlockedAt).every((item) => item.unlockedAt === now.toISOString())).toBe(true);
    now = new Date(now.getTime() + 60_000); expect((await service.refresh(a.id, {})).newlyUnlocked).toEqual([]);
    expect(await db.getRepository(CommunityAchievementUnlock).countBy({ userId: a.id })).toBe(9);
    expect(await db.getRepository(WalletBalance).count()).toBe(0);
    expect(JSON.stringify(first)).not.toMatch(/rngSeed|rngCounter|passwordHash|userId|synthetic-history|requestHash/);
  });
  it('counts different collected IDs rather than item copies or repeated entries', async () => {
    const a = await user('collector'); const state = createDemonTowerState(now.getTime(), '2099-09-09', 'collector-seed-long-enough');
    state.weapons[0].spareCopies = 9999; state.weapons.push({ ...state.weapons[0] });
    await db.getRepository(DemonTowerProfile).save(db.getRepository(DemonTowerProfile).create({ userId: a.id, version: 1, state: state as unknown as Record<string, unknown>, createdAt: now, updatedAt: now }));
    expect((await service.me(a.id)).achievements.find((item) => item.key === 'tower_collection')).toMatchObject({ progress: 9, eligible: false });
  });
  it('uses each module\'s settled paid champion record, not temporary rankings or another user\'s award', async () => {
    const a = await user('play_winner'); const b = await user('rail_winner'); const c = await user('tower_winner'); const other = await user('not_winner');
    await db.getRepository(PlayDailyAward).insert({ serviceDate: '2099-09-08', gameKey: 'snake', winnerUserId: a.id, score: 50, coins: 100, awardedAt: now });
    await db.getRepository(RailDailyAward).insert({ serviceDate: '2099-09-08', winnerUserId: b.id, rateBasisPoints: 10000, coins: 100, awardedAt: now });
    await db.getRepository(DemonTowerDailyAward).insert({ serviceDate: '2099-09-08', winnerUserId: c.id, bossDamage: 100, coins: 100, awardedAt: now });
    for (const winner of [a, b, c]) expect((await service.me(winner.id)).achievements.find((item) => item.key === 'daily_champion')).toMatchObject({ progress: 1, eligible: true, unlockedAt: null });
    expect((await service.me(other.id)).achievements.find((item) => item.key === 'daily_champion')?.eligible).toBe(false);
  });
  it('uses actual clipped tower contribution and completed own development status without exposing proposal text', async () => {
    const a = await user('contributor'); const b = await user('different_author');
    await db.getRepository(DemonTowerWorldFloor).insert({ floor: 1, bossHp: 2400, bossMaxHp: 2400, passageProgress: 0, passageRequired: 50, version: 1, unlockedAt: now, defeatedAt: null, completedAt: null, updatedAt: now });
    await db.getRepository(DemonTowerContribution).insert({ floor: 1, userId: a.id, bossDamage: 980, passageContribution: 20, level: 1, updatedAt: now });
    const proposal = await db.getRepository(DevelopmentRequest).save(db.getRepository(DevelopmentRequest).create({ authorId: a.id, clientRequestId: randomUUID(), requestHash: 'a'.repeat(64), title: 'private synthetic title', description: 'private synthetic body must never project', category: 'feature', status: 'accepted', version: 1, attachmentCount: 0, attachmentBytes: 0 }));
    expect((await service.me(a.id)).achievements.find((item) => item.key === 'development_done')?.eligible).toBe(false);
    await db.getRepository(DevelopmentRequest).update(proposal.id, { status: 'done' });
    const result = await service.refresh(a.id, {}); expect(result.newlyUnlocked).toEqual(['tower_contributor', 'development_done']);
    expect(JSON.stringify(result)).not.toContain('private synthetic');
    const other = await service.me(b.id); expect(other.achievements.filter((item) => item.eligible)).toEqual([]);
  });
  it('binds equip to user/CAS/full request, replays only its latest request and permits unequip', async () => {
    const a = await user('wearer'); const b = await user('stranger'); await farm(a, 25);
    const input = titleInput(); const first = await service.equip(a.id, input);
    expect(first.overview.presentation).toEqual({ version: 1, equippedTitle: { key: 'farm_first', label: '工位园丁' } });
    const replay = await service.equip(a.id, input); expect(replay.replayed).toBe(true); expect(replay.overview.presentation.version).toBe(1);
    await expect(service.equip(a.id, { ...input, titleKey: 'farm_25' })).rejects.toMatchObject({ response: { code: 'PROGRESSION_IDEMPOTENCY_CONFLICT' } });
    await expect(service.equip(b.id, input)).rejects.toMatchObject({ response: { code: 'TITLE_NOT_UNLOCKED' } });
    const second = await service.equip(a.id, titleInput('farm_25', 1)); expect(second.overview.presentation.version).toBe(2);
    await expect(service.equip(a.id, input)).rejects.toMatchObject({ response: { code: 'PROGRESSION_VERSION_CONFLICT' } });
    const removed = await service.equip(a.id, titleInput(null, 2)); expect(removed.overview.presentation).toEqual({ version: 3, equippedTitle: null });
  });
  it('rejects new-UUID no-ops and stale versions without consuming a presentation version', async () => {
    const a = await user('noops'); await farm(a, 1);
    await expect(service.equip(a.id, titleInput(null))).rejects.toMatchObject({ response: { code: 'TITLE_UNCHANGED' } });
    await service.equip(a.id, titleInput());
    await expect(service.equip(a.id, titleInput('farm_first', 1))).rejects.toMatchObject({ response: { code: 'TITLE_UNCHANGED' } });
    await expect(service.equip(a.id, titleInput(null, 0))).rejects.toMatchObject({ response: { code: 'PROGRESSION_VERSION_CONFLICT' } });
    expect((await service.me(a.id)).presentation.version).toBe(1);
  });
  it.each([null, [], { titleKey: 'farm_first' }, { requestId: 'no', expectedVersion: 0, titleKey: 'farm_first' }, { requestId: randomUUID(), expectedVersion: -1, titleKey: 'farm_first' }, { requestId: randomUUID(), expectedVersion: 0, titleKey: '<b>管理员</b>' }, { requestId: randomUUID(), expectedVersion: 0, titleKey: 'farm_first', userId: randomUUID() }])('rejects malformed/forged equip input %j', async (raw) => {
    const a = await user('invalid'); await expect(service.equip(a.id, raw)).rejects.toMatchObject({ response: { code: 'PROGRESSION_REQUEST_INVALID' } });
    expect(await db.getRepository(CommunityUserPresentation).count()).toBe(0);
  });
  it('keeps achievements permanent without granting VIP or default public wear', async () => {
    const a = await user('permanent'); await farm(a, 1); await service.refresh(a.id, {});
    await db.getRepository(DeskPlant).delete({ userId: a.id });
    expect((await service.me(a.id)).achievements.find((item) => item.key === 'farm_first')).toMatchObject({ progress: 0, eligible: true, unlockedAt: now.toISOString() });
    expect((await loadTitleBadges(db.manager, [a.id])).size).toBe(0);
    await service.equip(a.id, titleInput()); expect((await loadTitleBadges(db.manager, [a.id])).get(a.id)).toEqual({ key: 'farm_first', label: '工位园丁' });
    expect((await service.me(a.id)).vip.active).toBe(false);
  });
  it('public projection rejects unknown or unowned titles, inactive authors and disabled feature', async () => {
    const a = await user('project'); await farm(a, 1); await service.equip(a.id, titleInput());
    await db.getRepository(CommunityAchievementUnlock).delete({ userId: a.id }); expect((await loadTitleBadges(db.manager, [a.id])).size).toBe(0);
    await service.refresh(a.id, {}); await db.getRepository(CommunityUserPresentation).update(a.id, { equippedTitleKey: '<img>' }); expect((await loadTitleBadges(db.manager, [a.id])).size).toBe(0);
    await db.getRepository(CommunityUserPresentation).update(a.id, { equippedTitleKey: 'farm_first' }); await db.getRepository(User).update(a.id, { accountStatus: 'suspended' }); expect((await loadTitleBadges(db.manager, [a.id])).size).toBe(0);
    await db.getRepository(User).update(a.id, { accountStatus: 'active' }); process.env.FEATURE_COMMUNITY_PROGRESSION_ENABLED = 'false'; expect((await loadTitleBadges(db.manager, [a.id])).size).toBe(0);
  });
  it('honors both maintenance and feature gates without granting while GET remains read-only', async () => {
    const a = await user('gates'); await farm(a, 100); await gift(a);
    for (const gate of ['FEATURE_COMMUNITY_WRITES_ENABLED', 'FEATURE_COMMUNITY_PROGRESSION_ENABLED']) {
      process.env[gate] = 'false'; expect((await service.me(a.id)).writesEnabled).toBe(false);
      await expect(service.refresh(a.id, {})).rejects.toMatchObject({ status: 503 }); await expect(service.equip(a.id, titleInput())).rejects.toMatchObject({ status: 503 });
      process.env[gate] = 'true';
    }
    expect(await db.getRepository(CommunityAchievementUnlock).count()).toBe(0);
    await expect(service.refresh(a.id, { claimed: true })).rejects.toMatchObject({ response: { code: 'PROGRESSION_REQUEST_INVALID' } });
  });
  it('defines an additive three-table migration with a single active-account fixed launch campaign', async () => {
    const queries: string[] = []; const query = jest.fn(async (sql: string) => { queries.push(sql); });
    await new AddCommunityProgression1700000000031().up({ query } as unknown as QueryRunner);
    expect(queries.filter((sql) => sql.startsWith('CREATE TABLE'))).toHaveLength(3);
    const giftSql = queries.find((sql) => sql.startsWith('INSERT INTO membership_grants'))!;
    expect(giftSql).toContain("'launch_vip_202609'"); expect(giftSql).toContain("interval '720 hours'"); expect(giftSql).toContain("account_status = 'active'"); expect(giftSql).toContain('transaction_timestamp()'); expect(giftSql).toContain('DO NOTHING');
    expect(queries.join('\n')).not.toMatch(/UPDATE users|ALTER TABLE user_profiles|wallet|community_role/i);
  });
  it('executes the launch SELECT for existing active users once and a normal migration no-op never extends or enrolls newcomers', async () => {
    const a = await user('existing'); const admin = await user('existing_admin'); const suspended = await user('existing_suspended', 'suspended');
    await db.getRepository(User).update(admin.id, { communityRole: 'admin' });
    const queries: string[] = [];
    await new AddCommunityProgression1700000000031().up({ query: async (sql: string) => { queries.push(sql); } } as unknown as QueryRunner);
    const giftSql = queries.find((sql) => sql.startsWith('INSERT INTO membership_grants'))!;
    // Execute the exact shipped SELECT against existing empty synthetic tables.
    // pg-mem's clock adapter is not transaction-stable; a fixed test Date emulates that PG property.
    jest.useFakeTimers({ now, doNotFake: ['nextTick', 'setImmediate', 'setTimeout'] });
    try { await db.query(giftSql); } finally { jest.useRealTimers(); }
    const grants = await db.getRepository(CommunityMembershipGrant).find({ order: { userId: 'ASC' } });
    expect(grants.map((row) => row.userId).sort()).toEqual([a.id, admin.id].sort());
    expect(grants.some((row) => row.userId === suspended.id)).toBe(false);
    for (const row of grants) expect(row.expiresAt.getTime() - row.startsAt.getTime()).toBe(30 * 86_400_000);
    expect(grants[0].startsAt.getTime()).toBe(grants[1].startsAt.getTime());
    const newcomer = await user('after_launch'); expect(await db.runMigrations()).toEqual([]);
    expect(await db.getRepository(CommunityMembershipGrant).find({ order: { userId: 'ASC' } })).toEqual(grants);
    expect((await service.me(newcomer.id)).vip.source).toBeNull();
    expect((await db.getRepository(User).findOneByOrFail({ id: admin.id })).communityRole).toBe('admin');
  });
});
