#!/usr/bin/env node
'use strict';

/**
 * Candidate-image acceptance against an isolated, empty-business PostgreSQL DB.
 * Never a production-data tool: explicit host/database/confirmation guards are
 * checked before application imports. No HTTP, real credentials or moderation
 * provider is used. The caller owns disposable PostgreSQL/network cleanup.
 */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const path = require('node:path');

assert.equal(process.env.RAIL_REHEARSAL_CONFIRMATION, 'ISOLATED_RAIL_ONLY:20260908');
assert.equal(process.env.DB_DATABASE, 'community_rail_rehearsal');
assert.ok(process.env.DB_HOST === '127.0.0.1' || process.env.DB_HOST === 'demon-tower-rehearsal-pg-hgbacy' || /^rail-rehearsal-pg-[a-z0-9]{6,16}$/.test(process.env.DB_HOST || ''), 'Explicit isolated DB_HOST required');
assert.equal(process.env.DB_PORT || '5432', '5432');
assert.ok(process.env.DB_USERNAME && process.env.DB_PASSWORD, 'Dedicated test credentials required');
assert.ok(!process.env.DATABASE_URL, 'Production connection strings are forbidden');
assert.notEqual(process.env.NODE_ENV, 'production', 'Never run in a production environment');
process.env.NODE_ENV = 'test';
process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true';
process.env.FEATURE_COMMUNITY_CHAT_ENABLED = 'true';
process.env.FEATURE_CHAT_WRITES_ENABLED = 'true';
process.env.AUTH_TOKEN_PEPPER = 'isolated-rail-rehearsal-pepper-20260908-never-production';
const appRoot = process.env.RAIL_REHEARSAL_APP_ROOT || '/app';
const fromApp = createRequire(path.join(appRoot, 'packages/backend/package.json'));
fromApp('reflect-metadata');
const { DataSource } = fromApp('typeorm');
const dist = process.env.RAIL_REHEARSAL_BACKEND_DIST || path.join(appRoot, 'packages/backend/dist');
const load = (file) => fromApp(path.join(dist, file));
const E = load('database/entities');
const { migrations } = load('database/migrations');
const { RailService } = load('modules/community/rail/rail.service');
const { RailChatService } = load('modules/community/rail/rail-chat.service');
const { RailRewardsService } = load('modules/community/rail/rail-rewards.service');
const { PlayService } = load('modules/community/play/play.service');
const { PlatformAssetsService } = load('modules/platform/platform-assets.service');
const { NotificationService } = load('modules/community/notification.service');
const { hashAuthRateLimitKey } = load('modules/auth/auth-crypto');
const timestamp = (migration) => Number(migration.name.slice(-13));
assert.ok(E.RailRoom && E.RailDailyAward && E.RailChatMessageRecord, 'Candidate Rail entity build required');
assert.ok(migrations.some((migration) => timestamp(migration) === 1700000000029), 'Migration 0029 required');
assert.ok(migrations.some((migration) => timestamp(migration) === 1700000000030), 'Additive migration 0030 required');
assert.ok(migrations.every((migration) => timestamp(migration) <= 1700000000030), 'Review rehearsal before future migrations');

