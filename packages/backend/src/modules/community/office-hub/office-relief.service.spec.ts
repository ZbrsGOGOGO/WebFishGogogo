import 'reflect-metadata';
import crypto = require('node:crypto');
import { DataSource, EntityManager } from 'typeorm';
import { type OfficeReliefState } from '@stealth-reader/shared';
import { User, WalletBalance, WalletLedger, DeskPlant, DemonTowerProfile, DemonTowerAutoRun, CommunityAchievementUnlock, CommunityUserPresentation } from '../../../database/entities';
import { createLocalDevDataSource } from '../../../database/local-dev-datasource';
import { PlatformAssetsService } from '../../platform';
import { actDemonTower, createDemonTowerState } from '../demon-tower/demon-tower.engine';
import { demonTowerWorldView, initialDemonTowerWorld } from '../demon-tower/demon-tower.rules';
import { OfficeHubService } from './office-hub.service';
import { accrueOfficeRelief, actOfficeRelief, newOfficeRelief } from './office-relief.rules';
import { newOfficeProfile, officeDay } from './office-hub.rules';

describe('Office relief real service persistence and cross-module ownership (pg-mem)', () => {
  let db: DataSource, service: OfficeHubService, assets: PlatformAssetsService, owner: User, peer: User, now: number;
  const env = { ...process.env };
  beforeEach(async () => {
    process.env.FEATURE_OFFICE_HUB_ENABLED = 'true'; process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true';
    process.env.FEATURE_COMMUNITY_PROGRESSION_ENABLED = 'true'; process.env.FEATURE_COMMUNITY_DEMON_TOWER_ENABLED = 'true'; process.env.FEATURE_DEMON_TOWER_EXPANSION_ENABLED = 'true';
    process.env.FEATURE_SOCIAL_VERIFICATION_ENABLED = 'false';
    now = Date.parse('2099-09-11T01:00:00Z'); jest.spyOn(Date, 'now').mockImplementation(() => now);
    db = await createLocalDevDataSource(); assets = new PlatformAssetsService({ now: () => new Date(now) }); service = new OfficeHubService(db, assets);
    const repo = db.getRepository(User); [owner, peer] = await repo.save(['relief_service', 'relief_service_peer'].map(username => repo.create({ username, email: username + '@synthetic.invalid', passwordHash: 'synthetic-only', accountStatus: 'active' })));
    await db.transaction(manager => assets.ensurePlatformState(manager, owner.id));
    // pg-mem lacks window functions. With no UGC rows this bounded read is
    // equivalent; all application writes and cross-module queries remain real.
    const original = EntityManager.prototype.query;
    jest.spyOn(EntityManager.prototype, 'query').mockImplementation(function (this: EntityManager, sql: string, parameters?: unknown[]) {
      if (sql.startsWith('SELECT * FROM (SELECT *,row_number() OVER(PARTITION BY kind')) {
        return original.call(this, 'SELECT * FROM office_hub_posts WHERE (hidden=false OR $1::boolean) ORDER BY created_at DESC,id DESC LIMIT 90', parameters);
      }
      return original.call(this, sql, parameters);
    });
  });
  afterEach(async () => { jest.restoreAllMocks(); if (db?.isInitialized) await db.destroy(); process.env = { ...env }; });
  const profile = async (user = owner) => (await db.query('SELECT state FROM office_hub_profiles WHERE user_id=$1', [user.id]))[0]?.state;
  async function seed(relief = accrueOfficeRelief(newOfficeRelief(now), 5400), user = owner) {
    await db.query('INSERT INTO office_hub_profiles(user_id,state) VALUES($1,$2::jsonb)', [user.id, JSON.stringify({ ...newOfficeProfile(now), relief })]);
  }
  const input = (action = 'relief_play', expectedVersion = 1, fields: Record<string, unknown> = { tool: 'keyboard' }, requestId = crypto.randomUUID()) => ({ requestId, action, expectedVersion, ...fields });
  const call = async (command: unknown, user = owner) => { now += 1100; return service.action(user.id, command); };
  function roll(...values: number[]) {
    return jest.spyOn(crypto, 'randomInt').mockImplementation(((...args: number[]) => {
      const value = values.shift(); if (value === undefined || args.length !== 1 || value < 0 || value >= args[0]) throw new Error('Unexpected synthetic RNG draw'); return value;
    }) as typeof crypto.randomInt);
  }
  function pending(rolls: number[][]): OfficeReliefState {
    let state = accrueOfficeRelief(newOfficeRelief(now), 1800 * rolls.length);
    for (const values of rolls) {
      const queue = [...values]; state = actOfficeRelief(state, { kind: 'play', tool: 'coffee' }, { now, requestId: crypto.randomUUID(), rng: max => { const value = queue.shift()!; expect(value).toBeLessThan(max); return value; } }).state;
    }
    return state;
  }
  async function snapshot(user = owner) {
    return { office: await profile(user), receipts: await db.query('SELECT * FROM office_hub_receipts WHERE user_id=$1 ORDER BY request_id', [user.id]),
      wallet: await db.getRepository(WalletBalance).findBy({ userId: user.id }), ledger: await db.getRepository(WalletLedger).find({ where: { userId: user.id }, order: { id: 'ASC' } }),
      plant: await db.getRepository(DeskPlant).findOneBy({ userId: user.id }), tower: await db.getRepository(DemonTowerProfile).createQueryBuilder('p').addSelect('p.state').where('p.user_id=:id', { id: user.id }).getOne(),
      titles: await db.getRepository(CommunityAchievementUnlock).find({ where: { userId: user.id }, order: { achievementKey: 'ASC' } }) };
  }
  async function tower(user = owner) {
    const state = actDemonTower(createDemonTowerState(now, officeDay(now), 'relief-service-synthetic-seed'), { kind: 'select_skin', payload: { skin: 'ledger' } },
      { now, serviceDate: officeDay(now), expansionEnabled: true, world: demonTowerWorldView(initialDemonTowerWorld(new Date(now))) }).state;
    return db.getRepository(DemonTowerProfile).save({ userId: user.id, version: 1, state: state as unknown as Record<string, unknown>, createdAt: new Date(now), updatedAt: new Date(now) });
  }

  it('keeps GET relief projection unpersisted and new lottery balances separate from the daily boss and main wallet', async () => {
    await seed(); const before = await snapshot(); const overview = await service.overview(owner.id);
    expect(overview.relief).toMatchObject({ chances: 3, version: 1 }); expect(await snapshot()).toEqual(before);
    const rng = roll(0, 0, 400); const won = await call(input()); rng.mockRestore();
    expect(won.relief).toMatchObject({ tokenBalance: 500, chances: 2, version: 2 }); expect(won.reliefReceipt).toMatchObject({ replayed: false, outcome: { kind: 'coin', tokenDelta: 500 } });
    const after = await snapshot(); expect(after.wallet).toEqual(before.wallet); expect(after.ledger).toEqual(before.ledger); expect(after.office.boss).toEqual(before.office.boss);
    expect(after.office.stats.bossDays).toBe(0); expect(after.receipts).toHaveLength(1);
    await call({ requestId: crypto.randomUUID(), action: 'boss_start' }); now += 30001;
    const daily = await call({ requestId: crypto.randomUUID(), action: 'boss_claim' });
    expect(daily.boss.claimed).toBe(true); expect(daily.relief?.tokenBalance).toBe(500);
    expect(Number((await db.getRepository(WalletBalance).findOneByOrFail({ userId: owner.id, currency: 'office_coin' })).balance)).toBe(520);
  });

  it('replays the original outcome after later actions, rejects changed payload/key and stale versions', async () => {
    await seed(); const command = input(); let rng = roll(0, 0, 900); const first = await call(command); rng.mockRestore();
    rng = roll(5000, 250); await call(input('relief_play', 2)); rng.mockRestore();
    const saved = await snapshot(), retry = await call(command);
    expect(retry.reliefReceipt).toEqual({ ...first.reliefReceipt, replayed: true }); expect(retry.relief?.tokenBalance).toBe(700); expect(await snapshot()).toEqual(saved);
    await expect(call({ ...command, tool: 'coffee' })).rejects.toMatchObject({ response: { code: 'OFFICE_IDEMPOTENCY_CONFLICT' } });
    await expect(call(input('relief_play', 1))).rejects.toMatchObject({ response: { code: 'OFFICE_RELIEF_VERSION_CONFLICT' } }); expect(await snapshot()).toEqual(saved);
  });

  it('floors losses at module zero, buys and explicitly equips cosmetic skins without changing main assets', async () => {
    const state = accrueOfficeRelief(newOfficeRelief(now), 5400); state.tokenBalance = 20; await seed(state); const wallet = (await snapshot()).wallet;
    const rng = roll(5000, 250); const lost = await call(input()); rng.mockRestore();
    expect(lost.reliefReceipt?.outcome).toMatchObject({ kind: 'loss', nominalAmount: 300, tokenDelta: -20 }); expect(lost.relief?.tokenBalance).toBe(0);
    await expect(call(input('relief_buy', 2, { skinId: 'mint' }))).rejects.toMatchObject({ response: { code: 'OFFICE_RELIEF_TOKENS_LOW' } });
    const p = await profile(); p.relief.tokenBalance = 2000; await db.query('UPDATE office_hub_profiles SET state=$2::jsonb WHERE user_id=$1', [owner.id, JSON.stringify(p)]);
    const bought = await call(input('relief_buy', 2, { skinId: 'mint' })); expect(bought.relief).toMatchObject({ tokenBalance: 800, equippedSkin: null, skins: ['mint'] });
    const equipped = await call(input('relief_equip', 3, { skinId: 'mint' })); expect(equipped.relief?.equippedSkin).toBe('mint'); expect((await snapshot()).wallet).toEqual(wallet);
  });

  it('rejects forged fields, unsupported actions, missing command fields and known no-chance requests without writes', async () => {
    await seed(newOfficeRelief(now)); const before = await snapshot();
    for (const raw of [null, [], { ...input(), action: 'relief_admin' }, { ...input(), userId: peer.id }, { ...input(), reward: 99999 }, { ...input(), expectedVersion: '1' }, { ...input(), tool: '<script>' }, { requestId: crypto.randomUUID(), action: 'relief_play', expectedVersion: 1 }]) {
      await expect(call(raw)).rejects.toBeDefined(); expect(await snapshot()).toEqual(before);
    }
    await expect(call(input())).rejects.toMatchObject({ response: { code: 'OFFICE_RELIEF_NO_CHANCES' } }); expect(await profile(peer)).toBeUndefined();
  });

  it('honors all feature gates and rejects deleted accounts without consuming chances or issuing titles', async () => {
    await seed(); const before = await snapshot();
    for (const key of ['FEATURE_OFFICE_HUB_ENABLED', 'FEATURE_COMMUNITY_WRITES_ENABLED', 'FEATURE_COMMUNITY_PROGRESSION_ENABLED']) {
      process.env[key] = 'false'; await expect(call(input())).rejects.toMatchObject({ status: 503 }); process.env[key] = 'true'; expect(await snapshot()).toEqual(before);
    }
    await db.getRepository(User).update(owner.id, { accountStatus: 'deleted' }); await expect(call(input())).rejects.toMatchObject({ response: { code: 'ACCOUNT_NOT_ACTIVE' } }); expect(await snapshot()).toEqual(before);
  });

  it('grants rare titles exactly once without automatic equip or a management-role change', async () => {
    await seed(); let rng = roll(9900, 0); const first = await call(input()); rng.mockRestore();
    expect(first.relief?.titles).toEqual(['office_relief_fish']); expect(await db.getRepository(CommunityAchievementUnlock).countBy({ userId: owner.id, achievementKey: 'office_relief_fish' })).toBe(1);
    expect(await db.getRepository(CommunityUserPresentation).count()).toBe(0);
    rng = roll(9900, 0); const duplicate = await call(input('relief_play', 2)); rng.mockRestore(); expect(duplicate.relief?.tokenBalance).toBe(500);
    expect(await db.getRepository(CommunityAchievementUnlock).countBy({ userId: owner.id })).toBe(1); expect((await db.getRepository(User).findOneByOrFail({ id: owner.id })).communityRole).toBe('user');
  });

  it('preserves missing-module pending rewards and grants exactly 30 real farm coins once after farm setup', async () => {
    const state = pending([[9970, 0]]); await seed(state); const dropId = state.pending[0].id, command = input('relief_claim', state.version, { dropId });
    const before = await snapshot(); await expect(call(command)).rejects.toMatchObject({ response: { code: 'OFFICE_RELIEF_FARM_REQUIRED' } }); expect(await snapshot()).toEqual(before);
    const farm = await db.getRepository(DeskPlant).save({ userId: owner.id, farmCoins: 50 });
    const claimed = await call(command); expect(claimed.relief?.pending).toEqual([]);
    const plant = await db.getRepository(DeskPlant).findOneByOrFail({ userId: owner.id }); expect(plant.farmCoins).toBe(80); expect(plant.farmVersion).toBe(farm.farmVersion + 1);
    const after = await snapshot(); expect((await call(command)).reliefReceipt?.replayed).toBe(true); expect(await snapshot()).toEqual(after);
    await expect(call(input('relief_claim', claimed.relief!.version, { dropId }))).rejects.toMatchObject({ response: { code: 'OFFICE_RELIEF_DROP_NOT_FOUND' } });
    expect(after.wallet).toEqual(before.wallet); expect(after.ledger).toEqual(before.ledger);
  });

  it('retains tower gifts until explicitly claimed and credits real materials, fragments and current-main weapon experience once', async () => {
    const state = pending([[9950, 0], [9990, 0], [9990, 1]]); await seed(state); const first = input('relief_claim', state.version, { dropId: state.pending[0].id });
    const before = await snapshot(); await expect(call(first)).rejects.toMatchObject({ response: { code: 'OFFICE_RELIEF_TOWER_REQUIRED' } }); expect(await snapshot()).toEqual(before);
    const initial = await tower(), original = structuredClone(initial.state) as any;
    for (const drop of state.pending) {
      const version = (await profile()).relief.version, command = input('relief_claim', version, { dropId: drop.id }); await call(command);
      const saved = await snapshot(); expect((await call(command)).reliefReceipt?.replayed).toBe(true); expect(await snapshot()).toEqual(saved);
    }
    const saved = await snapshot(), updated = saved.tower!.state as any;
    expect(updated.materials.ore).toBe(original.materials.ore + 3); expect(updated.provisions.fragments).toBe(original.provisions.fragments + 3);
    const beforeWeapon = original.weapons.find((weapon: any) => weapon.id === original.loadout.mainHand), afterWeapon = updated.weapons.find((weapon: any) => weapon.id === original.loadout.mainHand);
    expect(afterWeapon.qualityExperience).toBe(beforeWeapon.qualityExperience + 15); expect(afterWeapon.star).toBe(beforeWeapon.star); expect(afterWeapon.favor).toBe(beforeWeapon.favor); expect(saved.tower!.version).toBe(initial.version + 3);
    expect(updated.totalExperience).toBe(original.totalExperience); expect(saved.wallet).toEqual(before.wallet); expect(saved.ledger).toEqual(before.ledger); expect(saved.office.relief.pending).toEqual([]);
  });

  it('blocks tower claims during automatic exploration or a battle and respects module switches without discarding pending', async () => {
    const state = pending([[9950, 0]]); await seed(state); const p = await tower(), command = input('relief_claim', state.version, { dropId: state.pending[0].id });
    process.env.FEATURE_DEMON_TOWER_EXPANSION_ENABLED = 'false'; const disabled = await snapshot(); await expect(call(command)).rejects.toMatchObject({ response: { code: 'OFFICE_RELIEF_TOWER_REQUIRED' } }); expect(await snapshot()).toEqual(disabled); process.env.FEATURE_DEMON_TOWER_EXPANSION_ENABLED = 'true';
    const run = await db.getRepository(DemonTowerAutoRun).save({ id: crypto.randomUUID(), userId: owner.id, originAuthSessionId: null, startRequestId: crypto.randomUUID(), requestHash: 'a'.repeat(64), version: 1, status: 'running', stopReason: null, serviceDate: officeDay(now), floor: 1, maxExplorations: 1, startedExplorations: 0, completedExplorations: 0, steps: 0, expectedProfileVersion: p.version, officeCoinsGranted: 0, failureCount: 0, nextStepAt: new Date(now), expiresAt: new Date(now + 60000), createdAt: new Date(now), updatedAt: new Date(now), stoppedAt: null });
    const active = await snapshot(); await expect(call(command)).rejects.toMatchObject({ response: { code: 'OFFICE_RELIEF_TOWER_BUSY' } }); expect(await snapshot()).toEqual(active);
    await db.getRepository(DemonTowerAutoRun).update(run.id, { status: 'completed', stopReason: 'completed', stoppedAt: new Date(now) });
    let battleState = p.state as any;
    for (let i = 0; i < 15 && !battleState.battle; i++) battleState = actDemonTower(battleState, { kind: 'explore', payload: {} }, { now, serviceDate: officeDay(now), expansionEnabled: true, world: demonTowerWorldView(initialDemonTowerWorld(new Date(now))) }).state;
    expect(battleState.battle).not.toBeNull(); await db.getRepository(DemonTowerProfile).update(owner.id, { state: battleState });
    const fighting = await snapshot(); await expect(call(command)).rejects.toMatchObject({ response: { code: 'OFFICE_RELIEF_TOWER_BUSY' } }); expect(await snapshot()).toEqual(fighting);
  });
});
