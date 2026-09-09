#!/usr/bin/env node
'use strict';
/** Only the root-managed disposable growth PG. No production credentials, users, network or timers. */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const path = require('node:path');
assert.equal(process.env.AUTO_EXPLORE_REHEARSAL_CONFIRMATION, 'ISOLATED_AUTO_ONLY:20260909');
assert.equal(process.env.DB_HOST, 'growth-pg-btpam6');
assert.equal(process.env.DB_DATABASE, 'community_growth_rehearsal');
assert.equal(process.env.DB_USERNAME, 'growth_test');
assert.equal(process.env.DB_PORT || '5432', '5432');
assert.ok(process.env.DB_PASSWORD && process.env.DB_PASSWORD.length >= 8);
assert.equal(process.env.NODE_ENV, 'test'); assert.equal(process.env.LOCAL_DEV, 'false');
for (const key of ['DATABASE_URL', 'PGHOST', 'PGDATABASE', 'PUBLIC_SITE_ORIGIN', 'REDIS_URL', 'JWT_SECRET', 'AUTH_TOKEN_PEPPER', 'AUTH_EMAIL_WEBHOOK_URL', 'AUTH_EMAIL_OUTBOX_ENCRYPTION_KEY', 'SMTP_HOST']) assert.ok(!process.env[key], 'Do not supply production environment bundles');
const appRoot = process.env.APP_ROOT || '/app';
const fromApp = createRequire(path.join(appRoot, 'packages/backend/package.json'));
fromApp('reflect-metadata');
const { DataSource, Repository } = fromApp('typeorm');
const dist = process.env.BACKEND_DIST || path.join(appRoot, 'packages/backend/dist');
const load = file => fromApp(path.join(dist, file));
const E = load('database/entities');
const { migrations } = load('database/migrations');
const { DemonTowerService } = load('modules/community/demon-tower/demon-tower.service');
const { DemonTowerAutoService } = load('modules/community/demon-tower/demon-tower-auto.service');
const { MembershipService } = load('modules/community/progression/membership.service');
const { AuthService } = load('modules/auth/auth.service');
const { AuthRateLimitService } = load('modules/auth/auth-rate-limit.service');
const { AuthEmailOutboxService } = load('modules/auth/auth-email-outbox.service');
const { AuthSensitiveDataService } = load('modules/auth/auth-sensitive-data.service');
const { AccountLifecycleService } = load('modules/auth/account-lifecycle.service');
const { generateRefreshToken, hashAuthRateLimitKey } = load('modules/auth/auth-crypto');
const { hashPassword, verifyPassword } = load('modules/auth/password.util');
const { PlatformAssetsService } = load('modules/platform/platform-assets.service');
const { toBusinessLocalDate } = load('modules/platform/platform-time');
const engine = load('modules/community/demon-tower/demon-tower.engine');
const timestamp = migration => Number(migration.name.slice(-13));
assert.ok(migrations.some(migration => timestamp(migration) === 1700000000032));
assert.ok(migrations.every(migration => timestamp(migration) <= 1700000000032), 'Review later migrations separately');
for (const flag of ['FEATURE_COMMUNITY_WRITES_ENABLED', 'FEATURE_COMMUNITY_DEMON_TOWER_ENABLED', 'FEATURE_COMMUNITY_PROGRESSION_ENABLED', 'FEATURE_DEMON_TOWER_AUTO_EXPLORE_ENABLED']) process.env[flag] = 'true';
process.env.APP_MODE = 'community';
const options = { type: 'postgres', host: process.env.DB_HOST, port: 5432, username: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE, entities: E.entities, migrations, synchronize: false, migrationsRun: false, logging: false,
  extra: { max: 12, options: '-c statement_timeout=20000 -c lock_timeout=10000 -c idle_in_transaction_session_timeout=20000' } };