const NativeDate = Date;
let clock = NativeDate.parse('2099-06-01T02:00:00.000Z');
class TestDate extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [clock])); }
  static now() { return clock; }
}
const at = (value) => { const next = typeof value === 'number' ? value : NativeDate.parse(value); assert.ok(next >= clock, 'Synthetic clock must be monotonic'); clock = next; };
const tick = (amount = 250) => at(clock + amount);
const synthetic = [];
const checks = [];
const awardDates = new Set(['2099-06-01', '2099-06-02']);
let db, baseline, rail, chat, play, assets, notifications, rewards;
const moderation = { isAvailable: () => true, moderate: async () => ({ decision: 'allow', reason: 'isolated synthetic rehearsal only' }) };
const check = (name) => { checks.push(name); process.stdout.write(`PASS ${name}\n`); };
const request = (extra = {}) => ({ clientRequestId: randomUUID(), mode: 'room', title: 'rail-rehearsal · synthetic', maxPlayers: 3, botCount: 0, ...extra });
const rejected = (promise, code) => assert.rejects(promise, (error) => error?.response?.code === code);
function safePublic(value) {
  const text = JSON.stringify(value);
  assert.ok(!/"(?:engineState|passwordHash|requestHash|creatorId|hostUserId|rng|seed|deck|decks|password|joinCode)"\s*:/.test(text), 'Private state must not be projected');
  for (const person of synthetic) { assert.ok(!text.includes(person.email), 'Email leaked'); assert.ok(!text.includes(person.id), 'Internal user ID leaked'); }
}
async function fingerprints() {
  const rows = await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
  const result = {};
  for (const { tablename } of rows) {
    assert.match(tablename, /^[a-z0-9_]+$/);
    const [entry] = await db.query(`SELECT count(*)::integer AS count, md5(COALESCE(string_agg(to_jsonb(t)::text, E'\\n' ORDER BY to_jsonb(t)::text), '')) AS digest FROM "${tablename}" t`);
    result[tablename] = entry;
  }
  return result;
}
async function makeUsers(count = 28) {
  assert.ok(count <= 32);
  for (let index = 0; index < count; index += 1) {
    const email = `rail-rehearsal.${randomUUID()}@users.invalid`;
    const repository = db.getRepository(E.User);
    const user = await repository.save(repository.create({ email, username: `rr_${index}_${randomUUID().slice(0, 6)}`, displayName: `rail-rehearsal ${index}`, passwordHash: 'synthetic-only-not-a-login-password', accountStatus: 'active' }));
    synthetic.push(user);
  }
  return synthetic;
}
async function schema() {
  db = await new DataSource({
    type: 'postgres', host: process.env.DB_HOST, port: 5432, username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE,
    entities: E.entities, migrations, synchronize: false, migrationsRun: false, logging: false,
    extra: { max: 12, options: '-c statement_timeout=20000 -c lock_timeout=10000 -c idle_in_transaction_session_timeout=20000' },
  }).initialize();
  assert.equal((await db.query('SELECT current_database() AS name'))[0].name, 'community_rail_rehearsal');
  const initialTables = await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
  // An already migrated isolated DB is permitted only when every business row is absent.
  if (initialTables.length) {
    const names = new Set(initialTables.map((row) => row.tablename));
    assert.ok(names.has('users') && names.has('migrations'), 'Unknown database layout');
    assert.equal(Number((await db.query('SELECT count(*) FROM users'))[0].count), 0, 'Refuse any existing users');
    for (const name of ['rail_rooms', 'rail_room_members', 'rail_commands', 'rail_chat_messages', 'rail_daily_scores', 'rail_daily_awards', 'rail_player_stats', 'play_rooms', 'auth_rate_limit_buckets']) {
      if (names.has(name)) assert.equal(Number((await db.query(`SELECT count(*) FROM "${name}"`))[0].count), 0, `Refuse existing ${name}`);
    }
  }
  await db.runMigrations({ transaction: 'all' });
  assert.equal(Number((await db.query('SELECT max(timestamp) AS timestamp FROM migrations'))[0].timestamp), 1700000000030);
  assert.equal(await db.getRepository(E.User).count(), 0);
  for (const entity of [E.RailRoom, E.RailDailyAward, E.RailDailyScore, E.RailPlayerStats, E.RailChatMessageRecord, E.PlayRoom, E.AuthRateLimitBucket]) assert.equal(await db.getRepository(entity).count(), 0);
  baseline = await fingerprints();
  assert.deepEqual(await db.runMigrations({ transaction: 'all' }), [], 'Migration rerun must be a no-op');
  global.Date = TestDate;
  chat = new RailChatService(db, moderation); rail = new RailService(db, chat); play = new PlayService(db);
  assets = new PlatformAssetsService({ now: () => new TestDate() }); notifications = new NotificationService(db); rewards = new RailRewardsService(db, assets, notifications);
  check('guarded empty-business database migrates to 0030 and reruns idempotently');
}
function legal(view, favoriteId) {
  const game = view.game; const mine = game?.me;
  if (!mine?.availableActions.length) return null;
  const kind = mine.availableActions[0]; const payload = { roundToken: game.roundToken };
  if (kind === 'place_good') payload.cardId = mine.hand.good[0].id;
  else if (kind === 'place_bad') payload.cardId = mine.hand.bad[0].id;
  else if (kind === 'place_buff') {
    payload.cardId = mine.hand.buff[0].id;
    const target = [...game.tracks.A, ...game.tracks.B].find((entry) => !entry.buff);
    assert.ok(target, 'A legal condition target must exist'); payload.targetId = target.id;
  } else if (kind === 'choose_track') {
    const favorite = game.players.find((player) => player.id === favoriteId);
    payload.track = favorite?.team === 'A' ? 'B' : 'A';
  } else if (kind === 'rate') payload.value = 7;
  else assert.equal(kind, 'next_round');
  return { actionId: randomUUID(), sequence: view.me.nextSequence, kind, payload };
}
async function manualGame(roomId, players, favoriteId = players[0].publicId) {
  // At most nine short rounds; advance only enough to let explicitly labelled bots act.
  // No client score or engine-state replacement is used in this helper.
  for (let step = 0; step < 1200; step += 1) {
    let moved = false;
    for (const user of players) {
      const view = await rail.get(user.id, roomId);
      if (view.status === 'finished') return view;
      assert.equal(view.status, 'running'); safePublic(view);
      const action = legal(view, favoriteId);
      if (action) { tick(); await rail.action(user.id, roomId, action); moved = true; break; }
    }
    if (!moved) tick(500);
  }
  throw new Error('Manual action helper did not reach a terminal result');
}
async function startRoom(players, extra = {}) {
  const waiting = await rail.create(players[0].id, request(extra));
  for (const user of players.slice(1)) { tick(); await rail.join(user.id, { roomId: waiting.id }); }
  for (const user of players) await rail.ready(user.id, waiting.id, { ready: true });
  return rail.start(players[0].id, waiting.id);
}

