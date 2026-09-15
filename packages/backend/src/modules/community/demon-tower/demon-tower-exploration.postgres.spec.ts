import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import type { DemonTowerActionInput } from '@stealth-reader/shared';
import { entities, DemonTowerCommand, DemonTowerDailyProgress, DemonTowerProfile, DemonTowerWorldFloor, RewardGrant, User, WalletBalance, WalletLedger } from '../../../database/entities';
import { migrations } from '../../../database/migrations';
import { PlatformAssetsService } from '../../platform/platform-assets.service';
import { actDemonTower, type DemonTowerEngineState } from './demon-tower.engine';
import { DemonTowerService } from './demon-tower.service';

// Explicit loopback, disposable synthetic DB only. Never use DB_*/production settings.
const testUrl = process.env.DEMON_EXPLORATION_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    !/^\/feedback_test_tower_explore_[a-z0-9_]+$/.test(url.pathname)) throw new Error('Exploration tests require an explicitly named loopback feedback_test_tower_explore_* database');
}

(testUrl ? describe : describe.skip)('Demon tower exploration real PostgreSQL atomicity', () => {
  let db: DataSource, service: DemonTowerService, assets: PlatformAssetsService;
  const env = { ...process.env }, runId = randomUUID().slice(0, 8);
  const now = new Date('2099-09-08T02:00:00Z'), clock = { now: () => now };
  beforeAll(async () => {
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true'; process.env.FEATURE_COMMUNITY_DEMON_TOWER_ENABLED = 'true';
    process.env.FEATURE_DEMON_TOWER_EXPANSION_ENABLED = 'true';
    db = new DataSource({ type: 'postgres', url: testUrl!, entities, migrations, synchronize: false, logging: false,
      extra: { max: 8, application_name: `tower_exploration_test_${runId}`, statement_timeout: 15000 } });
    await db.initialize();
    if ((await db.query("SELECT to_regclass('public.users') IS NOT NULL AS present"))[0].present) {
      const rows = await db.query("SELECT count(*)::integer AS count FROM users WHERE email NOT LIKE '%@tower-explore.synthetic.invalid'");
      if (rows[0].count !== 0) throw new Error('Exploration database contains non-exploration fixtures; refusing to run');
    }
    await db.runMigrations(); assets = new PlatformAssetsService(clock); service = new DemonTowerService(db, assets, clock);
  }, 60_000);
  afterEach(() => { jest.restoreAllMocks(); });
  afterAll(async () => { if (db?.isInitialized) await db.destroy(); process.env = { ...env }; });
  const command = (version: number, kind: 'explore' | 'explore_with_pass' = 'explore'): DemonTowerActionInput => ({ requestId: randomUUID(), expectedVersion: version, kind, payload: {} });
  const profile = (actor: User) => db.getRepository(DemonTowerProfile).createQueryBuilder('profile').addSelect('profile.state').where('profile.user_id = :id', { id: actor.id }).getOneOrFail();
  async function actor(outcome: 'battle' | 'treasure' | 'blessing' = 'treasure', initializeAssets = false) {
    const id = randomUUID(), repo = db.getRepository(User);
    const user = await repo.save(repo.create({ username: `explore-${id.slice(0, 8)}`, email: `${id}@tower-explore.synthetic.invalid`, passwordHash: 'synthetic-only', accountStatus: 'active' }));
    if (initializeAssets) await db.transaction(manager => assets.ensurePlatformState(manager, user.id));
    await service.action(user.id, { kind: 'enroll', payload: {}, requestId: randomUUID(), expectedVersion: 0 });
    const row = await profile(user), view = await service.overview(user.id), state = row.state as unknown as DemonTowerEngineState;
    let found = false;
    for (let seed = 0; seed < 100 && !found; seed++) {
      state.rngSeed = `pg-exploration-synthetic-${seed}`; state.rngCounter = 0;
      found = actDemonTower(state, { kind: 'explore', payload: {} }, { now: now.getTime(), serviceDate: '2099-09-08', world: view.world, expansionEnabled: true }).exploration?.outcome === outcome;
    }
    if (!found) throw new Error('Synthetic exploration seed not found');
    await db.getRepository(DemonTowerProfile).save(row); return user;
  }
  async function snapshot(user: User) {
    return {
      profile: await profile(user), wallet: await db.getRepository(WalletBalance).find({ where: { userId: user.id }, order: { currency: 'ASC' } }),
      ledger: await db.getRepository(WalletLedger).find({ where: { userId: user.id }, order: { id: 'ASC' } }),
      grants: await db.getRepository(RewardGrant).find({ where: { userId: user.id }, order: { id: 'ASC' } }),
      daily: await db.getRepository(DemonTowerDailyProgress).find({ where: { userId: user.id }, order: { serviceDate: 'ASC' } }),
      commands: await db.getRepository(DemonTowerCommand).createQueryBuilder('command').addSelect(['command.receipt', 'command.requestHash'])
        .where('command.user_id = :id', { id: user.id }).orderBy('command.request_id', 'ASC').getMany(),
      world: await db.getRepository(DemonTowerWorldFloor).find({ order: { floor: 'ASC' } }),
    };
  }

  it.each(['battle', 'treasure', 'blessing'] as const)('restores the owned %s departure and actual rewards without changing a save on GET', async outcome => {
    const user = await actor(outcome), before = await profile(user), request = command(before.version), result = await service.action(user.id, request);
    expect(result.exploration).toMatchObject({ requestId: request.requestId, source: 'manual', appliedVersion: before.version + 1,
      completedAt: now.getTime(), result: { outcome, floor: 1, staminaSpent: 5, passesSpent: 0 }, officeCoinsGranted: outcome === 'battle' ? 0 : 2 });
    expect(result.overview.profile!.stamina).toBe(95);
    expect(result.exploration!.result!.experience).toBe(result.overview.profile!.totalExperience - (before.state as unknown as DemonTowerEngineState).totalExperience);
    const saved = await snapshot(user), recovered = await service.overview(user.id);
    expect(recovered.lastExploration).toEqual(result.exploration); expect(await snapshot(user)).toEqual(saved);
    const privatePayload = JSON.stringify(recovered.lastExploration);
    expect(privatePayload).not.toMatch(/rngSeed|rngCounter|passwordHash|email|wallet|loadout|originAuthSessionId/);
  });
  it('serializes same-UUID concurrent requests into exactly one five-stamina departure and reward', async () => {
    const user = await actor('treasure', true), baseline = await snapshot(user), before = baseline.profile, request = command(before.version);
    const results = await Promise.all([service.action(user.id, request), service.action(user.id, request)]);
    expect(results.filter(row => row.replayed)).toHaveLength(1); expect(results[0].exploration).toEqual(results[1].exploration);
    const saved = await snapshot(user);
    expect(saved.profile.version).toBe(before.version + 1); expect((saved.profile.state as unknown as DemonTowerEngineState).stamina).toBe(95);
    expect(saved.commands.filter(row => row.requestId === request.requestId)).toHaveLength(1); expect(saved.grants).toHaveLength(baseline.grants.length + 1);
    expect(saved.ledger).toHaveLength(baseline.ledger.length + 1);
    expect(saved.ledger.filter(row => row.sourceType === 'demon_tower_action' && row.sourceId === request.requestId)).toMatchObject([{ currency: 'office_coin', delta: '2' }]);
    expect(BigInt(saved.wallet.find(row => row.currency === 'office_coin')!.balance)).toBe(BigInt(baseline.wallet.find(row => row.currency === 'office_coin')?.balance ?? '0') + 2n);
    expect(saved.daily[0].actionCount).toBe(2);
  }, 30_000);
  it('rejects one of two different UUIDs at the same version without a second cost/reward', async () => {
    const user = await actor('treasure', true), baseline = await snapshot(user), before = baseline.profile;
    const results = await Promise.allSettled([service.action(user.id, command(before.version)), service.action(user.id, command(before.version))]);
    expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1);
    expect((results.find(row => row.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ response: { code: 'DEMON_TOWER_VERSION_CONFLICT' } });
    const saved = await snapshot(user); expect(saved.profile.version).toBe(before.version + 1);
    expect((saved.profile.state as unknown as DemonTowerEngineState).stamina).toBe(95); expect(saved.grants).toHaveLength(baseline.grants.length + 1);
    expect(saved.ledger).toHaveLength(baseline.ledger.length + 1);
    expect(saved.ledger.filter(row => row.sourceType === 'demon_tower_action')).toMatchObject([{ currency: 'office_coin', delta: '2' }]);
    expect(BigInt(saved.wallet.find(row => row.currency === 'office_coin')!.balance)).toBe(BigInt(baseline.wallet.find(row => row.currency === 'office_coin')?.balance ?? '0') + 2n);
  }, 30_000);
  it('initializes the real lazy starting balance once, separately from an exactly-once exploration reward', async () => {
    const user = await actor(), before = await snapshot(user), input = command(before.profile.version);
    expect(before.wallet).toEqual([]); expect(before.ledger).toEqual([]);
    const results = await Promise.all([service.action(user.id, input), service.action(user.id, input)]);
    expect(results.filter(result => result.replayed)).toHaveLength(1);
    expect(results.map(result => result.officeCoinsGranted)).toEqual([2, 2]);
    const saved = await snapshot(user);
    expect(saved.wallet.find(row => row.currency === 'office_coin')?.balance).toBe('502');
    expect(saved.ledger).toHaveLength(2);
    expect(saved.ledger.filter(row => row.sourceType === 'platform_onboarding')).toMatchObject([{ sourceId: user.id, currency: 'office_coin', delta: '500' }]);
    expect(saved.ledger.filter(row => row.sourceType === 'demon_tower_action')).toMatchObject([{ sourceId: input.requestId, currency: 'office_coin', delta: '2' }]);
    expect((await service.action(user.id, input)).replayed).toBe(true);
    expect(await snapshot(user)).toEqual(saved);
  }, 30_000);
  it('recovers a committed departure after a lost response and replays the original UUID without any second write', async () => {
    const user = await actor(), before = await profile(user), request = command(before.version);
    await expect((async () => { await service.action(user.id, request); throw new Error('synthetic response lost after commit'); })()).rejects.toThrow('response lost');
    const saved = await snapshot(user), recovered = await service.overview(user.id), retry = await service.action(user.id, request);
    expect(retry.replayed).toBe(true); expect(retry.exploration).toEqual(recovered.lastExploration); expect(await snapshot(user)).toEqual(saved);
  });
  it('retains an older UUID outcome while projecting the newest successful departure and current profile', async () => {
    const user = await actor(), initial = await profile(user), firstInput = command(initial.version);
    const first = await service.action(user.id, firstInput), secondInput = command(first.overview.profile!.version), second = await service.action(user.id, secondInput);
    const saved = await snapshot(user), replay = await service.action(user.id, firstInput);
    expect(replay.replayed).toBe(true); expect(replay.exploration).toEqual(first.exploration);
    expect(replay.overview.lastExploration).toEqual(second.exploration); expect(replay.overview.profile!.version).toBe(second.overview.profile!.version);
    expect(await snapshot(user)).toEqual(saved);
  });
  it('consumes one manual exploration pass instead of stamina and restores/replays it without a second pass cost', async () => {
    const user = await actor(), row = await profile(user), view = await service.overview(user.id);
    const prepared = actDemonTower(row.state as unknown as DemonTowerEngineState, { kind: 'train', payload: {} }, { now: now.getTime(), serviceDate: '2099-09-08', world: view.world, expansionEnabled: true }).state;
    prepared.provisions!.passes = 1; row.state = prepared as unknown as Record<string, unknown>; await db.getRepository(DemonTowerProfile).save(row);
    const input = command(row.version, 'explore_with_pass'), result = await service.action(user.id, input);
    expect(result.exploration!.result).toMatchObject({ staminaSpent: 0, passesSpent: 1 }); expect(result.overview.profile!.stamina).toBe(prepared.stamina);
    const saved = await snapshot(user); expect((saved.profile.state as unknown as DemonTowerEngineState).provisions!.passes).toBe(0);
    expect((await service.overview(user.id)).lastExploration).toEqual(result.exploration);
    expect((await service.action(user.id, input)).replayed).toBe(true); expect(await snapshot(user)).toEqual(saved);
  });
  it.each(['profile', 'command', 'projection', 'reward'] as const)('rolls back costs, RNG, rewards, quota and receipt after a %s failure', async failure => {
    const user = await actor(), before = await snapshot(user), request = command(before.profile.version);
    let injection: { mockRestore(): void };
    if (failure === 'profile') {
      const original = Repository.prototype.save;
      injection = jest.spyOn(Repository.prototype, 'save').mockImplementation(async function (this: Repository<object>, ...args) {
        const result = await original.apply(this, args);
        if (this.metadata.target === DemonTowerProfile) throw new Error('synthetic exploration fault'); return result;
      });
    } else if (failure === 'command') {
      const original = Repository.prototype.insert;
      injection = jest.spyOn(Repository.prototype, 'insert').mockImplementation(async function (this: Repository<object>, ...args) {
        const result = await original.apply(this, args);
        if (this.metadata.target === DemonTowerCommand) throw new Error('synthetic exploration fault'); return result;
      });
    } else if (failure === 'reward') {
      const original = assets.grantReward.bind(assets);
      injection = jest.spyOn(assets, 'grantReward').mockImplementation(async (...args) => { await original(...args); throw new Error('synthetic exploration fault'); });
    } else {
      const target = service as unknown as { project: (...args: unknown[]) => Promise<unknown> }, original = target.project.bind(service);
      injection = jest.spyOn(target, 'project').mockImplementation(async (...args) => { await original(...args); throw new Error('synthetic exploration fault'); });
    }
    await expect(service.action(user.id, request)).rejects.toThrow('synthetic exploration fault'); injection.mockRestore();
    expect(await snapshot(user)).toEqual(before);
    const retry = await service.action(user.id, request); expect(retry.replayed).toBe(false); expect(retry.overview.profile!.stamina).toBe(95);
    expect((await snapshot(user)).grants).toHaveLength(1);
  });
  it('rejects invalid payloads or insufficient stamina without creating a departure receipt or changing any state', async () => {
    const user = await actor(), before = await snapshot(user), input = command(before.profile.version);
    await expect(service.action(user.id, { ...input, payload: { staminaRefund: 5 } })).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_INVALID_ACTION' } });
    expect(await snapshot(user)).toEqual(before);
    const row = await profile(user); (row.state as unknown as DemonTowerEngineState).stamina = 4; await db.getRepository(DemonTowerProfile).save(row);
    const low = await snapshot(user);
    await expect(service.action(user.id, command(row.version))).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_NOT_ENOUGH_STAMINA' } });
    expect(await snapshot(user)).toEqual(low); expect((await service.overview(user.id)).lastExploration).toBeNull();
  });
  it('does not expose another user receipt and recovers legacy text without inferring costs or classification', async () => {
    const user = await actor(), other = await actor(), before = await profile(user), request = command(before.version);
    const result = await service.action(user.id, request);
    expect((await service.overview(other.id)).lastExploration).toBeNull();
    const repo = db.getRepository(DemonTowerCommand), row = await repo.createQueryBuilder('command').addSelect('command.receipt').where('command.user_id = :id AND command.request_id = :requestId', { id: user.id, requestId: request.requestId }).getOneOrFail();
    delete (row.receipt as Record<string, unknown>).exploration; await repo.save(row);
    const legacy = (await service.overview(user.id)).lastExploration!;
    expect(legacy).toMatchObject({ requestId: request.requestId, source: 'legacy', events: result.events, officeCoinsGranted: result.officeCoinsGranted });
    expect(legacy.result).toBeUndefined(); expect((await service.action(user.id, request)).exploration).toBeUndefined();
  });
});
