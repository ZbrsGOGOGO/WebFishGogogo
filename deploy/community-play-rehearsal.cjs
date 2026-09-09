#!/usr/bin/env node
'use strict';

/**
 * Isolated PostgreSQL acceptance, never a production-data tool.
 * Requires an EMPTY dedicated database and an explicitly named private test host.
 * Run with the candidate backend/shared dist mounted read-only into the API image.
 * The caller owns disposable container/network cleanup; this script also removes
 * every synthetic row and verifies the entire post-migration table baseline.
 */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const path = require('node:path');

assert.equal(process.env.PLAY_REHEARSAL_CONFIRMATION, 'ISOLATED_SYNTHETIC_ONLY:20260908');
assert.equal(process.env.DB_DATABASE, 'community_play_rehearsal');
assert.ok(process.env.DB_HOST === '127.0.0.1' || process.env.DB_HOST === 'demon-tower-rehearsal-pg-hgbacy' || /^(?:play|rail)-rehearsal-pg-[a-z0-9]{6,16}$/.test(process.env.DB_HOST || ''), 'Explicit isolated DB_HOST required');
assert.equal(process.env.DB_PORT || '5432', '5432');
assert.ok(process.env.DB_USERNAME && process.env.DB_PASSWORD, 'Explicit dedicated test credentials required');
assert.ok(!process.env.DATABASE_URL, 'Do not pass production connection strings');

const appRoot = process.env.PLAY_REHEARSAL_APP_ROOT || '/app';
const fromApp = createRequire(path.join(appRoot, 'packages/backend/package.json'));
fromApp('reflect-metadata');
const { DataSource } = fromApp('typeorm');
const dist = process.env.PLAY_REHEARSAL_BACKEND_DIST || path.join(appRoot, 'packages/backend/dist');
const load = (name) => fromApp(path.join(dist, name));
const E = load('database/entities');
const { migrations } = load('database/migrations');
const { PlayService } = load('modules/community/play/play.service');
const { PlayRewardsService } = load('modules/community/play/play-rewards.service');
const { PlatformAssetsService } = load('modules/platform/platform-assets.service');
const { NotificationService } = load('modules/community/notification.service');
const { hashAuthRateLimitKey } = load('modules/auth/auth-crypto');
const GAME_KEYS = ['snake', 'tetris', 'tank', 'zhesi', 'draw', 'undercover'];
const oldTimestamp = 1700000000028;
const timestamp = (migration) => Number(migration.name.slice(-13));
assert.ok(E.PlayRoom && E.PlayDailyAward, 'Candidate entity build required');
assert.ok(migrations.some((migration) => timestamp(migration) === 1700000000029), 'Candidate migration 0029 required');
assert.ok(migrations.some((migration) => timestamp(migration) === 1700000000030), 'Candidate migration 0030 required');
assert.ok(migrations.every((migration) => timestamp(migration) <= 1700000000030), 'Review this rehearsal before running future migrations');
const options = {
  type: 'postgres', host: process.env.DB_HOST, port: 5432,
  username: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE,
  entities: E.entities, migrations, synchronize: false, migrationsRun: false,
  extra: { max: 12, options: '-c statement_timeout=20000 -c lock_timeout=10000 -c idle_in_transaction_session_timeout=20000' },
};
process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true';
process.env.NODE_ENV = 'test';
process.env.AUTH_TOKEN_PEPPER = `isolated-play-password-${randomUUID()}`;
const NativeDate = Date;
let clock = NativeDate.parse('2099-06-01T02:00:00.000Z');
class TestDate extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [clock])); }
  static now() { return clock; }
}
let db;
let baseline;
let play;
let assets;
let notifications;
const synthetic = [];
const ownedRateKeys = new Set();
const passed = [];
function check(name) { passed.push(name); process.stdout.write(`PASS ${name}\n`); }
function at(value) { clock = typeof value === 'number' ? value : NativeDate.parse(value); }
function ownPasswordBudget(user, roomId) {
  ownedRateKeys.add(hashAuthRateLimitKey('room-password:play:user', user.id));
  ownedRateKeys.add(hashAuthRateLimitKey('room-password:play:room-user', `${roomId}:${user.id}`));
}
function ownPasswordMutation(user, roomId) {
  ownedRateKeys.add(hashAuthRateLimitKey('room-password-mutation:play:user', user.id));
  ownedRateKeys.add(hashAuthRateLimitKey('room-password-mutation:play:room-user', `${roomId}:${user.id}`));
}