async function primaryRoomChecks(people) {
  const host = people[0]; const input = request();
  const created = await Promise.all(Array.from({ length: 8 }, () => new RailService(db, chat).create(host.id, input)));
  const waiting = created[0];
  assert.ok(created.every((view) => view.id === waiting.id)); assert.equal(await db.getRepository(E.RailRoom).count(), 1);
  await rejected(rail.create(host.id, { ...input, title: 'changed intent' }), 'RAIL_IDEMPOTENCY_CONFLICT');
  await rejected(rail.create(host.id, request()), 'RAIL_ACTIVE_ROOM');
  await rejected(play.create(host.id, { clientRequestId: randomUUID(), gameKey: 'tetris', mode: 'solo' }), 'PLAY_ACTIVE_RAIL_ROOM');
  const candidates = people.slice(1, 8);
  const joins = await Promise.allSettled(candidates.map((person) => new RailService(db, chat).join(person.id, { roomId: waiting.id })));
  assert.equal(joins.filter((entry) => entry.status === 'fulfilled').length, 2);
  assert.ok(joins.filter((entry) => entry.status === 'rejected').every((entry) => entry.reason.response.code === 'RAIL_ROOM_FULL'));
  const trio = [host, ...candidates.filter((_, index) => joins[index].status === 'fulfilled')];
  await rejected(rail.start(trio[1].id, waiting.id), 'RAIL_HOST_REQUIRED');
  await rejected(rail.start(host.id, waiting.id), 'RAIL_PLAYERS_NOT_READY');
  const beforeBots = await rail.get(host.id, waiting.id);
  const noBots = await rail.setBots(host.id, waiting.id, { count: 0, expectedVersion: beforeBots.version });
  assert.equal(noBots.playerCount, 3); assert.equal(noBots.botCount, 0); assert.ok(noBots.members.every((member) => !member.ready));
  await rejected(rail.setBots(host.id, waiting.id, { count: 1, expectedVersion: noBots.version }), 'RAIL_ROOM_FULL');
  for (const user of trio) await rail.ready(user.id, waiting.id, { ready: true });
  const running = await rail.start(host.id, waiting.id); assert.equal(running.rankingEligible, true);
  check('8-way create idempotency, real capacity race, cross-game exclusion, host and readiness guards');

  const remaining = people.filter((user) => !trio.some((member) => member.id === user.id));
  const spectators = remaining.slice(0, 20);
  const watching = await Promise.all(spectators.map((user) => rail.join(user.id, { roomId: running.id, role: 'spectator' })));
  assert.ok(watching.every((view) => view.me.role === 'spectator' && view.game.me === null && view.game.viewerRole === 'spectator'));
  await rejected(rail.join(remaining[20].id, { roomId: running.id, role: 'spectator' }), 'RAIL_SPECTATORS_FULL');
  await rejected(rail.get(remaining[21].id, running.id), 'RAIL_ROOM_NOT_FOUND');
  safePublic(watching[0]); safePublic(await rail.list(remaining[21].id));
  const actor = trio.find((user) => user.publicId !== running.game.conductorId);
  const actorView = await rail.get(actor.id, running.id); const firstAction = legal(actorView, host.publicId);
  await rejected(rail.action(spectators[0].id, running.id, firstAction), 'RAIL_PARTICIPANT_REQUIRED');
  check('20 real concurrent spectator joins, hard capacity and no private hand/internal identity projection');

  const spectator = spectators[0];
  await rejected(chat.send(spectator.id, running.id, { clientMessageId: randomUUID(), channel: 'player', body: 'wrong channel' }), 'RAIL_CHAT_CHANNEL_FORBIDDEN');
  await rejected(chat.send(host.id, running.id, { clientMessageId: randomUUID(), channel: 'spectator', body: 'wrong channel' }), 'RAIL_CHAT_CHANNEL_FORBIDDEN');
  const playerMessage = { clientMessageId: randomUUID(), channel: 'player', body: 'rail-rehearsal synthetic player discussion' };
  const message = await chat.send(host.id, running.id, playerMessage);
  assert.equal((await chat.send(host.id, running.id, playerMessage)).id, message.id);
  await rejected(chat.send(host.id, running.id, { ...playerMessage, body: 'different payload' }), 'RAIL_IDEMPOTENCY_CONFLICT');
  await chat.send(spectator.id, running.id, { clientMessageId: randomUUID(), channel: 'spectator', body: 'rail-rehearsal synthetic spectator discussion' });
  const tail = await chat.list(spectator.id, running.id); assert.equal(tail.items.length, 2); safePublic(tail);
  await rejected(chat.withdraw(spectator.id, running.id, message.id), 'RAIL_CHAT_MESSAGE_NOT_FOUND');
  const withdrawn = await chat.withdraw(host.id, running.id, message.id); assert.equal(withdrawn.status, 'withdrawn'); assert.equal(withdrawn.body, null);
  const refreshed = await chat.list(spectator.id, running.id); assert.equal(refreshed.latestSequence, tail.latestSequence); assert.equal(refreshed.items.find((item) => item.id === message.id).body, null);
  assert.equal((await chat.list(host.id, running.id, { channel: 'spectator' })).items.length, 1);
  check('both chat channels readable, role-bound writes, stable send identity and unchanged-sequence withdrawal');

  tick();
  const results = await Promise.all(Array.from({ length: 8 }, () => new RailService(db, chat).action(actor.id, running.id, firstAction)));
  assert.ok(results.every((view) => view.me.nextSequence === firstAction.sequence + 1));
  assert.equal(await db.getRepository(E.RailCommand).count({ where: { roomId: running.id } }), 1);
  const snapshot = await fingerprints();
  await rejected(rail.action(actor.id, running.id, { ...firstAction, payload: { ...firstAction.payload, cardId: 'not-owned' } }), 'RAIL_IDEMPOTENCY_CONFLICT');
  assert.deepEqual(await fingerprints(), snapshot);
  const nextAction = legal(await rail.get(actor.id, running.id), host.publicId);
  assert.ok(nextAction);
  const beforeStorageFailure = await fingerprints();
  const failingDb = Object.create(db);
  failingDb.transaction = (work) => db.transaction((manager) => {
    const wrapped = Object.create(manager);
    wrapped.getRepository = (entity) => {
      const repository = manager.getRepository(entity);
      if (entity !== E.RailCommand) return repository;
      const commands = Object.create(repository); commands.insert = async () => { throw new Error('RAIL_REHEARSAL_COMMAND_FAILURE'); }; return commands;
    };
    return work(wrapped);
  });
  await assert.rejects(new RailService(failingDb, chat).action(actor.id, running.id, nextAction), /RAIL_REHEARSAL_COMMAND_FAILURE/);
  assert.deepEqual(await fingerprints(), beforeStorageFailure, 'True SQL rollback must restore member sequence, command and room state');
  const finished = await manualGame(running.id, trio, host.publicId);
  assert.ok(finished.game.result.players.every((player) => player.eligible && !player.isBot && player.eligibleRounds === 2));
  assert.equal(finished.game.result.players.find((player) => player.id === host.publicId).rateBasisPoints, 10000);
  assert.equal(await db.getRepository(E.RailPlayerStats).count(), 3);
  assert.ok(await db.getRepository(E.RailDailyScore).count() > 0);
  const beforeFinalReads = await db.getRepository(E.RailPlayerStats).find({ order: { userId: 'ASC' } });
  await Promise.all(Array.from({ length: 8 }, (_, index) => rail.get(trio[index % 3].id, running.id)));
  assert.deepEqual(await db.getRepository(E.RailPlayerStats).find({ order: { userId: 'ASC' } }), beforeFinalReads);
  const board = await rewards.leaderboard('2099-06-01'); safePublic(board); assert.equal(board.items[0].publicId, host.publicId);
  check('8-way authoritative action replay, changed-payload conflict, SQL rollback and fully manual 3-human result recorded once');
  return trio;
}

