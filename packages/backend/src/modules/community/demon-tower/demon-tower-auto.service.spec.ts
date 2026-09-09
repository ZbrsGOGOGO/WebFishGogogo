import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { DEMON_TOWER_AUTO_LIMITS } from '@stealth-reader/shared';
import { User, AuthSession, DemonTowerProfile, DemonTowerCommand, DemonTowerWorldFloor, WalletBalance, DemonTowerDailyProgress } from '../../../database/entities';
import { DemonTowerAutoRun } from '../../../database/entities/demon-tower-auto-run.entity';
import { CommunityMembershipGrant } from '../../../database/entities/community-progression.entity';
import { createLocalDevDataSource } from '../../../database/local-dev-datasource';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PlatformAssetsService } from '../../platform/platform-assets.service';
import { MembershipService } from '../progression/membership.service';
import { DemonTowerAutoService } from './demon-tower-auto.service';
import { DemonTowerService } from './demon-tower.service';
import { DemonTowerController } from './demon-tower.controller';
import { type DemonTowerEngineState, demonTowerMaxHp } from './demon-tower.engine';

/** Real entities/queries; pg-mem cannot prove rollback or lock exclusion (see isolated PG rehearsal). */
describe('DemonTowerAutoService bounded server worker', () => {
  let db: DataSource, tower: DemonTowerService, auto: DemonTowerAutoService, now: Date;
  const env = { ...process.env };
  beforeEach(async () => {
    for (const flag of ['FEATURE_COMMUNITY_WRITES_ENABLED', 'FEATURE_COMMUNITY_DEMON_TOWER_ENABLED', 'FEATURE_COMMUNITY_PROGRESSION_ENABLED', 'FEATURE_DEMON_TOWER_AUTO_EXPLORE_ENABLED']) process.env[flag] = 'true';
    now = new Date('2099-09-08T02:00:00Z'); db = await createLocalDevDataSource();
    const clock = { now: () => new Date(now) };
    tower = new DemonTowerService(db, new PlatformAssetsService(clock), clock);
    auto = new DemonTowerAutoService(db, tower, new MembershipService(), clock);
  });
  afterEach(async () => { auto?.onModuleDestroy(); jest.restoreAllMocks(); if (db?.isInitialized) await db.destroy(); process.env = { ...env }; });
  const tick = (ms = 2001) => { now = new Date(now.getTime() + ms); };
  async function actor(vip = true, enroll = true) {
    const id = randomUUID(); const user = await db.getRepository(User).save(db.getRepository(User).create({ id, username: `auto_${id.slice(0, 8)}`, email: `${id}@auto.invalid`, displayName: 'Auto test', passwordHash: 'synthetic-only', accountStatus: 'active' as const }));
    const session = await db.getRepository(AuthSession).save({ userId: id, lastSeenAt: now, expiresAt: new Date(now.getTime() + 86_400_000), revokedAt: null, revokeReason: null });
    if (vip) await db.getRepository(CommunityMembershipGrant).save({ userId: id, campaignKey: 'launch_vip_202609', startsAt: new Date(now.getTime() - 1000), expiresAt: new Date(now.getTime() + 86_400_000), createdAt: now });
    const enrollment = { requestId: randomUUID(), expectedVersion: 0, kind: 'enroll', payload: {} };
    if (enroll) await tower.action(id, enrollment);
    return { user, session, enrollment };
  }
  async function start(a: Awaited<ReturnType<typeof actor>>, maxExplorations = 20) {
    const profile = (await tower.overview(a.user.id)).profile!;
    const input = { requestId: randomUUID(), expectedVersion: profile.version, floor: profile.selectedFloor, maxExplorations };
    return { input, response: await auto.start(a.user.id, a.session.id, input) };
  }
  async function rawProfile(userId: string) { return db.getRepository(DemonTowerProfile).createQueryBuilder('p').addSelect('p.state').where('p.user_id = :userId', { userId }).getOneOrFail(); }
  async function modify(userId: string, change: (state: DemonTowerEngineState) => void) { const profile = await rawProfile(userId); change(profile.state as unknown as DemonTowerEngineState); await db.getRepository(DemonTowerProfile).save(profile); }
  async function job(id: string) { return db.getRepository(DemonTowerAutoRun).createQueryBuilder('r').addSelect(['r.failureCount', 'r.originAuthSessionId']).where('r.id=:id', { id }).getOneOrFail(); }

  it('guards every automation endpoint with JWT and never starts a test timer', () => {
    for (const name of ['autoRead', 'autoStart', 'autoStop'] as const) expect(Reflect.getMetadata(GUARDS_METADATA, DemonTowerController.prototype[name])).toContain(JwtAuthGuard);
    const timer = jest.spyOn(global, 'setInterval'); auto.onModuleInit(); expect(timer).not.toHaveBeenCalled();
  });
  it('reads without enrollment, world initialization or wallet writes, even when disabled', async () => {
    const a = await actor(false, false); process.env.FEATURE_DEMON_TOWER_AUTO_EXPLORE_ENABLED = 'false';
    expect(await auto.read(a.user.id)).toMatchObject({ enabled: false, run: null, overview: { profile: null } });
    for (const entity of [DemonTowerAutoRun, DemonTowerProfile, DemonTowerWorldFloor, WalletBalance]) expect(await db.getRepository(entity).count()).toBe(0);
  });
  it('requires VIP and a live owned session; never creates a membership or run on rejection', async () => {
    const a = await actor(false); const b = await actor();
    const input = { requestId: randomUUID(), expectedVersion: 1, floor: 1, maxExplorations: 2 };
    await expect(auto.start(a.user.id, a.session.id, input)).rejects.toMatchObject({ response: { code: 'VIP_REQUIRED' } });
    await expect(auto.start(a.user.id, b.session.id, input)).rejects.toMatchObject({ response: { code: 'INVALID_SESSION' } });
    await db.getRepository(AuthSession).update(a.session.id, { revokedAt: now });
    await expect(auto.start(a.user.id, a.session.id, input)).rejects.toMatchObject({ response: { code: 'INVALID_SESSION' } });
    expect(await db.getRepository(DemonTowerAutoRun).count()).toBe(0); expect(await db.getRepository(CommunityMembershipGrant).count()).toBe(1);
  });
  it('rejects stale versions, wrong floor, low HP and insufficient stamina without game changes', async () => {
    const a = await actor(); const input = { requestId: randomUUID(), expectedVersion: 1, floor: 1, maxExplorations: 2 };
    await expect(auto.start(a.user.id, a.session.id, { ...input, expectedVersion: 2 })).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_VERSION_CONFLICT' } });
    await expect(auto.start(a.user.id, a.session.id, { ...input, floor: 2 })).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_AUTO_FLOOR_CHANGED' } });
    await modify(a.user.id, state => { state.hp = 1; });
    await expect(auto.start(a.user.id, a.session.id, input)).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_AUTO_LOW_HEALTH' } });
    await modify(a.user.id, state => { state.hp = demonTowerMaxHp(state); state.stamina = 0; });
    await expect(auto.start(a.user.id, a.session.id, input)).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_NOT_ENOUGH_STAMINA' } });
    expect(await db.getRepository(DemonTowerAutoRun).count()).toBe(0); expect(await db.getRepository(DemonTowerCommand).count()).toBe(1);
  });
  it('binds a start UUID, blocks second tabs, redacts internals and preserves old manual receipt replay', async () => {
    const a = await actor(); const { input, response } = await start(a);
    expect(response.run).toMatchObject({ status: 'running', steps: 0, maxSteps: 260, maxExplorations: 20 });
    expect(response.overview.profile?.availableActions).toEqual([]);
    expect(JSON.stringify(response)).not.toMatch(/originAuthSessionId|startRequestId|requestHash|failureCount|rngSeed|rngCounter/);
    expect(JSON.stringify(response)).not.toContain(a.user.id); expect(JSON.stringify(response)).not.toContain(a.session.id);
    expect((await auto.start(a.user.id, a.session.id, input)).replayed).toBe(true);
    await expect(auto.start(a.user.id, a.session.id, { ...input, maxExplorations: 3 })).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_AUTO_IDEMPOTENCY_CONFLICT' } });
    await expect(start(a)).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_AUTO_RUNNING' } });
    await expect(tower.action(a.user.id, { requestId: randomUUID(), expectedVersion: 1, kind: 'train', payload: {} })).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_AUTO_RUNNING' } });
    const replay = await tower.action(a.user.id, a.enrollment); expect(replay.replayed).toBe(true); expect(replay.overview.autoExplore?.id).toBe(response.run!.id);
    expect(await db.getRepository(DemonTowerCommand).count()).toBe(1);
  });
  it('stops only the owned run, is repeatable and remains available when VIP and every write gate are off', async () => {
    const a = await actor(); const b = await actor(); const { input, response } = await start(a); const id = response.run!.id;
    await expect(auto.stop(b.user.id, id, {})).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_AUTO_NOT_FOUND' } });
    await db.getRepository(CommunityMembershipGrant).delete({ userId: a.user.id });
    for (const flag of ['FEATURE_COMMUNITY_WRITES_ENABLED', 'FEATURE_COMMUNITY_DEMON_TOWER_ENABLED', 'FEATURE_COMMUNITY_PROGRESSION_ENABLED', 'FEATURE_DEMON_TOWER_AUTO_EXPLORE_ENABLED']) process.env[flag] = 'false';
    const before = await rawProfile(a.user.id); const stopped = await auto.stop(a.user.id, id, {});
    expect(stopped).toMatchObject({ replayed: false, enabled: false, run: { status: 'stopped', stopReason: 'manual_stop', nextStepAt: null } });
    expect((await auto.stop(a.user.id, id, {})).replayed).toBe(true); expect(await rawProfile(a.user.id)).toEqual(before);
    for (const flag of ['FEATURE_COMMUNITY_WRITES_ENABLED', 'FEATURE_COMMUNITY_DEMON_TOWER_ENABLED', 'FEATURE_COMMUNITY_PROGRESSION_ENABLED', 'FEATURE_DEMON_TOWER_AUTO_EXPLORE_ENABLED']) process.env[flag] = 'true';
    expect((await auto.start(a.user.id, a.session.id, input)).run?.status).toBe('stopped');
  });
  it('advances only one due engine step, survives service reconstruction and never modifies world contribution', async () => {
    const a = await actor(); const { response } = await start(a, 2); const id = response.run!.id;
    const world = await db.getRepository(DemonTowerWorldFloor).find({ order: { floor: 'ASC' } });
    expect(await auto.runOne(id, false)).toBe(true); expect((await job(id)).steps).toBe(1);
    expect(await auto.runOne(id, false)).toBe(false); expect(await db.getRepository(DemonTowerCommand).count()).toBe(2);
    auto = new DemonTowerAutoService(db, tower, new MembershipService(), { now: () => new Date(now) }); tick();
    await auto.runOne(id, false); expect((await job(id)).steps).toBe(2);
    expect(await db.getRepository(DemonTowerWorldFloor).find({ order: { floor: 'ASC' } })).toEqual(world);
    expect(await db.getRepository(DemonTowerDailyProgress).findOneByOrFail({ userId: a.user.id, serviceDate: '2099-09-08' })).toMatchObject({ bossDamage: 0, passageContribution: 0, bossAttempts: 0 });
  });
  it('resumes a persisted legacy battle without activating growth mid-turn, and preserves all worker boundaries', async () => {
    const a = await actor(); await modify(a.user.id, state => { state.rngSeed = 'a'.repeat(64); state.rngCounter = 0; });
    const { response } = await start(a), id = response.run!.id;
    for (let i = 0; i < 8 && !(await rawProfile(a.user.id)).state.battle; i++) { await auto.runOne(id, false); tick(); }
    await modify(a.user.id, state => {
      expect(state.battle).not.toBeNull(); delete state.growth;
      for (const item of state.weapons) { delete item.star; delete item.favor; delete item.levelExempt; }
      for (const item of state.skills) delete item.levelExempt;
      delete state.battle!.rulesVersion; delete state.battle!.innates; delete state.battle!.feignUsed;
      state.loadout.activeSkills = ['s1']; state.battle!.player.hp = Math.ceil(state.battle!.player.maxHp / 2);
      state.battle!.enemies[0].hp = 1000; state.battle!.enemies[0].maxHp = 1000;
    });
    const before = (await rawProfile(a.user.id)).state as unknown as DemonTowerEngineState;
    auto = new DemonTowerAutoService(db, tower, new MembershipService(), { now: () => new Date(now) });
    await auto.runOne(id, false);
    const after = (await rawProfile(a.user.id)).state as unknown as DemonTowerEngineState;
    expect(after.growth).toBeUndefined(); expect(after.battle!.rulesVersion).toBeUndefined();
    expect(after.battle!.totalDamage).toBe(before.battle!.totalDamage); expect(after.battle!.turn).toBe(before.battle!.turn + 1);
    expect(after.weapons[0].favor).toBeUndefined();
    expect(await job(id)).toMatchObject({ maxExplorations: 20, status: 'running' });
    await auto.stop(a.user.id, id, {}); tick(); const stopped = await rawProfile(a.user.id);
    expect(await auto.runOne(id, false)).toBe(false); expect(await rawProfile(a.user.id)).toEqual(stopped);
  });
  it.each(['session_ended', 'vip_expired', 'account_inactive', 'day_changed', 'time_limit', 'maintenance'] as const)('stops for %s without consuming a step', async reason => {
    const a = await actor(); const { response } = await start(a); const before = await rawProfile(a.user.id);
    if (reason === 'session_ended') await db.getRepository(AuthSession).update(a.session.id, { revokedAt: now });
    if (reason === 'vip_expired') await db.getRepository(CommunityMembershipGrant).update({ userId: a.user.id }, { expiresAt: new Date(now.getTime() + 1) });
    if (reason === 'account_inactive') await db.getRepository(User).update(a.user.id, { accountStatus: 'suspended' });
    if (reason === 'day_changed') now = new Date('2099-09-08T16:00:00Z');
    if (reason === 'time_limit') tick(DEMON_TOWER_AUTO_LIMITS.durationMs);
    if (reason === 'maintenance') process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'false';
    tick(); await auto.runOne(response.run!.id, false);
    expect(await job(response.run!.id)).toMatchObject({ status: 'stopped', stopReason: reason, steps: 0 });
    expect(await rawProfile(a.user.id)).toEqual(before); expect(await db.getRepository(DemonTowerCommand).count()).toBe(1);
  });
  it('leaves a low-health battle untouched for manual takeover instead of fleeing or healing', async () => {
    const a = await actor(); await modify(a.user.id, state => { state.rngSeed = 'a'.repeat(64); state.rngCounter = 0; }); const { response } = await start(a);
    for (let i = 0; i < 4 && !(await rawProfile(a.user.id)).state.battle; i++) { await auto.runOne(response.run!.id, false); tick(); }
    await modify(a.user.id, state => { expect(state.battle).not.toBeNull(); state.battle!.player.hp = 1; });
    const before = await rawProfile(a.user.id); await auto.runOne(response.run!.id, false);
    expect(await job(response.run!.id)).toMatchObject({ stopReason: 'low_health' }); expect(await rawProfile(a.user.id)).toEqual(before);
    expect((await auto.read(a.user.id)).overview.profile?.availableActions).toContain('flee');
  });
  it('defers transient failures at the same game cursor, then stops after three without engine writes', async () => {
    const a = await actor(); const { response } = await start(a); const before = await rawProfile(a.user.id);
    jest.spyOn(tower, 'applyActionInTransaction').mockRejectedValue(new Error('synthetic failure, never log details'));
    for (let i = 0; i < 3; i++) { await auto.runOne(response.run!.id, false); tick(5001); }
    expect(await job(response.run!.id)).toMatchObject({ status: 'stopped', stopReason: 'server_error', steps: 0, failureCount: 3 });
    expect(await rawProfile(a.user.id)).toEqual(before); expect(await db.getRepository(DemonTowerCommand).count()).toBe(1);
  });
  it('bounds exploration count and avoids another exploration after a completed batch', async () => {
    const a = await actor(); await modify(a.user.id, state => { state.attributes.STR = 200; state.attributes.DEF = 200; state.hp = demonTowerMaxHp(state); });
    const { response } = await start(a, 2);
    for (let i = 0; i < 26 && (await job(response.run!.id)).status === 'running'; i++) { await auto.runOne(response.run!.id, false); tick(); }
    expect(await job(response.run!.id)).toMatchObject({ status: 'completed', stopReason: 'completed', startedExplorations: 2, completedExplorations: 2 });
    const before = await rawProfile(a.user.id); expect(await auto.runOne(response.run!.id, false)).toBe(false); expect(await rawProfile(a.user.id)).toEqual(before);
    expect((await auto.read(a.user.id)).run?.status).toBe('completed');
  });
});