async function fingerprints() {
  const tables = await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
  const values = {};
  for (const { tablename } of tables) {
    assert.match(tablename, /^[a-z0-9_]+$/);
    const [row] = await db.query(`SELECT count(*)::integer AS count, md5(COALESCE(string_agg(to_jsonb(t)::text, E'\\n' ORDER BY to_jsonb(t)::text), '')) AS digest FROM "${tablename}" t`);
    values[tablename] = row;
  }
  return values;
}
async function makeUser(status = 'active') {
  const email = `play-rehearsal.${randomUUID()}@users.invalid`;
  const username = `rp_${synthetic.length}_${randomUUID().slice(0, 6)}`;
  const repo = db.getRepository(E.User);
  const user = await repo.save(repo.create({ email, username, displayName: `测试成员 ${synthetic.length}`, passwordHash: 'synthetic-only-not-a-login-password', accountStatus: status }));
  synthetic.push({ id: user.id, email });
  return user;
}
function request(gameKey = 'tetris', mode = 'solo', extra = {}) { return { clientRequestId: randomUUID(), gameKey, mode, ...extra }; }
async function rejected(promise, code) { await assert.rejects(promise, (error) => error && error.response && error.response.code === code); }
async function command(user, room, sequence, kind = 'tetris', payload = { move: 'hardDrop' }, actionId = randomUUID()) {
  at(clock + 100);
  return play.action(user.id, room.id, { actionId, sequence, kind, payload });
}
async function finish(user, room) { at(NativeDate.parse(room.expiresAt) + 100); return play.get(user.id, room.id); }
async function startPair(first, second, gameKey = 'tetris') {
  const room = await play.create(first.id, request(gameKey, 'room', { maxPlayers: 2 }));
  await play.join(second.id, { roomId: room.id });
  await play.ready(first.id, room.id, { ready: true }); await play.ready(second.id, room.id, { ready: true });
  return play.start(first.id, room.id);
}
async function addScore(user, date, gameKey, score) {
  await db.getRepository(E.PlayDailyScore).insert({ serviceDate: date, gameKey, userId: user.id, score, mode: 'room', roomId: null, achievedAt: new TestDate(`${date}T08:00:00.000Z`) });
}

async function schemaRehearsal() {
  db = await new DataSource({ ...options, migrations: migrations.filter((migration) => timestamp(migration) <= oldTimestamp) }).initialize();
  assert.equal((await db.query('SELECT current_database() AS name'))[0].name, 'community_play_rehearsal');
  assert.equal(Number((await db.query("SELECT count(*) FROM pg_tables WHERE schemaname='public'"))[0].count), 0, 'Database must be completely empty');
  await db.runMigrations({ transaction: 'all' });
  const beforeUpgrade = await fingerprints();
  await db.destroy();
  db = await new DataSource(options).initialize();
  await db.runMigrations({ transaction: 'all' });
  assert.equal(await db.getRepository(E.User).count(), 0);
  assert.equal(await db.getRepository(E.PlayRoom).count(), 0);
  // No test/business data exists yet. Only reverse the newly introduced migrations.
  for (;;) {
    const [last] = await db.query('SELECT timestamp FROM migrations ORDER BY timestamp DESC LIMIT 1');
    if (Number(last.timestamp) <= oldTimestamp) break;
    assert.ok([1700000000030, 1700000000029].includes(Number(last.timestamp)), 'Only the two reviewed additive migrations may be reversed');
    await db.undoLastMigration({ transaction: 'all' });
  }
  assert.deepEqual(await fingerprints(), beforeUpgrade, 'Additive migration down must preserve every baseline row');
  await db.runMigrations({ transaction: 'all' });
  baseline = await fingerprints();
  check('migration 0028 → 0030 → 0028 → 0030, no baseline changes or old migration reversals');
}

