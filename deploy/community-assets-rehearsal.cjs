#!/usr/bin/env node
'use strict';

// Dedicated, network-isolated PostgreSQL acceptance. Never pass a production
// env file. All users/items/guilds below are newly generated synthetic records.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const path = require('node:path');
assert.equal(process.env.ASSETS_REHEARSAL_CONFIRMATION, 'ISOLATED_SYNTHETIC_ONLY:20260908');
assert.equal(process.env.DB_DATABASE, 'community_assets_rehearsal');
assert.equal(process.env.DB_HOST, 'growth-pg-btpam6', 'An explicitly reviewed isolated host is required');
assert.equal(process.env.DB_PORT || '5432', '5432');
assert.equal(process.env.NODE_ENV, 'test');
assert.equal(process.env.LOCAL_DEV, 'false');
assert.ok(process.env.DB_USERNAME && process.env.DB_PASSWORD, 'Dedicated test credentials required');
assert.ok(!process.env.DATABASE_URL && !process.env.PUBLIC_SITE_ORIGIN, 'Production connection/env bundles forbidden');
const appRoot = process.env.ASSETS_REHEARSAL_APP_ROOT || '/app';
const fromApp = createRequire(path.join(appRoot, 'packages/backend/package.json'));
fromApp('reflect-metadata');
const { DataSource, In } = fromApp('typeorm');
const dist = process.env.ASSETS_REHEARSAL_BACKEND_DIST || path.join(appRoot, 'packages/backend/dist');
const load = name => fromApp(path.join(dist, name));
const E = load('database/entities');
const { migrations } = load('database/migrations');
assert.ok(migrations.some(item => Number(item.name.slice(-13)) === 1700000000029));
assert.ok(migrations.some(item => Number(item.name.slice(-13)) === 1700000000032));
assert.ok(migrations.every(item => Number(item.name.slice(-13)) <= 1700000000032));
const { PlatformAssetsService } = load('modules/platform/platform-assets.service');
const { PlatformService } = load('modules/platform/platform.service');
const { cumulativeExperienceForLevel } = load('modules/platform/level.rules');
const { OutboxService } = load('modules/outbox/outbox.service');
const { GuildService } = load('modules/community/guild.service');
const { ArcadeService } = load('modules/community/arcade/arcade.service');
const { DeskPlantService } = load('modules/community/desk-plant.service');
const { RelationshipPolicyService } = load('modules/community/relationship-policy.service');
const { NotificationService } = load('modules/community/notification.service');
const { FeedService } = load('modules/community/feed.service');
process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true';
const db = new DataSource({ type: 'postgres', host: process.env.DB_HOST, port: 5432,
  username: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE,
  entities: E.entities, migrations, synchronize: false, migrationsRun: false, logging: false,
  extra: { max: 12, options: '-c statement_timeout=15000 -c lock_timeout=10000 -c idle_in_transaction_session_timeout=20000' },
});
let now = new Date('2099-06-01T02:00:00Z');
const clock = { now: () => new Date(now) };
const assets = new PlatformAssetsService(clock);
const outbox = new OutboxService();
const platform = new PlatformService(db, clock, assets, outbox);
const guilds = new GuildService(db, assets, clock);
const policy = new RelationshipPolicyService();
const notifications = new NotificationService(db);
const feeds = new FeedService(db, policy, notifications, clock);
const plants = new DeskPlantService(db, policy, assets, notifications, feeds, clock);
const identities = [];
const ownedItems = [];
const passed = [];
let baseline;
const mark = name => { passed.push(name); console.log('PASS ' + name); };
const tx = work => db.transaction(work);
const ctx = (key, overrides = {}) => ({ sourceType: 'assets_rehearsal', sourceId: 'synthetic', reason: 'test-v1', idempotencyKey: key, ...overrides });
const balance = async user => Number((await db.getRepository(E.WalletBalance).findOneByOrFail({ userId: user.id, currency: 'office_coin' })).balance);
const rejected = (promise, code) => assert.rejects(promise, error => error?.response?.code === code);

