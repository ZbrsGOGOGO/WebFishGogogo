import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { randomUUID } from 'node:crypto';
import { DEMON_TOWER_CATALOG, type DemonTowerAction, type DemonTowerActionInput } from '@stealth-reader/shared';
import type { DataSource } from 'typeorm';
import { DemonTowerCommand, DemonTowerContribution, DemonTowerDailyProgress, DemonTowerProfile, DemonTowerWorldFloor, RewardGrant, User, WalletBalance, WalletLedger } from '../../../database/entities';
import { createLocalDevDataSource } from '../../../database/local-dev-datasource';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../auth/optional-jwt-auth.guard';
import { PlatformAssetsService } from '../../platform/platform-assets.service';
import { DemonTowerController } from './demon-tower.controller';
import { type DemonTowerEngineState } from './demon-tower.engine';
import { DemonTowerService } from './demon-tower.service';

/** pg-mem checks real mappings/queries. Concurrent locks and failure rollback require the real-PG script. */
describe('DemonTowerService entity integration', () => {
  let db: DataSource;
  let service: DemonTowerService;
  let assets: PlatformAssetsService;
  let now: Date;
  const env = { ...process.env };
  beforeEach(async () => {
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true'; process.env.FEATURE_COMMUNITY_DEMON_TOWER_ENABLED = 'true';
    now = new Date('2099-09-08T02:00:00Z');
    db = await createLocalDevDataSource();
    assets = new PlatformAssetsService({ now: () => now });
    service = new DemonTowerService(db, assets, { now: () => now });
  });
  afterEach(async () => { jest.restoreAllMocks(); if (db?.isInitialized) await db.destroy(); process.env = { ...env }; });
  async function user(label: string, status: User['accountStatus'] = 'active'): Promise<User> {
    const repo = db.getRepository(User);
    return repo.save(repo.create({ email: `${label}@tower-service-test.invalid`, username: label, displayName: label, passwordHash: 'synthetic-only', accountStatus: status }));
  }
  const request = (kind: DemonTowerAction['kind'] = 'enroll', expectedVersion = 0, payload: object = {}): DemonTowerActionInput => ({ requestId: randomUUID(), expectedVersion, kind, payload }) as DemonTowerActionInput;
  async function act(actor: User, kind: DemonTowerAction['kind'], payload: object = {}) {
    now = new Date(now.getTime() + 1001);
    const current = await service.overview(actor.id);
    if (kind === 'challenge_boss' || kind === 'donate') payload = { floor: current.world.currentFloor, ...payload };
    return service.action(actor.id, request(kind, current.profile?.version ?? 0, payload));
  }
  async function rawProfile(actor: User): Promise<DemonTowerProfile> {
    return db.getRepository(DemonTowerProfile).createQueryBuilder('profile').addSelect('profile.state').where('profile.user_id = :id', { id: actor.id }).getOneOrFail();
  }
  async function prepareState(actor: User, change: (state: DemonTowerEngineState) => void): Promise<void> {
    const row = await rawProfile(actor); change(row.state as unknown as DemonTowerEngineState); await db.getRepository(DemonTowerProfile).save(row);
  }

  it('protects personal endpoints and authenticates optional tokens on public leaderboards', () => {
    for (const name of ['overview', 'action'] as const) expect(Reflect.getMetadata(GUARDS_METADATA, DemonTowerController.prototype[name])).toContain(JwtAuthGuard);
    for (const name of ['leaderboard', 'contributions'] as const) expect(Reflect.getMetadata(GUARDS_METADATA, DemonTowerController.prototype[name])).toContain(OptionalJwtAuthGuard);
    expect(Reflect.getMetadata(GUARDS_METADATA, DemonTowerController.prototype.catalog)).toBeUndefined();
  });
  it('does not initialize personal/world/wallet state on GET and requires explicit enrollment', async () => {
    const a = await user('alice');
    expect(await service.overview(a.id)).toMatchObject({ profile: null, world: { phase: 'boss', currentFloor: 1 }, wallet: { officeCoinBalance: 0 } });
    for (const entity of [DemonTowerProfile, DemonTowerWorldFloor, DemonTowerDailyProgress, DemonTowerCommand, WalletBalance]) expect(await db.getRepository(entity).count()).toBe(0);
    await expect(service.action(a.id, request('train'))).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_ENROLL_REQUIRED' } });
    const first = await service.action(a.id, request());
    expect(first.overview.profile).toMatchObject({ level: 1, version: 1, stamina: DEMON_TOWER_CATALOG.rules.staminaCap });
    expect(first.overview.profile?.weapons.map((item) => item.id)).toEqual(expect.arrayContaining(['w1', 'w17']));
    expect(await db.getRepository(DemonTowerWorldFloor).count()).toBe(9);
    expect(await db.getRepository(WalletBalance).count()).toBe(0);
  });
  it('rejects inactive/missing users and forged user/seed/score fields without creating any game state', async () => {
    const a = await user('alice'); const suspended = await user('suspended', 'suspended');
    for (const id of [suspended.id, randomUUID()]) {
      await expect(service.action(id, request())).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_ACTIVE_ACCOUNT_REQUIRED' } });
      await expect(service.overview(id)).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_ACTIVE_ACCOUNT_REQUIRED' } });
    }
    for (const extra of [{ userId: suspended.id }, { score: 100000 }, { seed: 'forged' }]) await expect(service.action(a.id, { ...request(), ...extra })).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_REQUEST_INVALID' } });
    expect(await db.getRepository(DemonTowerProfile).count()).toBe(0);
  });
  it('binds UUID to full action/version payload, supports stale exact replay and returns current state/current wallet', async () => {
    const a = await user('alice'); const enrollment = request();
    const first = await service.action(a.id, enrollment);
    const trained = await act(a, 'train');
    await db.transaction((manager) => assets.creditWallet(manager, a.id, 'office_coin', 17, { sourceType: 'tower_test', sourceId: 'fresh-wallet', reason: 'test', idempotencyKey: randomUUID() }));
    const replay = await service.action(a.id, enrollment);
    expect(first.replayed).toBe(false); expect(replay.replayed).toBe(true);
    expect(replay.overview.profile?.version).toBe(trained.overview.profile?.version);
    expect(replay.overview.profile?.totalExperience).toBe(trained.overview.profile?.totalExperience);
    expect(replay.overview.wallet.officeCoinBalance).toBe(17);
    expect(await db.getRepository(DemonTowerCommand).count()).toBe(2);
    await expect(service.action(a.id, { ...enrollment, kind: 'train' })).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_IDEMPOTENCY_CONFLICT' } });
    await expect(service.action(a.id, { ...enrollment, expectedVersion: 2 })).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_IDEMPOTENCY_CONFLICT' } });
    await expect(service.action(a.id, request('train', 1))).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_VERSION_CONFLICT', currentVersion: 2 } });
  });
  it('isolates each caller save even when request UUIDs are the same, and redacts all RNG/receipt internals', async () => {
    const a = await user('alice'); const b = await user('bob'); const enrollment = request();
    await service.action(a.id, enrollment); await service.action(b.id, enrollment); await act(a, 'train');
    const av = await service.overview(a.id); const bv = await service.overview(b.id);
    expect(av.profile?.totalExperience).toBeGreaterThan(0); expect(bv.profile?.totalExperience).toBe(0);
    const secret = (await rawProfile(a)).state.rngSeed;
    for (const view of [av, bv, await service.action(a.id, enrollment)]) {
      const serialized = JSON.stringify(view);
      expect(serialized).not.toMatch(/rngSeed|rngCounter|requestHash|passwordHash|email|"state"|userId/);
      expect(serialized).not.toContain(secret); expect(serialized).not.toContain(a.id); expect(serialized).not.toContain(b.id);
    }
  });
  it('projects offline stamina without persisting a read or allowing maintenance/disabled writes', async () => {
    const a = await user('alice'); await act(a, 'enroll'); await act(a, 'train');
    const before = await rawProfile(a); const stored = before.state as unknown as DemonTowerEngineState;
    now = new Date(now.getTime() + 600_000);
    expect((await service.overview(a.id)).profile!.stamina).toBeGreaterThan(stored.stamina);
    expect((await rawProfile(a)).state).toEqual(before.state);
    for (const gate of ['FEATURE_COMMUNITY_WRITES_ENABLED', 'FEATURE_COMMUNITY_DEMON_TOWER_ENABLED']) {
      process.env[gate] = 'false';
      const view = await service.overview(a.id);
      expect(view.writesEnabled).toBe(false); expect(view.profile?.stamina).toBe(stored.stamina);
      await expect(service.action(a.id, request('train', before.version))).rejects.toMatchObject({ status: 503 });
      expect((await rawProfile(a)).state).toEqual(before.state);
      process.env[gate] = 'true';
    }
  });
  it('rejects extra engine payload fields without consuming a receipt/version or stamina', async () => {
    const a = await user('alice'); await act(a, 'enroll'); const before = await rawProfile(a);
    await expect(service.action(a.id, request('train', 1, { score: 500 }))).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_INVALID_ACTION' } });
    expect(await rawProfile(a)).toEqual(before);
    expect(await db.getRepository(DemonTowerCommand).count()).toBe(1);
    await expect(service.action(a.id, request('allocate', 1, { attribute: 'STR', points: 999 }))).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_NOT_ENOUGH_ATTRIBUTE_POINTS' } });
  });
  it('runs a server-owned ordinary battle, rejects foreign targets and permits only one turn per receipt', async () => {
    const a = await user('alice'); await act(a, 'enroll');
    await prepareState(a, (state) => { state.rngSeed = 'a'.repeat(64); state.rngCounter = 0; });
    let view = (await act(a, 'explore')).overview;
    for (let count = 0; count < 10 && !view.profile?.battle; count++) view = (await act(a, 'explore')).overview;
    expect(view.profile?.battle).not.toBeNull();
    const battle = view.profile!.battle!;
    const attack = request('attack', view.profile!.version, { targetId: battle.enemies[0].id });
    await expect(service.action(a.id, { ...attack, payload: { targetId: 'another-user-target' } })).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_INVALID_TARGET' } });
    const result = await service.action(a.id, attack); const replay = await service.action(a.id, attack);
    expect(replay.replayed).toBe(true); expect(replay.overview.profile).toEqual(result.overview.profile);
    expect(result.overview.profile?.battle?.turn ?? result.overview.profile?.lastReport?.turns).toBe(1);
    if (result.overview.profile?.battle) {
      await expect(service.action(a.id, request('equip', result.overview.profile.version, result.overview.profile.loadout))).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_BATTLE_IN_PROGRESS' } });
      const fled = await act(a, 'flee'); expect(fled.overview.profile?.lastReport?.outcome).toBe('fled'); expect(fled.officeCoinsGranted).toBe(0);
    }
  });
  it('clips the last world hit, records only effective damage and refuses to attack an already-dead boss', async () => {
    const a = await user('alice'); await act(a, 'enroll');
    await prepareState(a, (state) => { state.rngSeed = 'a'.repeat(64); state.rngCounter = 0; });
    await db.getRepository(DemonTowerWorldFloor).update({ floor: 1 }, { bossHp: 1 });
    const result = await act(a, 'challenge_boss');
    expect(result.effectiveBossDamage).toBe(1); expect(result.overview.world.phase).toBe('passage');
    expect(result.overview.profile?.lastReport?.damage).toBe(1); expect(result.overview.profile!.lastReport!.turns).toBeLessThanOrEqual(5);
    expect((await db.getRepository(DemonTowerContribution).findOneByOrFail({ userId: a.id, floor: 1 })).bossDamage).toBe(1);
    const before = await rawProfile(a);
    await expect(act(a, 'challenge_boss')).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_BOSS_UNAVAILABLE' } });
    expect((await rawProfile(a)).state).toEqual(before.state);
    expect((await db.getRepository(DemonTowerDailyProgress).findOneByOrFail({ userId: a.id, serviceDate: '2099-09-08' })).bossDamage).toBe(1);
  });
  it('completes passage once using only needed materials and unlocks a layer for qualified late joiners', async () => {
    const a = await user('alice'); const b = await user('bob'); await act(a, 'enroll'); await act(b, 'enroll');
    await db.getRepository(DemonTowerWorldFloor).update({ floor: 1 }, { bossHp: 0, defeatedAt: now, passageProgress: DEMON_TOWER_CATALOG.floors[0].passageRequired - 1 });
    await prepareState(a, (state) => { state.materials.clue = 10; });
    const result = await act(a, 'donate', { material: 'clue', amount: 10 });
    expect(result.passageContribution).toBe(1); expect(result.overview.profile?.materials.clue).toBe(9);
    expect(result.overview.world).toMatchObject({ currentFloor: 2, unlockedFloor: 2, completedFloors: [1], phase: 'boss' });
    expect(result.officeCoinsGranted).toBe(0);
    await expect(act(a, 'donate', { material: 'ore', amount: 1 })).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_PASSAGE_UNAVAILABLE' } });
    await prepareState(b, (state) => { state.level = 5; });
    expect((await act(b, 'select_floor', { floor: 2 })).overview.profile?.selectedFloor).toBe(2);
    expect(await db.getRepository(DemonTowerContribution).count({ where: { userId: b.id } })).toBe(0);
  });
  it('enforces three daily boss attempts independently in the persisted daily row', async () => {
    const a = await user('alice'); await act(a, 'enroll');
    await db.getRepository(DemonTowerDailyProgress).update({ userId: a.id, serviceDate: '2099-09-08' }, { bossAttempts: 3 });
    await expect(act(a, 'challenge_boss')).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_BOSS_DAILY_LIMIT' } });
    expect((await db.getRepository(DemonTowerWorldFloor).findOneByOrFail({ floor: 1 })).bossHp).toBe(DEMON_TOWER_CATALOG.floors[0].bossMaxHp);
  });
  it('persists ninth-floor completion, prevents further world costs and leaves unlocked exploration available', async () => {
    const a = await user('alice'); await act(a, 'enroll');
    // Qualified late-game fixture, not a claim that a new player reaches level 110 in one action.
    await prepareState(a, (state) => { state.level = 110; state.materials.clue = 1; });
    for (const floor of DEMON_TOWER_CATALOG.floors) await db.getRepository(DemonTowerWorldFloor).update({ floor: floor.floor }, {
      unlockedAt: now, bossHp: 0, defeatedAt: now,
      passageProgress: floor.passageRequired - (floor.floor === 9 ? 1 : 0), completedAt: floor.floor === 9 ? null : now,
    });
    const completed = await act(a, 'donate', { floor: 9, material: 'clue', amount: 1 });
    expect(completed.passageContribution).toBe(1); expect(completed.officeCoinsGranted).toBe(0);
    expect(completed.overview.profile?.materials.clue).toBe(0);
    expect(completed.overview.world).toMatchObject({ currentFloor: 9, unlockedFloor: 9, phase: 'complete', completedFloors: [1, 2, 3, 4, 5, 6, 7, 8, 9] });
    const saved = await rawProfile(a); const worlds = await db.getRepository(DemonTowerWorldFloor).find({ order: { floor: 'ASC' } });
    await expect(act(a, 'donate', { floor: 9, material: 'ore', amount: 1 })).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_PASSAGE_UNAVAILABLE' } });
    await expect(act(a, 'challenge_boss', { floor: 9 })).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_BOSS_UNAVAILABLE' } });
    expect(await rawProfile(a)).toEqual(saved);
    expect(await db.getRepository(DemonTowerWorldFloor).find({ order: { floor: 'ASC' } })).toEqual(worlds);
    expect(await db.getRepository(DemonTowerCommand).count()).toBe(2);
    expect(await db.getRepository(RewardGrant).count()).toBe(0);
    expect((await act(a, 'select_floor', { floor: 9 })).overview.profile?.selectedFloor).toBe(9);
    expect((await act(a, 'select_floor', { floor: 1 })).overview.profile?.selectedFloor).toBe(1);
    expect((await act(a, 'train')).overview.world.phase).toBe('complete');
    expect(await db.getRepository(DemonTowerWorldFloor).count()).toBe(9);
  });
  it('requires the intended world floor, rejects old targets without costs, and permits fresh HP on the same floor', async () => {
    const a = await user('alice'); await act(a, 'enroll');
    for (const floor of [undefined, null, '1', 0, 10, 1.5]) {
      await expect(service.action(a.id, request('challenge_boss', 1, floor === undefined ? {} : { floor }))).rejects.toMatchObject({ status: 400 });
    }
    const oldBossRequest = request('challenge_boss', 1, { floor: 1 });
    await db.getRepository(DemonTowerWorldFloor).update({ floor: 1 }, { bossHp: 0, defeatedAt: now, passageProgress: DEMON_TOWER_CATALOG.floors[0].passageRequired, completedAt: now });
    await db.getRepository(DemonTowerWorldFloor).update({ floor: 2 }, { unlockedAt: now });
    await prepareState(a, (state) => { state.level = 5; state.rngSeed = 'a'.repeat(64); state.rngCounter = 0; });
    const before = await rawProfile(a); const dayBefore = await db.getRepository(DemonTowerDailyProgress).findOneByOrFail({ userId: a.id, serviceDate: '2099-09-08' });
    await expect(service.action(a.id, oldBossRequest)).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_WORLD_FLOOR_CHANGED' } });
    await expect(service.action(a.id, request('donate', 1, { floor: 1, material: 'ore', amount: 1 }))).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_WORLD_FLOOR_CHANGED' } });
    expect(await rawProfile(a)).toEqual(before);
    expect(await db.getRepository(DemonTowerDailyProgress).findOneByOrFail({ userId: a.id, serviceDate: '2099-09-08' })).toEqual(dayBefore);
    expect(await db.getRepository(DemonTowerCommand).count()).toBe(1);
    const currentRequest = request('challenge_boss', 1, { floor: 2 });
    await db.getRepository(DemonTowerWorldFloor).update({ floor: 2 }, { bossHp: 1, version: 20 });
    const current = await service.action(a.id, currentRequest);
    expect(current.effectiveBossDamage).toBe(1); expect(current.overview.profile?.version).toBe(2);
  });
  it('caps normal coins at 200, records a clipped payout once, and resets the date exactly at Shanghai midnight', async () => {
    const a = await user('alice'); await act(a, 'enroll');
    for (let index = 0; index < 3; index++) await act(a, 'train');
    await db.getRepository(DemonTowerDailyProgress).update({ userId: a.id, serviceDate: '2099-09-08' }, { officeCoins: 199 });
    const claim = request('claim_reward', (await service.overview(a.id)).profile!.version);
    const result = await service.action(a.id, claim);
    expect(result.officeCoinsGranted).toBe(1); expect(result.overview.profile?.daily.officeCoinsEarned).toBe(200);
    expect((await service.action(a.id, claim)).officeCoinsGranted).toBe(1);
    expect(await db.getRepository(RewardGrant).count({ where: { sourceType: 'demon_tower_action' } })).toBe(1);
    expect(await db.getRepository(WalletLedger).count({ where: { sourceType: 'demon_tower_action' } })).toBe(1);
    now = new Date('2099-09-08T16:00:00Z');
    const nextDay = await act(a, 'train');
    expect(nextDay.overview.profile?.daily).toMatchObject({ serviceDate: '2099-09-09', officeCoinsEarned: 0, activity: 1, rewardClaimed: false, bossAttempts: 0 });
    expect(await db.getRepository(DemonTowerDailyProgress).count({ where: { userId: a.id } })).toBe(2);
  });
  it('keeps upgrades and game XP independent from the account wallet and old platform growth', async () => {
    const a = await user('alice'); await act(a, 'enroll');
    const first = await service.overview(a.id);
    const upgraded = await act(a, 'upgrade', { itemType: 'skill', itemId: 's1' });
    expect(upgraded.overview.profile?.skills.find((item) => item.id === 's1')?.quality).toBe(1);
    expect(upgraded.overview.profile?.materials.soul).toBeLessThan(first.profile!.materials.soul);
    expect(upgraded.officeCoinsGranted).toBe(0); expect(await db.getRepository(WalletBalance).count()).toBe(0);
  });
  it('bounds successful commands by rate and daily count, while exact replays do not consume quota', async () => {
    const a = await user('alice'); const enrollment = request(); await service.action(a.id, enrollment);
    for (let version = 1; version < 6; version++) await service.action(a.id, request('train', version));
    await expect(service.action(a.id, request('train', 6))).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_ACTION_RATE_LIMIT' } });
    expect((await service.action(a.id, enrollment)).replayed).toBe(true);
    await db.getRepository(DemonTowerDailyProgress).update({ userId: a.id, serviceDate: '2099-09-08' }, { actionCount: 2000 });
    await expect(act(a, 'train')).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_DAILY_ACTION_LIMIT' } });
  });
  it('rejects new no-op commands without consuming quota but replays historical successful floor/loadout UUIDs', async () => {
    const a = await user('alice'); await act(a, 'enroll');
    const initial = (await service.overview(a.id)).profile!;
    const loadout = { ...initial.loadout, mainHand: 'w5' };
    const equip = request('equip', initial.version, loadout);
    await service.action(a.id, equip); await act(a, 'train');
    // Only unlock/qualification are fixtures; both recorded actions really change their prior state.
    await db.getRepository(DemonTowerWorldFloor).update({ floor: 1 }, { bossHp: 0, defeatedAt: now, passageProgress: DEMON_TOWER_CATALOG.floors[0].passageRequired, completedAt: now });
    await db.getRepository(DemonTowerWorldFloor).update({ floor: 2 }, { unlockedAt: now });
    await prepareState(a, (state) => { state.level = 5; });
    const changeFloor = request('select_floor', (await rawProfile(a)).version, { floor: 2 });
    await service.action(a.id, changeFloor); await act(a, 'train');
    const before = await rawProfile(a);
    const day = await db.getRepository(DemonTowerDailyProgress).findOneByOrFail({ userId: a.id, serviceDate: '2099-09-08' });
    const count = await db.getRepository(DemonTowerCommand).countBy({ userId: a.id });
    for (const [kind, payload, code] of [
      ['equip', loadout, 'DEMON_TOWER_LOADOUT_UNCHANGED'],
      ['select_floor', { floor: 2 }, 'DEMON_TOWER_FLOOR_UNCHANGED'],
    ] as const) await expect(service.action(a.id, request(kind, before.version, payload))).rejects.toMatchObject({ response: { code } });
    for (const historical of [equip, changeFloor]) {
      const receipt = await service.action(a.id, historical);
      expect(receipt.replayed).toBe(true); expect(receipt.overview.profile?.version).toBe(before.version);
      expect(receipt.overview.profile?.selectedFloor).toBe(2); expect(receipt.overview.profile?.loadout.mainHand).toBe('w5');
    }
    expect(await rawProfile(a)).toEqual(before);
    expect(await db.getRepository(DemonTowerDailyProgress).findOneByOrFail({ userId: a.id, serviceDate: day.serviceDate })).toEqual(day);
    expect(await db.getRepository(DemonTowerCommand).countBy({ userId: a.id })).toBe(count);
    expect(await db.getRepository(RewardGrant).count()).toBe(0);
  });
  it('persists free attribute resets once, conserves real earned points and honors the exact 24-hour boundary', async () => {
    const a = await user('alice'); await act(a, 'enroll');
    await expect(act(a, 'reset_attributes')).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_ATTRIBUTES_UNCHANGED' } });
    expect(await db.getRepository(DemonTowerCommand).countBy({ userId: a.id })).toBe(1);
    for (let index = 0; (await service.overview(a.id)).profile!.level < 2 && index < 5; index++) await act(a, 'train');
    const grown = (await service.overview(a.id)).profile!;
    expect(grown.level).toBeGreaterThanOrEqual(2);
    await act(a, 'allocate', { attribute: 'STR', points: 3 });
    const allocated = (await service.overview(a.id)).profile!;
    expect(allocated.attributeReset.allocatedPoints).toBe(3);
    const worlds = await db.getRepository(DemonTowerWorldFloor).find({ order: { floor: 'ASC' } });
    const rng = (await rawProfile(a)).state.rngCounter;
    const input = request('reset_attributes', allocated.version);
    const first = await service.action(a.id, input);
    expect(first.officeCoinsGranted).toBe(0); expect(first.effectiveBossDamage).toBe(0); expect(first.passageContribution).toBe(0);
    expect(first.overview.profile?.attributes).toEqual(grown.attributes);
    expect(first.overview.profile?.unspentPoints).toBe(grown.unspentPoints);
    expect(first.overview.profile?.attributeReset).toEqual({ allocatedPoints: 0, eligibleAt: now.getTime() + DEMON_TOWER_CATALOG.rules.attributeResetCooldownMs });
    expect((await rawProfile(a)).state.rngCounter).toBe(rng);
    await act(a, 'allocate', { attribute: 'DEF', points: 1 });
    const before = await rawProfile(a); const count = await db.getRepository(DemonTowerCommand).countBy({ userId: a.id });
    const retry = request('reset_attributes', before.version);
    const eligibleAt = first.overview.profile!.attributeReset.eligibleAt!;
    now = new Date(eligibleAt - 1);
    await expect(service.action(a.id, retry)).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_ATTRIBUTE_RESET_COOLDOWN' } });
    const oldReplay = await service.action(a.id, input);
    expect(oldReplay.replayed).toBe(true); expect(oldReplay.overview.profile?.version).toBe(before.version);
    expect(oldReplay.overview.profile?.attributeReset.allocatedPoints).toBe(1);
    expect(await rawProfile(a)).toEqual(before);
    expect(await db.getRepository(DemonTowerCommand).countBy({ userId: a.id })).toBe(count);
    now = new Date(eligibleAt);
    const second = await service.action(a.id, retry);
    expect(second.replayed).toBe(false); expect(second.overview.profile?.version).toBe(before.version + 1);
    expect(second.overview.profile?.attributes).toEqual(grown.attributes); expect(second.overview.profile?.unspentPoints).toBe(grown.unspentPoints);
    expect(second.overview.profile?.attributeReset.eligibleAt).toBe(eligibleAt + DEMON_TOWER_CATALOG.rules.attributeResetCooldownMs);
    expect((await service.action(a.id, retry)).replayed).toBe(true);
    expect(await db.getRepository(DemonTowerCommand).countBy({ userId: a.id })).toBe(count + 1);
    expect(await db.getRepository(DemonTowerWorldFloor).find({ order: { floor: 'ASC' } })).toEqual(worlds);
    expect(await db.getRepository(RewardGrant).count()).toBe(0); expect(await db.getRepository(WalletBalance).count()).toBe(0);
  });
  it('takes user lock before world lock and rechecks maintenance after waiting on the world', async () => {
    const a = await user('alice'); await act(a, 'enroll'); const before = await rawProfile(a);
    const seen: string[] = []; const createRunner = db.createQueryRunner.bind(db);
    jest.spyOn(db, 'createQueryRunner').mockImplementation((mode) => {
      const runner = createRunner(mode); const query = runner.query.bind(runner);
      jest.spyOn(runner, 'query').mockImplementation(async (sql: string, parameters?: unknown[], structured?: boolean) => {
        seen.push(sql);
        const result = structured === true ? await query(sql, parameters, true) : await query(sql, parameters);
        if (sql.includes('"demon_tower_world_floors"') && sql.includes('FOR UPDATE')) process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'false';
        return result;
      });
      return runner;
    });
    await expect(service.action(a.id, request('train', 1))).rejects.toMatchObject({ response: { code: 'COMMUNITY_WRITES_DISABLED' } });
    const userLock = seen.findIndex((sql) => sql.includes('"users"') && sql.includes('FOR NO KEY UPDATE'));
    const worldLock = seen.findIndex((sql) => sql.includes('"demon_tower_world_floors"') && sql.includes('FOR UPDATE'));
    expect(userLock).toBeGreaterThanOrEqual(0); expect(worldLock).toBeGreaterThan(userLock);
    expect((await rawProfile(a)).state).toEqual(before.state);
    expect(await db.getRepository(DemonTowerCommand).count()).toBe(1);
  });
  it.each(['midnight', 'maintenance'] as const)('checks %s after the last awaited projection, not merely before wallet/response reads', async (boundary) => {
    const a = await user('alice'); await act(a, 'enroll');
    now = new Date('2099-09-08T15:59:59.999Z');
    let crossed = false;
    const createRunner = db.createQueryRunner.bind(db);
    jest.spyOn(db, 'createQueryRunner').mockImplementation((mode) => {
      const runner = createRunner(mode); const query = runner.query.bind(runner);
      jest.spyOn(runner, 'query').mockImplementation(async (sql: string, parameters?: unknown[], structured?: boolean) => {
        const result = structured === true ? await query(sql, parameters, true) : await query(sql, parameters);
        if (sql.includes('FROM "wallet_balances"') && !sql.includes('FOR UPDATE')) {
          crossed = true;
          if (boundary === 'midnight') now = new Date('2099-09-08T16:00:00.000Z');
          else process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'false';
        }
        return result;
      });
      return runner;
    });
    await expect(service.action(a.id, request('train', 1))).rejects.toMatchObject({
      status: boundary === 'midnight' ? 409 : 503,
      response: { code: boundary === 'midnight' ? 'DEMON_TOWER_DAY_CHANGED' : 'COMMUNITY_WRITES_DISABLED' },
    });
    expect(crossed).toBe(true);
    // pg-mem does not implement transaction rollback. The real-PG midnight/wallet tests assert the
    // complete 132-table fingerprint, old/new daily rows, unchanged UUID retry and unique grant.
  });
});