async function roomChecks() {
  const people = [];
  for (let index = 0; index < 18; index += 1) people.push(await makeUser());
  const a = people[0];
  const sameRequest = request();
  const created = await Promise.all(Array.from({ length: 8 }, () => new PlayService(db).create(a.id, sameRequest)));
  const first = created[0];
  assert.ok(created.every((room) => room.id === first.id));
  assert.equal(await db.getRepository(E.PlayRoom).count(), 1);
  assert.equal(await db.getRepository(E.PlayRoomMember).count({ where: { userId: a.id, active: true } }), 1);
  await rejected(play.create(a.id, { ...sameRequest, gameKey: 'snake' }), 'PLAY_IDEMPOTENCY_CONFLICT');
  await rejected(play.create(a.id, request()), 'PLAY_ACTIVE_ROOM');
  check('concurrent room create serializes on account and replays exactly one room');

  at(clock + 100);
  const action = { actionId: randomUUID(), sequence: 1, kind: 'tetris', payload: { move: 'hardDrop' } };
  const replayed = await Promise.all(Array.from({ length: 8 }, () => new PlayService(db).action(a.id, first.id, action)));
  assert.ok(replayed.every((value) => value.me.nextSequence === 2));
  assert.equal(new Set(replayed.map((value) => value.game.players[0].score)).size, 1);
  assert.equal(await db.getRepository(E.PlayCommand).count({ where: { roomId: first.id } }), 1);
  at(clock + 100);
  const sameSequence = await Promise.allSettled(Array.from({ length: 8 }, () => new PlayService(db).action(a.id, first.id, { ...action, actionId: randomUUID(), sequence: 2 })));
  assert.equal(sameSequence.filter((value) => value.status === 'fulfilled').length, 1);
  assert.ok(sameSequence.filter((value) => value.status === 'rejected').every((value) => value.reason.response.code === 'PLAY_SEQUENCE_CONFLICT'));
  at(clock + 100);
  const snapshot = await fingerprints();
  await rejected(play.action(a.id, first.id, { ...action, actionId: randomUUID(), sequence: 3, payload: { move: 'hardDrop', score: 5000000 } }), 'PLAY_INVALID_ACTION');
  assert.deepEqual(await fingerprints(), snapshot, 'Rejected action must leave all database rows unchanged');
  const failingPlay = new PlayService({
    transaction: (work) => db.transaction((manager) => {
      const wrapped = Object.create(manager);
      wrapped.getRepository = (entity) => {
        const repository = manager.getRepository(entity);
        if (entity !== E.PlayCommand) return repository;
        const commands = Object.create(repository);
        commands.insert = async () => { throw new Error('PLAY_REHEARSAL_COMMAND_STORAGE_FAILURE'); };
        return commands;
      };
      return work(wrapped);
    }),
  });
  await assert.rejects(failingPlay.action(a.id, first.id, { ...action, actionId: randomUUID(), sequence: 3, payload: { move: 'rotate' } }), /PLAY_REHEARSAL_COMMAND_STORAGE_FAILURE/);
  assert.deepEqual(await fingerprints(), snapshot, 'Command storage failure must roll back the already-saved sequence/window and engine mutation');
  at(NativeDate.parse(first.expiresAt) + 100);
  const finalized = await Promise.all(Array.from({ length: 8 }, () => new PlayService(db).get(a.id, first.id)));
  assert.ok(finalized.every((value) => value.status === 'finished'));
  assert.equal(await db.getRepository(E.PlayDailyScore).count({ where: { userId: a.id, gameKey: 'tetris' } }), 1);
  const bestBefore = await db.getRepository(E.PlayDailyScore).findOneByOrFail({ serviceDate: '2099-06-01', gameKey: 'tetris', userId: a.id });
  assert.equal((await play.action(a.id, first.id, action)).game.players[0].score, finalized[0].game.players[0].score);
  check('concurrent duplicate/distinct action IDs, strict sequence, rejected-input rollback and one final score');

  const low = await play.create(a.id, request()); await command(a, low, 1); await finish(a, low);
  assert.deepEqual(await db.getRepository(E.PlayDailyScore).findOneByOrFail({ serviceDate: '2099-06-01', gameKey: 'tetris', userId: a.id }), bestBefore);
  const multi = await startPair(a, people[14]);
  await command(a, multi, 1); await command(a, multi, 2); await command(a, multi, 3);
  at(NativeDate.parse(multi.expiresAt) + 100);
  await Promise.all(Array.from({ length: 8 }, (_, index) => new PlayService(db).get((index % 2 ? a : people[14]).id, multi.id)));
  const improved = await db.getRepository(E.PlayDailyScore).findOneByOrFail({ serviceDate: '2099-06-01', gameKey: 'tetris', userId: a.id });
  assert.equal(improved.mode, 'room'); assert.ok(improved.score > bestBefore.score);
  assert.equal(await db.getRepository(E.PlayDailyScore).count({ where: { userId: people[14].id } }), 0);
  check('solo/room share one atomic best; lower scores and AFK users do not enter or replace the board');

  const invitation = await play.create(people[10].id, request('draw', 'room'));
  // The product no longer creates invitation-only rooms. Reconstruct only a
  // synthetic historical private row to prove its visibility is not widened.
  const legacyCode = 'A1B2C3D4E5F6';
  await db.getRepository(E.PlayRoom).update(invitation.id, { visibility: 'invite', joinCode: legacyCode });
  assert.equal(invitation.joinCode, null);
  await rejected(play.join(people[11].id, { roomId: invitation.id }), 'PLAY_ROOM_NOT_FOUND');
  await rejected(play.get(people[11].id, invitation.id), 'PLAY_ROOM_NOT_FOUND');
  const legacyJoined = await play.join(people[11].id, { code: legacyCode.toLowerCase() });
  assert.equal(legacyJoined.id, invitation.id); assert.equal(legacyJoined.visibility, 'invite'); assert.equal(legacyJoined.joinCode, null);
  assert.ok(!(await play.list(a.id)).items.some((room) => room.id === invitation.id));

  const passwordHost = people[12]; const passwordGuest = people[16];
  const secret = '密'.repeat(30) + 'A'; const otherSecret = '密'.repeat(30) + 'B';
  const protectedRequest = request('draw', 'room', { password: secret, maxPlayers: 2 });
  const protectedRoom = await play.create(passwordHost.id, protectedRequest);
  const privatePasswordRow = await db.getRepository(E.PlayRoom).createQueryBuilder('room').addSelect(['room.passwordHash', 'room.joinCode']).where('room.id = :id', { id: protectedRoom.id }).getOneOrFail();
  const protectedSummary = (await play.list(passwordGuest.id)).items.find((room) => room.id === protectedRoom.id);
  assert.equal(protectedSummary.hasPassword, true); assert.equal(protectedRoom.joinCode, null);
  assert.ok(!JSON.stringify([protectedRoom, protectedSummary]).includes(secret));
  assert.ok(!JSON.stringify([protectedRoom, protectedSummary]).includes(privatePasswordRow.passwordHash));
  assert.ok(!JSON.stringify([protectedRoom, protectedSummary]).includes(privatePasswordRow.joinCode));
  ownPasswordBudget(passwordGuest, protectedRoom.id);
  // Same first 72 bytes is still the wrong password. Rejected joins must retain
  // the separate, durable abuse-budget transaction across six API instances.
  for (let index = 0; index < 5; index += 1) await rejected(new PlayService(db).join(passwordGuest.id, { roomId: protectedRoom.id, password: otherSecret }), 'PLAY_ROOM_ACCESS_DENIED');
  await rejected(new PlayService(db).join(passwordGuest.id, { roomId: protectedRoom.id, password: secret }), 'AUTH_RATE_LIMITED');
  assert.equal(await db.getRepository(E.PlayRoomMember).count({ where: { roomId: protectedRoom.id } }), 1);
  at(clock + 600_001);
  assert.equal((await play.join(passwordGuest.id, { roomId: protectedRoom.id, password: secret })).id, protectedRoom.id);
  await rejected(play.setPassword(passwordGuest.id, protectedRoom.id, { password: '', expectedVersion: 2 }), 'PLAY_HOST_REQUIRED');
  await rejected(play.setPassword(passwordHost.id, protectedRoom.id, { password: '', expectedVersion: 1 }), 'PLAY_VERSION_CONFLICT');
  ownPasswordMutation(passwordHost, protectedRoom.id);
  const passwordChanges = await Promise.allSettled(['new-room-password-A', 'new-room-password-B'].map((password) => play.setPassword(passwordHost.id, protectedRoom.id, { password, expectedVersion: 2 })));
  assert.equal(passwordChanges.filter((item) => item.status === 'fulfilled').length, 1);
  assert.ok(passwordChanges.filter((item) => item.status === 'rejected').every((item) => item.reason.response.code === 'PLAY_VERSION_CONFLICT'));
  assert.equal((await play.join(passwordGuest.id, { roomId: protectedRoom.id })).id, protectedRoom.id, 'Admitted member reconnect does not disclose or require the changed secret');
  const cleared = await play.setPassword(passwordHost.id, protectedRoom.id, { password: '', expectedVersion: 3 });
  assert.equal(cleared.hasPassword, false);
  check('public password rooms, secret redaction, 72-byte-prefix separation, durable guess limits, concurrent host CAS and password clearing');
  const waiting = await play.create(people[1].id, request('draw', 'room', { maxPlayers: 4 }));
  await db.getRepository(E.UserBlock).insert({ blockerId: people[1].id, blockedId: people[9].id });
  assert.ok(!(await play.list(people[9].id)).items.some((room) => room.id === waiting.id));
  await rejected(play.join(people[9].id, { roomId: waiting.id }), 'PLAY_ROOM_NOT_FOUND');
  const lobby = await play.list(a.id);
  assert.ok(!JSON.stringify(lobby).includes('joinCode')); assert.ok(!JSON.stringify(lobby).includes(people[1].email));
  const joined = await Promise.allSettled(people.slice(2, 9).map((person) => new PlayService(db).join(person.id, { roomId: waiting.id })));
  assert.equal(joined.filter((value) => value.status === 'fulfilled').length, 3);
  assert.ok(joined.filter((value) => value.status === 'rejected').every((value) => value.reason.response.code === 'PLAY_ROOM_FULL'));
  assert.equal(await db.getRepository(E.PlayRoomMember).count({ where: { roomId: waiting.id, active: true } }), 4);
  const joinedUsers = people.slice(2, 9).filter((_, index) => joined[index].status === 'fulfilled');
  await rejected(play.start(joinedUsers[0].id, waiting.id), 'PLAY_HOST_REQUIRED');
  await rejected(play.start(people[1].id, waiting.id), 'PLAY_PLAYERS_NOT_READY');
  const drawPeople = [people[1], ...joinedUsers];
  for (const person of drawPeople) await play.ready(person.id, waiting.id, { ready: true });
  const running = await play.start(people[1].id, waiting.id);
  const drawer = drawPeople.find((person) => person.publicId === running.game.board.drawerId);
  const guesser = drawPeople.find((person) => person.id !== drawer.id);
  const drawerView = await play.get(drawer.id, running.id);
  const guesserView = await play.get(guesser.id, running.id);
  const answer = drawerView.game.board.word;
  assert.equal(typeof answer, 'string'); assert.equal(guesserView.game.board.word, null);
  assert.ok(!JSON.stringify(guesserView).includes(answer)); assert.ok(!/"rng"|engineState|wordIndex|passwordHash/.test(JSON.stringify(drawerView)));
  await command(drawer, running, 1, 'stroke', { round: 1, points: [{ x: 10, y: 10 }, { x: 30, y: 50 }], color: '#334155', width: 4 });
  await command(guesser, running, 1, 'guess', { round: 1, text: answer });
  const left = await play.leave(guesser.id, running.id); assert.equal(left.game, null); assert.equal(left.joinCode, null);
  await finish(drawer, running);
  assert.equal(await db.getRepository(E.PlayDailyScore).count({ where: { userId: guesser.id, gameKey: 'draw' } }), 0);
  check('legacy private visibility, block privacy, actual concurrent capacity, host readiness, real draw secrecy and forfeit exclusion');

  await db.getRepository(E.User).update(people[13].id, { accountStatus: 'suspended' });
  await rejected(play.create(people[13].id, request()), 'PLAY_ACTIVE_ACCOUNT_REQUIRED');
  await rejected(play.list(people[13].id), 'PLAY_ACTIVE_ACCOUNT_REQUIRED');
  at('2099-06-01T15:57:58.000Z');
  const midnight = await play.create(a.id, request()); await command(a, midnight, 1);
  assert.equal(midnight.expiresAt, '2099-06-01T15:59:58.000Z');
  at('2099-06-01T16:00:03.000Z');
  assert.equal((await play.get(a.id, midnight.id)).leaderboardDate, '2099-06-02');
  check('active-account checks and Beijing midnight use documented server-settlement day on catch-up');
  return people;
}