async function fingerprints() {
  const result = {};
  for (const { tablename } of await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")) {
    assert.match(tablename, /^[a-z0-9_]+$/);
    [result[tablename]] = await db.query(`SELECT count(*)::integer AS count, md5(COALESCE(string_agg(to_jsonb(t)::text, E'\\n' ORDER BY to_jsonb(t)::text), '')) AS digest FROM "${tablename}" t`);
  }
  return result;
}
async function user() {
  const id = randomUUID(); const publicId = randomUUID(); const email = `assets-rehearsal.${publicId}@users.invalid`;
  identities.push({ id, publicId, email }); // Track before insertion for safe interruption cleanup.
  return db.getRepository(E.User).save({ id, publicId, email, emailNormalized: email,
    username: `at_${id.slice(0, 12)}`, displayName: '合成验收成员', passwordHash: 'synthetic-not-a-login-password', accountStatus: 'active', communityRole: 'user' });
}
async function prepare(member, extra = 0) {
  await tx(async manager => {
    await assets.ensurePlatformState(manager, member.id);
    await assets.addExperience(manager, member.id, cumulativeExperienceForLevel(15));
    if (extra) await assets.creditWallet(manager, member.id, 'office_coin', extra, ctx(`prepare:${member.id}`));
  });
}
async function assetChecks() {
  const member = await user();
  await Promise.all(Array.from({ length: 8 }, () => tx(manager => assets.ensurePlatformState(manager, member.id))));
  assert.equal(await balance(member), 500);
  assert.equal(await db.getRepository(E.WalletLedger).countBy({ userId: member.id }), 1);
  const checkins = await Promise.all(Array.from({ length: 8 }, () => platform.checkinToday(member.id)));
  assert.equal(checkins.filter(result => !result.alreadyCheckedIn).length, 1);
  assert.equal(new Set(checkins.map(result => result.rewardGrantId)).size, 1);
  assert.equal(await balance(member), 550);
  assert.equal(await db.getRepository(E.Checkin).countBy({ userId: member.id }), 1);
  assert.equal(await db.getRepository(E.OutboxEvent).countBy({ userId: member.id }), 1);
  mark('eight concurrent initialization/checkins: one initial balance, one reward/receipt/outbox');

  now = new Date('2099-06-01T16:00:00Z');
  const next = await Promise.all(Array.from({ length: 6 }, () => platform.checkinToday(member.id)));
  assert.equal(next.filter(result => !result.alreadyCheckedIn).length, 1);
  assert.ok(next.every(result => result.localDate === '2099-06-02'));
  assert.equal(await balance(member), 600);
  mark('Shanghai midnight: exactly one new daily checkin reward');

  const creditKey = `credit:${randomUUID()}`;
  const credited = await Promise.all(Array.from({ length: 8 }, () => tx(manager => assets.creditWallet(manager, member.id, 'office_coin', 100, ctx(creditKey)))));
  assert.equal(credited.filter(result => result.applied).length, 1); assert.equal(await balance(member), 700);
  for (const field of ['sourceType', 'sourceId', 'reason']) await rejected(tx(manager => assets.creditWallet(manager, member.id, 'office_coin', 100, ctx(creditKey, { [field]: 'different' }))), 'IDEMPOTENCY_KEY_REUSED');
  const spent = await Promise.allSettled(Array.from({ length: 8 }, () => tx(manager => assets.debitWallet(manager, member.id, 'office_coin', 690, ctx(`debit:${randomUUID()}`)))));
  assert.equal(spent.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(await balance(member), 10);
  assert.ok(spent.filter(result => result.status === 'rejected').every(result => result.reason.response.code === 'INSUFFICIENT_WALLET_BALANCE'));
  mark('concurrent wallet replay/context collisions and overdraft leave exact ledger/balance');

  const item = { id: randomUUID(), slug: `assets_test_${randomUUID().replaceAll('-', '')}`, name: '合成测试物品', category: 'seed', stackable: true, enabled: true, metadata: {} };
  ownedItems.push(item); await db.getRepository(E.ItemDefinition).insert(item);
  const itemKey = `item:${randomUUID()}`;
  const inventory = await Promise.all(Array.from({ length: 8 }, () => tx(manager => assets.creditInventory(manager, member.id, item.slug, 2, ctx(itemKey)))));
  assert.equal(inventory.filter(result => result.applied).length, 1);
  for (const field of ['sourceType', 'sourceId', 'reason']) await rejected(tx(manager => assets.creditInventory(manager, member.id, item.slug, 2, ctx(itemKey, { [field]: 'different' }))), 'IDEMPOTENCY_KEY_REUSED');
  assert.equal(Number((await db.getRepository(E.InventoryStack).findOneByOrFail({ userId: member.id, itemId: item.id })).quantity), 2);
  assert.equal(await db.getRepository(E.InventoryLedger).countBy({ userId: member.id }), 1);
  mark('concurrent inventory receipt once, mismatched business source rejected');

  const inactive = await user();
  const blocker = db.createQueryRunner(); await blocker.connect(); await blocker.startTransaction();
  let pending;
  try {
    await blocker.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [inactive.id]);
    const [{ pid: holderPid }] = await blocker.query('SELECT pg_backend_pid() AS pid');
    pending = platform.checkinToday(inactive.id).then(value => ({ value }), error => ({ error }));
    let waiting = false;
    for (let count = 0; count < 250; count += 1) {
      const [row] = await db.query("SELECT count(*)::integer AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND $1::integer=ANY(pg_blocking_pids(pid))", [holderPid]);
      if (row.count > 0) { waiting = true; break; }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.ok(waiting, 'Must observe a real PostgreSQL lock wait, not a timing guess');
    await blocker.query("UPDATE users SET account_status='suspended' WHERE id=$1", [inactive.id]);
    await blocker.commitTransaction();
    const outcome = await pending; assert.equal(outcome.error?.getStatus(), 401);
    for (const entity of [E.WalletBalance, E.WalletLedger, E.RewardGrant, E.Checkin]) assert.equal(await db.getRepository(entity).countBy({ userId: inactive.id }), 0);
  } finally {
    if (blocker.isTransactionActive) await blocker.rollbackTransaction();
    await blocker.release(); if (pending) await pending;
  }
  mark('real user-row lock wait: concurrent suspension prevents all initialization/checkin credits');

  const failed = await user(); const before = await fingerprints();
  const broken = new PlatformService(db, clock, assets, { enqueue: async (manager, command) => { await outbox.enqueue(manager, command); throw new Error('synthetic-outbox-failure'); } });
  await assert.rejects(broken.checkinToday(failed.id), /synthetic-outbox-failure/);
  assert.deepEqual(await fingerprints(), before);
  await platform.checkinToday(failed.id); assert.equal(await balance(failed), 550);
  // Checkins/platform controllers are not mounted in CommunityAppModule or its
  // proxy; they are tested above as shared/full services, not live community APIs.
  const arcade = new ArcadeService(db);
  const previousMode = process.env.APP_MODE;
  process.env.APP_MODE = 'community';
  const run = await arcade.startRun(failed.id, 'tetris');
  await db.getRepository(E.ArcadeGameRun).update({ id: run.runId }, { startedAt: new Date(Date.now() - 10_000) });
  const readonlyBefore = await fingerprints();
  process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'false';
  try {
    await rejected(arcade.startRun(failed.id, 'tetris'), 'COMMUNITY_WRITES_DISABLED');
    await rejected(arcade.finishRun(failed.id, run.runId, { score: 0, metrics: { lines: 0, level: 1 } }), 'COMMUNITY_WRITES_DISABLED');
    assert.deepEqual((await arcade.leaderboard('tetris', 10)).items, []);
    assert.deepEqual(await fingerprints(), readonlyBefore, 'Community maintenance must not expire, finish, insert or rank an Arcade run');
    process.env.APP_MODE = 'full';
    await arcade.finishRun(failed.id, run.runId, { score: 0, metrics: { lines: 0, level: 1 } });
  } finally {
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true';
    if (previousMode === undefined) delete process.env.APP_MODE; else process.env.APP_MODE = previousMode;
  }
  mark('outbox write failure fully rolls back; Arcade community maintenance is read-only while full mode is unchanged');
}
async function farmChecks() {
  now = new Date('2099-06-03T02:00:00Z');
  const farmer = await user(); await plants.care(farmer.id, 'assets-farm-first-care');
  now = new Date(now.getTime() + 31_000);
  const before = await fingerprints();
  const brokenNotifications = { create: async (manager, input) => { await notifications.create(manager, input); throw new Error('synthetic-notification-failure'); } };
  const broken = new DeskPlantService(db, policy, assets, brokenNotifications, feeds, clock);
  await assert.rejects(broken.harvestAndCare(farmer.id, 'assets-farm-harvest'), /synthetic-notification-failure/);
  assert.deepEqual(await fingerprints(), before);
  const results = await Promise.all(Array.from({ length: 8 }, () => plants.harvestAndCare(farmer.id, 'assets-farm-harvest')));
  for (const result of results) assert.deepEqual(result, results[0]);
  assert.equal(await db.getRepository(E.RewardGrant).countBy({ userId: farmer.id, sourceType: 'farm_harvest' }), 1);
  assert.equal(await db.getRepository(E.DeskPlantCycle).countBy({ userId: farmer.id }), 2);
  let result = results[0];
  for (let index = 2; index <= 5; index += 1) {
    now = new Date(Date.parse(result.farm.plant.maturesAt) + 1000);
    result = await plants.harvestAndCare(farmer.id, `assets-farm-harvest-${index}`);
    assert.ok(result.reward.baseCoins > 0);
    assert.equal(result.reward.orderRewardGranted, index <= 3);
  }
  assert.equal(await db.getRepository(E.RewardGrant).countBy({ userId: farmer.id, sourceType: 'farm_harvest' }), 5);
  assert.equal(await db.getRepository(E.RewardGrant).countBy({ userId: farmer.id, sourceType: 'farm_order' }), 3);
  mark('farm notification rollback, eight identical harvests once, rewards continue after three daily orders');
}
async function guildChecks() {
  now = new Date('2099-06-04T02:00:00Z');
  const a = await user(); const b = await user(); const member = await user();
  await prepare(a, 30_000); await prepare(b, 30_000); await prepare(member, 5000);
  const first = await guilds.create(a.id, '合成甲项目组', 'assets-guild-create-a');
  const second = await guilds.create(b.id, '合成乙项目组', 'assets-guild-create-b');
  const one = first.membership.guild.id; const two = second.membership.guild.id;
  await guilds.join(member.id, one, 'assets-guild-join-one');
  const donatedBefore = await balance(member);
  const donations = await Promise.all(Array.from({ length: 8 }, () => guilds.donate(member.id, 100, 'assets-guild-donate')));
  assert.equal(await balance(member), donatedBefore - 100);
  assert.equal(Number((await db.getRepository(E.Guild).findOneByOrFail({ id: one })).treasury), 100);
  assert.ok(donations.every(result => result.lastMutation.amount === 100));
  assert.equal(await db.getRepository(E.GuildLedger).countBy({ guildId: one, kind: 'donation' }), 1);
  const beforeAttack = await balance(member);
  const attacks = await Promise.all(Array.from({ length: 8 }, () => guilds.attackBoss(member.id, 'assets-guild-boss')));
  assert.equal(await balance(member), beforeAttack + 120);
  assert.equal(await db.getRepository(E.GuildBossContribution).countBy({ userId: member.id }), 1);
  assert.ok(attacks.every(result => result.lastMutation.type === 'guildBossAttack'));
  await guilds.leave(member.id); await guilds.join(member.id, two, 'assets-guild-join-two');
  await rejected(guilds.attackBoss(member.id, 'assets-guild-second-boss'), 'GUILD_BOSS_DAILY_ATTEMPT_USED');
  assert.equal(await balance(member), beforeAttack + 120);
  const moved = await guilds.overview(member.id);
  assert.equal(moved.membership.boss.attempted, true); assert.equal(moved.membership.boss.canAttack, false);
  now = new Date('2099-06-04T21:00:00Z'); // Next service day begins at Shanghai 05:00.
  await guilds.attackBoss(member.id, 'assets-guild-next-day'); assert.equal(await balance(member), beforeAttack + 240);
  mark('guild donation/attack eight-way replay once; changing guild does not reset personal daily prize; 05:00 resets');

  const run = await db.getRepository(E.GuildBossRun).findOneByOrFail({ guildId: two });
  await db.getRepository(E.GuildBossContribution).update({ runId: run.id, userId: member.id }, { damage: '1' });
  // Deliberate persisted-boundary fixture, not a claim normal 30-seat combat
  // currently reaches 21 contributions. Tests quota independence from top-N UI.
  for (let index = 0; index < 20; index += 1) {
    const peer = await user();
    await db.getRepository(E.GuildMember).insert({ userId: peer.id, guildId: two, role: 'member', activity: 0, donatedToday: 0 });
    await db.getRepository(E.GuildBossContribution).insert({ userId: peer.id, guildId: two, runId: run.id, damage: '100', criticalHit: false, rewardSnapshot: {} });
  }
  const view = await guilds.overview(member.id);
  assert.equal(view.membership.boss.leaderboard.length, 20);
  assert.equal(view.membership.boss.attempted, true); assert.equal(view.membership.boss.attemptsRemaining, 0);
  assert.equal(view.membership.boss.myContribution.damage, 1);
  mark('top-20 presentation boundary does not erase own contribution/quota');
}
async function cleanup() {
  await tx(async manager => {
    const ids = identities.map(identity => identity.id);
    for (const identity of identities) {
      const row = await manager.getRepository(E.User).findOne({ where: { id: identity.id }, lock: { mode: 'pessimistic_write' } });
      if (row) { assert.equal(row.publicId, identity.publicId); assert.equal(row.email, identity.email); assert.equal(row.passwordHash, 'synthetic-not-a-login-password'); }
    }
    const rooms = ids.length ? await manager.getRepository(E.Guild).find({ where: { ownerUserId: In(ids) }, lock: { mode: 'pessimistic_write' } }) : [];
    for (const room of rooms) {
      for (const row of await manager.getRepository(E.GuildMember).findBy({ guildId: room.id })) assert.ok(ids.includes(row.userId));
      for (const row of await manager.getRepository(E.GuildBossContribution).findBy({ guildId: room.id })) assert.ok(ids.includes(row.userId));
      await manager.getRepository(E.Guild).delete({ id: room.id, ownerUserId: room.ownerUserId });
    }
    for (const identity of identities) await manager.getRepository(E.User).delete({ id: identity.id, publicId: identity.publicId, email: identity.email });
    for (const item of ownedItems) await manager.getRepository(E.ItemDefinition).delete({ id: item.id, slug: item.slug });
  });
  assert.deepEqual(await fingerprints(), baseline, 'Every public-table fingerprint must return to its baseline');
  mark('exact synthetic cleanup restores all table fingerprints; no shared/real record changed');
}
(async () => {
  await db.initialize();
  try {
    assert.equal((await db.query('SELECT current_database() AS name'))[0].name, 'community_assets_rehearsal');
    // Fail before running migrations if a previously initialized database ever
    // contains users/guilds. A fresh schema has no such tables yet.
    const existing = await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('users','guilds')");
    for (const { tablename } of existing) {
      assert.ok(tablename === 'users' || tablename === 'guilds');
      const [row] = await db.query(`SELECT count(*)::integer AS count FROM "${tablename}"`);
      assert.equal(row.count, 0, 'Refuse to migrate a populated business database');
    }
    await db.runMigrations({ transaction: 'all' });
    assert.equal(await db.getRepository(E.User).count(), 0, 'Must start with no users');
    assert.equal(await db.getRepository(E.Guild).count(), 0, 'Must start with no guilds');
    baseline = await fingerprints();
    try { await assetChecks(); await farmChecks(); await guildChecks(); }
    finally { await cleanup(); }
    console.log('ASSETS_REHEARSAL_OK ' + JSON.stringify({ scenarios: passed.length, syntheticUsers: identities.length }));
  } finally { await db.destroy(); }
})().catch(error => { console.error('ASSETS_REHEARSAL_FAILED', error?.code || error?.name || 'REDACTED', 'completedScenarios=' + passed.length); process.exitCode = 1; });
