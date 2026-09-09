import 'reflect-metadata';
import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, In } from 'typeorm';
import type { DemonTowerAction, DemonTowerActionInput } from '@stealth-reader/shared';
import { entities, DemonTowerProfile, DemonTowerWorldFloor, User, WalletLedger } from '../../../database/entities';
import { migrations } from '../../../database/migrations';
import { DemonTowerSquad } from '../../../database/entities/demon-tower-squad.entity';
import { PlatformAssetsService } from '../../platform/platform-assets.service';
import { DemonTowerService } from './demon-tower.service';
import { createDemonTowerState, demonTowerMaxHp, type DemonTowerEngineState } from './demon-tower.engine';
import type { DemonTowerSquadState } from './demon-tower-squad.engine';
import { cleanupDemonTowerExpansionUser } from './demon-tower-expansion-cleanup';

// Never use DB_*, DATABASE_URL or the production datasource. This suite only accepts an explicitly
// selected disposable feedback database. It creates FOUR synthetic users and removes only their rows.
const testUrl = process.env.DEMON_TEST_DATABASE_URL;
if (testUrl) {
  const value = new URL(testUrl);
  if (!['postgres:', 'postgresql:'].includes(value.protocol) || !/^\/feedback_test_[a-z0-9_]+$/.test(value.pathname)) throw new Error('DEMON_TEST_DATABASE_URL must name a disposable feedback_test_* database');
}
const real = testUrl ? describe : describe.skip;
real('Demon expansion real PostgreSQL concurrency and privacy', () => {
  let db: DataSource, service: DemonTowerService;
  const users: User[] = [], roomIds = new Set<string>(), savedEnv = { ...process.env };
  const NOW = new Date('2099-09-08T02:00:00Z'), DATE = '2099-09-08';
  const runId = randomUUID().slice(0, 8);
  let tick = 0;
  const clock = { now: () => new Date(NOW.getTime() + tick) };
  beforeAll(async () => {
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true'; process.env.FEATURE_COMMUNITY_DEMON_TOWER_ENABLED = 'true'; process.env.FEATURE_DEMON_TOWER_EXPANSION_ENABLED = 'true';
    db = new DataSource({ type: 'postgres', url: testUrl!, entities, migrations, synchronize: false, logging: false, extra: { max: 8, application_name: `demon_expansion_test_${runId}` } });
    await db.initialize(); await db.runMigrations(); service = new DemonTowerService(db, new PlatformAssetsService(clock), clock);
    for (let index = 0; index < 4; index += 1) {
      const repo = db.getRepository(User), user = await repo.save(repo.create({ email: `demon-pg-${runId}-${index}@synthetic.invalid`, username: `dpg-${runId}-${index}`, displayName: `妖塔测试${index + 1}`, passwordHash: 'synthetic-not-a-password', accountStatus: 'active' }));
      users.push(user); await service.action(user.id, request({ kind: 'enroll', payload: {} }, 0));
    }
  }, 60_000);
  beforeEach(async () => {
    tick += 2000;
    for (const id of roomIds) await db.getRepository(DemonTowerSquad).delete({ id }); roomIds.clear();
    for (const user of users) {
      await db.getRepository(User).update(user.id, { accountStatus: 'active' });
      const row = await raw(user), state = createDemonTowerState(clock.now().getTime(), DATE, randomBytes(32).toString('hex'));
      state.level = 61; state.attributes = { STR: 1000, SPD: 1000, AGI: 100, DEF: 1000, LUCK: 100 }; state.hp = demonTowerMaxHp(state);
      state.materials = { ore: 1000, herb: 1000, soul: 1000, clue: 0 };
      row.state = state as unknown as Record<string, unknown>; row.version += 1; row.actionWindowAt = null; row.actionWindowCount = 0; await db.getRepository(DemonTowerProfile).save(row);
    }
  }, 30_000);
  afterAll(async () => {
    if (db?.isInitialized) {
      for (const id of roomIds) await db.getRepository(DemonTowerSquad).delete({ id });
      for (const user of users) await db.transaction(manager => cleanupDemonTowerExpansionUser(manager, user.id, user.publicId));
      if (users.length) await db.getRepository(User).delete({ id: In(users.map(user => user.id)) });
      await db.destroy();
    }
    process.env = { ...savedEnv };
  }, 30_000);
  function request(action: DemonTowerAction, expectedVersion: number): DemonTowerActionInput { return { ...action, requestId: randomUUID(), expectedVersion }; }
  const raw = (actor: User) => db.getRepository(DemonTowerProfile).createQueryBuilder('profile').addSelect('profile.state').where('profile.user_id = :id', { id: actor.id }).getOneOrFail();
  const room = (id: string) => db.getRepository(DemonTowerSquad).createQueryBuilder('squad').addSelect('squad.state').where('squad.id = :id', { id }).getOneOrFail();
  async function act(actor: User, action: DemonTowerAction) { tick += 1001; const version = (await raw(actor)).version; return service.action(actor.id, request(action, version)); }
  async function createParty() {
    const created = await act(users[0], { kind: 'squad_create', payload: { floor: 1 } }); const id = created.overview.profile!.expansion!.squadId!; roomIds.add(id);
    await act(users[1], { kind: 'squad_join', payload: { squadId: id } }); return id;
  }

  it('serializes two concurrent ready consents, exact UUID replay and separate member reward races without double-debit/grant', async () => {
    const id = await createParty(), before = await Promise.all(users.slice(0, 2).map(actor => service.overview(actor.id)));
    const ready = await Promise.all(users.slice(0, 2).map(async actor => request({ kind: 'squad_ready', payload: {} }, (await raw(actor)).version)));
    const prepared = await Promise.all([service.action(users[0].id, ready[0]), service.action(users[1].id, ready[1])]);
    expect((await room(id)).status).toBe('active');
    prepared.forEach((receipt, index) => expect(receipt.overview.profile!.stamina).toBe(before[index].profile!.stamina - 3));
    const duplicateReady = await Promise.all([service.action(users[0].id, ready[0]), service.action(users[0].id, ready[0])]); expect(duplicateReady.every(receipt => receipt.replayed)).toBe(true);
    await act(users[0], { kind: 'squad_step', payload: {} }); expect((await room(id)).status).toBe('victory');
    const beforeReward = await Promise.all(users.slice(0, 2).map(actor => service.overview(actor.id)));
    const aVersion = (await raw(users[0])).version, bVersion = (await raw(users[1])).version;
    const aClaim = request({ kind: 'squad_claim', payload: {} }, aVersion);
    const results = await Promise.allSettled([service.action(users[0].id, aClaim), service.action(users[0].id, aClaim), service.action(users[1].id, request({ kind: 'squad_claim', payload: {} }, bVersion)), service.action(users[1].id, request({ kind: 'squad_claim', payload: {} }, bVersion))]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(3);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    const after = await Promise.all(users.slice(0, 2).map(actor => service.overview(actor.id)));
    after.forEach((view, index) => { expect(view.profile!.materials.ore).toBe(beforeReward[index].profile!.materials.ore + 5); expect(view.profile!.expansion!.essences).toBe(1); });
    expect(await db.getRepository(WalletLedger).countBy({ userId: In(users.map(user => user.id)) })).toBe(0);
  }, 30_000);
  it('rejects concurrent/repeated same-person PVP, retains defender state and never leaks private opponent/room snapshots', async () => {
    for (const user of users.slice(0, 2)) await act(user, { kind: 'arena_enroll', payload: { enabled: true } });
    const defender = await raw(users[1]), version = (await raw(users[0])).version;
    const action = { kind: 'arena_challenge', payload: { opponentPublicId: users[1].publicId } } as const;
    const settled = await Promise.allSettled([service.action(users[0].id, request(action, version)), service.action(users[0].id, request(action, version))]);
    expect(settled.filter(result => result.status === 'fulfilled')).toHaveLength(1); expect(await raw(users[1])).toEqual(defender);
    await expect(act(users[0], action)).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_ARENA_OPPONENT_ALREADY_CHALLENGED' } });
    const id = await createParty(); await act(users[0], { kind: 'squad_ready', payload: {} });
    const stranger = await service.social(users[2].id), privateRoom = await room(id), seed = (privateRoom.state as unknown as DemonTowerSquadState).rngSeed;
    expect(stranger.squads.some(item => item.id === id)).toBe(true);
    expect(JSON.stringify(stranger)).not.toMatch(/rngSeed|rngCounter|passwordHash|"build"|"userId"/); expect(JSON.stringify(stranger)).not.toContain(seed);
    await expect(act(users[2], { kind: 'squad_step', payload: {} })).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_SQUAD_NOT_JOINED' } });
  }, 30_000);
  it('does not resurrect anonymized opponent identity when an action waited on the world lock during soft deletion', async () => {
    for (const user of users.slice(0, 2)) await act(user, { kind: 'arena_enroll', payload: { enabled: true } });
    await act(users[1], { kind: 'arena_challenge', payload: { opponentPublicId: users[0].publicId } });
    const before = await raw(users[1]), runner = db.createQueryRunner(); await runner.connect(); await runner.startTransaction();
    let action: Promise<unknown> | null = null;
    try {
      await runner.manager.getRepository(User).createQueryBuilder('user').where('user.id = :id', { id: users[0].id }).setLock('for_no_key_update').getOneOrFail();
      await runner.manager.getRepository(DemonTowerWorldFloor).createQueryBuilder('world').orderBy('world.floor', 'ASC').setLock('pessimistic_write').getMany();
      action = service.action(users[1].id, request({ kind: 'train', payload: {} }, before.version)).then(value => value, error => error);
      let blocked = false;
      for (let i = 0; i < 100; i += 1) {
        const waiting = await db.query("SELECT count(*)::integer AS count FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE '%demon_tower_world_floors%'", [`demon_expansion_test_${runId}`]);
        if (waiting[0].count > 0) { blocked = true; break; }
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      expect(blocked).toBe(true);
      await cleanupDemonTowerExpansionUser(runner.manager, users[0].id, users[0].publicId);
      await runner.manager.getRepository(User).update(users[0].id, { accountStatus: 'deleted' });
      await runner.commitTransaction();
      const result = await action; expect(result).toMatchObject({ response: { code: 'DEMON_TOWER_VERSION_CONFLICT' } });
      const saved = (await raw(users[1])).state as unknown as DemonTowerEngineState;
      expect(saved.expansion!.arena!.lastReport).toMatchObject({ opponentPublicId: '', opponentName: '已注销同事' });
      expect(JSON.stringify(saved)).not.toContain(users[0].publicId); expect(saved.materials).toEqual(before.state.materials);
      await act(users[1], { kind: 'train', payload: {} });
      expect(JSON.stringify((await raw(users[1])).state)).not.toContain(users[0].publicId);
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction(); await runner.release(); if (action) await action;
    }
  }, 30_000);
});