async function rewardChecks(people) {
  const a = people[0]; const suspended = people[15]; const rollbackUser = people[17];
  const rewards = new PlayRewardsService(db, assets, notifications);
  const noWallets = await fingerprints();
  const balanceBoard = await rewards.officeCoins(a.id);
  assert.deepEqual(await fingerprints(), noWallets, 'Balance board must be entirely read-only');
  assert.ok(balanceBoard.items.every((entry) => entry.balance === 0));
  assert.ok(!JSON.stringify(balanceBoard).includes(a.email)); assert.ok(!JSON.stringify(balanceBoard).includes(a.id));
  await rejected(rewards.officeCoins(people[13].id), 'PLAY_ACTIVE_ACCOUNT_REQUIRED');
  check('office-coin board authenticates, excludes suspended users, hides internal fields and never initializes assets');

  await db.getRepository(E.User).update(suspended.id, { accountStatus: 'suspended' });
  for (const gameKey of GAME_KEYS) {
    // Midnight already produced one legitimate tetris score; overwrite only the
    // isolated fixture to make all six winners/tie rules deterministic.
    await db.getRepository(E.PlayDailyScore).delete({ serviceDate: '2099-06-02', gameKey, userId: a.id });
    await addScore(a, '2099-06-02', gameKey, 100);
  }
  await addScore(suspended, '2099-06-02', 'snake', 999);
  at('2099-06-02T16:04:59.999Z');
  assert.equal(await rewards.settleDay('2099-06-02', 'snake'), false);
  assert.equal(await db.getRepository(E.PlayDailyAward).count(), 0);
  await db.transaction((manager) => assets.ensurePlatformState(manager, a.id));
  const balanceBefore = Number((await db.getRepository(E.WalletBalance).findOneByOrFail({ userId: a.id, currency: 'office_coin' })).balance);
  at('2099-06-02T16:05:00.000Z');
  const awards = await Promise.all(Array.from({ length: 8 }, () => new PlayRewardsService(db, assets, notifications).settleDay('2099-06-02', 'snake')));
  assert.equal(awards.filter(Boolean).length, 1);
  assert.equal(await db.getRepository(E.RewardGrant).count({ where: { sourceType: 'arcade_daily_champion' } }), 1);
  assert.equal(Number((await db.getRepository(E.WalletBalance).findOneByOrFail({ userId: a.id, currency: 'office_coin' })).balance), balanceBefore + 100);
  const others = await Promise.all(GAME_KEYS.slice(1).flatMap((gameKey) => Array.from({ length: 2 }, () => new PlayRewardsService(db, assets, notifications).settleDay('2099-06-02', gameKey))));
  assert.equal(others.filter(Boolean).length, 5);
  assert.equal(await db.getRepository(E.PlayDailyAward).count({ where: { serviceDate: '2099-06-02' } }), 6);
  assert.equal(await db.getRepository(E.RewardGrant).count({ where: { sourceType: 'arcade_daily_champion' } }), 6);
  assert.equal(await db.getRepository(E.WalletLedger).count({ where: { sourceType: 'arcade_daily_champion' } }), 6);
  assert.equal(await db.getRepository(E.CommunityNotification).count({ where: { eventType: 'arcade_daily_champion' } }), 6);
  assert.equal(Number((await db.getRepository(E.WalletBalance).findOneByOrFail({ userId: a.id, currency: 'office_coin' })).balance), balanceBefore + 600);
  assert.equal(await rewards.settleDay('2099-06-03', 'snake'), false);
  check('00:05 boundary, concurrent winner claim, six-game 600-coin cap and one ledger/grant/notice per source');

  await addScore(rollbackUser, '2099-06-01', 'tank', 300);
  const beforeFailure = await fingerprints();
  const failingNotifications = new NotificationService(db);
  failingNotifications.create = async () => { throw new Error('PLAY_REHEARSAL_NOTIFICATION_FAILURE'); };
  await assert.rejects(new PlayRewardsService(db, assets, failingNotifications).settleDay('2099-06-01', 'tank'), /PLAY_REHEARSAL_NOTIFICATION_FAILURE/);
  assert.deepEqual(await fingerprints(), beforeFailure, 'Notification failure must roll back prize, wallet welcome/credit, grant and every other row');
  const retried = await Promise.all(Array.from({ length: 6 }, () => new PlayRewardsService(db, assets, notifications).settleDay('2099-06-01', 'tank')));
  assert.equal(retried.filter(Boolean).length, 1);
  assert.equal(await db.getRepository(E.RewardGrant).count({ where: { userId: rollbackUser.id, sourceType: 'arcade_daily_champion' } }), 1);
  check('real PostgreSQL notification-failure rollback restores full database fingerprint; retry pays once');

  await addScore(suspended, '2099-06-01', 'snake', 999);
  assert.equal(await rewards.settleDay('2099-06-01', 'snake'), true);
  const emptyAward = await db.getRepository(E.PlayDailyAward).findOneByOrFail({ serviceDate: '2099-06-01', gameKey: 'snake' });
  assert.equal(emptyAward.coins, 0); assert.equal(emptyAward.winnerUserId, null);
  await rewards.settleDue();
  const missing = await db.query('SELECT DISTINCT s.service_date, s.game_key FROM play_daily_scores s LEFT JOIN play_daily_awards a ON a.service_date=s.service_date AND a.game_key=s.game_key WHERE a.service_date IS NULL');
  assert.equal(missing.length, 0, 'Automatic backfill must settle every older positive-score group');
  const beforeSpend = await rewards.officeCoins(a.id);
  const own = beforeSpend.me.balance;
  await db.transaction((manager) => assets.debitWallet(manager, a.id, 'office_coin', own - 1, { sourceType: 'play_rehearsal', sourceId: randomUUID(), reason: 'synthetic leaderboard spending check', idempotencyKey: `play-rehearsal:${randomUUID()}` }));
  const afterSpend = await rewards.officeCoins(a.id);
  assert.equal(afterSpend.me.balance, 1); assert.ok(afterSpend.me.rank > beforeSpend.me.rank);
  process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'false';
  const disabledSnapshot = await fingerprints();
  assert.equal(await rewards.settleDay('2099-06-01', 'zhesi'), false); await rewards.settleDue();
  assert.deepEqual(await fingerprints(), disabledSnapshot);
  process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true';
  check('inactive winners get zero claims, automatic missed-day backfill, live spending ranks and write-disable guard');
}

