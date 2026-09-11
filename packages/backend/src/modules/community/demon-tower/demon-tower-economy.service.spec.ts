import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import type { DemonTowerAction, DemonTowerActionInput } from '@stealth-reader/shared';
import { DemonTowerProfile, DemonTowerWorldFloor, User, WalletLedger } from '../../../database/entities';
import { createLocalDevDataSource } from '../../../database/local-dev-datasource';
import { PlatformAssetsService } from '../../platform/platform-assets.service';
import { DemonTowerService } from './demon-tower.service';
import type { DemonTowerEngineState } from './demon-tower.engine';

/** Repository integration only; release acceptance separately tests real PostgreSQL locking/rollback. */
describe('Demon tower economy service boundaries', () => {
  let db: DataSource, service: DemonTowerService, now: Date;
  const env = { ...process.env };
  beforeEach(async () => {
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true';
    process.env.FEATURE_COMMUNITY_DEMON_TOWER_ENABLED = 'true';
    process.env.FEATURE_DEMON_TOWER_EXPANSION_ENABLED = 'true';
    now = new Date('2099-09-08T02:00:00Z'); db = await createLocalDevDataSource();
    service = new DemonTowerService(db, new PlatformAssetsService({ now: () => now }), { now: () => now });
  });
  afterEach(async () => { if (db?.isInitialized) await db.destroy(); process.env = { ...env }; });
  const request = (action: DemonTowerAction, version: number): DemonTowerActionInput => ({ ...action, expectedVersion: version, requestId: randomUUID() });
  const raw = (user: User) => db.getRepository(DemonTowerProfile).createQueryBuilder('p').addSelect('p.state').where('p.user_id = :id', { id: user.id }).getOneOrFail();
  async function act(user: User, action: DemonTowerAction) { now = new Date(now.getTime() + 1001); return service.action(user.id, request(action, (await raw(user)).version)); }
  async function user() {
    const id = randomUUID();
    const actor = await db.getRepository(User).save(db.getRepository(User).create({ username: `economy-${id.slice(0, 8)}`, email: `${id}@synthetic.invalid`, passwordHash: 'synthetic-only', accountStatus: 'active' }));
    await service.action(actor.id, request({ kind: 'enroll', payload: {} }, 0)); return actor;
  }
  async function funded(actor: User) {
    await act(actor, { kind: 'train', payload: {} });
    const row = await raw(actor), state = row.state as unknown as DemonTowerEngineState;
    state.economy!.balance = 200; state.materials.soul = 200;
    await db.getRepository(DemonTowerProfile).save(row);
  }
  it('projects a legacy save with zero stones without persisting adaptation or granting wallet funds', async () => {
    const actor = await user(), before = await raw(actor);
    const view = await service.overview(actor.id);
    expect(view.profile!.economy).toMatchObject({ balance: 0, dailyEarned: 0 });
    expect(await raw(actor)).toEqual(before);
    expect(await db.getRepository(WalletLedger).count()).toBe(0);
  });
  it('saves one atomic purchase and replays it without another debit, reward or public-wallet operation', async () => {
    const actor = await user(); await funded(actor);
    const command = request({ kind: 'shop_purchase', payload: { offerId: 'pill_STR', quantity: 2 } }, (await raw(actor)).version);
    const first = await service.action(actor.id, command), saved = await raw(actor);
    expect(first.overview.profile!.economy).toMatchObject({ balance: 170, buffs: { STR: 10 } });
    expect(first.officeCoinsGranted).toBe(0);
    expect((await service.action(actor.id, command)).replayed).toBe(true); expect(await raw(actor)).toEqual(saved);
    await expect(service.action(actor.id, { ...command, payload: { offerId: 'pill_STR', quantity: 1 } }))
      .rejects.toMatchObject({ response: { code: 'DEMON_TOWER_IDEMPOTENCY_CONFLICT' } });
    await expect(service.action(actor.id, { ...command, requestId: randomUUID() }))
      .rejects.toMatchObject({ response: { code: 'DEMON_TOWER_VERSION_CONFLICT' } });
    expect(await db.getRepository(WalletLedger).count()).toBe(0);
  });
  it('keeps another account isolated and rejects price/owner injection and closed write gates', async () => {
    const a = await user(), b = await user(); await funded(a);
    const beforeA = await raw(a), beforeB = await raw(b);
    await expect(service.action(b.id, request({ kind: 'shop_purchase', payload: { offerId: 'pill_STR', quantity: 1 } }, beforeB.version)))
      .rejects.toMatchObject({ response: { code: 'DEMON_TOWER_NOT_ENOUGH_SPIRIT_STONES' } });
    await expect(service.action(a.id, { ...request({ kind: 'shop_purchase', payload: { offerId: 'pill_STR', quantity: 1 } }, beforeA.version), payload: { offerId: 'pill_STR', quantity: 1, price: 0, userId: b.id } }))
      .rejects.toMatchObject({ response: { code: 'DEMON_TOWER_INVALID_ACTION' } });
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'false';
    await expect(service.action(a.id, request({ kind: 'shop_purchase', payload: { offerId: 'pill_STR', quantity: 1 } }, beforeA.version))).rejects.toBeDefined();
    expect(await raw(a)).toEqual(beforeA); expect(await raw(b)).toEqual(beforeB);
  });
  it('credits only clamped effective world-boss damage and never recredits a replay', async () => {
    const actor = await user(); await funded(actor);
    const row = await raw(actor), state = row.state as unknown as DemonTowerEngineState;
    state.attributes.STR = 1000; state.attributes.SPD = 1000; state.attributes.DEF = 1000;
    state.economy!.balance = 0;
    await db.getRepository(DemonTowerProfile).save(row);
    await db.getRepository(DemonTowerWorldFloor).update({ floor: 1 }, { bossHp: 7 });
    const command = request({ kind: 'challenge_boss', payload: { floor: 1 } }, row.version);
    const result = await service.action(actor.id, command);
    expect(result.effectiveBossDamage).toBe(7);
    expect(result.overview.profile!.economy).toMatchObject({ balance: 3, bossEarned: 3, dailyEarned: 3 });
    const saved = await raw(actor); expect((await service.action(actor.id, command)).replayed).toBe(true);
    expect(await raw(actor)).toEqual(saved);
  });
  it('expires temporary bonuses on read without a DB write and preserves permanent bonuses through free reset', async () => {
    const actor = await user(); await funded(actor);
    await act(actor, { kind: 'allocate', payload: { attribute: 'STR', points: 1 } });
    await act(actor, { kind: 'shop_purchase', payload: { offerId: 'pill_STR', quantity: 1 } });
    await act(actor, { kind: 'shop_purchase', payload: { offerId: 'permanent_STR', quantity: 1 } });
    const reset = await act(actor, { kind: 'reset_attributes', payload: {} });
    expect(reset.overview.profile!.economy).toMatchObject({ permanent: { STR: 1 }, buffs: { STR: 5 } });
    const before = await raw(actor); now = new Date(now.getTime() + 86_400_000);
    const view = await service.overview(actor.id);
    expect(view.profile!.economy).toMatchObject({ permanent: { STR: 1 }, buffs: { STR: 0 } });
    expect(await raw(actor)).toEqual(before);
  });
});
