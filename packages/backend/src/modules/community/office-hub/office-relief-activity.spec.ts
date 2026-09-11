import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource, EntityManager } from 'typeorm';
import { User, WalletBalance } from '../../../database/entities';
import { CommunityFishProgress } from '../../../database/entities/community-growth.entity';
import { createLocalDevDataSource } from '../../../database/local-dev-datasource';
import { FishGrowthService } from '../progression/fish-growth.service';
import { creditOfficeReliefActivity } from './office-relief-activity';
import { newOfficeProfile } from './office-hub.rules';
import { newOfficeRelief } from './office-relief.rules';

describe('Trusted fish activity funds only the private relief chance pool', () => {
  let db: DataSource, user: User, other: User, fish: FishGrowthService, now: Date;
  const env = { ...process.env };
  beforeEach(async () => {
    process.env.FEATURE_COMMUNITY_PROGRESSION_ENABLED = 'true'; process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true'; process.env.FEATURE_OFFICE_HUB_ENABLED = 'true';
    db = await createLocalDevDataSource(); now = new Date('2099-09-11T01:00:00Z'); fish = new FishGrowthService(db, { now: () => now });
    const repo = db.getRepository(User);
    [user, other] = await repo.save(['relief_active', 'relief_other'].map(username => repo.create({ username, email: username + '@synthetic.invalid', passwordHash: 'synthetic-only', accountStatus: 'active' })));
  });
  afterEach(async () => { jest.restoreAllMocks(); if (db?.isInitialized) await db.destroy(); process.env = { ...env }; });
  const advance = (seconds = 30) => { now = new Date(+now + seconds * 1000); };
  const office = async (id = user.id) => (await db.query('SELECT state FROM office_hub_profiles WHERE user_id=$1', [id]))[0]?.state;
  async function write(state: unknown, id = user.id) { await db.query('INSERT INTO office_hub_profiles(user_id,state) VALUES($1,$2::jsonb)', [id, JSON.stringify(state)]); }
  const beat = () => ({ tabId: randomUUID(), sequence: 1, mode: 'game' as const });
  const credit = (seconds: number) => db.transaction(async manager => {
    await manager.getRepository(User).createQueryBuilder('u').where('u.id=:id', { id: user.id }).setLock('for_no_key_update').getOneOrFail();
    await creditOfficeReliefActivity(manager, user.id, seconds, now);
  });

  it('does not query or initialize on zero seconds or disabled feature, and rejects unbounded internal intervals', async () => {
    const query = jest.fn(), manager = { query } as unknown as EntityManager;
    await creditOfficeReliefActivity(manager, user.id, 0, now);
    process.env.FEATURE_OFFICE_HUB_ENABLED = 'false'; await creditOfficeReliefActivity(manager, user.id, 30, now);
    for (const seconds of [-1, 0.5, 76, 14400, NaN]) await expect(creditOfficeReliefActivity(manager, user.id, seconds, now)).rejects.toThrow('OFFICE_RELIEF_ACTIVITY_INVALID');
    expect(query).not.toHaveBeenCalled(); expect(await office()).toBeUndefined();
  });

  it('first accepted interval initializes normal office tier without historical time or retroactive farm income', async () => {
    await db.query('INSERT INTO tower_defense_profiles(user_id,promotion_tier,stats) VALUES($1,5,$2::jsonb)', [user.id, '{}']);
    const input = beat(); await fish.heartbeat(user.id, input); expect(await office()).toBeUndefined();
    await db.getRepository(CommunityFishProgress).update(user.id, { experience: 500, activeSeconds: 30000, gameSeconds: 0 });
    advance(); await fish.heartbeat(user.id, { ...input, sequence: 2 });
    const profile = await office(), { relief, ...legacy } = profile;
    expect(legacy).toEqual({ ...newOfficeProfile(+now), promotionTier: 5 });
    expect(relief).toMatchObject({ schemaVersion: 1, version: 1, chances: 0, remainderSeconds: 30, trackedSeconds: 30, tokenBalance: 0, titles: [] });
    expect(await office(other.id)).toBeUndefined(); expect(await db.getRepository(WalletBalance).count()).toBe(0);
  });

  it('updates only relief on old profiles and does not accrue farm, reset boss/day or change promotion', async () => {
    const old = { ...newOfficeProfile(+now - 30 * 86400000), promotionTier: 2, farmEarned: 123.5, farmSpent: 100,
      boss: { startedAt: +now - 999999, hits: 10, lastHitAt: +now - 999900, damage: 300, claimed: true }, customRetainedField: { value: 'retained' } };
    await write(old); await write(old, other.id); await credit(30);
    const { relief, ...unchanged } = await office(); expect(unchanged).toEqual(old); expect(await office(other.id)).toEqual(old);
    expect(relief).toMatchObject({ chances: 0, remainderSeconds: 30, trackedSeconds: 30, version: 1 });
  });

  it('crosses 30 minutes once, drops full-pool overflow, and never decays saved chances or action version', async () => {
    const relief = { ...newOfficeRelief(+now), version: 7, chances: 9, remainderSeconds: 1790, trackedSeconds: 17990 };
    await write({ ...newOfficeProfile(+now), relief }); await credit(30);
    expect((await office()).relief).toMatchObject({ version: 7, chances: 10, remainderSeconds: 0, trackedSeconds: 18000 });
    now = new Date(+now + 60 * 86400000); await credit(75);
    expect((await office()).relief).toMatchObject({ version: 7, chances: 10, remainderSeconds: 0, trackedSeconds: 18000 });
    const p = await office(); p.relief.chances = 9; p.relief.totalPlays += 1; p.relief.version += 1;
    await db.query('UPDATE office_hub_profiles SET state=$2::jsonb WHERE user_id=$1', [user.id, JSON.stringify(p)]);
    await credit(30); expect((await office()).relief).toMatchObject({ version: 8, chances: 9, remainderSeconds: 30, trackedSeconds: 18030 });
  });

  it('does not multiply game time, replay intervals, use another tab lease, or backfill paused/offline time', async () => {
    const a = beat(), b = beat(); await fish.heartbeat(user.id, a); advance();
    await fish.heartbeat(user.id, { ...a, sequence: 2 }); const first = await office();
    expect(first.relief.trackedSeconds).toBe(30);
    advance(); await fish.heartbeat(user.id, { ...a, sequence: 2 }); await fish.heartbeat(user.id, b);
    expect(await office()).toEqual(first);
    await fish.heartbeat(user.id, { ...a, sequence: 3, mode: 'pause' }); advance();
    await fish.heartbeat(user.id, { ...b, sequence: 2 }); expect(await office()).toEqual(first);
    advance(76); await fish.heartbeat(user.id, { ...b, sequence: 3 }); expect(await office()).toEqual(first);
    advance(); await fish.heartbeat(user.id, { ...b, sequence: 4 });
    expect((await office()).relief).toMatchObject({ trackedSeconds: 60, remainderSeconds: 60, chances: 0 });
  });

  it('inherits the daily accepted-second cap and preserves the pool across a Beijing midnight reset', async () => {
    const a = beat(); await fish.heartbeat(user.id, a);
    await db.getRepository(CommunityFishProgress).update(user.id, { activeSeconds: 14390, gameSeconds: 0, dailyActiveSeconds: 14390, dailyGameSeconds: 0 });
    advance(); await fish.heartbeat(user.id, { ...a, sequence: 2 }); expect((await office()).relief.trackedSeconds).toBe(10);
    advance(); await fish.heartbeat(user.id, { ...a, sequence: 3 }); const capped = await office(); expect(capped.relief.trackedSeconds).toBe(10);
    now = new Date('2099-09-11T16:00:01Z'); await fish.heartbeat(user.id, { ...a, sequence: 4 }); expect(await office()).toEqual(capped);
    advance(); await fish.heartbeat(user.id, { ...a, sequence: 5 }); expect((await office()).relief.trackedSeconds).toBe(40);
  });

  it('disabled or inactive accounts cannot manufacture chances, and no grant is inferred from accumulated XP', async () => {
    const a = beat(); await fish.heartbeat(user.id, a); process.env.FEATURE_OFFICE_HUB_ENABLED = 'false';
    advance(); await fish.heartbeat(user.id, { ...a, sequence: 2 }); expect(await office()).toBeUndefined();
    process.env.FEATURE_OFFICE_HUB_ENABLED = 'true'; advance(); await fish.heartbeat(user.id, { ...a, sequence: 3 });
    const before = await office(); expect(before.relief.trackedSeconds).toBe(30);
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'false'; advance(); await expect(fish.heartbeat(user.id, { ...a, sequence: 4 })).rejects.toMatchObject({ status: 503 });
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true'; await db.getRepository(User).update(user.id, { accountStatus: 'deleted' });
    await expect(fish.heartbeat(user.id, { ...a, sequence: 5 })).rejects.toMatchObject({ status: 401 }); expect(await office()).toEqual(before);
  });
});