async function passwordBotAndTimeoutChecks(people, trio) {
  const [host, friend, third] = trio; const outsider = people.find((user) => !trio.includes(user));
  const passwordRoom = await rail.create(host.id, request({ password: 'old-rail-lock', maxPlayers: 4 }));
  assert.equal(passwordRoom.hasPassword, true); safePublic(passwordRoom);
  assert.ok((await rail.list(friend.id)).items.some((entry) => entry.id === passwordRoom.id && entry.hasPassword));
  await rejected(rail.join(friend.id, { roomId: passwordRoom.id, password: 'wrong-lock' }), 'RAIL_PASSWORD_REQUIRED');
  assert.ok(await db.getRepository(E.AuthRateLimitBucket).count() > 0, 'Rejected password attempt must persist its anti-abuse receipt');
  const changed = await rail.setPassword(host.id, passwordRoom.id, { password: 'new-rail-lock', expectedVersion: passwordRoom.version });
  await rejected(rail.setPassword(host.id, passwordRoom.id, { password: 'stale-lock', expectedVersion: passwordRoom.version }), 'RAIL_VERSION_CONFLICT');
  await rejected(rail.join(friend.id, { roomId: passwordRoom.id, password: 'old-rail-lock' }), 'RAIL_PASSWORD_REQUIRED');
  await rail.join(friend.id, { roomId: passwordRoom.id, password: 'new-rail-lock' });
  const current = await rail.get(host.id, passwordRoom.id);
  await rail.setPassword(host.id, passwordRoom.id, { password: '', expectedVersion: current.version });
  const open = await rail.join(third.id, { roomId: passwordRoom.id }); assert.equal(open.hasPassword, false);
  for (const user of trio) await rail.leave(user.id, passwordRoom.id);
  assert.equal((await rail.get(host.id, passwordRoom.id)).status, 'closed');
  check('listed password room, durable failed-password quotas, version-fenced password change and password removal');

  const practice = await rail.create(host.id, request({ mode: 'practice', botCount: 2 }));
  assert.equal(practice.status, 'running'); assert.equal(practice.playerCount, 1); assert.equal(practice.botCount, 2); assert.equal(practice.rankingEligible, false);
  assert.ok(practice.bots.every((bot) => bot.isBot && /^AI0[1-8]$/.test(bot.displayName)));
  const beforePractice = await db.getRepository(E.RailDailyScore).find({ order: { userId: 'ASC' } });
  const practiced = await manualGame(practice.id, [host]);
  assert.equal(practiced.game.result.players.find((player) => !player.isBot).eligible, true);
  assert.deepEqual(await db.getRepository(E.RailDailyScore).find({ order: { userId: 'ASC' } }), beforePractice);
  const mixed = await startRoom([host, friend], { botCount: 1 }); assert.equal(mixed.rankingEligible, false);
  await manualGame(mixed.id, [host, friend]);
  assert.deepEqual(await db.getRepository(E.RailDailyScore).find({ order: { userId: 'ASC' } }), beforePractice);
  check('explicit autonomous bots complete practice/mixed games but neither mode earns a daily score');

  const afk = await startRoom(trio); const beforeAfkStats = await db.getRepository(E.RailPlayerStats).find({ order: { userId: 'ASC' } });
  at(NativeDate.parse(afk.expiresAt) + 1); const timedOut = await rail.get(host.id, afk.id);
  assert.equal(timedOut.status, 'finished'); assert.ok(timedOut.game.result.players.every((player) => !player.eligible));
  assert.deepEqual(await db.getRepository(E.RailPlayerStats).find({ order: { userId: 'ASC' } }), beforeAfkStats);
  assert.deepEqual(await db.getRepository(E.RailDailyScore).find({ order: { userId: 'ASC' } }), beforePractice);
  const classic = await play.create(outsider.id, { clientRequestId: randomUUID(), gameKey: 'tetris', mode: 'solo' });
  await rejected(rail.create(outsider.id, request()), 'RAIL_ACTIVE_PLAY_ROOM');
  const target = await rail.create(host.id, request());
  await rejected(rail.join(outsider.id, { roomId: target.id }), 'RAIL_ACTIVE_PLAY_ROOM');
  const observer = await rail.join(outsider.id, { roomId: target.id, role: 'spectator' }); assert.equal(observer.me.role, 'spectator');
  await rail.leave(outsider.id, target.id); await rail.leave(host.id, target.id); await play.leave(outsider.id, classic.id);
  check('full timeout is ineligible, old Play blocks parallel participation while honest spectating remains possible');
}

