import 'reflect-metadata';
import crypto = require('node:crypto');
import { DataSource, EntityManager, Repository } from 'typeorm';
import type { OfficeReliefState } from '@stealth-reader/shared';
import { entities, User, DeskPlant, DemonTowerProfile, CommunityFishProgress, CommunityAchievementUnlock } from '../../../database/entities';
import { migrations } from '../../../database/migrations';
import { PlatformAssetsService } from '../../platform';
import { FishGrowthService } from '../progression/fish-growth.service';
import { actDemonTower, createDemonTowerState } from '../demon-tower/demon-tower.engine';
import { demonTowerWorldView, initialDemonTowerWorld } from '../demon-tower/demon-tower.rules';
import { OfficeHubService } from './office-hub.service';
import { accrueOfficeRelief, actOfficeRelief, newOfficeRelief } from './office-relief.rules';
import { newOfficeProfile, officeDay } from './office-hub.rules';

// Never fall back to DB_* / DATABASE_URL. The supplied database must be fresh
// and isolated. Preserve all synthetic rows for release dump/archive evidence.
const testUrl = process.env.OFFICE_RELIEF_TEST_DATABASE_URL;
if (testUrl) {
  const parsed = new URL(testUrl);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !/^\/feedback_test_office_relief_[a-z0-9_]+$/.test(parsed.pathname)) {
    throw new Error('OFFICE_RELIEF_TEST_DATABASE_URL must name a fresh feedback_test_office_relief_* database');
  }
}
(testUrl ? describe : describe.skip)('Office relief actual PostgreSQL serialization and fault rollback', () => {
  let db: DataSource, service: OfficeHubService, fish: FishGrowthService, assets: PlatformAssetsService, now: number;
  const env = { ...process.env }, runId = crypto.randomUUID().slice(0, 8);
  beforeAll(async () => {
    for (const key of ['FEATURE_OFFICE_HUB_ENABLED', 'FEATURE_COMMUNITY_WRITES_ENABLED', 'FEATURE_COMMUNITY_PROGRESSION_ENABLED', 'FEATURE_COMMUNITY_DEMON_TOWER_ENABLED', 'FEATURE_DEMON_TOWER_EXPANSION_ENABLED']) process.env[key] = 'true';
    process.env.FEATURE_SOCIAL_VERIFICATION_ENABLED = 'false';
    db = new DataSource({ type: 'postgres', url: testUrl!, entities, migrations, synchronize: false, logging: false,
      extra: { max: 8, application_name: 'office_relief_test_' + runId, statement_timeout: 15000, lock_timeout: 10000 } });
    await db.initialize();
    const [{ present }] = await db.query("SELECT to_regclass('public.users') IS NOT NULL AS present");
    if (present && Number((await db.query('SELECT count(*) AS count FROM users'))[0].count) !== 0) throw new Error('Office relief acceptance requires a fresh empty synthetic database');
    await db.runMigrations();
    assets = new PlatformAssetsService({ now: () => new Date(now) }); service = new OfficeHubService(db, assets);
    fish = new FishGrowthService(db, { now: () => new Date(now) });
  }, 60000);
  beforeEach(() => { now = Date.parse('2099-09-11T01:00:00Z'); jest.spyOn(Date, 'now').mockImplementation(() => now); });
  afterEach(() => { jest.restoreAllMocks(); for (const key of ['FEATURE_OFFICE_HUB_ENABLED', 'FEATURE_COMMUNITY_WRITES_ENABLED', 'FEATURE_COMMUNITY_PROGRESSION_ENABLED', 'FEATURE_COMMUNITY_DEMON_TOWER_ENABLED', 'FEATURE_DEMON_TOWER_EXPANSION_ENABLED']) process.env[key] = 'true'; });
  afterAll(async () => { if (db?.isInitialized) await db.destroy(); process.env = { ...env }; });
  async function actor(relief = accrueOfficeRelief(newOfficeRelief(now), 3600)): Promise<User> {
    const id = crypto.randomUUID(), repo = db.getRepository(User);
    const user = await repo.save(repo.create({ username: 'or-' + id.slice(0, 8), email: id + '@office-relief.synthetic.invalid', passwordHash: 'synthetic-only', accountStatus: 'active' }));
    await db.transaction(manager => assets.ensurePlatformState(manager, user.id));
    await db.query('INSERT INTO office_hub_profiles(user_id,state) VALUES($1,$2::jsonb)', [user.id, JSON.stringify({ ...newOfficeProfile(now), relief })]);
    return user;
  }
  const command = (action = 'relief_play', expectedVersion = 1, fields: Record<string, unknown> = { tool: 'keyboard' }, requestId = crypto.randomUUID()) => ({ requestId, action, expectedVersion, ...fields });
  const act = async (user: User, input: unknown) => { now += 1100; return service.action(user.id, input); };
  const rawOffice = async (user: User) => (await db.query('SELECT state FROM office_hub_profiles WHERE user_id=$1', [user.id]))[0].state;
  function roll(...values: number[]) {
    return jest.spyOn(crypto, 'randomInt').mockImplementation(((...args: number[]) => {
      const value = values.shift(); if (value === undefined || args.length !== 1 || value < 0 || value >= args[0]) throw new Error('Unexpected synthetic RNG draw'); return value;
    }) as typeof crypto.randomInt);
  }
  function gift(values: number[]): OfficeReliefState {
    const queue = [...values];
    return actOfficeRelief(accrueOfficeRelief(newOfficeRelief(now), 1800), { kind: 'play', tool: 'coffee' },
      { now, requestId: crypto.randomUUID(), rng: max => { const value = queue.shift()!; expect(value).toBeLessThan(max); return value; } }).state;
  }
  async function tower(user: User) {
    const state = actDemonTower(createDemonTowerState(now, officeDay(now), 'isolated-office-relief-tower'), { kind: 'select_skin', payload: { skin: 'ledger' } },
      { now, serviceDate: officeDay(now), expansionEnabled: true, world: demonTowerWorldView(initialDemonTowerWorld(new Date(now))) }).state;
    return db.getRepository(DemonTowerProfile).save({ userId: user.id, version: 1, state: state as unknown as Record<string, unknown>, createdAt: new Date(now), updatedAt: new Date(now) });
  }
  async function snapshot(user: User) {
    return { office: await db.query('SELECT * FROM office_hub_profiles WHERE user_id=$1', [user.id]),
      receipts: await db.query('SELECT * FROM office_hub_receipts WHERE user_id=$1 ORDER BY request_id', [user.id]),
      wallets: await db.query('SELECT * FROM wallet_balances WHERE user_id=$1 ORDER BY currency', [user.id]),
      ledger: await db.query('SELECT * FROM wallet_ledger WHERE user_id=$1 ORDER BY id', [user.id]),
      farm: await db.getRepository(DeskPlant).findOneBy({ userId: user.id }),
      tower: await db.getRepository(DemonTowerProfile).createQueryBuilder('p').addSelect('p.state').where('p.user_id=:id', { id: user.id }).getOne(),
      towerCommands: await db.query('SELECT * FROM demon_tower_commands WHERE user_id=$1 ORDER BY request_id', [user.id]),
      fish: await db.getRepository(CommunityFishProgress).findOneBy({ userId: user.id }),
      titles: await db.getRepository(CommunityAchievementUnlock).find({ where: { userId: user.id }, order: { achievementKey: 'ASC' } }) };
  }

  it('same request concurrently consumes one chance, returns one immutable outcome and never changes the main wallet', async () => {
    const user = await actor(), before = await snapshot(user), input = command(); const rng = roll(0, 0, 0);
    const results = await Promise.all([service.action(user.id, input), service.action(user.id, input)]); rng.mockRestore();
    expect(results.filter(result => result.reliefReceipt?.replayed)).toHaveLength(1);
    expect(results[0].reliefReceipt?.outcome).toEqual(results[1].reliefReceipt?.outcome);
    const saved = await snapshot(user); expect(saved.office[0].state.relief).toMatchObject({ chances: 1, tokenBalance: 100, totalPlays: 1, version: 2 });
    expect(saved.receipts).toHaveLength(1); expect(saved.wallets).toEqual(before.wallets); expect(saved.ledger).toEqual(before.ledger);
    await expect(service.action(user.id, { ...input, tool: 'stapler' })).rejects.toMatchObject({ response: { code: 'OFFICE_IDEMPOTENCY_CONFLICT' } });
    expect(await snapshot(user)).toEqual(saved);
  }, 30000);

  it('different request IDs at one version have one winner and cannot double-consume or silently accept a stale quote', async () => {
    const user = await actor(), rng = roll(0, 0, 0);
    const results = await Promise.allSettled([service.action(user.id, command()), service.action(user.id, command())]); rng.mockRestore();
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect((results.find(result => result.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ response: { code: 'OFFICE_RELIEF_VERSION_CONFLICT' } });
    expect((await rawOffice(user)).relief).toMatchObject({ chances: 1, totalPlays: 1, tokenBalance: 100 });
  }, 30000);

  it('serializes a real heartbeat and consumption under the same account lock without losing newly earned chances', async () => {
    const user = await actor(accrueOfficeRelief(newOfficeRelief(now), 3570)), input = { tabId: crypto.randomUUID(), sequence: 1, mode: 'game' as const };
    await fish.heartbeat(user.id, input); now += 30000; const rng = roll(0, 0, 0);
    await Promise.all([fish.heartbeat(user.id, { ...input, sequence: 2 }), service.action(user.id, command())]); rng.mockRestore();
    const state = (await rawOffice(user)).relief; expect(state).toMatchObject({ version: 2, chances: 1, totalPlays: 1, remainderSeconds: 0, trackedSeconds: 3600 });
    const before = await snapshot(user); now += 30000; await fish.heartbeat(user.id, { ...input, sequence: 2 });
    await fish.heartbeat(user.id, { tabId: crypto.randomUUID(), sequence: 1, mode: 'game' }); expect(await snapshot(user)).toEqual(before);
  }, 30000);

  it('rolls back farm credit, pending removal and office state when the final immutable receipt insert fails', async () => {
    const state = gift([9970, 0]), user = await actor(state); await db.getRepository(DeskPlant).save({ userId: user.id, farmCoins: 70 });
    const before = await snapshot(user), input = command('relief_claim', state.version, { dropId: state.pending[0].id });
    const original = EntityManager.prototype.query; let observedRealCredit = false;
    const fault = jest.spyOn(EntityManager.prototype, 'query').mockImplementation(async function (this: EntityManager, sql: string, parameters?: unknown[]) {
      if (sql.startsWith('INSERT INTO office_hub_receipts') && parameters?.[0] === user.id) {
        const rows = await original.call(this, 'SELECT farm_coins FROM desk_plants WHERE user_id=$1', [user.id]) as Array<{ farm_coins: number }>; observedRealCredit = Number(rows[0].farm_coins) === 100;
        throw new Error('synthetic-office-receipt-failure');
      }
      return original.call(this, sql, parameters);
    });
    await expect(act(user, input)).rejects.toThrow('synthetic-office-receipt-failure'); fault.mockRestore(); expect(observedRealCredit).toBe(true); expect(await snapshot(user)).toEqual(before);
    const result = await act(user, input); expect(result.relief?.pending).toEqual([]); expect((await db.getRepository(DeskPlant).findOneByOrFail({ userId: user.id })).farmCoins).toBe(100);
    const saved = await snapshot(user); expect((await act(user, input)).reliefReceipt?.replayed).toBe(true); expect(await snapshot(user)).toEqual(saved);
  });

  it('rolls back a granted title and persisted play when the post-write view fails, then safely retries the same UUID', async () => {
    const user = await actor(), before = await snapshot(user), input = command(), original = (service as any).view; let observedTitle = false;
    const fault = jest.spyOn(service as any, 'view').mockImplementation(async (...args: unknown[]) => {
      const manager = args[0] as EntityManager;
      observedTitle = await manager.getRepository(CommunityAchievementUnlock).countBy({ userId: user.id, achievementKey: 'office_relief_fish' }) === 1;
      throw new Error('synthetic-office-view-failure');
    });
    let rng = roll(9900, 0); await expect(act(user, input)).rejects.toThrow('synthetic-office-view-failure'); rng.mockRestore(); fault.mockRestore();
    expect((service as any).view).toBe(original); expect(observedTitle).toBe(true); expect(await snapshot(user)).toEqual(before);
    rng = roll(9900, 0); await act(user, input); rng.mockRestore(); expect(await db.getRepository(CommunityAchievementUnlock).countBy({ userId: user.id, achievementKey: 'office_relief_fish' })).toBe(1);
  });

  it('rolls back fish time when the actual downstream office save fails and retries the unchanged heartbeat only once', async () => {
    const user = await actor(newOfficeRelief(now)), beat = { tabId: crypto.randomUUID(), sequence: 1, mode: 'browse' as const };
    await fish.heartbeat(user.id, beat); now += 30000; const before = await snapshot(user), original = EntityManager.prototype.query; let observedFishWrite = false;
    const fault = jest.spyOn(EntityManager.prototype, 'query').mockImplementation(async function (this: EntityManager, sql: string, parameters?: unknown[]) {
      if (sql.startsWith('UPDATE office_hub_profiles SET state=') && parameters?.[0] === user.id) {
        const saved = await this.getRepository(CommunityFishProgress).findOneByOrFail({ userId: user.id }); observedFishWrite = saved.activeSeconds === 30;
        throw new Error('synthetic-office-activity-write-failure');
      }
      return original.call(this, sql, parameters);
    });
    await expect(fish.heartbeat(user.id, { ...beat, sequence: 2 })).rejects.toThrow('synthetic-office-activity-write-failure'); fault.mockRestore();
    expect(observedFishWrite).toBe(true); expect(await snapshot(user)).toEqual(before);
    await fish.heartbeat(user.id, { ...beat, sequence: 2 }); expect((await rawOffice(user)).relief.trackedSeconds).toBe(30);
    expect((await db.getRepository(CommunityFishProgress).findOneByOrFail({ userId: user.id })).activeSeconds).toBe(30);
  });

  it.each(['FEATURE_COMMUNITY_WRITES_ENABLED', 'FEATURE_COMMUNITY_PROGRESSION_ENABLED'])('rolls back both accepted-time writes when %s closes during the office save', async key => {
    const user = await actor(newOfficeRelief(now)), beat = { tabId: crypto.randomUUID(), sequence: 1, mode: 'game' as const };
    await fish.heartbeat(user.id, beat); now += 30000; const before = await snapshot(user), original = EntityManager.prototype.query; let wroteOffice = false;
    const fault = jest.spyOn(EntityManager.prototype, 'query').mockImplementation(async function (this: EntityManager, sql: string, parameters?: unknown[]) {
      const result = await original.call(this, sql, parameters);
      if (sql.startsWith('UPDATE office_hub_profiles SET state=') && parameters?.[0] === user.id) { wroteOffice = true; process.env[key] = 'false'; }
      return result;
    });
    await expect(fish.heartbeat(user.id, { ...beat, sequence: 2 })).rejects.toMatchObject({ status: 503 }); fault.mockRestore(); process.env[key] = 'true';
    expect(wroteOffice).toBe(true); expect(await snapshot(user)).toEqual(before);
    process.env.FEATURE_OFFICE_HUB_ENABLED = 'false'; await fish.heartbeat(user.id, { ...beat, sequence: 2 });
    expect((await db.getRepository(CommunityFishProgress).findOneByOrFail({ userId: user.id })).activeSeconds).toBe(30); expect((await rawOffice(user)).relief.trackedSeconds).toBe(0);
  });

  it.each(['FEATURE_OFFICE_HUB_ENABLED', 'FEATURE_COMMUNITY_WRITES_ENABLED', 'FEATURE_COMMUNITY_PROGRESSION_ENABLED'])('rolls back an already saved relief action when %s closes in final projection', async key => {
    const user = await actor(), before = await snapshot(user), input = command(), original = (service as any).view;
    const fault = jest.spyOn(service as any, 'view').mockImplementation(async function (...args: unknown[]) { const result = await original.apply(service, args); process.env[key] = 'false'; return result; });
    const rng = roll(0, 0, 0); await expect(act(user, input)).rejects.toMatchObject({ status: 503 }); rng.mockRestore(); fault.mockRestore(); process.env[key] = 'true';
    expect(await snapshot(user)).toEqual(before);
  });

  it('rolls back a real tower grant that crosses Beijing midnight after profile save and permits the original UUID on the next day', async () => {
    const state = gift([9950, 0]), user = await actor(state); await tower(user); const input = command('relief_claim', state.version, { dropId: state.pending[0].id });
    now = Date.parse('2099-09-11T15:59:59.900Z'); const before = await snapshot(user), original = Repository.prototype.save; let wroteTower = false;
    const fault = jest.spyOn(Repository.prototype, 'save').mockImplementation(async function (this: Repository<object>, ...args: any[]) {
      const result = await (original as any).apply(this, args);
      if (this.metadata.target === DemonTowerProfile) { wroteTower = true; now = Date.parse('2099-09-11T16:00:00.100Z'); }
      return result;
    });
    await expect(service.action(user.id, input)).rejects.toMatchObject({ response: { code: 'OFFICE_RELIEF_DAY_CHANGED' } }); fault.mockRestore();
    expect(wroteTower).toBe(true); expect(await snapshot(user)).toEqual(before);
    await service.action(user.id, input); const saved = await snapshot(user);
    expect((saved.tower!.state as any).materials.ore).toBe((before.tower!.state as any).materials.ore + 3); expect(saved.towerCommands).toEqual(before.towerCommands); expect(saved.wallets).toEqual(before.wallets);
  });
});
