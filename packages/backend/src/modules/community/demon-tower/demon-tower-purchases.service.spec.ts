import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import type { DemonTowerAction, DemonTowerActionInput } from '@stealth-reader/shared';
import { DemonTowerCommand, DemonTowerProfile, User, WalletBalance, WalletLedger } from '../../../database/entities';
import { createLocalDevDataSource } from '../../../database/local-dev-datasource';
import { PlatformAssetsService } from '../../platform/platform-assets.service';
import * as engine from './demon-tower.engine';
import { DemonTowerService } from './demon-tower.service';

/** pg-mem repository coverage; rollback/concurrency is asserted only in the explicit PostgreSQL suite. */
describe('Demon tower office-coin purchase service', () => {
  let db: DataSource, service: DemonTowerService, assets: PlatformAssetsService, now: Date;
  const env = { ...process.env };
  beforeEach(async () => {
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true'; process.env.FEATURE_COMMUNITY_DEMON_TOWER_ENABLED = 'true';
    process.env.FEATURE_DEMON_TOWER_EXPANSION_ENABLED = 'true'; now = new Date('2099-09-08T02:00:00Z');
    db = await createLocalDevDataSource(); assets = new PlatformAssetsService({ now: () => now });
    service = new DemonTowerService(db, assets, { now: () => now });
  });
  afterEach(async () => { jest.restoreAllMocks(); if (db?.isInitialized) await db.destroy(); process.env = { ...env }; });
  const pass = { kind: 'office_purchase', payload: { offer: 'pass' } } as const;
  function input(action: DemonTowerAction, expectedVersion: number): DemonTowerActionInput { return { ...action, requestId: randomUUID(), expectedVersion }; }
  const raw = (user: User) => db.getRepository(DemonTowerProfile).createQueryBuilder('profile').addSelect('profile.state').where('profile.user_id = :id', { id: user.id }).getOneOrFail();
  async function actor(balance = 500): Promise<User> {
    const id = randomUUID(), repo = db.getRepository(User);
    const user = await repo.save(repo.create({ username: `buy-${id.slice(0, 8)}`, email: `${id}@purchase-service.invalid`, passwordHash: 'synthetic-only', accountStatus: 'active' }));
    await service.action(user.id, input({ kind: 'enroll', payload: {} }, 0));
    if (balance) await db.transaction(manager => assets.creditWallet(manager, user.id, 'office_coin', balance,
      { sourceType: 'synthetic_test_fixture', sourceId: id, reason: 'purchase-test', idempotencyKey: `purchase-fixture:${id}` }));
    return user;
  }
  async function act(user: User, action: DemonTowerAction) { now = new Date(now.getTime() + 1001); return service.action(user.id, input(action, (await raw(user)).version)); }
  const debitRows = (user: User) => db.getRepository(WalletLedger).find({ where: { userId: user.id, sourceType: 'demon_tower_shop' } });

  it('debits the authoritative wallet once and replays the immutable spent amount with current balance', async () => {
    const user = await actor(), before = await raw(user), request = input(pass, before.version);
    const result = await service.action(user.id, request), saved = await raw(user);
    expect(result).toMatchObject({ replayed: false, officeCoinsSpent: 30, officeCoinsGranted: 0, overview: { wallet: { officeCoinBalance: 470 } } });
    expect(result.events).toContain('已从全站钱包扣除 30 办公币。');
    expect(saved.version).toBe(before.version + 1);
    expect(await debitRows(user)).toHaveLength(1);
    expect((await debitRows(user))[0]).toMatchObject({ userId: user.id, currency: 'office_coin', sourceType: 'demon_tower_shop', sourceId: request.requestId, idempotencyKey: `demon-tower-shop:${user.id}:${request.requestId}` });
    expect(Number((await debitRows(user))[0].delta)).toBe(-30);
    await db.transaction(manager => assets.creditWallet(manager, user.id, 'office_coin', 10,
      { sourceType: 'synthetic_test_fixture', sourceId: randomUUID(), reason: 'later-credit', idempotencyKey: randomUUID() }));
    expect(await service.action(user.id, request)).toMatchObject({ replayed: true, officeCoinsSpent: 30, overview: { wallet: { officeCoinBalance: 480 } } });
    expect(await raw(user)).toEqual(saved); expect(await debitRows(user)).toHaveLength(1);
    await expect(service.action(user.id, { ...request, payload: { offer: 'star' } })).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_IDEMPOTENCY_CONFLICT' } });
    await expect(service.action(user.id, { ...request, requestId: randomUUID() })).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_VERSION_CONFLICT' } });
  });

  it('uses server daily progressive chest prices and resets them on the Beijing business day', async () => {
    const user = await actor(), action = { kind: 'progressive_chest', payload: {} } as const;
    expect((await act(user, action)).officeCoinsSpent).toBe(30);
    expect((await act(user, action)).officeCoinsSpent).toBe(55);
    now = new Date('2099-09-08T16:00:00Z');
    const reset = await act(user, action);
    expect(reset).toMatchObject({ officeCoinsSpent: 30, officeCoinsGranted: 0, overview: { wallet: { officeCoinBalance: 385 } } });
    expect(await debitRows(user)).toHaveLength(3);
  });

  it('rejects insufficient balance, forged pricing and other-account payloads before changing the save', async () => {
    const user = await actor(20), other = await actor(), before = await raw(user), otherBefore = await raw(other);
    const count = await db.getRepository(DemonTowerCommand).count();
    await expect(service.action(user.id, input(pass, before.version))).rejects.toMatchObject({ response: { code: 'INSUFFICIENT_WALLET_BALANCE' } });
    for (const extra of [{ cost: 0 }, { price: 0 }, { userId: other.id }, { quantity: 5 }, { currency: 'spirit_stone' }]) {
      await expect(service.action(user.id, { ...input(pass, before.version), payload: { offer: 'pass', ...extra } })).rejects.toBeDefined();
    }
    expect(await raw(user)).toEqual(before); expect(await raw(other)).toEqual(otherBefore);
    expect(await debitRows(user)).toHaveLength(0); expect(await db.getRepository(DemonTowerCommand).count()).toBe(count);
    expect(Number((await db.getRepository(WalletBalance).findOneByOrFail({ userId: user.id, currency: 'office_coin' })).balance)).toBe(20);
  });

  it('never debits legacy actions and rejects unexpected or invalid engine cost before writes', async () => {
    const user = await actor(), debit = jest.spyOn(assets, 'debitWallet');
    const old = await act(user, { kind: 'train', payload: {} });
    expect(old.officeCoinsSpent).toBeUndefined(); expect(debit).not.toHaveBeenCalled();
    const before = await raw(user), actual = engine.actDemonTower;
    const simulate = jest.spyOn(engine, 'actDemonTower');
    for (const cost of [1, 301, -1, 0.5, Number.NaN]) {
      simulate.mockImplementation((...args) => ({ ...actual(...args), officeCoinCost: cost }));
      await expect(service.action(user.id, input({ kind: 'train', payload: {} }, before.version))).rejects.toThrow('Demon tower purchase cost invariant failed');
      expect(await raw(user)).toEqual(before);
    }
    simulate.mockRestore(); expect(debit).not.toHaveBeenCalled();
  });

  it('refuses a free/oversized engine purchase, a stranded debit replay and maintenance writes', async () => {
    const user = await actor(), before = await raw(user), actual = engine.actDemonTower;
    const simulate = jest.spyOn(engine, 'actDemonTower');
    for (const officeCoinCost of [0, 301]) {
      simulate.mockImplementation((...args) => ({ ...actual(...args), officeCoinCost }));
      await expect(service.action(user.id, input(pass, before.version))).rejects.toThrow('Demon tower purchase cost invariant failed');
    }
    simulate.mockRestore();
    const request = input(pass, before.version);
    await db.transaction(manager => assets.debitWallet(manager, user.id, 'office_coin', 30,
      { sourceType: 'demon_tower_shop', sourceId: request.requestId, reason: 'demon-tower-office_purchase', idempotencyKey: `demon-tower-shop:${user.id}:${request.requestId}` }));
    await expect(service.action(user.id, request)).rejects.toThrow('Demon tower purchase receipt invariant failed');
    expect(await raw(user)).toEqual(before); expect(await debitRows(user)).toHaveLength(1);
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'false';
    await expect(service.action(user.id, input(pass, before.version))).rejects.toBeDefined();
    expect(await raw(user)).toEqual(before); expect(await debitRows(user)).toHaveLength(1);
  });
});