async function cleanSyntheticRows() {
  if (!db?.isInitialized || !baseline) return;
  const allowed = new Map(synthetic.map((user) => [user.id, user.email]));
  const rooms = await db.getRepository(E.PlayRoom).find();
  assert.ok(rooms.every((room) => allowed.has(room.creatorId)), 'Refuse to delete an unowned room');
  const awards = await db.getRepository(E.PlayDailyAward).find();
  assert.ok(awards.every((award) => ['2099-06-01', '2099-06-02'].includes(award.serviceDate) && GAME_KEYS.includes(award.gameKey)), 'Refuse to delete an unowned award');
  await db.transaction(async (manager) => {
    const passwordBuckets = await manager.getRepository(E.AuthRateLimitBucket).find();
    assert.ok(passwordBuckets.every((row) => ownedRateKeys.has(row.keyHash) && ['room-password:play:user', 'room-password:play:room-user', 'room-password-mutation:play:user', 'room-password-mutation:play:room-user'].includes(row.scope)), 'Refuse to delete an unowned abuse bucket');
    for (const row of passwordBuckets) await manager.getRepository(E.AuthRateLimitBucket).delete({ keyHash: row.keyHash, scope: row.scope });
    for (const award of awards) await manager.getRepository(E.PlayDailyAward).delete({ serviceDate: award.serviceDate, gameKey: award.gameKey });
    for (const room of rooms) await manager.getRepository(E.PlayRoom).delete({ id: room.id });
    for (const user of synthetic) {
      const existing = await manager.getRepository(E.User).findOneBy({ id: user.id });
      assert.ok(!existing || existing.email === user.email, 'Synthetic identity guard failed');
      if (existing) await manager.getRepository(E.User).delete({ id: user.id, email: user.email });
    }
  });
  assert.deepEqual(await fingerprints(), baseline, 'Exact synthetic cleanup must restore all post-migration rows');
  check('exact synthetic cleanup restores the complete post-migration database fingerprint');
}

(async () => {
  let failed;
  try {
    await schemaRehearsal();
    global.Date = TestDate;
    play = new PlayService(db);
    assets = new PlatformAssetsService({ now: () => new TestDate() });
    notifications = new NotificationService(db);
    const people = await roomChecks();
    await rewardChecks(people);
  } catch (error) { failed = error; }
  finally {
    try { await cleanSyntheticRows(); } catch (error) { failed = failed || error; process.stderr.write(`CLEANUP_FAILED ${error.message}\n`); }
    global.Date = NativeDate;
    if (db?.isInitialized) await db.destroy();
  }
  if (failed) { process.stderr.write(`PLAY_REHEARSAL_FAILED ${failed.stack || failed.message}\n`); process.exitCode = 1; return; }
  process.stdout.write(`${JSON.stringify({ status: 'PLAY_REHEARSAL_OK', database: 'community_play_rehearsal', scenarios: passed.length, syntheticUsers: synthetic.length, cleaned: true, locksAndRollback: 'real PostgreSQL' })}\n`);
})();