async function rewardChecks(trio) {
  const host = trio[0];
  const readonlyBefore = await fingerprints(); await rewards.me(host.id); await rewards.leaderboard('2099-06-01');
  assert.deepEqual(await fingerprints(), readonlyBefore, 'Leaderboard and own statistics must not initialize wallets or write');
  at('2099-06-01T16:04:59.999Z'); assert.equal(await rewards.settleDay('2099-06-01'), false);
  await db.transaction((manager) => assets.ensurePlatformState(manager, host.id));
  const balanceBefore = Number((await db.getRepository(E.WalletBalance).findOneByOrFail({ userId: host.id, currency: 'office_coin' })).balance);
  at('2099-06-01T16:05:00.000Z');
  const claimed = await Promise.all(Array.from({ length: 8 }, () => new RailRewardsService(db, assets, notifications).settleDay('2099-06-01')));
  assert.equal(claimed.filter(Boolean).length, 1);
  assert.equal(await db.getRepository(E.RailDailyAward).count({ where: { serviceDate: '2099-06-01' } }), 1);
  assert.equal(Number((await db.getRepository(E.WalletBalance).findOneByOrFail({ userId: host.id, currency: 'office_coin' })).balance), balanceBefore + 100);
  for (const entity of [E.RewardGrant, E.WalletLedger]) assert.equal(await db.getRepository(entity).count({ where: { sourceType: 'rail_daily_champion' } }), 1);
  assert.equal(await db.getRepository(E.CommunityNotification).count({ where: { eventType: 'rail_daily_champion' } }), 1);
  check('read-only boards, exact Beijing 00:05 boundary and 8 concurrent date claims credit exactly 100 coins once');

  at('2099-06-02T02:00:00.000Z'); const another = await startRoom(trio); await manualGame(another.id, trio, trio[1].publicId);
  assert.equal((await rewards.leaderboard('2099-06-02')).items[0].publicId, trio[1].publicId);
  at('2099-06-02T16:05:00.000Z');
  const beforeFailure = await fingerprints(); const failingNotifications = new NotificationService(db);
  failingNotifications.create = async () => { throw new Error('RAIL_REHEARSAL_NOTIFICATION_FAILURE'); };
  await assert.rejects(new RailRewardsService(db, assets, failingNotifications).settleDay('2099-06-02'), /RAIL_REHEARSAL_NOTIFICATION_FAILURE/);
  assert.deepEqual(await fingerprints(), beforeFailure, 'Real transaction must roll back claim, welcome state, reward ledger and notification');
  await rewards.settleDue();
  assert.equal(await db.getRepository(E.RailDailyAward).count({ where: { serviceDate: '2099-06-02' } }), 1);
  assert.equal(await db.getRepository(E.RewardGrant).count({ where: { userId: trio[1].id, sourceType: 'rail_daily_champion' } }), 1);
  assert.equal(await rewards.settleDay('2099-06-02'), false);
  process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'false'; const disabled = await fingerprints();
  await rewards.settleDue(); assert.equal(await rewards.settleDay('2099-06-02'), false); assert.deepEqual(await fingerprints(), disabled);
  process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true';
  check('notification failure restores complete SQL fingerprint; automatic catch-up retries once and write-disable remains read-only');
}

