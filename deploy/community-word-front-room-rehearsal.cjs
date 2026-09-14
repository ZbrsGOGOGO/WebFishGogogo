#!/usr/bin/env node
'use strict';

/**
 * Real Word Front room service acceptance against ONE restored, disposable clone.
 * The exact Docker DNS name, dedicated database, explicit confirmation and a
 * clone-only 64-hex sentinel must all match before the first write. Never run
 * this script on production or against a database containing real test users.
 *
 * Reuse the v3 release clone's `public.webfish_v3_rehearsal_sentinel` row with
 * purpose `webfish-wordfront-v3-20260914`; only read its token, never modify
 * its handoff. Run in the candidate API image on the clone network with the
 * fixed DB_HOST/DB_DATABASE below, REHEARSAL_SENTINEL_TOKEN set to the clone's
 * unique 64-hex token, and REHEARSAL_CONFIRMATION set to the exact value below.
 * The production API image does not bundle deploy scripts: mount this file
 * read-only into the one-off clone-network container.
 */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const path = require('node:path');

assert.equal(process.env.REHEARSAL_CONFIRMATION, 'I_UNDERSTAND_THIS_WRITES_ONLY_TO_WEBFISH_V3_ISOLATED_CLONE');
assert.equal(process.env.DB_HOST, 'webfish-v3-rehearsal-postgres-1');
assert.equal(process.env.DB_DATABASE, 'webfish_v3_rehearsal');
assert.equal(process.env.DB_PORT || '5432', '5432');
assert.match(process.env.REHEARSAL_SENTINEL_TOKEN || '', /^[0-9a-f]{64}$/);
assert.ok(process.env.DB_USERNAME && process.env.DB_PASSWORD, 'Explicit clone credentials required');
assert.ok(!process.env.DATABASE_URL, 'A database URL is forbidden');

const appRoot = process.env.WORD_ROOM_REHEARSAL_APP_ROOT || '/app';
const fromApp = createRequire(path.join(appRoot, 'packages/backend/package.json'));
fromApp('reflect-metadata');
const { DataSource } = fromApp('typeorm');
const load = (name) => fromApp(path.join(appRoot, 'packages/backend/dist', name));
const E = load('database/entities');
const { WordFrontRoomService } = load('modules/community/word-front-room/word-front-room.service');
const { hashAuthRateLimitKey } = load('modules/auth/auth-crypto');

const db = new DataSource({
  type: 'postgres', host: process.env.DB_HOST, port: 5432,
  database: process.env.DB_DATABASE, username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD, entities: E.entities,
  synchronize: false, migrationsRun: false,
  extra: { max: 4, options: '-c statement_timeout=20000 -c lock_timeout=10000 -c idle_in_transaction_session_timeout=20000' },
});
let rooms;
const syntheticIds = [];
const roomIds = [];
const checks = [];
const mark = (label) => { checks.push(label); process.stdout.write(`PASS ${label}\n`); };
const rejected = (promise, code) => assert.rejects(promise, (error) => error?.response?.code === code);