let db, baseline, tower, assets, auto, phase = 'guard';
let now = new Date('2099-09-09T02:00:00Z');
const clock = { now: () => new Date(now) };
const identities = [], checks = [], pending = new Set(), deletionIds = new Set(), rateLimitKeys = new Set();
const mark = name => { checks.push(name); process.stdout.write(`PASS ${name}\n`); };
const tick = (ms = 2001) => { now = new Date(now.getTime() + ms); };
const expectCode = (promise, code) => assert.rejects(promise, error => error?.response?.code === code);
const tracked = promise => { const settled = promise.then(value => ({ value }), error => ({ error })); pending.add(settled); void settled.finally(() => pending.delete(settled)); return settled; };
async function settle(promises) { const values = await Promise.all(promises); const failure = values.find(value => value.error); if (failure) throw failure.error; return values.map(value => value.value); }
async function fingerprints() {
  const result = {};
  for (const { tablename } of await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")) {
    assert.match(tablename, /^[a-z0-9_]+$/);
    [result[tablename]] = await db.query(`SELECT count(*)::integer AS count, md5(COALESCE(string_agg(to_jsonb(t)::text, E'\\n' ORDER BY to_jsonb(t)::text), '')) AS digest FROM "${tablename}" t`);
  }
  return result;
}
const withoutHistory = fingerprints => Object.fromEntries(Object.entries(fingerprints).filter(([key]) => key !== 'migrations'));
async function rawProfile(userId) { return db.getRepository(E.DemonTowerProfile).createQueryBuilder('p').addSelect('p.state').where('p.user_id=:userId', { userId }).getOneOrFail(); }
async function job(id) { return db.getRepository(E.DemonTowerAutoRun).createQueryBuilder('r').addSelect(['r.failureCount', 'r.originAuthSessionId', 'r.startRequestId', 'r.requestHash']).where('r.id=:id', { id }).getOneOrFail(); }
async function changeState(actor, change) { const profile = await rawProfile(actor.user.id); change(profile.state); await db.getRepository(E.DemonTowerProfile).save(profile); }
async function actor({ vip = true, enroll = true } = {}) {
  const id = randomUUID(), publicId = randomUUID(), username = `autopg_${publicId.slice(0, 12)}`, email = `${publicId}@auto-rehearsal.invalid`;
  identities.push({ id, publicId, username, email });
  const user = await db.getRepository(E.User).save(db.getRepository(E.User).create({ id, publicId, username, email, displayName: '自动探索合成验收', passwordHash: 'synthetic-only-no-login', accountStatus: 'active', communityRole: 'user' }));
  const session = await db.getRepository(E.AuthSession).save({ userId: id, lastSeenAt: now, expiresAt: new Date(now.getTime() + 86_400_000), revokedAt: null, revokeReason: null });
  if (vip) await db.getRepository(E.CommunityMembershipGrant).save({ userId: id, campaignKey: 'launch_vip_202609', startsAt: new Date(now.getTime() - 1000), expiresAt: new Date(now.getTime() + 86_400_000), createdAt: now });
  const enrollment = { requestId: randomUUID(), expectedVersion: 0, kind: 'enroll', payload: {} };
  if (enroll) await tower.action(id, enrollment);
  return { user, session, enrollment };
}
async function begin(actor, maxExplorations = 20) {
  const profile = (await tower.overview(actor.user.id)).profile;
  const input = { requestId: randomUUID(), expectedVersion: profile.version, floor: profile.selectedFloor, maxExplorations };
  return { input, response: await auto.start(actor.user.id, actor.session.id, input) };
}
async function gameEvidence(actor) {
  const userId = actor.user.id;
  return { profile: await rawProfile(userId), commands: await db.getRepository(E.DemonTowerCommand).find({ where: { userId }, order: { requestId: 'ASC' } }),
    daily: await db.getRepository(E.DemonTowerDailyProgress).find({ where: { userId }, order: { serviceDate: 'ASC' } }),
    balances: await db.getRepository(E.WalletBalance).find({ where: { userId }, order: { currency: 'ASC' } }),
    grants: await db.getRepository(E.RewardGrant).find({ where: { userId }, order: { id: 'ASC' } }),
    ledger: await db.getRepository(E.WalletLedger).find({ where: { userId }, order: { id: 'ASC' } }) };
}
async function rewardNext(actor) {
  const world = (await tower.overview(actor.user.id)).world;
  for (let index = 0; index < 100; index++) {
    const state = engine.createDemonTowerState(now.getTime(), toBusinessLocalDate(now), `synthetic-auto-reward-${index}`);
    const result = engine.actDemonTower(state, { kind: 'explore', payload: {} }, { now: now.getTime(), serviceDate: toBusinessLocalDate(now), world });
    if (result.officeCoinIntent > 0 && result.state.battle === null) {
      const profile = await rawProfile(actor.user.id); profile.state = state; await db.getRepository(E.DemonTowerProfile).save(profile); return result.officeCoinIntent;
    }
  }
  assert.fail('Synthetic seed must generate an ordinary noncombat reward');
}
async function hold(sql, args = []) {
  const runner = db.createQueryRunner(); await runner.connect(); await runner.startTransaction();
  const [{ pid }] = await runner.query('SELECT pg_backend_pid() AS pid');
  await runner.query(sql, args);
  return { pid, release: async () => { if (runner.isTransactionActive) await runner.rollbackTransaction(); await runner.release(); } };
}
async function waitBlocked(holder, minimum = 1) {
  for (let i = 0; i < 250; i++) {
    const [{ count }] = await db.query("SELECT count(*)::integer AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND $1::integer=ANY(pg_blocking_pids(pid))", [holder.pid]);
    // Same-user queues can transitively wait on a preceding tuple lock holder.
    const [{ total }] = await db.query(`WITH RECURSIVE blocked AS (SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND $1::integer=ANY(pg_blocking_pids(pid)) UNION SELECT a.pid FROM pg_stat_activity a JOIN blocked b ON b.pid=ANY(pg_blocking_pids(a.pid)) WHERE a.datname=current_database()) SELECT count(DISTINCT pid)::integer AS total FROM blocked`, [holder.pid]);
    if (count >= 1 && total >= minimum) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail('Real specifically attributed PG lock wait was not observed');
}
async function schema() {
  phase = 'isolated-schema32'; db = await new DataSource(options).initialize();
  const [who] = await db.query('SELECT current_database() AS database,current_user AS username');
  assert.equal(who.database, 'community_growth_rehearsal'); assert.equal(who.username, 'growth_test');
  const names = new Set((await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).map(row => row.tablename));
  if (names.size) {
    assert.ok(names.has('users') && names.has('migrations')); assert.equal(Number((await db.query('SELECT count(*) FROM users'))[0].count), 0);
    const seeded = new Set(['migrations', 'tools', 'tool_professions', 'item_definitions', 'crop_definitions', 'task_definitions', 'chat_rooms', 'community_capacity_guards']);
    for (const table of names) { assert.match(table, /^[a-z0-9_]+$/); if (!seeded.has(table)) assert.equal(Number((await db.query(`SELECT count(*) FROM "${table}"`))[0].count), 0, 'Existing business rows forbidden'); }
    for (const table of ['membership_grants', 'achievement_unlocks', 'user_presentation', 'demon_tower_auto_runs', 'demon_tower_profiles', 'demon_tower_commands', 'demon_tower_world_floors', 'demon_tower_daily_progress', 'demon_tower_contributions', 'demon_tower_daily_awards', 'wallet_balances', 'reward_grants', 'wallet_ledger']) if (names.has(table)) assert.equal(Number((await db.query(`SELECT count(*) FROM "${table}"`))[0].count), 0);
    const latest = Number((await db.query('SELECT max(timestamp) AS latest FROM migrations'))[0].latest);
    assert.ok([1700000000031, 1700000000032].includes(latest));
    if (latest === 1700000000032) await db.undoLastMigration({ transaction: 'all' });
  } else {
    await db.destroy(); db = await new DataSource({ ...options, migrations: migrations.filter(item => timestamp(item) <= 1700000000031) }).initialize();
    await db.runMigrations({ transaction: 'all' }); await db.destroy(); db = await new DataSource(options).initialize();
  }
  const before = await fingerprints(); const history = await db.query('SELECT timestamp,name FROM migrations ORDER BY timestamp');
  assert.equal(Number(history.at(-1).timestamp), 1700000000031);
  await db.runMigrations({ transaction: 'all' }); const upgraded = await fingerprints();
  assert.equal(Object.keys(upgraded).length, Object.keys(before).length + 1); assert.equal(upgraded.demon_tower_auto_runs.count, 0);
  delete upgraded.demon_tower_auto_runs; assert.deepEqual(withoutHistory(upgraded), withoutHistory(before));
  await db.undoLastMigration({ transaction: 'all' }); assert.deepEqual(withoutHistory(await fingerprints()), withoutHistory(before));
  assert.deepEqual(await db.query('SELECT timestamp,name FROM migrations ORDER BY timestamp'), history);
  await db.runMigrations({ transaction: 'all' }); assert.deepEqual(await db.runMigrations({ transaction: 'all' }), []);
  baseline = await fingerprints(); assert.equal(Object.keys(baseline).length, 136);
  assets = new PlatformAssetsService(clock); tower = new DemonTowerService(db, assets, clock); auto = new DemonTowerAutoService(db, tower, new MembershipService(), clock);
  mark('schema31-32-31-32 exact additive table and no-op; old data unchanged');
}
async function permissionsAndReplay() {
  phase = 'permissions-and-replay'; const guest = await actor({ vip: false, enroll: false }); const initial = await fingerprints();
  assert.equal((await auto.read(guest.user.id)).run, null); assert.deepEqual(await fingerprints(), initial);
  const a = await actor(), b = await actor({ vip: false });
  const bad = { requestId: randomUUID(), expectedVersion: 1, floor: 1, maxExplorations: 2 };
  await expectCode(auto.start(b.user.id, b.session.id, bad), 'VIP_REQUIRED');
  await expectCode(auto.start(a.user.id, b.session.id, bad), 'INVALID_SESSION');
  for (const input of [{ ...bad, score: 999 }, { ...bad, maxExplorations: 21 }, { ...bad, seed: 'client-seed' }]) await expectCode(auto.start(a.user.id, a.session.id, input), 'DEMON_TOWER_AUTO_REQUEST_INVALID');
  const { input, response } = await begin(a); const id = response.run.id;
  const after = await fingerprints(); const replays = await settle(Array.from({ length: 6 }, () => tracked(auto.start(a.user.id, a.session.id, input))));
  assert.ok(replays.every(value => value.replayed && value.run.id === id)); assert.deepEqual(await fingerprints(), after);
  await expectCode(auto.start(a.user.id, a.session.id, { ...input, maxExplorations: 2 }), 'DEMON_TOWER_AUTO_IDEMPOTENCY_CONFLICT');
  await expectCode(begin(a), 'DEMON_TOWER_AUTO_RUNNING');
  await expectCode(tower.action(a.user.id, { requestId: randomUUID(), expectedVersion: 1, kind: 'train', payload: {} }), 'DEMON_TOWER_AUTO_RUNNING');
  assert.equal((await tower.action(a.user.id, a.enrollment)).replayed, true);
  await expectCode(auto.stop(b.user.id, id, {}), 'DEMON_TOWER_AUTO_NOT_FOUND');
  const serialized = JSON.stringify(response); assert.ok(!/originAuthSessionId|startRequestId|requestHash|failureCount|rngSeed|rngCounter/.test(serialized)); assert.ok(!serialized.includes(a.user.id) && !serialized.includes(a.session.id));
  await auto.stop(a.user.id, id, {}); assert.equal((await auto.start(a.user.id, a.session.id, input)).run.status, 'stopped');
  mark('VIP/session/exact payload/owner guards; six UUID replays; old manual receipt survives; no restart or secrets');
}
async function concurrency() {
  phase = 'concurrent-first-start'; const a = await actor();
  const input = { requestId: randomUUID(), expectedVersion: 1, floor: 1, maxExplorations: 3 };
  const started = await settle(Array.from({ length: 6 }, () => tracked(auto.start(a.user.id, a.session.id, input))));
  assert.equal(started.filter(value => !value.replayed).length, 1); assert.equal(new Set(started.map(value => value.run.id)).size, 1);
  const id = started[0].run.id;
  phase = 'concurrent-worker-step'; const holder = await hold('SELECT id FROM users WHERE id=$1 FOR NO KEY UPDATE', [a.user.id]); let workers;
  try {
    workers = Array.from({ length: 6 }, () => tracked(new DemonTowerAutoService(db, tower, new MembershipService(), clock).runOne(id, false)));
    await waitBlocked(holder, 6);
  } finally { await holder.release(); }
  const results = await settle(workers); assert.equal(results.filter(Boolean).length, 1); assert.equal((await job(id)).steps, 1);
  assert.equal((await rawProfile(a.user.id)).version, 2); assert.equal(await db.getRepository(E.DemonTowerCommand).countBy({ userId: a.user.id }), 2);
  await auto.stop(a.user.id, id, {});
  mark('six independent starts and six real queued workers produce exactly one run and one engine receipt');
  phase = 'default-skip-locked-busy-user'; const skipped = await actor(); const skipRun = (await begin(skipped)).response.run;
  const skipHolder = await hold('SELECT id FROM users WHERE id=$1 FOR NO KEY UPDATE', [skipped.user.id]);
  try {
    assert.deepEqual(await settle([tracked(auto.runOne(skipRun.id)), tracked(new DemonTowerAutoService(db, tower, new MembershipService(), clock).runOne(skipRun.id))]), [false, false]);
    assert.equal((await job(skipRun.id)).steps, 0);
  } finally { await skipHolder.release(); }
  await auto.stop(skipped.user.id, skipRun.id, {});
  mark('two production-default workers SKIP LOCKED without hanging or claiming the busy user');
  phase = 'default-workers-reconstructed-service'; const resumed = await actor(); await rewardNext(resumed); const durable = (await begin(resumed, 2)).response.run;
  const firstDefault = await settle([tracked(auto.runOne(durable.id)), tracked(new DemonTowerAutoService(db, tower, new MembershipService(), clock).runOne(durable.id))]);
  assert.equal(firstDefault.filter(Boolean).length, 1); assert.equal((await job(durable.id)).steps, 1);
  assert.equal(await db.getRepository(E.DemonTowerCommand).countBy({ userId: resumed.user.id }), 2);
  tick(); const restartedTower = new DemonTowerService(db, new PlatformAssetsService(clock), clock);
  const restarted = new DemonTowerAutoService(db, restartedTower, new MembershipService(), clock);
  assert.equal(await restarted.runOne(durable.id), true); assert.equal((await job(durable.id)).steps, 2);
  assert.equal(await restarted.runOne(durable.id), false);
  assert.equal(await db.getRepository(E.DemonTowerCommand).countBy({ userId: resumed.user.id }), 3);
  await restarted.stop(resumed.user.id, durable.id, {});
  mark('default competing workers settle once; reconstructed services resume the durable next cursor without replay credit');
  phase = 'stop-wins-user-lock'; const b = await actor(); const run = (await begin(b)).response.run;
  const gate = await hold('SELECT id FROM users WHERE id=$1 FOR NO KEY UPDATE', [b.user.id]); let stop, worker;
  try { stop = tracked(auto.stop(b.user.id, run.id, {})); await waitBlocked(gate); worker = tracked(auto.runOne(run.id, false)); await waitBlocked(gate, 2); }
  finally { await gate.release(); }
  const [stopped, advanced] = await settle([stop, worker]); assert.equal(stopped.run.stopReason, 'manual_stop'); assert.equal(advanced, false); assert.equal((await job(run.id)).steps, 0);
  mark('stop queued before worker atomically prevents next step');
  phase = 'stop-waits-for-inflight-step'; const c = await actor(); await rewardNext(c); const inflight = (await begin(c, 2)).response.run;
  const worldGate = await hold('SELECT floor FROM demon_tower_world_floors WHERE floor=1 FOR UPDATE'); let first, cancellation;
  try { first = tracked(auto.runOne(inflight.id, false)); await waitBlocked(worldGate); cancellation = tracked(auto.stop(c.user.id, inflight.id, {})); await waitBlocked(worldGate, 2); }
  finally { await worldGate.release(); }
  const [didStep, didStop] = await settle([first, cancellation]); assert.equal(didStep, true); assert.equal(didStop.run.stopReason, 'manual_stop'); assert.equal(didStop.run.steps, 1);
  const afterStop = await gameEvidence(c); tick(); assert.equal(await auto.runOne(inflight.id, false), false); assert.deepEqual(await gameEvidence(c), afterStop);
  mark('stop waits for the in-flight world-locked step, then guarantees no later command or reward');
}
async function rollbackAndCap() {
  phase = 'reward-failure-rollback'; const a = await actor(); const reward = await rewardNext(a); const run = (await begin(a, 1)).response.run;
  const before = await gameEvidence(a); const original = assets.grantReward;
  assets.grantReward = async function (...args) { await original.apply(this, args); throw new Error('synthetic post-grant failure'); };
  try { assert.equal(await auto.runOne(run.id, false), false); } finally { assets.grantReward = original; }
  assert.deepEqual(await gameEvidence(a), before); assert.equal((await job(run.id)).failureCount, 1); assert.equal((await job(run.id)).steps, 0);
  tick(5001); assert.equal(await auto.runOne(run.id, false), true); assert.equal((await job(run.id)).status, 'completed');
  assert.equal(await db.getRepository(E.RewardGrant).countBy({ userId: a.user.id, sourceType: 'demon_tower_action' }), 1);
  assert.equal(Number((await db.getRepository(E.WalletBalance).findOneByOrFail({ userId: a.user.id, currency: 'office_coin' })).balance), 500 + reward);
  const finished = await gameEvidence(a); assert.equal(await auto.runOne(run.id, false), false); assert.deepEqual(await gameEvidence(a), finished);
  mark('post-credit failure rolls back game/commands/initial wallet/grant; same cursor retries exactly once');
  phase = 'shared-daily-cap'; const b = await actor(); await rewardNext(b); await db.getRepository(E.DemonTowerDailyProgress).update({ userId: b.user.id, serviceDate: toBusinessLocalDate(now) }, { officeCoins: 199 });
  const limited = (await begin(b, 1)).response.run; await auto.runOne(limited.id, false);
  assert.equal((await job(limited.id)).officeCoinsGranted, 1); assert.equal((await db.getRepository(E.DemonTowerDailyProgress).findOneByOrFail({ userId: b.user.id, serviceDate: toBusinessLocalDate(now) })).officeCoins, 200);
  assert.equal(Number((await db.getRepository(E.WalletBalance).findOneByOrFail({ userId: b.user.id, currency: 'office_coin' })).balance), 501);
  mark('automatic exploration uses the existing 200-per-day cap and clips a two-coin reward to one');
}
async function expiryLocks() {
  for (const reason of ['vip_expired', 'session_ended', 'day_changed', 'time_limit', 'maintenance']) {
    phase = `world-wait-${reason}`; now = new Date('2099-09-09T15:59:58Z');
    const a = await actor(); const run = (await begin(a)).response.run; const before = await gameEvidence(a);
    if (reason === 'vip_expired') await db.getRepository(E.CommunityMembershipGrant).update({ userId: a.user.id }, { expiresAt: new Date(now.getTime() + 1000) });
    if (reason === 'session_ended') await db.getRepository(E.AuthSession).update(a.session.id, { expiresAt: new Date(now.getTime() + 1000) });
    if (reason === 'time_limit') now = new Date('2099-09-09T02:00:00Z'); // A separate fixture below sets exact run TTL without crossing a date.
    if (reason === 'time_limit') { await db.getRepository(E.DemonTowerAutoRun).update(run.id, { createdAt: new Date(now.getTime() - 899_000), expiresAt: new Date(now.getTime() + 1000), nextStepAt: now }); }
    const holder = await hold('SELECT floor FROM demon_tower_world_floors WHERE floor=1 FOR UPDATE'); let work;
    try { work = tracked(auto.runOne(run.id, false)); await waitBlocked(holder); tick(reason === 'day_changed' ? 2000 : 1001); if (reason === 'maintenance') process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'false'; }
    finally { await holder.release(); }
    await settle([work]); process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true';
    assert.equal((await job(run.id)).stopReason, reason); assert.equal((await job(run.id)).steps, 0); assert.deepEqual(await gameEvidence(a), before);
    mark(`real world-lock wait rechecks ${reason} and consumes no game resources`);
  }
  phase = 'wallet-wait-midnight-final-fence'; now = new Date('2099-09-10T15:59:58Z'); const a = await actor(); await rewardNext(a);
  await db.transaction(manager => assets.ensurePlatformState(manager, a.user.id));
  const run = (await begin(a, 1)).response.run; const before = await gameEvidence(a); const holder = await hold("SELECT user_id FROM wallet_balances WHERE user_id=$1 AND currency='office_coin' FOR UPDATE", [a.user.id]); let work;
  try { work = tracked(auto.runOne(run.id, false)); await waitBlocked(holder); tick(2000); } finally { await holder.release(); }
  await settle([work]); assert.equal((await job(run.id)).stopReason, 'day_changed'); assert.equal((await job(run.id)).steps, 0); assert.deepEqual(await gameEvidence(a), before);
  mark('wallet lock crosses UTC+8 midnight: final fence rolls back profile, receipt, daily row and reward together');
}
async function afterSaveFences() {
  // Deliberately advance the injected service clock only AFTER the real PG run
  // UPDATE completes. This is a fault-injection boundary, not a natural wait.
  for (const reason of ['day_changed', 'vip_expired', 'session_ended', 'time_limit', 'maintenance']) {
    phase = `after-run-save-${reason}`; now = new Date(reason === 'day_changed' ? '2099-09-12T15:59:58Z' : '2099-09-12T02:00:00Z');
    const a = await actor(); await rewardNext(a); const run = (await begin(a, 1)).response.run;
    if (reason === 'vip_expired') await db.getRepository(E.CommunityMembershipGrant).update({ userId: a.user.id }, { expiresAt: new Date(now.getTime() + 1000) });
    if (reason === 'session_ended') await db.getRepository(E.AuthSession).update(a.session.id, { expiresAt: new Date(now.getTime() + 1000) });
    if (reason === 'time_limit') await db.getRepository(E.DemonTowerAutoRun).update(run.id, { createdAt: new Date(now.getTime() - 899_000), expiresAt: new Date(now.getTime() + 1000) });
    const before = await gameEvidence(a), originalSave = Repository.prototype.save; let injected = false;
    Repository.prototype.save = async function (entity, ...rest) {
      const result = await originalSave.call(this, entity, ...rest);
      if (!injected && this.metadata.target === E.DemonTowerAutoRun && entity?.id === run.id && entity.steps === 1) {
        assert.equal(this.manager.queryRunner?.isTransactionActive, true);
        assert.equal((await this.manager.getRepository(E.DemonTowerAutoRun).findOneByOrFail({ id: run.id })).steps, 1);
        assert.equal(await this.manager.getRepository(E.DemonTowerCommand).countBy({ userId: a.user.id }), 2);
        injected = true; tick(reason === 'day_changed' ? 2000 : 1001);
        if (reason === 'maintenance') process.env.FEATURE_DEMON_TOWER_AUTO_EXPLORE_ENABLED = 'false';
      }
      return result;
    };
    try { assert.equal(await auto.runOne(run.id), false); }
    finally { Repository.prototype.save = originalSave; process.env.FEATURE_DEMON_TOWER_AUTO_EXPLORE_ENABLED = 'true'; }
    assert.equal(injected, true); assert.equal((await job(run.id)).stopReason, reason); assert.equal((await job(run.id)).steps, 0);
    assert.deepEqual(await gameEvidence(a), before);
    mark(`injected ${reason} after final PG run save rolls back completed run, profile, receipt and credited reward`);
  }
}
function authServices() {
  const neverSend = () => { throw new Error('MAIL_SENDING_FORBIDDEN_IN_REHEARSAL'); };
  const outbox = new AuthEmailOutboxService(db, { sendRegistrationCode: neverSend, sendPasswordReset: neverSend });
  // These actual service methods need only DB, rate limiter and recipient purge;
  // no registration/JWT/provider method or application bootstrap is called.
  return { auth: new AuthService(db, undefined, undefined, outbox, new AuthRateLimitService(db), undefined),
    lifecycle: new AccountLifecycleService(db, new AuthSensitiveDataService(), outbox) };
}
async function sessionRevocationRaces() {
  now = new Date('2099-09-13T02:00:00Z'); const { auth } = authServices();
  const password = 'Synthetic-Automation#2026', replacement = 'Synthetic-Replacement#2026';
  const storedPassword = await hashPassword(password), ipAddress = '127.0.0.12';
  for (const kind of ['logout', 'logout_all', 'password']) {
    for (const first of ['revocation', 'worker']) {
      phase = `${kind}-${first}-first`; const a = await actor(); await rewardNext(a);
      await db.getRepository(E.User).update(a.user.id, { passwordHash: storedPassword });
      const token = generateRefreshToken();
      await db.getRepository(E.AuthRefreshToken).save({ id: token.id, sessionId: a.session.id, tokenHash: token.hash, status: 'active', expiresAt: a.session.expiresAt });
      const run = (await begin(a, 2)).response.run; const before = await gameEvidence(a);
      const revoke = () => {
        if (kind === 'logout') return auth.logout(token.raw);
        if (kind === 'logout_all') return auth.logoutAll(a.user.id);
        rateLimitKeys.add(hashAuthRateLimitKey('password-change:ip', ipAddress));
        rateLimitKeys.add(hashAuthRateLimitKey('password-change:user', a.user.id));
        return auth.changePassword(a.user.id, { currentPassword: password, newPassword: replacement }, { ipAddress });
      };
      let worker, revocation;
      if (first === 'revocation') {
        const gate = await hold('SELECT id FROM users WHERE id=$1 FOR NO KEY UPDATE', [a.user.id]);
        try {
          revocation = tracked(revoke()); await waitBlocked(gate);
          // A revoker waiting for User must not already own the session/token.
          const probe = db.createQueryRunner(); await probe.connect(); await probe.startTransaction();
          try { await probe.query('SELECT id FROM auth_sessions WHERE id=$1 FOR UPDATE NOWAIT', [a.session.id]); await probe.query('SELECT id FROM auth_refresh_tokens WHERE id=$1 FOR UPDATE NOWAIT', [token.id]); }
          finally { await probe.rollbackTransaction(); await probe.release(); }
          worker = tracked(auto.runOne(run.id, false)); await waitBlocked(gate, 2);
        } finally { await gate.release(); }
      } else {
        const gate = await hold('SELECT floor FROM demon_tower_world_floors WHERE floor=1 FOR UPDATE');
        try { worker = tracked(auto.runOne(run.id, false)); await waitBlocked(gate); revocation = tracked(revoke()); await waitBlocked(gate, 2); }
        finally { await gate.release(); }
      }
      const [didWork] = await settle([worker, revocation]);
      assert.equal((await db.getRepository(E.AuthRefreshToken).findOneByOrFail({ id: token.id })).status, 'revoked');
      assert.equal((await db.getRepository(E.AuthSession).findOneByOrFail({ id: a.session.id })).revokeReason, kind === 'password' ? 'password_change' : kind);
      if (kind === 'password') assert.equal(await verifyPassword(replacement, (await db.getRepository(E.User).findOneByOrFail({ id: a.user.id })).passwordHash), true);
      if (first === 'revocation') { assert.equal(didWork, true); assert.equal((await job(run.id)).steps, 0); assert.deepEqual(await gameEvidence(a), before); }
      else { assert.equal(didWork, true); assert.equal((await job(run.id)).steps, 1); }
      const afterRevoke = await gameEvidence(a); tick(); await auto.runOne(run.id);
      assert.equal((await job(run.id)).stopReason, 'session_ended'); assert.deepEqual(await gameEvidence(a), afterRevoke);
      mark(`real AuthService ${kind}, ${first} queued first: user-session order and no engine action after successful revocation`);
    }
  }
}
async function softDeletion() {
  phase = 'real-soft-account-deletion'; now = new Date('2099-09-14T02:00:00Z'); const { lifecycle } = authServices();
  const a = await actor(), survivor = await actor(); const run = (await begin(a)).response.run;
  await db.getRepository(E.CommunityAchievementUnlock).save({ userId: a.user.id, achievementKey: 'farm_first', unlockedAt: now, sourceVersion: 1 });
  await db.getRepository(E.CommunityUserPresentation).save({ userId: a.user.id, equippedTitleKey: 'farm_first', version: 1, updatedAt: now });
  const survivorBefore = await gameEvidence(survivor), worldBefore = await db.getRepository(E.DemonTowerWorldFloor).find({ order: { floor: 'ASC' } });
  await db.getRepository(E.User).update(a.user.id, { accountStatus: 'deleting' });
  const id = randomUUID(); deletionIds.add(id);
  await db.getRepository(E.AccountDeletionRequest).save({ id, userId: a.user.id, previousAccountStatus: 'active', status: 'scheduled',
    idempotencyKeyHash: id.replaceAll('-', '').repeat(2), requestHash: id.replaceAll('-', '').repeat(2), requestedAt: new Date(now.getTime() - 8 * 86_400_000), scheduledFor: now, availableAt: now });
  const gate = await hold('SELECT id FROM users WHERE id=$1 FOR NO KEY UPDATE', [a.user.id]); let deletion, worker;
  try { deletion = tracked(lifecycle.processDueDeletions(1, now)); await waitBlocked(gate); worker = tracked(auto.runOne(run.id, false)); await waitBlocked(gate, 2); }
  finally { await gate.release(); }
  const [completed, advanced] = await settle([deletion, worker]); assert.equal(completed, 1); assert.equal(advanced, false);
  const deleted = await db.getRepository(E.User).findOneByOrFail({ id: a.user.id });
  assert.equal(deleted.accountStatus, 'deleted'); assert.equal(deleted.publicId, a.user.publicId); assert.equal(deleted.email, `deleted+${a.user.publicId}@invalid.local`); assert.equal(deleted.username, null);
  identities.find(identity => identity.id === a.user.id).deleted = true;
  for (const entity of [E.DemonTowerAutoRun, E.CommunityMembershipGrant, E.CommunityAchievementUnlock, E.CommunityUserPresentation, E.DemonTowerProfile, E.DemonTowerCommand, E.DemonTowerDailyProgress, E.AuthSession]) assert.equal(await db.getRepository(entity).countBy({ userId: a.user.id }), 0);
  assert.equal((await db.getRepository(E.AccountDeletionRequest).findOneByOrFail({ id })).status, 'completed');
  assert.deepEqual(await gameEvidence(survivor), survivorBefore); assert.deepEqual(await db.getRepository(E.DemonTowerWorldFloor).find({ order: { floor: 'ASC' } }), worldBefore);
  assert.equal(await auto.runOne(run.id), false);
  mark('actual soft deletion removes auto/VIP/achievement/title and save rows under user lock; no later worker and no other-user/world changes');
}
async function remainingBounds() {
  now = new Date('2099-09-11T02:00:00Z');
  for (const reason of ['step_limit', 'quota_reached', 'stamina_empty', 'account_inactive', 'profile_changed']) {
    phase = `bound-${reason}`; const a = await actor(); const run = (await begin(a)).response.run;
    if (reason === 'step_limit') await db.getRepository(E.DemonTowerAutoRun).update(run.id, { steps: 260 });
    if (reason === 'quota_reached') await db.getRepository(E.DemonTowerDailyProgress).update({ userId: a.user.id, serviceDate: toBusinessLocalDate(now) }, { actionCount: 2000 });
    if (reason === 'stamina_empty') await changeState(a, state => { state.stamina = 0; });
    if (reason === 'account_inactive') await db.getRepository(E.User).update(a.user.id, { accountStatus: 'suspended' });
    if (reason === 'profile_changed') await db.getRepository(E.DemonTowerProfile).increment({ userId: a.user.id }, 'version', 1);
    const before = await gameEvidence(a); await auto.runOne(run.id, false); assert.equal((await job(run.id)).stopReason, reason); assert.deepEqual(await gameEvidence(a), before);
    mark(`fixed ${reason} bound stops without additional gameplay`);
  }
  phase = 'batch-limit-and-feature-independent-stop'; const a = await actor();
  await changeState(a, state => { state.attributes.STR = 200; state.attributes.DEF = 200; state.hp = engine.demonTowerMaxHp(state); });
  const run = (await begin(a, 2)).response.run;
  for (let i = 0; i < 26 && (await job(run.id)).status === 'running'; i++) { await auto.runOne(run.id, false); tick(); }
  assert.equal((await job(run.id)).status, 'completed'); assert.equal((await job(run.id)).startedExplorations, 2); assert.equal((await job(run.id)).completedExplorations, 2);
  const b = await actor(); const stop = (await begin(b)).response.run; const before = await gameEvidence(b);
  for (const flag of ['FEATURE_COMMUNITY_WRITES_ENABLED', 'FEATURE_COMMUNITY_DEMON_TOWER_ENABLED', 'FEATURE_COMMUNITY_PROGRESSION_ENABLED', 'FEATURE_DEMON_TOWER_AUTO_EXPLORE_ENABLED']) process.env[flag] = 'false';
  await db.getRepository(E.CommunityMembershipGrant).delete({ userId: b.user.id });
  assert.equal((await auto.stop(b.user.id, stop.id, {})).run.stopReason, 'manual_stop'); assert.equal((await auto.stop(b.user.id, stop.id, {})).replayed, true); assert.deepEqual(await gameEvidence(b), before);
  mark('bounded batch ends at two explorations; stop is owned/idempotent even after VIP and every write gate close');
}
async function cleanup() {
  if (!baseline || !db?.isInitialized) return;
  phase = 'precise-cleanup'; await Promise.all([...pending]);
  const allowed = new Map(identities.map(identity => [identity.id, identity])); const users = await db.getRepository(E.User).find();
  assert.ok(users.every(user => { const expected = allowed.get(user.id); return expected && user.publicId === expected.publicId && user.communityRole === 'user' && (expected.deleted
    ? user.accountStatus === 'deleted' && user.email === `deleted+${expected.publicId}@invalid.local` && user.username === null
    : user.email === expected.email && user.username === expected.username && ['active', 'suspended'].includes(user.accountStatus)); }));
  assert.equal(await db.getRepository(E.DemonTowerContribution).count(), 0); assert.equal(await db.getRepository(E.DemonTowerDailyAward).count(), 0);
  for (const entity of [E.DemonTowerAutoRun, E.DemonTowerProfile, E.DemonTowerCommand, E.DemonTowerDailyProgress, E.CommunityMembershipGrant, E.CommunityAchievementUnlock, E.CommunityUserPresentation, E.AuthSession, E.WalletBalance, E.WalletLedger, E.RewardGrant]) assert.ok((await db.getRepository(entity).find()).every(row => allowed.has(row.userId)));
  const sessions = new Set((await db.getRepository(E.AuthSession).find()).map(row => row.id));
  assert.ok((await db.getRepository(E.AuthRefreshToken).find()).every(row => sessions.has(row.sessionId)));
  const deletions = await db.getRepository(E.AccountDeletionRequest).find(); assert.ok(deletions.every(row => deletionIds.has(row.id) && allowed.has(row.userId)));
  const audits = await db.getRepository(E.AdminAuditLog).find();
  assert.ok(audits.every(row => deletionIds.has(row.targetId) && row.actorId === null && row.actorRole === 'system' && row.targetType === 'account' && row.action === 'account.deletion.completed'));
  const buckets = await db.getRepository(E.AuthRateLimitBucket).find(); assert.ok(buckets.every(row => rateLimitKeys.has(row.keyHash) && ['password-change:ip', 'password-change:user'].includes(row.scope)));
  const worlds = await db.getRepository(E.DemonTowerWorldFloor).find({ order: { floor: 'ASC' } }); assert.equal(worlds.length, 9);
  assert.ok(worlds.every((world, index) => world.floor === index + 1 && world.bossHp === world.bossMaxHp && world.passageProgress === 0 && world.defeatedAt === null && world.completedAt === null));
  assert.equal(baseline.demon_tower_world_floors.count, 0);
  await db.transaction(async manager => {
    for (const user of users.sort((a, b) => a.id.localeCompare(b.id))) await manager.query('SELECT id FROM users WHERE id=$1 FOR NO KEY UPDATE', [user.id]);
    await manager.query('SELECT floor FROM demon_tower_world_floors ORDER BY floor FOR UPDATE');
    for (const user of users) await manager.getRepository(E.User).delete({ id: user.id, publicId: user.publicId, email: user.email });
    for (const audit of audits) await manager.getRepository(E.AdminAuditLog).delete({ id: audit.id, targetId: audit.targetId, action: 'account.deletion.completed' });
    for (const bucket of buckets) await manager.getRepository(E.AuthRateLimitBucket).delete({ keyHash: bucket.keyHash, scope: bucket.scope });
    for (const world of worlds) await manager.getRepository(E.DemonTowerWorldFloor).delete({ floor: world.floor });
  });
  assert.deepEqual(await fingerprints(), baseline); mark('exact synthetic cleanup restores all post-migration table content fingerprints');
}
(async () => {
  let failure, failedPhase;
  try { await schema(); await permissionsAndReplay(); await concurrency(); await rollbackAndCap(); await expiryLocks(); await afterSaveFences(); await sessionRevocationRaces(); await softDeletion(); await remainingBounds(); }
  catch (error) { failure = error; failedPhase = phase; }
  finally { try { await cleanup(); } catch (error) { failure ||= error; failedPhase ||= phase; } if (db?.isInitialized) await db.destroy(); }
  if (failure) {
    const raw = failure?.response?.code || failure?.code || 'ASSERTION_OR_RUNTIME'; const code = /^[A-Z0-9_]{2,80}$/.test(String(raw)) ? raw : 'UNCLASSIFIED';
    process.stderr.write(`AUTO_EXPLORE_REHEARSAL_FAILED phase=${failedPhase} class=${failure?.constructor?.name || 'Error'} code=${code}\n`); process.exitCode = 1; return;
  }
  process.stdout.write(`${JSON.stringify({ status: 'AUTO_EXPLORE_REHEARSAL_OK', scenarios: checks.length, syntheticUsers: identities.length, cleaned: true, lockingAndRollback: 'real PostgreSQL', liveTimers: false })}\n`);
})();