async function cleanup() {
  if (!db?.isInitialized || !baseline) return;
  const allowed = new Map(synthetic.map((user) => [user.id, user.email]));
  const railRooms = await db.getRepository(E.RailRoom).find(); const playRooms = await db.getRepository(E.PlayRoom).find();
  for (const room of [...railRooms, ...playRooms]) assert.ok(allowed.has(room.creatorId), 'Refuse unowned room cleanup');
  const awards = await db.getRepository(E.RailDailyAward).find();
  assert.ok(awards.every((award) => awardDates.has(award.serviceDate) && (!award.winnerUserId || allowed.has(award.winnerUserId))), 'Refuse unowned award cleanup');
  const knownBuckets = new Set();
  for (const user of synthetic) {
    for (const scope of ['rail:chat:account', 'rail:chat:burst', 'room-password:rail:user', 'room-password-mutation:rail:user']) knownBuckets.add(hashAuthRateLimitKey(scope, user.id));
    for (const room of railRooms) {
      knownBuckets.add(hashAuthRateLimitKey('room-password:rail:room-user', `${room.id}:${user.id}`));
      knownBuckets.add(hashAuthRateLimitKey('room-password-mutation:rail:room-user', `${room.id}:${user.id}`));
    }
  }
  const buckets = await db.getRepository(E.AuthRateLimitBucket).find();
  assert.ok(buckets.every((bucket) => knownBuckets.has(bucket.keyHash)), 'Refuse unknown abuse-bucket cleanup');
  await db.transaction(async (manager) => {
    for (const bucket of buckets) await manager.getRepository(E.AuthRateLimitBucket).delete({ keyHash: bucket.keyHash });
    for (const award of awards) await manager.getRepository(E.RailDailyAward).delete({ serviceDate: award.serviceDate });
    for (const room of railRooms) await manager.getRepository(E.RailRoom).delete({ id: room.id });
    for (const room of playRooms) await manager.getRepository(E.PlayRoom).delete({ id: room.id });
    for (const user of synthetic) {
      const row = await manager.getRepository(E.User).findOneBy({ id: user.id });
      assert.ok(!row || row.email === user.email && /^rail-rehearsal\..+@users\.invalid$/.test(row.email), 'Synthetic identity guard failed');
      if (row) await manager.getRepository(E.User).delete({ id: user.id, email: user.email });
    }
  });
  assert.equal(await db.getRepository(E.User).count(), 0); assert.equal(await db.getRepository(E.RailRoom).count(), 0);
  assert.deepEqual(await fingerprints(), baseline, 'Exact synthetic cleanup must restore the complete post-migration database');
  check('precise synthetic users/rooms/claims/HMAC buckets cleanup restores every baseline table fingerprint');
}

(async () => {
  let failure;
  try { await schema(); const people = await makeUsers(); const trio = await primaryRoomChecks(people); await passwordBotAndTimeoutChecks(people, trio); await rewardChecks(trio); }
  catch (error) { failure = error; }
  finally {
    try { await cleanup(); } catch (error) { failure = failure || error; process.stderr.write(`CLEANUP_FAILED ${error.message}\n`); }
    global.Date = NativeDate;
    if (db?.isInitialized) await db.destroy();
  }
  if (failure) { process.stderr.write(`RAIL_REHEARSAL_FAILED ${failure.stack || failure.message}\n`); process.exitCode = 1; return; }
  process.stdout.write(`${JSON.stringify({ status: 'RAIL_REHEARSAL_OK', database: 'community_rail_rehearsal', scenarios: checks.length, syntheticUsers: synthetic.length, cleaned: true, locksAndRollback: 'real PostgreSQL', moderation: 'synthetic local allow-only fixture' })}\n`);
})();