async function guardClone() {
  const [database] = await db.query('SELECT current_database() AS name');
  assert.equal(database.name, 'webfish_v3_rehearsal');
  const [table] = await db.query("SELECT to_regclass('public.webfish_v3_rehearsal_sentinel')::text AS name");
  assert.ok(['webfish_v3_rehearsal_sentinel', 'public.webfish_v3_rehearsal_sentinel'].includes(table.name), 'Clone-only sentinel table required');
  const tokens = await db.query("SELECT token FROM public.webfish_v3_rehearsal_sentinel WHERE purpose = 'webfish-wordfront-v3-20260914'");
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].token, process.env.REHEARSAL_SENTINEL_TOKEN);
  mark('dedicated clone host/database and one unique sentinel verified before writes');
}
async function fingerprint(table) {
  const [row] = await db.query(`SELECT count(*)::integer AS count,
    md5(COALESCE(string_agg(to_jsonb(t)::text, E'\\n' ORDER BY to_jsonb(t)::text), '')) AS digest
    FROM "${table}" t`);
  return row;
}
async function assetSnapshot() {
  const result = {};
  for (const table of ['arcade_game_runs', 'arcade_best_scores', 'wallet_balances', 'wallet_ledger']) result[table] = await fingerprint(table);
  return result;
}
async function makeUser(label) {
  const id = randomUUID();
  const repo = db.getRepository(E.User);
  const user = await repo.save(repo.create({ id, email: `word-room-${id}@users.invalid`, username: `qa_wf_${id.slice(0, 7)}`,
    displayName: `合成成员${label}`, passwordHash: 'synthetic-clone-only-not-a-login-secret', accountStatus: 'active' }));
  syntheticIds.push(user.id);
  return user;
}
function assertPrivate(view, a, b) {
  const text = JSON.stringify(view);
  for (const value of [a.id, b.id, 'passwordHash', 'createHash', 'seed', 'wallet', 'email']) assert.ok(!text.includes(value));
}
async function checkRoom(a, b) {
  rooms = new WordFrontRoomService(db);
  const create = { requestId: randomUUID(), name: '合成双线演练', chapter: 1, password: '测试通行密语' };
  const room = await rooms.create(a.id, create); roomIds.push(room.id);
  assert.equal(room.status, 'waiting'); assert.equal(room.requiresPassword, true);
  assert.equal((await rooms.create(a.id, create)).id, room.id);
  await rejected(rooms.get(b.id, room.id), 'WORD_ROOM_NOT_FOUND');
  await rejected(rooms.join(b.id, { roomId: room.id, password: '错误密语' }), 'WORD_ROOM_PASSWORD_INVALID');
  const joined = await rooms.join(b.id, { roomId: room.id, password: '测试通行密语' });
  assert.equal(joined.mySide, 'blue'); assertPrivate(joined, a, b);
  await rejected(rooms.start(b.id, room.id, {}), 'WORD_ROOM_HOST_REQUIRED');
  const started = await rooms.start(a.id, room.id, {});
  assert.equal(started.status, 'running'); assert.equal(started.board.status, 'running');
  assert.deepEqual(started.board.units, (await rooms.get(b.id, room.id)).board.units);
  mark('synthetic two-member password room, idempotent create, nonmember denial and host-only start');

  await rejected(rooms.act(a.id, room.id, { actionId: randomUUID(), action: { type: 'recruit', tick: 0 } }), 'WORD_ROOM_INPUT_INVALID');
  await rejected(rooms.act(a.id, room.id, { actionId: randomUUID(), action: { type: 'recruit', score: 1000000 } }), 'WORD_ROOM_INPUT_INVALID');
  const actionId = randomUUID();
  const moved = await rooms.act(a.id, room.id, { actionId, action: { type: 'recruit' } });
  assert.equal(moved.board.credits, 8);
  assert.equal((await rooms.act(a.id, room.id, { actionId, action: { type: 'recruit' } })).board.credits, 8);
  await rejected(rooms.act(a.id, room.id, { actionId, action: { type: 'buy_boost', boost: 'attack' } }), 'WORD_ROOM_ACTION_CONFLICT');
  rooms.advance(Date.now() + 850);
  const red = await rooms.get(a.id, room.id), blue = await rooms.get(b.id, room.id);
  assert.equal(red.board.tick, blue.board.tick); assert.ok(red.board.tick > 0);
  assert.equal(red.board.credits, 8); assert.equal(blue.board.credits, 20);
  assertPrivate(red, a, b);
  mark('server-owned tick/state, rejected forged score/tick, one accepted intent and equal lane advancement');

  await rooms.leave(b.id, room.id, {});
  assert.equal((await rooms.get(a.id, room.id)).winner, 'red');
  await rooms.leave(a.id, room.id, {});
  const open = await rooms.create(a.id, { requestId: randomUUID(), name: '合成公开演练', chapter: 2, password: '' });
  roomIds.push(open.id); assert.equal(open.requiresPassword, false);
  assert.equal((await rooms.join(b.id, { roomId: open.id, password: '' })).mySide, 'blue');
  await rooms.leave(b.id, open.id, {}); await rooms.leave(a.id, open.id, {});
  mark('forfeit winner and optional-password public room use no invite code');
}
async function cleanup() {
  rooms?.onModuleDestroy();
  if (!db.isInitialized) return;
  const hashes = [];
  for (const id of syntheticIds) {
    for (const scope of ['word-front-room:create', 'word-front-room:join', 'room-password:word-front:user']) hashes.push(hashAuthRateLimitKey(scope, id));
    for (const roomId of roomIds) hashes.push(hashAuthRateLimitKey('room-password:word-front:room-user', `${roomId}:${id}`));
  }
  if (hashes.length) await db.query('DELETE FROM auth_rate_limit_buckets WHERE key_hash = ANY($1::varchar[])', [hashes]);
  if (syntheticIds.length) await db.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [syntheticIds]);
  await db.destroy();
}
async function main() {
  await db.initialize();
  try {
    await guardClone();
    const before = await assetSnapshot();
    process.env.FEATURE_WORD_FRONT_ROOMS_ENABLED = 'true';
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true';
    const a = await makeUser('甲'), b = await makeUser('乙');
    await checkRoom(a, b);
    assert.deepEqual(await assetSnapshot(), before, 'Formal Arcade scores and wallet rows must remain byte-for-byte unchanged');
    mark('Arcade runs/bests and wallet balance/ledger unchanged');
  } finally { await cleanup(); }
  process.stdout.write(`PASS ${checks.length} isolated Word Front room acceptance checks\n`);
}
main().catch(() => { process.stderr.write('FAIL isolated Word Front room acceptance; see clone-only logs, no production action taken\n'); process.exitCode = 1; });
