#!/usr/bin/env node
'use strict';

/**
 * Disposable PostgreSQL acceptance for 九层妖塔. Never use a production env file.
 * The caller creates/removes the specifically reviewed, internal-only containers.
 * Only synthetic users are created; all table content fingerprints must be restored.
 */
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const path = require('node:path');
assert.equal(process.env.DEMON_TOWER_REHEARSAL_CONFIRMATION, 'ISOLATED_SYNTHETIC_DEMON_TOWER_ONLY:20260908');
assert.equal(process.env.DB_HOST, 'growth-pg-btpam6');
assert.equal(process.env.DB_DATABASE, 'community_demon_tower_rehearsal');
assert.equal(process.env.DB_PORT || '5432', '5432');
assert.equal(process.env.DB_USERNAME, 'growth_test');
assert.ok(process.env.DB_PASSWORD && process.env.DB_PASSWORD.length >= 8);
assert.equal(process.env.NODE_ENV, 'test');
assert.equal(process.env.LOCAL_DEV, 'false');
assert.ok(!process.env.DATABASE_URL && !process.env.PUBLIC_SITE_ORIGIN, 'Production env bundles forbidden');
const appRoot = process.env.DEMON_TOWER_REHEARSAL_APP_ROOT || '/app';
const fromApp = createRequire(path.join(appRoot, 'packages/backend/package.json'));
fromApp('reflect-metadata');
const { DataSource } = fromApp('typeorm');
const dist = process.env.DEMON_TOWER_REHEARSAL_BACKEND_DIST || path.join(appRoot, 'packages/backend/dist');
const load = (name) => fromApp(path.join(dist, name));
const E = load('database/entities');
const { migrations } = load('database/migrations');
const engine = load('modules/community/demon-tower/demon-tower.engine');
const { DemonTowerService } = load('modules/community/demon-tower/demon-tower.service');
const { DemonTowerRewardsService } = load('modules/community/demon-tower/demon-tower-rewards.service');
const { PlatformAssetsService } = load('modules/platform/platform-assets.service');
const { NotificationService } = load('modules/community/notification.service');
const { toBusinessLocalDate } = load('modules/platform/platform-time');
const timestamp = (migration) => Number(migration.name.slice(-13));
assert.ok(migrations.some((migration) => timestamp(migration) === 1700000000032));
assert.ok(migrations.every((migration) => timestamp(migration) <= 1700000000032), 'Review future migrations explicitly');
process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true';
process.env.FEATURE_COMMUNITY_DEMON_TOWER_ENABLED = 'true';
process.env.APP_MODE = 'community';
const options = {
  type: 'postgres', host: process.env.DB_HOST, port: 5432, username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE, entities: E.entities,
  migrations, synchronize: false, migrationsRun: false, logging: false,
  extra: { max: 12, options: '-c statement_timeout=20000 -c lock_timeout=10000 -c idle_in_transaction_session_timeout=20000' },
};
const towerTables = ['demon_tower_profiles', 'demon_tower_world_floors', 'demon_tower_commands', 'demon_tower_contributions', 'demon_tower_daily_progress', 'demon_tower_daily_awards'];
let db, baseline, service, assets, notifications, rewards;
let now = new Date('2099-09-08T02:00:00Z');
const clock = { now: () => new Date(now) };
const identities = [];
const deletionTargets = new Set();
const checks = [];
const inFlight = new Set();
let phase = 'initialize';
const mark = (name) => { checks.push(name); phase = name; process.stdout.write(`PASS ${name}\n`); };
const tick = (ms = 1001) => { now = new Date(now.getTime() + ms); };
const rejected = (promise, code) => assert.rejects(promise, (error) => error?.response?.code === code);
const command = (kind, version, payload = {}, requestId = randomUUID()) => ({ kind, payload, expectedVersion: version, requestId });
function start(promise) {
  const pending = promise.then((value) => ({ value }), (error) => ({ error }));
  inFlight.add(pending); void pending.finally(() => inFlight.delete(pending)); return pending;
}
async function all(promises) {
  const results = await Promise.allSettled(promises);
  const failed = results.find((result) => result.status === 'rejected');
  if (failed) throw failed.reason;
  return results.map((result) => result.value);
}
async function fingerprints() {
  const result = {};
  for (const { tablename } of await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")) {
    assert.match(tablename, /^[a-z0-9_]+$/);
    [result[tablename]] = await db.query(`SELECT count(*)::integer AS count, md5(COALESCE(string_agg(to_jsonb(t)::text, E'\\n' ORDER BY to_jsonb(t)::text), '')) AS digest FROM "${tablename}" t`);
  }
  return result;
}
function safePublic(value) {
  const serialized = JSON.stringify(value);
  assert.ok(!/"(?:state|rngSeed|rngCounter|lootPity|requestHash|passwordHash|email|userId|receipt)"\s*:/.test(serialized), 'Private game/identity internals must never be projected');
  for (const identity of identities) { assert.ok(!serialized.includes(identity.id)); assert.ok(!serialized.includes(identity.email)); }
}
async function makeUser() {
  const id = randomUUID(); const publicId = randomUUID(); const email = `tower-rehearsal.${publicId}@users.invalid`;
  const identity = { id, publicId, email, username: `dt_${publicId.slice(0, 12)}` };
  identities.push(identity); // Identity is tracked before the insert, including on interrupted failure.
  return db.getRepository(E.User).save({ ...identity, emailNormalized: email, displayName: '妖塔合成验收成员', passwordHash: 'synthetic-only-not-a-login-password', accountStatus: 'active', communityRole: 'user' });
}
async function act(user, kind, payload = {}) {
  tick();
  const view = await service.overview(user.id);
  if (kind === 'challenge_boss' || kind === 'donate') payload = { floor: view.world.currentFloor, ...payload };
  return service.action(user.id, command(kind, view.profile?.version ?? 0, payload));
}
async function enroll() { const user = await makeUser(); await act(user, 'enroll'); return user; }
async function profile(user) { return db.getRepository(E.DemonTowerProfile).createQueryBuilder('profile').addSelect('profile.state').where('profile.user_id=:id', { id: user.id }).getOneOrFail(); }
async function changeState(user, change) {
  const row = await profile(user); change(row.state); await db.getRepository(E.DemonTowerProfile).save(row);
}
async function balance(user) { return Number((await db.getRepository(E.WalletBalance).findOneBy({ userId: user.id, currency: 'office_coin' }))?.balance ?? 0); }
async function daily(user, date = toBusinessLocalDate(now)) { return db.getRepository(E.DemonTowerDailyProgress).findOneByOrFail({ userId: user.id, serviceDate: date }); }
async function waitForBlocked(holderPid, minimum = 1) {
  for (let attempt = 0; attempt < 250; attempt++) {
    const [row] = await db.query("SELECT count(*)::integer AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND $1::integer=ANY(pg_blocking_pids(pid))", [holderPid]);
    if (row.count >= minimum) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail('Expected a real, specifically attributed PostgreSQL lock wait');
}
async function waitForBlockedChain(holderPid, minimum) {
  let observed = { direct: 0, transitive: 0 };
  for (let attempt = 0; attempt < 250; attempt++) {
    [observed] = await db.query(`WITH RECURSIVE edges AS (
      SELECT pid, unnest(pg_blocking_pids(pid)) AS blocker FROM pg_stat_activity
      WHERE datname=current_database() AND wait_event_type='Lock'
    ), descendants(pid) AS (
      SELECT pid FROM edges WHERE blocker=$1::integer
      UNION SELECT edge.pid FROM edges edge JOIN descendants parent ON edge.blocker=parent.pid
    ) SELECT (SELECT count(*)::integer FROM edges WHERE blocker=$1::integer) AS direct,
      (SELECT count(*)::integer FROM descendants) AS transitive`, [holderPid]);
    if (observed.transitive >= minimum) {
      process.stdout.write(`DIAGNOSTIC ${JSON.stringify({ check: 'attributed-row-lock-chain', expected: minimum, direct: observed.direct, transitive: observed.transitive })}\n`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const error = new Error('Synthetic attributed lock chain was not observed');
  error.code = 'SYNTHETIC_LOCK_CHAIN_NOT_OBSERVED';
  error.rehearsalDiagnostics = { expected: minimum, direct: observed.direct, transitive: observed.transitive };
  throw error;
}
async function heldLock(sql, parameters, work) {
  const runner = db.createQueryRunner(); await runner.connect(); await runner.startTransaction();
  try {
    await runner.query(sql, parameters);
    const [{ pid }] = await runner.query('SELECT pg_backend_pid() AS pid');
    await work(runner, pid);
  } finally { if (runner.isTransactionActive) await runner.rollbackTransaction(); await runner.release(); await Promise.all([...inFlight]); }
}
async function schema() {
  phase = 'schema-isolation-preflight';
  db = await new DataSource(options).initialize();
  const [identity] = await db.query('SELECT current_database() AS database, current_user AS username');
  assert.equal(identity.database, 'community_demon_tower_rehearsal'); assert.equal(identity.username, 'growth_test');
  const names = new Set((await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).map((row) => row.tablename));
  if (names.size) {
    assert.ok(names.has('users') && names.has('migrations'));
    assert.equal(Number((await db.query('SELECT count(*) FROM users'))[0].count), 0, 'Existing users forbidden before any migration');
    for (const name of towerTables) if (names.has(name)) assert.equal(Number((await db.query(`SELECT count(*) FROM "${name}"`))[0].count), 0, 'Existing tower data forbidden');
    const last = Number((await db.query('SELECT max(timestamp) AS value FROM migrations'))[0].value);
    assert.ok([1700000000030, 1700000000031, 1700000000032].includes(last), 'Only reviewed schema 30/31/32 permitted');
    for (const name of ['membership_grants', 'achievement_unlocks', 'user_presentation', 'demon_tower_auto_runs']) {
      if (names.has(name)) assert.equal(Number((await db.query(`SELECT count(*) FROM "${name}"`))[0].count), 0, 'Existing growth data forbidden');
    }
    for (let version = last; version > 1700000000030; version--) await db.undoLastMigration({ transaction: 'all' });
  } else {
    await db.destroy();
    db = await new DataSource({ ...options, migrations: migrations.filter((item) => timestamp(item) <= 1700000000030) }).initialize();
    await db.runMigrations({ transaction: 'all' });
    await db.destroy(); db = await new DataSource(options).initialize();
  }
  const beforeUpgrade = await fingerprints();
  assert.equal(Number((await db.query('SELECT max(timestamp) AS value FROM migrations'))[0].value), 1700000000030);
  phase = 'additive-migration-up-down-up';
  await db.runMigrations({ transaction: 'all' });
  assert.equal(Number((await db.query('SELECT max(timestamp) AS value FROM migrations'))[0].value), 1700000000032);
  assert.equal(Object.keys(await fingerprints()).length, Object.keys(beforeUpgrade).length + 4);
  await db.undoLastMigration({ transaction: 'all' });
  await db.undoLastMigration({ transaction: 'all' });
  assert.deepEqual(await fingerprints(), beforeUpgrade, 'Reversing only new empty tables must preserve every old row');
  await db.runMigrations({ transaction: 'all' });
  assert.deepEqual(await db.runMigrations({ transaction: 'all' }), []);
  baseline = await fingerprints();
  assets = new PlatformAssetsService(clock); notifications = new NotificationService(db);
  service = new DemonTowerService(db, assets, clock); rewards = new DemonTowerRewardsService(db, assets, notifications, clock);
  mark('schema 30 → 32 → 30 → 32: exactly four additive tables, no old row changes, rerun no-op');
}
async function concurrentEmptyWorldInitialization() {
  phase = 'three-user-empty-world-initialization';
  assert.equal(await db.getRepository(E.DemonTowerWorldFloor).count(), 0);
  const actors = await all([makeUser(), makeUser(), makeUser()]);
  let arrived = 0, releaseBarrier, rejectBarrier;
  const barrier = new Promise((resolve, reject) => { releaseBarrier = resolve; rejectBarrier = reject; });
  // A timeout is diagnostic, not a fallback that lets a sequential test claim concurrency.
  void barrier.catch(() => {});
  const timer = setTimeout(() => {
    const error = new Error('Synthetic empty-world barrier was not reached by all three transactions');
    error.code = 'SYNTHETIC_WORLD_BARRIER_NOT_REACHED'; rejectBarrier(error);
  }, 5000);
  const originalCreateRunner = db.createQueryRunner;
  db.createQueryRunner = function (...args) {
    const runner = originalCreateRunner.apply(this, args); const query = runner.query.bind(runner);
    let observedEmptyWorld = false;
    runner.query = async (...values) => {
      const result = await query(...values);
      if (!observedEmptyWorld && values[0].startsWith('SELECT 1 AS "row_exists"') && values[0].includes('FROM "demon_tower_world_floors"')) {
        observedEmptyWorld = true;
        const records = Array.isArray(result) ? result : result.records;
        assert.ok(Array.isArray(records)); assert.equal(records.length, 0, 'Each real transaction must observe the world empty before any INSERT');
        arrived += 1; if (arrived === 3) releaseBarrier();
        await barrier;
      }
      return result;
    };
    return runner;
  };
  let receipts;
  try {
    receipts = await all(actors.map((actor) => new DemonTowerService(db, assets, clock).action(actor.id, command('enroll', 0))));
  } finally {
    clearTimeout(timer); releaseBarrier(); db.createQueryRunner = originalCreateRunner;
  }
  phase = 'three-user-empty-world-verify-one-shared-initialization';
  assert.equal(arrived, 3);
  const worlds = await db.getRepository(E.DemonTowerWorldFloor).find({ order: { floor: 'ASC' } });
  assert.equal(worlds.length, 9);
  for (const [index, row] of worlds.entries()) {
    const definition = service.catalog().floors[index];
    assert.equal(row.floor, index + 1); assert.equal(row.bossHp, definition.bossMaxHp);
    assert.equal(row.version, 1); assert.equal(row.passageProgress, 0); assert.equal(row.passageRequired, definition.passageRequired);
    assert.equal(row.unlockedAt !== null, index === 0); assert.equal(row.defeatedAt, null); assert.equal(row.completedAt, null);
  }
  for (const [index, receipt] of receipts.entries()) {
    assert.equal(receipt.replayed, false); assert.equal(receipt.overview.profile.version, 1);
    assert.deepEqual(receipt.overview.world, receipts[0].overview.world); safePublic(receipt);
    assert.equal(await db.getRepository(E.DemonTowerCommand).countBy({ userId: actors[index].id }), 1);
    assert.equal(await balance(actors[index]), 0);
  }
  mark('three independent real transactions first observe an empty world together, then initialize exactly nine shared rows and three isolated saves');
}
async function identityAndIdempotency() {
  phase = 'readonly-and-auth';
  const user = await makeUser(); const before = await fingerprints();
  assert.equal((await service.overview(user.id)).profile, null); assert.equal(service.catalog().enabled, true);
  assert.deepEqual(await fingerprints(), before);
  await rejected(service.action(randomUUID(), command('enroll', 0)), 'DEMON_TOWER_ACTIVE_ACCOUNT_REQUIRED');
  await rejected(service.action(user.id, { ...command('enroll', 0), userId: randomUUID(), score: 1e9 }), 'DEMON_TOWER_REQUEST_INVALID');
  mark('read APIs do not initialize profile/world/wallet; missing account and forged identity rejected');

  await concurrentEmptyWorldInitialization();

  phase = 'concurrent-enrollment';
  const start = command('enroll', 0);
  const enrolled = await all(Array.from({ length: 8 }, () => service.action(user.id, start)));
  assert.equal(enrolled.filter((result) => !result.replayed).length, 1);
  assert.equal(await db.getRepository(E.DemonTowerCommand).countBy({ userId: user.id }), 1);
  assert.equal(await db.getRepository(E.DemonTowerWorldFloor).count(), 9);
  assert.equal(await balance(user), 0);
  await rejected(service.action(user.id, { ...start, kind: 'train' }), 'DEMON_TOWER_IDEMPOTENCY_CONFLICT');
  await rejected(service.action(user.id, { ...start, expectedVersion: 1 }), 'DEMON_TOWER_IDEMPOTENCY_CONFLICT');
  mark('eight identical enrollments: one save/receipt, existing shared world stays nine rows, payload-bound UUID');

  phase = 'concurrent-cas'; tick();
  const races = await Promise.allSettled(Array.from({ length: 8 }, () => service.action(user.id, command('train', 1))));
  assert.equal(races.filter((result) => result.status === 'fulfilled').length, 1);
  assert.ok(races.filter((result) => result.status === 'rejected').every((result) => result.reason?.response?.code === 'DEMON_TOWER_VERSION_CONFLICT'));
  assert.equal((await profile(user)).version, 2);
  assert.equal((await daily(user)).actionCount, 2);
  const replay = await service.action(user.id, start); assert.equal(replay.overview.profile.version, 2); assert.equal(replay.replayed, true); safePublic(replay);
  const second = await makeUser(); await service.action(second.id, start);
  assert.equal((await profile(second)).version, 1); assert.equal((await service.overview(second.id)).profile.totalExperience, 0);
  mark('distinct concurrent stale commands mutate once; exact old receipt projects current save; same UUID stays caller-scoped');

  phase = 'persistent-rate-and-daily-limits';
  const rateUser = await makeUser(); await service.action(rateUser.id, command('enroll', 0));
  for (let version = 1; version < 6; version++) await service.action(rateUser.id, command('train', version));
  let snapshot = await fingerprints();
  await rejected(service.action(rateUser.id, command('train', 6)), 'DEMON_TOWER_ACTION_RATE_LIMIT');
  assert.deepEqual(await fingerprints(), snapshot);
  await db.getRepository(E.DemonTowerDailyProgress).update({ userId: rateUser.id, serviceDate: toBusinessLocalDate(now) }, { actionCount: 2000 });
  snapshot = await fingerprints(); tick();
  await rejected(service.action(rateUser.id, command('train', 6)), 'DEMON_TOWER_DAILY_ACTION_LIMIT');
  assert.deepEqual(await fingerprints(), snapshot);
  mark('persistent six-per-second and 2000-per-day quotas reject without new state or receipts');
  return user;
}
async function lockBoundaryChecks() {
  phase = 'suspension-while-waiting';
  const actor = await enroll(); for (let index = 0; index < 3; index++) await act(actor, 'train');
  const ready = command('claim_reward', (await profile(actor)).version);
  const stateBefore = (await profile(actor)).state; const commandsBefore = await db.getRepository(E.DemonTowerCommand).countBy({ userId: actor.id });
  await heldLock('SELECT id FROM users WHERE id=$1 FOR UPDATE', [actor.id], async (runner, pid) => {
    const pending = start(service.action(actor.id, ready));
    await waitForBlocked(pid);
    await runner.query("UPDATE users SET account_status='suspended' WHERE id=$1", [actor.id]);
    await runner.commitTransaction();
    assert.equal((await pending).error?.response?.code, 'DEMON_TOWER_ACTIVE_ACCOUNT_REQUIRED');
  });
  assert.deepEqual((await profile(actor)).state, stateBefore); assert.equal(await balance(actor), 0);
  assert.equal(await db.getRepository(E.DemonTowerCommand).countBy({ userId: actor.id }), commandsBefore);
  mark('real attributed user-lock wait: concurrent suspension prevents pending reward and any save/ledger write');

  phase = 'maintenance-after-world-lock';
  const active = await enroll(); const mutation = command('train', (await profile(active)).version); const snapshot = await fingerprints();
  await heldLock('SELECT floor FROM demon_tower_world_floors WHERE floor=1 FOR UPDATE', [], async (runner, pid) => {
    const pending = start(service.action(active.id, mutation));
    await waitForBlocked(pid); process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'false';
    await runner.commitTransaction(); assert.equal((await pending).error?.response?.code, 'COMMUNITY_WRITES_DISABLED');
  });
  try {
    await service.overview(active.id); await rewards.leaderboard(); await rewards.contributions(); await rewards.settleDue();
    assert.deepEqual(await fingerprints(), snapshot);
  } finally { process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true'; }
  process.env.FEATURE_COMMUNITY_DEMON_TOWER_ENABLED = 'false';
  try {
    await rejected(service.action(active.id, mutation), 'DEMON_TOWER_DISABLED');
    await service.overview(active.id); await rewards.settleDue(); assert.equal(service.catalog().enabled, false);
    assert.deepEqual(await fingerprints(), snapshot);
  } finally { process.env.FEATURE_COMMUNITY_DEMON_TOWER_ENABLED = 'true'; }
  mark('maintenance after a real world-lock wait rolls back; feature-disabled and read-only reads/jobs leave every table unchanged');

  phase = 'maintenance-after-wallet-lock';
  const claimant = await enroll(); for (let index = 0; index < 3; index++) await act(claimant, 'train');
  await db.transaction((manager) => assets.ensurePlatformState(manager, claimant.id));
  const claim = command('claim_reward', (await profile(claimant)).version);
  const beforeWalletWait = await fingerprints();
  try {
    await heldLock("SELECT user_id FROM wallet_balances WHERE user_id=$1 AND currency='office_coin' FOR UPDATE", [claimant.id], async (runner, pid) => {
      const pending = start(service.action(claimant.id, claim));
      await waitForBlocked(pid); process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'false';
      await runner.commitTransaction(); assert.equal((await pending).error?.response?.code, 'COMMUNITY_WRITES_DISABLED');
    });
    assert.deepEqual(await fingerprints(), beforeWalletWait, 'Maintenance after reward execution started must roll back profile, daily, wallet, grant and receipt');
  } finally { process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true'; }
  const resumed = await service.action(claimant.id, claim);
  assert.equal(resumed.replayed, false); assert.ok(resumed.officeCoinsGranted > 0);
  mark('maintenance while waiting on a real wallet lock rolls back every table; the same unconsumed UUID works after reopening');

  phase = 'midnight-after-lock';
  const traveler = await enroll(); now = new Date('2099-09-08T15:59:59.900Z');
  await heldLock('SELECT floor FROM demon_tower_world_floors WHERE floor=1 FOR UPDATE', [], async (runner, pid) => {
    const pending = start(service.action(traveler.id, command('train', 1)));
    await waitForBlocked(pid); now = new Date('2099-09-08T16:00:00.000Z');
    await runner.commitTransaction();
    const result = await pending; if (result.error) throw result.error;
    assert.equal(result.value.overview.profile.daily.serviceDate, '2099-09-09');
  });
  assert.equal((await daily(traveler, '2099-09-08')).actionCount, 1);
  assert.equal((await daily(traveler, '2099-09-09')).actionCount, 1);
  mark('server date is taken after waiting: Shanghai 00:00 crossing writes only the new settlement day');
}

async function worldAndRollbackChecks() {
  phase = 'boss-rollback-after-ledger';
  const people = await all([enroll(), enroll(), enroll()]);
  for (const actor of people) await changeState(actor, (state) => { state.rngSeed = 'a'.repeat(64); state.rngCounter = 0; });
  await db.getRepository(E.DemonTowerWorldFloor).update({ floor: 1 }, { bossHp: 1 });
  const firstRequest = command('challenge_boss', 1, { floor: 1 });
  const brokenAssets = new PlatformAssetsService(clock);
  const realGrant = brokenAssets.grantReward.bind(brokenAssets);
  brokenAssets.grantReward = async (...args) => { await realGrant(...args); throw new Error('synthetic-after-ledger-failure'); };
  const brokenService = new DemonTowerService(db, brokenAssets, clock);
  const snapshot = await fingerprints();
  await assert.rejects(brokenService.action(people[0].id, firstRequest), /synthetic-after-ledger-failure/);
  assert.deepEqual(await fingerprints(), snapshot, 'Boss HP, first-kill marker, save, pity, daily score, grant and ledger must all roll back');
  mark('injected failure after actual wallet credit restores every table including world last hit and private RNG');

  phase = 'concurrent-final-hit';
  const priorActionGrants = await db.getRepository(E.RewardGrant).countBy({ sourceType: 'demon_tower_action' });
  const priorActionLedgers = await db.getRepository(E.WalletLedger).countBy({ sourceType: 'demon_tower_action' });
  const requests = [firstRequest, command('challenge_boss', 1, { floor: 1 }), command('challenge_boss', 1, { floor: 1 })];
  const raced = await Promise.allSettled([
    service.action(people[0].id, requests[0]), service.action(people[1].id, requests[1]),
    service.action(people[2].id, requests[2]), service.action(people[0].id, requests[0]),
  ]);
  phase = 'concurrent-final-hit-verify-responses';
  assert.ok(raced.some((item) => item.status === 'fulfilled'));
  for (const item of raced) {
    if (item.status === 'fulfilled') { assert.equal(item.value.effectiveBossDamage, 1); assert.ok(item.value.overview.profile.lastReport.turns <= 5); safePublic(item.value); }
    else assert.equal(item.reason?.response?.code, 'DEMON_TOWER_BOSS_UNAVAILABLE');
  }
  phase = 'concurrent-final-hit-verify-world-contribution';
  const world = await db.getRepository(E.DemonTowerWorldFloor).findOneByOrFail({ floor: 1 });
  assert.equal(world.bossHp, 0); assert.ok(world.defeatedAt);
  const contributions = await db.getRepository(E.DemonTowerContribution).findBy({ floor: 1 });
  assert.equal(contributions.reduce((sum, row) => sum + row.bossDamage, 0), 1);
  assert.equal(contributions.length, 1);
  const winner = people.find((actor) => actor.id === contributions[0].userId); assert.ok(winner);
  phase = 'concurrent-final-hit-verify-scoped-ledger';
  // Earlier scenarios can legitimately have their own tower grants. Verify this race's identities and
  // the exact global increment without deleting or accidentally reading another scenario's evidence.
  const actionGrants = await db.getRepository(E.RewardGrant).findBy(people.map((actor) => ({ sourceType: 'demon_tower_action', userId: actor.id })));
  assert.equal(actionGrants.length, 1); assert.equal(actionGrants[0].userId, winner.id);
  assert.equal(await db.getRepository(E.RewardGrant).countBy({ sourceType: 'demon_tower_action' }), priorActionGrants + 1);
  const actionLedgers = await db.getRepository(E.WalletLedger).findBy(people.map((actor) => ({ sourceType: 'demon_tower_action', userId: actor.id })));
  assert.equal(actionLedgers.length, 1); assert.equal(actionLedgers[0].userId, winner.id);
  assert.equal(Number(actionLedgers[0].delta), 5);
  assert.equal(await db.getRepository(E.WalletLedger).countBy({ sourceType: 'demon_tower_action' }), priorActionLedgers + 1);
  phase = 'concurrent-final-hit-verify-daily-scores';
  const dayScores = await db.getRepository(E.DemonTowerDailyProgress).findBy({ serviceDate: '2099-09-09' });
  assert.equal(dayScores.reduce((sum, row) => sum + row.bossDamage, 0), 1);
  mark('three real actors plus a duplicate last-hit request: exactly one HP, contribution, score and payout; no dead-boss replay');

  phase = 'concurrent-final-construction';
  await db.getRepository(E.DemonTowerWorldFloor).update({ floor: 1 }, { passageProgress: world.passageRequired - 1 });
  for (const actor of people) await changeState(actor, (state) => { state.materials.clue = 10; });
  tick();
  const outcomes = await all(people.map(async (actor) => service.action(actor.id, command('donate', (await profile(actor)).version, { floor: 1, material: 'clue', amount: 10 })).then((value) => ({ value }), (error) => ({ error }))));
  assert.equal(outcomes.filter((entry) => entry.value).length, 1);
  for (const entry of outcomes) {
    if (entry.value) { assert.equal(entry.value.passageContribution, 1); assert.equal(entry.value.overview.profile.materials.clue, 9); assert.equal(entry.value.officeCoinsGranted, 0); }
    else assert.equal(entry.error?.response?.code, 'DEMON_TOWER_WORLD_FLOOR_CHANGED');
  }
  assert.equal((await service.overview(winner.id)).world.currentFloor, 2);
  const current = await db.getRepository(E.DemonTowerWorldFloor).findOneByOrFail({ floor: 1 });
  assert.equal(current.passageProgress, current.passageRequired); assert.ok(current.completedAt);
  assert.ok((await db.getRepository(E.DemonTowerWorldFloor).findOneByOrFail({ floor: 2 })).unlockedAt);
  mark('concurrent last construction unit consumes one clue only once, awards no damage score, and opens the next floor atomically');

  phase = 'late-join-catchup';
  const late = await enroll();
  for (let count = 0; (await service.overview(late.id)).profile.level < 5 && count < 12; count++) await act(late, 'train');
  assert.ok((await service.overview(late.id)).profile.level >= 5);
  assert.equal((await act(late, 'select_floor', { floor: 2 })).overview.profile.selectedFloor, 2);
  assert.equal(await db.getRepository(E.DemonTowerContribution).countBy({ userId: late.id }), 0);
  mark('a new late joiner reaches the already-open next floor through real free training, with no missed-first-kill requirement');

  phase = 'bound-floor-intent-and-same-floor-cooperation';
  const lateVersion = (await profile(late)).version;
  const beforeOldTarget = await fingerprints();
  await rejected(service.action(late.id, command('challenge_boss', lateVersion, { floor: 1 })), 'DEMON_TOWER_WORLD_FLOOR_CHANGED');
  await rejected(service.action(late.id, command('donate', lateVersion, { floor: 1, material: 'ore', amount: 1 })), 'DEMON_TOWER_WORLD_FLOOR_CHANGED');
  assert.deepEqual(await fingerprints(), beforeOldTarget, 'An old displayed floor must never consume resources against a later target');
  const preparedForThisFloor = command('challenge_boss', lateVersion, { floor: 2 });
  for (let count = 0; (await service.overview(winner.id)).profile.level < 5 && count < 12; count++) await act(winner, 'train');
  for (const actor of [winner, late]) await changeState(actor, (state) => { state.rngSeed = 'a'.repeat(64); state.rngCounter = 0; });
  const firstCurrentHit = await act(winner, 'challenge_boss', { floor: 2 });
  assert.ok(firstCurrentHit.effectiveBossDamage > 0); assert.equal(firstCurrentHit.overview.world.phase, 'boss');
  const laterCurrentHit = await service.action(late.id, preparedForThisFloor);
  assert.ok(laterCurrentHit.effectiveBossDamage > 0, 'A valid same-floor intent remains usable after another actor changed HP/version');
  assert.equal(laterCurrentHit.overview.profile.version, lateVersion + 1);
  mark('cross-floor boss/donation intent is rejected with zero changes, while another real actor changing same-floor HP does not invalidate a prepared hit');
  const leader = (await rewards.leaderboard('2099-09-09')).entries[0];
  return [winner, late].find((actor) => actor.publicId === leader.publicId);
}

async function battleAndPityChecks() {
  phase = 'ordinary-battle-authority';
  const actor = await enroll();
  await changeState(actor, (state) => { state.rngSeed = 'a'.repeat(64); state.rngCounter = 0; });
  let view;
  for (let count = 0; count < 12; count++) { view = (await act(actor, 'explore')).overview; if (view.profile.battle) break; }
  assert.ok(view.profile.battle);
  const initialHp = view.profile.battle.player.hp; const persisted = (await profile(actor)).state;
  tick(3_600_000);
  const paused = await service.overview(actor.id);
  assert.equal(paused.profile.battle.player.hp, initialHp, 'Hiding/offline waiting must not heal a running battle');
  assert.deepEqual((await profile(actor)).state, persisted, 'GET must not persist regenerated state');
  const attack = command('attack', paused.profile.version, { targetId: paused.profile.battle.enemies[0].id });
  const before = await fingerprints();
  await rejected(service.action(actor.id, { ...attack, payload: { targetId: 'foreign-target', score: 100 } }), 'DEMON_TOWER_INVALID_ACTION');
  assert.deepEqual(await fingerprints(), before);
  const accepted = await all(Array.from({ length: 4 }, () => service.action(actor.id, attack)));
  assert.equal(accepted.filter((result) => !result.replayed).length, 1);
  const after = accepted[0].overview.profile;
  assert.equal(after.battle?.turn ?? after.lastReport.turns, 1);
  safePublic(accepted[0]);
  if (after.battle) { const left = await act(actor, 'flee'); assert.equal(left.officeCoinsGranted, 0); assert.equal(left.overview.profile.lastReport.outcome, 'fled'); }
  mark('real persisted ordinary battle: hostile targets rejected, four identical actions execute one turn, no offline battle healing or flee reward');

  phase = 'persisted-loot-guarantee';
  const collector = await enroll();
  const context = { now: now.getTime(), serviceDate: toBusinessLocalDate(now), world: (await service.overview(collector.id)).world };
  let testState;
  // Choose a deterministic synthetic chest fixture using the actual engine, never a client-supplied seed.
  for (let index = 0; index < 100; index++) {
    const candidate = engine.createDemonTowerState(now.getTime(), context.serviceDate, `isolated-loot-guarantee-${index}`);
    // A coherent synthetic level-12 fixture makes uncollected equipment eligible; no HTTP stat override exists.
    const keys = ['STR', 'SPD', 'AGI', 'DEF', 'LUCK'];
    for (let level = 1; level < 12; level++) {
      candidate.totalExperience += engine.demonTowerExperienceToNext(level);
      candidate.attributes[keys[(level * 2) % 5]]++; candidate.attributes[keys[(level * 2 + 1) % 5]]++;
      candidate.unspentPoints += 2;
    }
    candidate.level = 12; candidate.hp = engine.demonTowerMaxHp(candidate);
    const result = engine.actDemonTower(candidate, { kind: 'explore', payload: {} }, context);
    if (!result.state.battle) { testState = candidate; break; }
  }
  assert.ok(testState && testState.lootPity, 'Current engine must provide persisted loot-guarantee state');
  const seed = testState.rngSeed; const startCounter = testState.rngCounter;
  await changeState(collector, (state) => Object.assign(state, testState));
  const beforeWeapons = (await service.overview(collector.id)).profile.weapons.map((item) => item.id);
  const beforeSkills = (await service.overview(collector.id)).profile.skills.map((item) => item.id);
  for (let index = 0; index < 4; index++) {
    // Fixture forces the same ordinary chest roll; importantly, it does NOT reset the persisted pity state.
    await changeState(collector, (state) => { state.rngSeed = seed; state.rngCounter = startCounter; });
    tick(); const current = await service.overview(collector.id);
    const restartedService = new DemonTowerService(db, assets, clock);
    const result = await restartedService.action(collector.id, command('explore', current.profile.version));
    assert.equal(result.overview.profile.battle, null); safePublic(result);
  }
  const collected = (await service.overview(collector.id)).profile;
  assert.ok(collected.weapons.some((item) => !beforeWeapons.includes(item.id)) || collected.skills.some((item) => !beforeSkills.includes(item.id)), 'Four eligible resolutions guarantee an uncollected usable item');
  const stored = (await profile(collector)).state;
  assert.ok(stored.lootPity); assert.ok(!JSON.stringify(collected).includes(seed));
  mark('loot guarantee survives four separate service instances and database round trips; collection grows for free without exposing RNG/pity');
}

async function dailyEconomyChecks() {
  phase = 'normal-coin-cap-and-fresh-replay';
  const actor = await enroll(); for (let count = 0; count < 3; count++) await act(actor, 'train');
  const serviceDate = toBusinessLocalDate(now);
  await db.transaction(async (manager) => {
    await assets.ensurePlatformState(manager, actor.id);
    await assets.creditWallet(manager, actor.id, 'office_coin', 199, { sourceType: 'demon_tower_rehearsal_fixture', sourceId: actor.publicId, reason: 'synthetic-prior-earned-coins', idempotencyKey: `tower-fixture:${actor.id}` });
    await manager.getRepository(E.DemonTowerDailyProgress).update({ userId: actor.id, serviceDate }, { officeCoins: 199 });
  });
  tick(); const claim = command('claim_reward', (await profile(actor)).version);
  const copies = await all(Array.from({ length: 6 }, () => service.action(actor.id, claim)));
  assert.equal(copies.filter((result) => !result.replayed).length, 1);
  assert.ok(copies.every((result) => result.officeCoinsGranted === 1));
  assert.equal((await daily(actor)).officeCoins, 200); assert.equal(await balance(actor), 700);
  assert.equal(await db.getRepository(E.RewardGrant).countBy({ userId: actor.id, sourceType: 'demon_tower_action' }), 1);
  await db.transaction((manager) => assets.creditWallet(manager, actor.id, 'office_coin', 7, { sourceType: 'demon_tower_rehearsal_fixture', sourceId: actor.publicId, reason: 'newer-wallet-state', idempotencyKey: `tower-fixture-later:${actor.id}` }));
  await act(actor, 'train');
  const replay = await service.action(actor.id, claim);
  assert.equal(replay.replayed, true); assert.equal(replay.overview.wallet.officeCoinBalance, 707);
  assert.equal(replay.overview.profile.version, (await profile(actor)).version);
  assert.equal(replay.officeCoinsGranted, 1); safePublic(replay);
  mark('six concurrent daily claims clip to exactly 200 normal coins; old receipt keeps current save and newer wallet balance');

  phase = 'independent-daily-attempt-cap';
  const limited = await enroll();
  await db.getRepository(E.DemonTowerDailyProgress).update({ userId: limited.id, serviceDate }, { bossAttempts: 3 });
  const snapshot = await fingerprints();
  await rejected(act(limited, 'challenge_boss'), 'DEMON_TOWER_BOSS_DAILY_LIMIT');
  assert.deepEqual(await fingerprints(), snapshot);
  mark('independent persisted three-attempt cap rejects before stamina, RNG, world or wallet can change');
}

async function scoreFixture(user, date, damage, passage = 0) {
  assert.match(date, /^2099-09-(?:0[89]|1[0-5])$/);
  await db.getRepository(E.DemonTowerDailyProgress).save({ userId: user.id, serviceDate: date,
    bossDamage: damage, officeCoins: 0, passageContribution: passage, bossAttempts: damage ? 1 : 0,
    actionCount: 1, level: 1, achievedAt: new Date(`${date}T03:00:00Z`), updatedAt: new Date(`${date}T03:00:00Z`) });
}
async function awardChecks(worldWinner) {
  phase = 'daily-award-cutoff-and-concurrency';
  assert.ok(worldWinner);
  const expectedDamage = (await rewards.leaderboard('2099-09-09')).entries[0].bossDamage;
  const suspended = await makeUser(); await scoreFixture(suspended, '2099-09-09', 10000);
  await db.getRepository(E.User).update(suspended.id, { accountStatus: 'suspended' });
  const builder = await makeUser(); await scoreFixture(builder, '2099-09-09', 0, 10000);
  const beforeBalance = await balance(worldWinner);
  now = new Date('2099-09-09T16:04:59.999Z');
  assert.equal(await rewards.settleDay('2099-09-09'), false);
  const board = await rewards.leaderboard('2099-09-09', worldWinner.id);
  assert.equal(board.entries[0].publicId, worldWinner.publicId);
  assert.equal(board.entries[0].score, expectedDamage);
  assert.ok(board.entries.every((entry) => entry.publicId !== suspended.publicId && entry.publicId !== builder.publicId)); safePublic(board);
  now = new Date('2099-09-09T16:05:00.000Z');
  phase = 'reward-feature-disable-after-wallet-lock';
  const beforeAwardWalletWait = await fingerprints();
  try {
    await heldLock("SELECT user_id FROM wallet_balances WHERE user_id=$1 AND currency='office_coin' FOR UPDATE", [worldWinner.id], async (runner, pid) => {
      const pending = start(rewards.settleDay('2099-09-09'));
      await waitForBlocked(pid); process.env.FEATURE_COMMUNITY_DEMON_TOWER_ENABLED = 'false';
      await runner.commitTransaction(); assert.equal((await pending).error?.response?.code, 'DEMON_TOWER_DISABLED');
    });
    assert.deepEqual(await fingerprints(), beforeAwardWalletWait, 'Disabling the feature after award claim must roll back claim, grant, ledger and notice');
  } finally { process.env.FEATURE_COMMUNITY_DEMON_TOWER_ENABLED = 'true'; }
  mark('feature disable during real daily-award wallet wait rolls back the unique award claim, credit and notification');
  phase = 'daily-award-cutoff-and-concurrency';
  const replicas = Array.from({ length: 6 }, () => new DemonTowerRewardsService(db, assets, notifications, clock));
  const outcomes = await all(replicas.map((instance) => instance.settleDay('2099-09-09')));
  assert.equal(outcomes.filter(Boolean).length, 1);
  assert.equal(await balance(worldWinner), beforeBalance + 100);
  assert.equal(await db.getRepository(E.DemonTowerDailyAward).countBy({ serviceDate: '2099-09-09' }), 1);
  assert.equal(await db.getRepository(E.RewardGrant).countBy({ userId: worldWinner.id, sourceType: 'demon_tower_daily_champion', sourceId: '2099-09-09' }), 1);
  assert.equal(await db.getRepository(E.CommunityNotification).countBy({ userId: worldWinner.id, eventType: 'demon_tower_daily_champion' }), 1);
  const notice = await db.getRepository(E.CommunityNotification).findOneByOrFail({ userId: worldWinner.id, eventType: 'demon_tower_daily_champion' });
  assert.equal(notice.payload.resourcePath, '/games/demon-tower/leaderboard?date=2099-09-09');
  mark('Shanghai 00:05 and six real reward replicas: one independent 100-coin champion, no suspended or construction-only winner');

  phase = 'notification-rollback';
  const first = await makeUser(); const second = await makeUser();
  await scoreFixture(first, '2099-09-10', 500); await scoreFixture(second, '2099-09-11', 600);
  now = new Date('2099-09-11T16:05:00Z');
  const brokenNotifications = new NotificationService(db);
  const originalCreate = brokenNotifications.create.bind(brokenNotifications);
  brokenNotifications.create = async (manager, input) => {
    const value = await originalCreate(manager, input);
    if (input.dedupeKey === 'demon_tower_daily_champion:2099-09-10') throw new Error('synthetic-notification-after-insert');
    return value;
  };
  const broken = new DemonTowerRewardsService(db, assets, brokenNotifications, clock);
  const before = await fingerprints();
  await assert.rejects(broken.settleDay('2099-09-10'), /synthetic-notification-after-insert/);
  assert.deepEqual(await fingerprints(), before, 'Notification failure must roll back real award, initializer, ledger, grant and notice inserts');
  mark('failure after actual notification insert restores all tables; payout claim remains retryable');

  phase = 'offline-catchup-isolation';
  await broken.settleDue();
  assert.equal(await db.getRepository(E.DemonTowerDailyAward).countBy({ serviceDate: '2099-09-10' }), 0);
  assert.equal(await db.getRepository(E.DemonTowerDailyAward).countBy({ serviceDate: '2099-09-11' }), 1);
  assert.equal((await db.getRepository(E.DemonTowerDailyAward).findOneByOrFail({ serviceDate: '2099-09-08' })).coins, 0);
  assert.equal(await balance(first), 0); assert.equal(await balance(second), 600);
  await all(Array.from({ length: 6 }, () => new DemonTowerRewardsService(db, assets, notifications, clock).settleDue()));
  assert.equal(await balance(first), 600); assert.equal(await balance(second), 600);
  assert.equal(await db.getRepository(E.RewardGrant).countBy({ userId: first.id, sourceType: 'demon_tower_daily_champion' }), 1);
  assert.equal(await db.getRepository(E.RewardGrant).countBy({ userId: second.id, sourceType: 'demon_tower_daily_champion' }), 1);
  const complete = await fingerprints(); await rewards.settleDue(); assert.deepEqual(await fingerprints(), complete);
  mark('offline catch-up isolates a failing day, finalizes zero-damage activity days once, and six retry replicas never duplicate payouts');

  phase = 'reward-suspension-wait';
  const pendingWinner = await makeUser(); const fallback = await makeUser();
  await scoreFixture(pendingWinner, '2099-09-12', 1000); await scoreFixture(fallback, '2099-09-12', 900);
  now = new Date('2099-09-12T16:05:00Z');
  await heldLock('SELECT id FROM users WHERE id=$1 FOR UPDATE', [pendingWinner.id], async (runner, pid) => {
    const pending = start(rewards.settleDay('2099-09-12'));
    await waitForBlocked(pid);
    await runner.query("UPDATE users SET account_status='suspended' WHERE id=$1", [pendingWinner.id]);
    await runner.commitTransaction(); const result = await pending; if (result.error) throw result.error;
    assert.equal(result.value, true);
  });
  assert.equal(await balance(pendingWinner), 0); assert.equal(await balance(fallback), 600);
  assert.equal((await db.getRepository(E.DemonTowerDailyAward).findOneByOrFail({ serviceDate: '2099-09-12' })).winnerUserId, fallback.id);
  mark('reward worker waiting on the candidate user lock rechecks suspension and safely awards the next eligible player');
}

async function databaseConstraints() {
  phase = 'database-constraints';
  const actor = await enroll();
  const old = await fingerprints();
  for (const [sql, parameters] of [
    ['UPDATE demon_tower_world_floors SET boss_hp=-1 WHERE floor=2', []],
    ['UPDATE demon_tower_world_floors SET passage_progress=1 WHERE floor=2', []],
    ['UPDATE demon_tower_world_floors SET defeated_at=now() WHERE floor=2', []],
    ['UPDATE demon_tower_daily_progress SET office_coins=201 WHERE user_id=$1', [actor.id]],
    ['UPDATE demon_tower_daily_progress SET boss_attempts=4 WHERE user_id=$1', [actor.id]],
    ['UPDATE demon_tower_daily_progress SET action_count=2001 WHERE user_id=$1', [actor.id]],
    ['UPDATE demon_tower_profiles SET version=0 WHERE user_id=$1', [actor.id]],
  ]) {
    await assert.rejects(db.transaction((manager) => manager.query(sql, parameters)), (error) => error.code === '23514');
  }
  assert.deepEqual(await fingerprints(), old);
  mark('real PostgreSQL constraints reject negative HP, premature construction/defeat, coin/attempt/action overflow and invalid versions');
}

async function accountDeletionChecks() {
  phase = 'real-account-lifecycle-tower-erasure';
  const { AccountLifecycleService } = load('modules/auth/account-lifecycle.service');
  const { AuthSensitiveDataService } = load('modules/auth/auth-sensitive-data.service');
  const { AuthEmailOutboxService } = load('modules/auth/auth-email-outbox.service');
  process.env.FEATURE_ACCOUNT_DELETION_ENABLED = 'true';
  process.env.AUTH_TOKEN_PEPPER = randomBytes(32).toString('hex');
  process.env.AUTH_EMAIL_OUTBOX_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  process.env.AUTH_EMAIL_OUTBOX_ENCRYPTION_KEY_ID = 'tower-rehearsal-ephemeral';
  const noDelivery = new Proxy({}, { get: () => () => { throw new Error('External delivery forbidden in rehearsal'); } });
  const lifecycle = new AccountLifecycleService(db, new AuthSensitiveDataService(), new AuthEmailOutboxService(db, noDelivery));
  const owner = await enroll(); const peer = await enroll(); deletionTargets.add(owner.id);
  // Historical contribution fixtures exercise erasure independently of combat balance; no client score is accepted.
  for (const [actor, damage] of [[owner, 40], [peer, 20]]) {
    await db.getRepository(E.DemonTowerContribution).insert({ floor: 2, userId: actor.id, bossDamage: damage, passageContribution: 0, level: 1, updatedAt: now });
    await scoreFixture(actor, '2099-09-13', damage);
  }
  now = new Date('2099-09-13T16:05:00Z');
  assert.equal(await rewards.settleDay('2099-09-13'), true);
  const awardBefore = await db.getRepository(E.DemonTowerDailyAward).findOneByOrFail({ serviceDate: '2099-09-13' });
  assert.equal(awardBefore.winnerUserId, owner.id); assert.equal(awardBefore.coins, 100);
  const worldsBefore = await db.getRepository(E.DemonTowerWorldFloor).find({ order: { floor: 'ASC' } });
  const peerBefore = await profile(peer);
  const peerCommands = await db.getRepository(E.DemonTowerCommand).countBy({ userId: peer.id });
  const peerContribution = await db.getRepository(E.DemonTowerContribution).findBy({ userId: peer.id });
  const peerDaily = await db.getRepository(E.DemonTowerDailyProgress).findBy({ userId: peer.id });
  const ledgerBefore = await db.getRepository(E.WalletLedger).findBy({ userId: owner.id });
  const session = await db.getRepository(E.AuthSession).save({ userId: owner.id, userAgent: null, ipHash: null,
    lastSeenAt: now, expiresAt: new Date(now.getTime() + 86_400_000), revokedAt: null, revokeReason: null });
  await lifecycle.requestDeletion(owner.id, session.id, `tower-delete:${owner.publicId}`, now);
  const deletion = await db.getRepository(E.AccountDeletionRequest).findOneByOrFail({ userId: owner.id });
  assert.equal(await lifecycle.processDueDeletions(10, new Date(deletion.scheduledFor.getTime() + 1000)), 1);
  const tombstone = await db.getRepository(E.User).findOneByOrFail({ id: owner.id });
  assert.equal(tombstone.accountStatus, 'deleted'); assert.equal(tombstone.publicId, owner.publicId);
  assert.equal(tombstone.email, `deleted+${owner.publicId}@invalid.local`); assert.equal(tombstone.username, null);
  for (const entity of [E.DemonTowerProfile, E.DemonTowerCommand, E.DemonTowerContribution, E.DemonTowerDailyProgress]) assert.equal(await db.getRepository(entity).countBy({ userId: owner.id }), 0);
  const awardAfter = await db.getRepository(E.DemonTowerDailyAward).findOneByOrFail({ serviceDate: '2099-09-13' });
  assert.deepEqual({ ...awardAfter }, { ...awardBefore, winnerUserId: null });
  assert.deepEqual(await db.getRepository(E.DemonTowerWorldFloor).find({ order: { floor: 'ASC' } }), worldsBefore);
  assert.deepEqual(await profile(peer), peerBefore);
  assert.equal(await db.getRepository(E.DemonTowerCommand).countBy({ userId: peer.id }), peerCommands);
  assert.deepEqual(await db.getRepository(E.DemonTowerContribution).findBy({ userId: peer.id }), peerContribution);
  assert.deepEqual(await db.getRepository(E.DemonTowerDailyProgress).findBy({ userId: peer.id }), peerDaily);
  assert.deepEqual(await db.getRepository(E.WalletLedger).findBy({ userId: owner.id }), ledgerBefore, 'Immutable economic history is preserved by account erasure');
  assert.equal(await rewards.settleDay('2099-09-13'), false, 'Erasing a winner must not redistribute the same prize');
  await rejected(service.overview(owner.id), 'DEMON_TOWER_ACTIVE_ACCOUNT_REQUIRED');
  assert.ok((await rewards.leaderboard('2099-09-13')).entries.every((entry) => entry.publicId !== owner.publicId));
  lifecycle.onModuleDestroy();
  mark('actual AccountLifecycle request/lease/anonymization erases four private tower tables, preserves world/peer/ledger, and nulls—not re-awards—the champion');
}

async function crossDateSuspensionLocks() {
  phase = 'cross-date-reversed-candidates-suspension-locks';
  const first = await makeUser(); const second = await makeUser();
  await scoreFixture(first, '2099-09-14', 200); await scoreFixture(second, '2099-09-14', 100);
  await scoreFixture(first, '2099-09-15', 100); await scoreFixture(second, '2099-09-15', 200);
  now = new Date('2099-09-15T16:05:00Z');
  await heldLock('SELECT id FROM users WHERE id=$1 FOR UPDATE', [first.id], async (firstRunner, firstPid) => {
    await heldLock('SELECT id FROM users WHERE id=$1 FOR UPDATE', [second.id], async (secondRunner, secondPid) => {
      const left = start(new DemonTowerRewardsService(db, assets, notifications, clock).settleDay('2099-09-14'));
      const right = start(new DemonTowerRewardsService(db, assets, notifications, clock).settleDay('2099-09-15'));
      phase = 'cross-date-wait-first-candidate'; await waitForBlocked(firstPid);
      phase = 'cross-date-wait-second-candidate'; await waitForBlocked(secondPid);
      await firstRunner.query("UPDATE users SET account_status='suspended' WHERE id=$1", [first.id]);
      await firstRunner.commitTransaction();
      // First worker has passed the rejected first candidate and is now also blocked by the second holder.
      // PostgreSQL's tuple-lock queue can make the second waiter depend on the first waiter rather than
      // directly on the holder. Require both waiters to be descendants of this exact holder, not any lock.
      phase = 'cross-date-wait-two-attributed-descendants'; await waitForBlockedChain(secondPid, 2);
      await secondRunner.query("UPDATE users SET account_status='suspended' WHERE id=$1", [second.id]);
      await secondRunner.commitTransaction();
      phase = 'cross-date-await-two-award-transactions';
      const results = await Promise.all([left, right]);
      const failure = results.find((result) => result.error); if (failure) throw failure.error;
      assert.ok(results.every((result) => result.value === true));
    });
  });
  phase = 'cross-date-verify-zero-payouts';
  assert.equal(await balance(first), 0); assert.equal(await balance(second), 0);
  for (const serviceDate of ['2099-09-14', '2099-09-15']) assert.equal((await db.getRepository(E.DemonTowerDailyAward).findOneByOrFail({ serviceDate })).coins, 0);
  mark('two reversed-date candidate lists plus simultaneous suspensions finish without lock inversion or any payout');
}

async function paginatedRankingChecks() {
  phase = 'real-composite-key-ranking-beyond-top-50';
  const date = toBusinessLocalDate(now);
  assert.equal(date, '2099-09-16');
  const actors = [];
  for (let index = 0; index < 53; index++) actors.push(await makeUser());
  const suspended = await makeUser(); const zero = await makeUser();
  await db.getRepository(E.User).update({ id: suspended.id }, { accountStatus: 'suspended' });
  await db.getRepository(E.DemonTowerDailyProgress).insert([...actors, suspended, zero].map((actor, index) => ({
    userId: actor.id, serviceDate: date, bossDamage: index === 54 ? 0 : index === 53 ? 900 : 100,
    officeCoins: 0, passageContribution: 0, bossAttempts: index === 54 ? 0 : 1, actionCount: 1, level: 1,
    achievedAt: new Date(Date.parse('2099-09-15T16:00:00Z') + index * 1000), updatedAt: now,
  })));
  // Sorting fixtures only, on a separate existing floor so unrelated earlier contributions cannot affect ranks.
  await db.getRepository(E.DemonTowerContribution).insert([...actors, suspended, zero].map((actor, index) => ({
    userId: actor.id, floor: 9, bossDamage: index === 54 ? 0 : index === 53 ? 900 : 100,
    passageContribution: index === 54 ? 0 : 100 - index, level: 1, updatedAt: now,
  })));
  const caller = actors[52];
  await db.getRepository(E.User).update({ id: caller.id }, { displayName: '更新后的合成昵称' });
  const beforeReads = await fingerprints();
  for (const board of [await rewards.leaderboard(date, caller.id), await rewards.contributions('9', caller.id)]) {
    assert.equal(board.entries.length, 50);
    assert.deepEqual(board.entries.map((entry) => entry.publicId), actors.slice(0, 50).map((actor) => actor.publicId));
    assert.equal(board.me.rank, 53); assert.equal(board.me.publicId, caller.publicId);
    assert.equal(board.me.displayName, '更新后的合成昵称'); assert.equal(board.me.score, 100); safePublic(board);
  }
  assert.equal((await rewards.leaderboard(date)).me, null); assert.equal((await rewards.contributions('9')).me, null);
  assert.equal((await rewards.leaderboard(date, zero.id)).me, null); assert.equal((await rewards.contributions('9', zero.id)).me, null);
  assert.deepEqual(await fingerprints(), beforeReads, 'Public and caller rankings must not initialize state or issue coins');
  mark('real PostgreSQL composite-key queries: both top-50 lists retain precise own rank 53, fresh names, active-only privacy and write-free reads');
}

async function midnightWalletSettlementChecks() {
  phase = 'cross-midnight-wallet-prepare';
  assert.equal(toBusinessLocalDate(now), '2099-09-16');
  const actor = await enroll();
  await changeState(actor, (state) => { state.level = 5; state.rngSeed = 'a'.repeat(64); state.rngCounter = 0; });
  now = new Date('2099-09-16T15:59:59.000Z');
  await db.transaction((manager) => assets.ensurePlatformState(manager, actor.id));
  const beforeProfile = await profile(actor); const beforeDay = await daily(actor, '2099-09-16');
  const beforeWorld = (await service.overview(actor.id)).world; const beforeBalance = await balance(actor);
  assert.equal(beforeWorld.currentFloor, 2); assert.equal(beforeWorld.phase, 'boss');
  const input = command('challenge_boss', beforeProfile.version, { floor: 2 });
  const predicted = engine.actDemonTower(beforeProfile.state, { kind: input.kind, payload: input.payload }, { now: now.getTime(), serviceDate: '2099-09-16', world: beforeWorld });
  assert.ok(predicted.worldEffect.amount > 0); assert.equal(predicted.officeCoinIntent, 5);
  const before = await fingerprints();
  let outcome;
  phase = 'cross-midnight-wallet-real-wait';
  await heldLock("SELECT user_id FROM wallet_balances WHERE user_id=$1 AND currency='office_coin' FOR UPDATE", [actor.id], async (runner, pid) => {
    const pending = start(service.action(actor.id, input));
    await waitForBlocked(pid); now = new Date('2099-09-16T16:00:01.000Z');
    await runner.commitTransaction(); outcome = await pending;
  });
  phase = 'cross-midnight-wallet-expect-day-rejection';
  const oldDayAfterWait = await daily(actor, '2099-09-16');
  const code = outcome.error?.response?.code;
  process.stdout.write(`DIAGNOSTIC ${JSON.stringify({ check: 'two-second-midnight-wallet-wait', serverClockDay: toBusinessLocalDate(now),
    receiptDay: outcome.value?.overview.profile.daily.serviceDate ?? null, grantedOfficeCoins: outcome.value?.officeCoinsGranted ?? null,
    oldDayOfficeCoins: oldDayAfterWait.officeCoins, oldDayBossDamage: oldDayAfterWait.bossDamage,
    errorCode: typeof code === 'string' && /^[A-Z0-9_]+$/.test(code) ? code : null })}\n`);
  assert.equal(code, 'DEMON_TOWER_DAY_CHANGED'); assert.equal(outcome.error.getStatus(), 409);
  assert.deepEqual(await fingerprints(), before, 'Crossing midnight after simulation must not retain any old-day state, damage, grant or consumed UUID');
  phase = 'cross-midnight-wallet-retry-same-uuid-in-new-day';
  const resumed = await service.action(actor.id, input);
  assert.equal(resumed.replayed, false); assert.equal(resumed.overview.profile.version, beforeProfile.version + 1);
  assert.equal(resumed.overview.profile.daily.serviceDate, '2099-09-17');
  assert.equal(resumed.officeCoinsGranted, 5); assert.ok(resumed.effectiveBossDamage > 0);
  assert.equal(await balance(actor), beforeBalance + 5);
  assert.deepEqual(await daily(actor, '2099-09-16'), beforeDay);
  const newDay = await daily(actor, '2099-09-17');
  assert.equal(newDay.actionCount, 1); assert.equal(newDay.bossAttempts, 1); assert.equal(newDay.officeCoins, 5);
  assert.equal(newDay.bossDamage, resumed.effectiveBossDamage);
  assert.equal(resumed.overview.world.boss.hp, beforeWorld.boss.hp - resumed.effectiveBossDamage);
  const afterRetry = await fingerprints();
  const copies = await all(Array.from({ length: 6 }, () => service.action(actor.id, input)));
  assert.ok(copies.every((receipt) => receipt.replayed)); assert.deepEqual(await fingerprints(), afterRetry);
  assert.equal(await db.getRepository(E.RewardGrant).countBy({ userId: actor.id, sourceType: 'demon_tower_action', sourceId: input.requestId }), 1);
  const ledgers = await db.getRepository(E.WalletLedger).findBy({ userId: actor.id, sourceType: 'demon_tower_action', sourceId: input.requestId });
  assert.equal(ledgers.length, 1); assert.equal(Number(ledgers[0].delta), 5);
  mark('a real wallet wait crossing midnight by two seconds rolls back fully; the unchanged UUID then records one new-day hit and one five-coin grant');
}

async function freeAttributeResetChecks() {
  phase = 'free-attribute-reset-real-earned-points';
  const actor = await enroll();
  const beforeEmpty = await fingerprints();
  await rejected(service.action(actor.id, command('reset_attributes', (await profile(actor)).version)), 'DEMON_TOWER_ATTRIBUTES_UNCHANGED');
  assert.deepEqual(await fingerprints(), beforeEmpty, 'An empty reset cannot create a cooldown, receipt or daily action');
  for (let index = 0; (await service.overview(actor.id)).profile.level < 2 && index < 5; index++) await act(actor, 'train');
  const grown = (await service.overview(actor.id)).profile;
  assert.ok(grown.level >= 2); assert.ok(grown.unspentPoints >= 3);
  await act(actor, 'allocate', { attribute: 'STR', points: 3 });
  const allocated = (await service.overview(actor.id)).profile; assert.equal(allocated.attributeReset.allocatedPoints, 3);
  const beforeReset = await profile(actor); const beforeAssets = await fingerprints();
  const worlds = await db.getRepository(E.DemonTowerWorldFloor).find({ order: { floor: 'ASC' } });
  const input = command('reset_attributes', allocated.version);
  const results = await all(Array.from({ length: 6 }, () => service.action(actor.id, input)));
  assert.equal(results.filter((receipt) => !receipt.replayed).length, 1);
  for (const receipt of results) {
    assert.equal(receipt.officeCoinsGranted, 0); assert.equal(receipt.effectiveBossDamage, 0); assert.equal(receipt.passageContribution, 0);
    assert.deepEqual(receipt.overview.profile.attributes, grown.attributes); assert.equal(receipt.overview.profile.unspentPoints, grown.unspentPoints);
    assert.equal(receipt.overview.profile.version, allocated.version + 1); assert.equal(receipt.overview.profile.attributeReset.allocatedPoints, 0);
    assert.equal(receipt.overview.profile.daily.activity, grown.daily.activity); safePublic(receipt);
  }
  const eligibleAt = results[0].overview.profile.attributeReset.eligibleAt;
  assert.equal(eligibleAt, now.getTime() + service.catalog().rules.attributeResetCooldownMs);
  assert.equal((await profile(actor)).state.rngCounter, beforeReset.state.rngCounter);
  await act(actor, 'allocate', { attribute: 'DEF', points: 1 });
  const beforeCooldown = await profile(actor); const retry = command('reset_attributes', beforeCooldown.version);
  now = new Date(eligibleAt - 1);
  phase = 'free-attribute-reset-one-millisecond-before-cooldown';
  const beforeWait = await fingerprints();
  await rejected(service.action(actor.id, retry), 'DEMON_TOWER_ATTRIBUTE_RESET_COOLDOWN');
  const oldReplay = await service.action(actor.id, input);
  assert.equal(oldReplay.replayed, true); assert.equal(oldReplay.overview.profile.version, beforeCooldown.version);
  assert.equal(oldReplay.overview.profile.attributeReset.allocatedPoints, 1);
  assert.deepEqual(await fingerprints(), beforeWait, 'Cooldown rejection and stale successful UUID replay must leave every table unchanged');
  now = new Date(eligibleAt);
  phase = 'free-attribute-reset-exact-cooldown-same-uuid';
  const recovered = await service.action(actor.id, retry);
  assert.equal(recovered.replayed, false); assert.equal(recovered.overview.profile.version, beforeCooldown.version + 1);
  assert.deepEqual(recovered.overview.profile.attributes, grown.attributes); assert.equal(recovered.overview.profile.unspentPoints, grown.unspentPoints);
  assert.equal(recovered.overview.profile.attributeReset.eligibleAt, eligibleAt + service.catalog().rules.attributeResetCooldownMs);
  const complete = await fingerprints();
  assert.equal((await service.action(actor.id, retry)).replayed, true); assert.deepEqual(await fingerprints(), complete);
  assert.equal(await db.getRepository(E.DemonTowerCommand).countBy({ userId: actor.id, kind: 'reset_attributes' }), 2);
  for (const table of ['wallet_balances', 'wallet_ledger', 'reward_grants']) assert.deepEqual(complete[table], beforeAssets[table]);
  assert.equal(await balance(actor), 0);
  assert.equal(await db.getRepository(E.RewardGrant).countBy({ userId: actor.id }), 0);
  assert.deepEqual(await db.getRepository(E.DemonTowerWorldFloor).find({ order: { floor: 'ASC' } }), worlds);
  mark('free attribute reset conserves genuinely earned points: six duplicate requests apply once, cooldown rejects at minus one millisecond and the same UUID works at exactly 24 hours without coins');
}

async function cleanup() {
  if (!db?.isInitialized || !baseline) return;
  phase = 'precise-synthetic-cleanup';
  await Promise.all([...inFlight]);
  const allowed = new Map(identities.map((identity) => [identity.id, identity]));
  const users = await db.getRepository(E.User).find();
  assert.ok(users.every((user) => {
    const identity = allowed.get(user.id);
    return identity && user.publicId === identity.publicId && user.communityRole === 'user' && (
      user.email === identity.email && user.username === identity.username && /^tower-rehearsal\.[a-f0-9-]+@users\.invalid$/.test(user.email)
      || deletionTargets.has(user.id) && user.accountStatus === 'deleted' && user.email === `deleted+${identity.publicId}@invalid.local` && user.username === null);
  }), 'Refuse unknown identity or expanded role cleanup');
  for (const entity of [E.DemonTowerProfile, E.DemonTowerCommand, E.DemonTowerContribution, E.DemonTowerDailyProgress]) {
    const rows = await db.getRepository(entity).find();
    assert.ok(rows.every((row) => allowed.has(row.userId)), 'Refuse deleting another account game data');
  }
  const awards = await db.getRepository(E.DemonTowerDailyAward).find();
  assert.ok(awards.every((award) => /^2099-09-(?:0[89]|1[0-5])$/.test(award.serviceDate) && (!award.winnerUserId || allowed.has(award.winnerUserId))), 'Refuse unknown award cleanup');
  const deletions = await db.getRepository(E.AccountDeletionRequest).find();
  assert.ok(deletions.every((row) => deletionTargets.has(row.userId)), 'Refuse unknown account-deletion cleanup');
  const deletionIds = new Set(deletions.map((row) => row.id));
  const audits = await db.getRepository(E.AdminAuditLog).find();
  assert.ok(audits.every((row) => deletionIds.has(row.targetId) && row.targetType === 'account' && ['account.deletion.requested', 'account.deletion.completed'].includes(row.action) && (row.actorId === null || deletionTargets.has(row.actorId))), 'Refuse unknown audit cleanup');
  const worlds = await db.getRepository(E.DemonTowerWorldFloor).find({ order: { floor: 'ASC' } });
  assert.ok(worlds.length === 0 || worlds.length === 9 && worlds.every((row, index) => row.floor === index + 1), 'Unknown world layout');
  assert.equal(baseline.demon_tower_world_floors.count, 0);
  await db.transaction(async (manager) => {
    // Match normal lock order; only this isolated script can have created these users/worlds.
    for (const user of users.sort((a, b) => a.id.localeCompare(b.id))) await manager.query('SELECT id FROM users WHERE id=$1 FOR NO KEY UPDATE', [user.id]);
    await manager.query('SELECT floor FROM demon_tower_world_floors ORDER BY floor FOR UPDATE');
    // Only disposable synthetic audit rows tied to the exact new deletion IDs; never a production audit operation.
    for (const audit of audits) await manager.getRepository(E.AdminAuditLog).delete({ id: audit.id, targetId: audit.targetId, action: audit.action });
    for (const award of awards) await manager.getRepository(E.DemonTowerDailyAward).delete({ serviceDate: award.serviceDate });
    for (const user of users) await manager.getRepository(E.User).delete({ id: user.id, email: user.email, publicId: user.publicId });
    for (const world of worlds) await manager.getRepository(E.DemonTowerWorldFloor).delete({ floor: world.floor });
  });
  assert.deepEqual(await fingerprints(), baseline, 'Every table count and content fingerprint must return to baseline');
  mark('precise synthetic users/awards/world cleanup restores every post-migration table fingerprint');
}

(async () => {
  let failure, failedPhase;
  try {
    await schema(); await identityAndIdempotency(); await lockBoundaryChecks();
    const winner = await worldAndRollbackChecks(); await battleAndPityChecks();
    await dailyEconomyChecks(); await awardChecks(winner); await databaseConstraints();
    await accountDeletionChecks(); await crossDateSuspensionLocks(); await paginatedRankingChecks();
    await midnightWalletSettlementChecks();
    await freeAttributeResetChecks();
  } catch (error) { failure = error; failedPhase = phase; }
  finally {
    try { await cleanup(); } catch (error) { failure = failure || error; failedPhase = failedPhase || phase; }
    if (db?.isInitialized) await db.destroy();
  }
  if (failure) {
    const code = failure?.response?.code || failure?.code || 'ASSERTION_OR_RUNTIME';
    const safeCode = /^[A-Z0-9_]{2,80}$/.test(String(code)) ? code : 'UNCLASSIFIED';
    const details = failure?.rehearsalDiagnostics;
    const diagnostic = details && ['expected', 'direct', 'transitive'].every((key) => Number.isSafeInteger(details[key]) && details[key] >= 0)
      ? ` diagnostics=${JSON.stringify({ expected: details.expected, direct: details.direct, transitive: details.transitive })}` : '';
    process.stderr.write(`DEMON_TOWER_REHEARSAL_FAILED phase=${failedPhase} class=${failure?.constructor?.name || 'Error'} code=${safeCode}${diagnostic}\n`);
    process.exitCode = 1; return;
  }
  process.stdout.write(`${JSON.stringify({ status: 'DEMON_TOWER_REHEARSAL_OK', database: 'community_demon_tower_rehearsal', scenarios: checks.length, syntheticUsers: identities.length, cleaned: true, lockingAndRollback: 'real PostgreSQL', payment: 'none' })}\n`);
})();
