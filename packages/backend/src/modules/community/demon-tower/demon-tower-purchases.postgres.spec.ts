import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import type { DemonTowerAction, DemonTowerActionInput } from '@stealth-reader/shared';
import { entities, DemonTowerCommand, DemonTowerDailyProgress, DemonTowerProfile, User, WalletBalance, WalletLedger } from '../../../database/entities';
import { migrations } from '../../../database/migrations';
import { PlatformAssetsService } from '../../platform/platform-assets.service';
import { DemonTowerService } from './demon-tower.service';

// Explicit disposable DB only. Never read DB_*, DATABASE_URL or production config.
// Fixtures remain for dump/archive verification; this suite never drops a database or deletes rows.
const testUrl = process.env.DEMON_PURCHASE_TEST_DATABASE_URL;
if (testUrl) {
  const value = new URL(testUrl);
  if (!['postgres:', 'postgresql:'].includes(value.protocol) || !/^\/feedback_test_tower_purchases_[a-z0-9_]+$/.test(value.pathname)) {
    throw new Error('DEMON_PURCHASE_TEST_DATABASE_URL must name a fresh feedback_test_tower_purchases_* database');
  }
}
(testUrl ? describe : describe.skip)('Demon tower purchases real PostgreSQL atomicity', () => {
  let db: DataSource, service: DemonTowerService, assets: PlatformAssetsService, now: Date;
  const env = { ...process.env }, runId = randomUUID().slice(0, 8);
  const clock = { now: () => now };
  beforeAll(async () => {
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true';
    process.env.FEATURE_COMMUNITY_DEMON_TOWER_ENABLED = 'true';
    process.env.FEATURE_DEMON_TOWER_EXPANSION_ENABLED = 'true';
    now = new Date('2099-09-08T02:00:00Z');
    db = new DataSource({ type: 'postgres', url: testUrl!, entities, migrations, synchronize: false, logging: false,
      extra: { max: 8, application_name: `tower_purchases_test_${runId}`, statement_timeout: 15000 } });
    await db.initialize();
    const present = await db.query("SELECT to_regclass('public.users') IS NOT NULL AS present");
    if (present[0].present && (await db.query('SELECT count(*)::integer AS count FROM users'))[0].count !== 0) {
      throw new Error('Purchase acceptance requires a fresh empty synthetic test database');
    }
    await db.runMigrations();
    assets = new PlatformAssetsService(clock); service = new DemonTowerService(db, assets, clock);
  }, 60_000);
  beforeEach(() => { now = new Date('2099-09-08T02:00:00Z'); });
  afterEach(() => { jest.restoreAllMocks(); });
  afterAll(async () => { if (db?.isInitialized) await db.destroy(); process.env = { ...env }; });
  function command(action: DemonTowerAction, expectedVersion: number): DemonTowerActionInput { return { ...action, requestId: randomUUID(), expectedVersion }; }
  const pass = { kind: 'office_purchase', payload: { offer: 'pass' } } as const;
  async function actor(balance = 500): Promise<User> {
    const id = randomUUID(), repo = db.getRepository(User);
    const user = await repo.save(repo.create({ username: `buy-${id.slice(0, 8)}`, email: `${id}@tower-purchase.synthetic.invalid`, passwordHash: 'synthetic-only', accountStatus: 'active' }));
    await service.action(user.id, command({ kind: 'enroll', payload: {} }, 0));
    if (balance) await db.transaction(manager => assets.creditWallet(manager, user.id, 'office_coin', balance,
      { sourceType: 'synthetic_test_fixture', sourceId: id, reason: 'isolated-purchase-test', idempotencyKey: `purchase-fixture:${id}` }));
    return user;
  }
  const profile = (user: User) => db.getRepository(DemonTowerProfile).createQueryBuilder('profile').addSelect('profile.state').where('profile.user_id = :id', { id: user.id }).getOneOrFail();
  async function snapshot(user: User) {
    return {
      profile: await profile(user), wallet: await db.getRepository(WalletBalance).findOneBy({ userId: user.id, currency: 'office_coin' }),
      ledger: await db.getRepository(WalletLedger).find({ where: { userId: user.id }, order: { id: 'ASC' } }),
      daily: await db.getRepository(DemonTowerDailyProgress).find({ where: { userId: user.id }, order: { serviceDate: 'ASC' } }),
      commands: await db.getRepository(DemonTowerCommand).createQueryBuilder('command').addSelect(['command.receipt', 'command.requestHash'])
        .where('command.user_id = :id', { id: user.id }).orderBy('command.request_id', 'ASC').getMany(),
    };
  }

  it('serializes same-UUID concurrent retries into exactly one debit and one item grant', async () => {
    const user = await actor(), before = await profile(user), request = command(pass, before.version);
    const results = await Promise.all([service.action(user.id, request), service.action(user.id, request)]);
    expect(results.filter(row => row.replayed)).toHaveLength(1);
    for (const result of results) expect(result).toMatchObject({ officeCoinsSpent: 30, officeCoinsGranted: 0, overview: { wallet: { officeCoinBalance: 470 } } });
    const saved = await snapshot(user), debits = saved.ledger.filter(row => row.sourceType === 'demon_tower_shop');
    expect(saved.profile.version).toBe(before.version + 1); expect(debits).toHaveLength(1);
    expect(debits[0]).toMatchObject({ sourceId: request.requestId, delta: '-30', idempotencyKey: `demon-tower-shop:${user.id}:${request.requestId}` });
    expect(saved.commands.filter(row => row.requestId === request.requestId)).toHaveLength(1);
    await expect(service.action(user.id, { ...request, payload: { offer: 'star' } })).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_IDEMPOTENCY_CONFLICT' } });
    expect(await snapshot(user)).toEqual(saved);
  }, 30_000);

  it('allows one of two different UUIDs at the same version and prevents overdraw on the next version', async () => {
    const user = await actor(45), before = await profile(user);
    const results = await Promise.allSettled([service.action(user.id, command(pass, before.version)), service.action(user.id, command(pass, before.version))]);
    expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1);
    const failure = results.find(row => row.status === 'rejected') as PromiseRejectedResult;
    expect(failure.reason).toMatchObject({ response: { code: 'DEMON_TOWER_VERSION_CONFLICT' } });
    const saved = await snapshot(user); expect(saved.wallet!.balance).toBe('15');
    await expect(service.action(user.id, command(pass, saved.profile.version))).rejects.toMatchObject({ response: { code: 'INSUFFICIENT_WALLET_BALANCE' } });
    expect(await snapshot(user)).toEqual(saved);
  }, 30_000);

  it('rolls back a missing-wallet insufficient purchase including the provisional zero balance row', async () => {
    const user = await actor(0), before = await snapshot(user);
    await expect(service.action(user.id, command(pass, before.profile.version))).rejects.toMatchObject({ response: { code: 'INSUFFICIENT_WALLET_BALANCE' } });
    expect(await snapshot(user)).toEqual(before);
  });

  it('rolls back wallet, item, RNG, quota and profile when the final command insert fails', async () => {
    const user = await actor(), before = await snapshot(user), request = command({ kind: 'progressive_chest', payload: {} }, before.profile.version);
    const original = Repository.prototype.insert;
    const injected = jest.spyOn(Repository.prototype, 'insert').mockImplementation(function (this: Repository<object>, ...args) {
      if (this.metadata.target === DemonTowerCommand) throw new Error('synthetic final command failure');
      return original.apply(this, args);
    });
    await expect(service.action(user.id, request)).rejects.toThrow('synthetic final command failure');
    injected.mockRestore(); expect(await snapshot(user)).toEqual(before);
    expect((await service.action(user.id, request)).officeCoinsSpent).toBe(30);
  });

  it('rolls back a purchase that crosses Beijing midnight after debit, then permits the unchanged UUID', async () => {
    const user = await actor(), before = await snapshot(user), request = command(pass, before.profile.version);
    now = new Date('2099-09-08T15:59:59.900Z');
    const original = assets.debitWallet.bind(assets);
    const injected = jest.spyOn(assets, 'debitWallet').mockImplementation(async (...args) => {
      const result = await original(...args); now = new Date('2099-09-08T16:00:00.100Z'); return result;
    });
    await expect(service.action(user.id, request)).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_DAY_CHANGED' } });
    injected.mockRestore(); expect(await snapshot(user)).toEqual(before);
    const retry = await service.action(user.id, request);
    expect(retry).toMatchObject({ officeCoinsSpent: 30, overview: { wallet: { officeCoinBalance: 470 } } });
    expect((await db.getRepository(DemonTowerDailyProgress).findOneByOrFail({ userId: user.id, serviceDate: '2099-09-09' })).actionCount).toBe(1);
  });
});
