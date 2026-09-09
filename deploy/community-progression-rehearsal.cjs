#!/usr/bin/env node
'use strict';

/** Synthetic-only real PostgreSQL + Nest HTTP + loopback WebSocket acceptance.
 * Chat's event bus/moderation are explicit in-process test doubles (NOT a Redis/provider test).
 * No scheduled worker or mail sender runs. Caller owns the exact isolated Docker stack.
 */
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const path = require('node:path');
assert.equal(process.env.PROGRESSION_REHEARSAL_CONFIRMATION, 'ISOLATED_PROGRESSION_ONLY:20260909');
assert.equal(process.env.DB_HOST, 'growth-pg-btpam6');
assert.equal(process.env.DB_USERNAME, 'growth_test');
assert.equal(process.env.DB_DATABASE, 'community_growth_rehearsal');
assert.equal(process.env.DB_PORT || '5432', '5432');
assert.equal(process.env.NODE_ENV, 'test'); assert.equal(process.env.LOCAL_DEV, 'false');
assert.ok(process.env.DB_PASSWORD && process.env.DB_PASSWORD.length >= 12, 'Isolated database credentials required');
for (const key of ['DATABASE_URL', 'PGHOST', 'PGDATABASE', 'PUBLIC_SITE_ORIGIN', 'REDIS_URL', 'JWT_SECRET', 'AUTH_TOKEN_PEPPER', 'AUTH_EMAIL_WEBHOOK_URL', 'AUTH_EMAIL_OUTBOX_ENCRYPTION_KEY', 'SMTP_HOST']) assert.ok(!process.env[key], 'No production connection, secret or provider bundle may be supplied');
Object.assign(process.env, {
  FEATURE_COMMUNITY_PROGRESSION_ENABLED: 'true', FEATURE_COMMUNITY_WRITES_ENABLED: 'true',
  FEATURE_COMMUNITY_CHAT_ENABLED: 'true', FEATURE_CHAT_WRITES_ENABLED: 'true',
  FEATURE_ACCOUNT_DELETION_ENABLED: 'true', FEATURE_SOCIAL_VERIFICATION_ENABLED: 'false',
  AUTH_EMAIL_OUTBOX_PUMP_ENABLED: 'false', AUTH_REFRESH_COOKIE_NAME: 'progression_rehearsal_refresh',
  JWT_SECRET: randomBytes(48).toString('hex'), AUTH_TOKEN_PEPPER: randomBytes(48).toString('hex'),
  AUTH_EMAIL_OUTBOX_ENCRYPTION_KEY: randomBytes(32).toString('base64'), AUTH_EMAIL_OUTBOX_ENCRYPTION_KEY_ID: 'progression-ephemeral',
});
const fromApp = createRequire('/app/packages/backend/package.json');
fromApp('reflect-metadata');
const { DataSource } = fromApp('typeorm'); const { JwtService } = fromApp('@nestjs/jwt');
const { NestFactory } = fromApp('@nestjs/core'); const { Module } = fromApp('@nestjs/common'); const { WebSocket } = fromApp('ws');
const load = (name) => fromApp(path.join('/app/packages/backend/dist', name));
const E = load('database/entities'); const { migrations } = load('database/migrations');
assert.equal(Math.max(...migrations.map((migration) => Number(migration.name.slice(-13)))), 1700000000032, 'Review future schema before running');
const { AddCommunityProgression1700000000031 } = load('database/migrations/1700000000031-AddCommunityProgression');
const { CommunityProgressionService } = load('modules/community/progression/community-progression.service');
const { CommunityProgressionController } = load('modules/community/progression/community-progression.controller');
const { MembershipService } = load('modules/community/progression/membership.service');
const { PublicProfileService } = load('modules/community/public-profile.service');
const { RelationshipPolicyService } = load('modules/community/relationship-policy.service');
const { AuthService } = load('modules/auth/auth.service'); const { AuthController } = load('modules/auth/auth.controller');
const { JwtAuthGuard } = load('modules/auth/jwt-auth.guard'); const { BetaAccessService } = load('modules/auth/beta-access.service');
const { AuthRateLimitService } = load('modules/auth/auth-rate-limit.service'); const { CommunityCapacityService } = load('modules/auth/community-capacity.service');
const { AuthEmailOutboxService } = load('modules/auth/auth-email-outbox.service');
const { AccountLifecycleService } = load('modules/auth/account-lifecycle.service'); const { AuthSensitiveDataService } = load('modules/auth/auth-sensitive-data.service');
const { hashPassword } = load('modules/auth/password.util');
const { ChatService } = load('modules/chat/chat.service'); const { ChatController } = load('modules/chat/chat.controller');
const { DirectMessageService } = load('modules/chat/direct-message.service');
const { ChatWebSocketGateway } = load('modules/chat/chat-websocket.gateway');
const { RailChatService } = load('modules/community/rail/rail-chat.service');
const towerEngine = load('modules/community/demon-tower/demon-tower.engine');
const { toBusinessLocalDate } = load('modules/platform/platform-time');
const seeded = new Set(['migrations', 'tools', 'tool_professions', 'item_definitions', 'crop_definitions', 'task_definitions', 'chat_rooms', 'community_capacity_guards']);
const identifiers = []; const clients = []; const inFlight = new Set(); const checks = [];
const PASSWORD = `Synthetic-${randomBytes(20).toString('hex')}!`;
let phase = 'entry', db, baseline, primaryKeys, app, baseUrl, auth, progression, membership, profiles, chat, direct, rail, gateway, lifecycle, jwt;
const ident = (value) => { assert.match(value, /^[a-z0-9_]+$/); return `"${value}"`; };
const pass = (name) => { checks.push(name); process.stdout.write(`PASS ${name}\n`); };
const denied = (promise, code) => assert.rejects(promise, (error) => error?.response?.code === code);
const title = (titleKey, expectedVersion, requestId = randomUUID()) => ({ requestId, expectedVersion, titleKey });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function safeView(value) {
  const text = JSON.stringify(value); assert.ok(!/"(?:passwordHash|requestHash|lastRequestId|lastRequestHash|rngSeed|rngCounter|userId|sessionId)"\s*:/.test(text));
  for (const user of identifiers) { assert.ok(!text.includes(user.id)); assert.ok(!text.includes(user.email)); }
  assert.ok(!text.includes(PASSWORD));
}
async function snapshot() {
  const result = {};
  for (const { tablename } of await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")) {
    const [fingerprint] = await db.query(`SELECT count(*)::integer AS count, md5(COALESCE(string_agg(to_jsonb(t)::text, E'\\n' ORDER BY to_jsonb(t)::text), '')) AS digest FROM ${ident(tablename)} t`);
    const rows = (await db.query(`SELECT row_to_json(t) AS row FROM ${ident(tablename)} t`)).map((entry) => entry.row);
    result[tablename] = { ...fingerprint, rows };
  }
  return result;
}
async function user(label, status = 'active') {
  assert.ok(identifiers.length < 10); const id = randomUUID(); const publicId = randomUUID();
  const value = { id, publicId, username: `pr_${label}_${publicId.slice(0, 6)}`, email: `progression.${publicId}@users.invalid` };
  identifiers.push(value);
  return db.getRepository(E.User).save(db.getRepository(E.User).create({ ...value, usernameNormalized: value.username, emailNormalized: value.email, displayName: `Synthetic ${label}`, passwordHash: await hashPassword(PASSWORD), accountStatus: status, communityRole: 'user', onboardingCompleted: true }));
}
async function setup() {
  phase = 'isolated schema';
  db = await new DataSource({ type: 'postgres', host: process.env.DB_HOST, port: 5432, username: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE, entities: E.entities, migrations, synchronize: false, migrationsRun: false, logging: false,
    extra: { max: 16, application_name: 'synthetic-progression-rehearsal', options: '-c statement_timeout=15000 -c lock_timeout=10000 -c idle_in_transaction_session_timeout=20000' },
  }).initialize();
  const [identity] = await db.query('SELECT current_database() AS database, current_user AS username');
  assert.equal(identity.database, 'community_growth_rehearsal'); assert.equal(identity.username, 'growth_test');
  for (const { tablename } of await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")) {
    if (!seeded.has(tablename)) assert.equal(Number((await db.query(`SELECT count(*) FROM ${ident(tablename)}`))[0].count), 0, 'Existing business data forbidden');
  }
  await db.runMigrations({ transaction: 'all' }); assert.deepEqual(await db.runMigrations({ transaction: 'all' }), []);
  assert.equal(Number((await db.query('SELECT max(timestamp) AS timestamp FROM migrations'))[0].timestamp), 1700000000032);
  baseline = await snapshot(); primaryKeys = {};
  for (const table of Object.keys(baseline)) {
    primaryKeys[table] = (await db.query('SELECT a.attname::text AS name FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey) WHERE i.indrelid=$1::regclass AND i.indisprimary ORDER BY a.attnum', [table])).map((row) => row.name);
    assert.ok(primaryKeys[table].length, 'Every cleanup table needs a precise primary key');
  }
  const noMail = () => { throw new Error('MAIL_FORBIDDEN_IN_REHEARSAL'); };
  const outbox = new AuthEmailOutboxService(db, { assertRegistrationDeliveryAvailable() {}, assertPasswordResetDeliveryAvailable() {}, sendRegistrationCode: noMail, sendPasswordReset: noMail });
  jwt = new JwtService({ secret: process.env.JWT_SECRET });
  auth = new AuthService(db, jwt, new BetaAccessService(), outbox, new AuthRateLimitService(db), new CommunityCapacityService());
  membership = new MembershipService(); progression = new CommunityProgressionService(db, membership, { now: () => new Date() });
  profiles = new PublicProfileService(db, new RelationshipPolicyService()); lifecycle = new AccountLifecycleService(db, new AuthSensitiveDataService(), outbox);
  const listeners = new Set();
  const syntheticBus = { isAvailable: () => true, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, async publish(event) { await Promise.all([...listeners].map((fn) => fn(event))); }, async touchPresence() {}, async touchPresenceBatch() {}, async removePresence() {}, async presenceBand() { return 'quiet'; } };
  const moderation = { isAvailable: () => true, async moderate() { return { decision: 'allow', provider: 'isolated-test-only', reference: null }; } };
  chat = new ChatService(db, syntheticBus, moderation); direct = new DirectMessageService(db, syntheticBus, moderation); rail = new RailChatService(db, moderation);
  class ProgressionHarness {}
  Module({ controllers: [AuthController, CommunityProgressionController, ChatController], providers: [
    { provide: DataSource, useValue: db }, { provide: JwtService, useValue: jwt }, JwtAuthGuard,
    { provide: AuthService, useValue: auth }, { provide: CommunityProgressionService, useValue: progression }, { provide: ChatService, useValue: chat },
  ] })(ProgressionHarness);
  app = await NestFactory.create(ProgressionHarness, { logger: false, abortOnError: false });
  gateway = new ChatWebSocketGateway(chat, syntheticBus, direct, db); gateway.attach(app.getHttpServer());
  await app.listen(0, '127.0.0.1'); baseUrl = `http://127.0.0.1:${app.getHttpServer().address().port}`; process.env.PUBLIC_SITE_ORIGIN = baseUrl;
  pass('guarded empty-business schema32; real PG/Nest HTTP and no mail or background timers');
}
async function http(method, route, { token, body, status = 200 } = {}) {
  assert.ok(route.startsWith('/v1/'));
  const response = await fetch(`${baseUrl}${route}`, { method, redirect: 'error', signal: AbortSignal.timeout(10000), headers: {
    origin: baseUrl, ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  assert.equal(response.status, status, `${method} ${route} expected status`);
  const text = await response.text(); assert.ok(text.length < 1_000_000);
  return { json: text ? JSON.parse(text) : null, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function login(person) {
  const result = await http('POST', '/v1/auth/account/login', { body: { username: person.username, password: PASSWORD } });
  assert.ok(result.json.accessToken && result.cookie); assert.ok(!('refreshToken' in result.json));
  return { user: person, token: result.json.accessToken, sessionId: jwt.decode(result.json.accessToken).sid, refresh: decodeURIComponent(result.cookie.split('=').slice(1).join('=')) };
}
async function giftAndMembership() {
  phase = 'campaign'; const a = await user('existing'); const b = await user('reader'); const restricted = await user('restricted', 'suspended');
  const sql = []; await new AddCommunityProgression1700000000031().up({ query: async (query) => { sql.push(query); } });
  const gift = sql.find((query) => query.startsWith('INSERT INTO membership_grants')); assert.ok(gift && gift.includes("interval '720 hours'"));
  // Only the exact migration INSERT, on these isolated users; full DDL clone rehearsed separately.
  await db.transaction(async (manager) => { await manager.query(gift); });
  const rows = await db.getRepository(E.CommunityMembershipGrant).find({ order: { userId: 'ASC' } });
  assert.deepEqual(rows.map((row) => row.userId).sort(), [a.id, b.id].sort());
  assert.equal(rows[0].startsAt.getTime(), rows[1].startsAt.getTime());
  for (const row of rows) assert.equal(row.expiresAt.getTime() - row.startsAt.getTime(), 720 * 3600_000);
  await db.query(gift); assert.deepEqual(await db.getRepository(E.CommunityMembershipGrant).find({ order: { userId: 'ASC' } }), rows);
  const newcomer = await user('newcomer'); await db.getRepository(E.User).update(newcomer.id, { communityRole: 'admin' });
  assert.deepEqual(await db.runMigrations(), []); assert.equal((await progression.me(newcomer.id)).vip.active, false);
  await denied(membership.requireVip(db.manager, newcomer.id, new Date()), 'VIP_REQUIRED');
  await denied(membership.requireVip(db.manager, restricted.id, new Date()), 'PROGRESSION_ACTIVE_ACCOUNT_REQUIRED');
  const sessionA = await login(a); const sessionB = await login(b); await login(a);
  assert.deepEqual(await db.getRepository(E.CommunityMembershipGrant).find({ order: { userId: 'ASC' } }), rows);
  await http('GET', '/v1/community/progression/me', { status: 401 });
  const mine = await http('GET', '/v1/community/progression/me', { token: sessionA.token }); safeView(mine.json); assert.equal(mine.json.vip.active, true);
  const expires = rows.find((row) => row.userId === a.id).expiresAt;
  assert.equal((await membership.requireVip(db.manager, a.id, new Date(expires.getTime() - 1))).active, true);
  await denied(membership.requireVip(db.manager, a.id, expires), 'VIP_REQUIRED');
  pass('exact fixed720h active-only gift, repeat SQL/migration/login no renewal, future account and admin role no VIP, exact expiry');
  return { a, b, sessionA, sessionB };
}
async function blocked(userId, launch, expected = 2) {
  const holder = db.createQueryRunner(); await holder.connect(); await holder.startTransaction(); let requests = [];
  try {
    const [{ pid }] = await holder.query('SELECT pg_backend_pid() AS pid'); await holder.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
    requests = launch().map((promise) => { const pending = promise.then((value) => ({ value }), (error) => ({ error })); inFlight.add(pending); void pending.finally(() => inFlight.delete(pending)); return pending; });
    let observed = false;
    for (let attempt = 0; attempt < 300; attempt++) {
      const [row] = await db.query(`WITH RECURSIVE waiting(pid) AS (
        SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND $1::int=ANY(pg_blocking_pids(pid))
        UNION SELECT a.pid FROM pg_stat_activity a JOIN waiting w ON w.pid=ANY(pg_blocking_pids(a.pid)) WHERE a.datname=current_database()
      ) SELECT count(DISTINCT pid)::integer AS count FROM waiting`, [pid]);
      if (row.count >= expected) { observed = true; break; } await pause(20);
    }
    assert.ok(observed, 'Both business transactions must actually wait through the held user-row blocking chain');
    await holder.commitTransaction(); return await Promise.all(requests);
  } finally {
    if (holder.isTransactionActive) await holder.rollbackTransaction(); await holder.release(); await Promise.all(requests);
  }
}
async function concurrencyAndMetrics(a, b, sessionA) {
  phase = 'real PG cosmetics concurrency';
  await db.getRepository(E.DeskPlant).save(db.getRepository(E.DeskPlant).create({ userId: a.id, totalHarvests: 25 }));
  const zero = await progression.me(a.id); assert.equal(zero.achievements.find((item) => item.key === 'farm_25').eligible, true);
  assert.equal(await db.getRepository(E.CommunityAchievementUnlock).count(), 0);
  const refreshed = await blocked(a.id, () => [progression.refresh(a.id, {}), progression.refresh(a.id, {})]);
  assert.ok(refreshed.every((item) => item.value)); assert.equal(refreshed.reduce((sum, item) => sum + item.value.newlyUnlocked.length, 0), 2);
  const request = title('farm_first', 0); const equipped = await blocked(a.id, () => [progression.equip(a.id, request), progression.equip(a.id, request)]);
  assert.ok(equipped.every((item) => item.value)); assert.equal(equipped.filter((item) => item.value.replayed).length, 1);
  await denied(progression.equip(a.id, { ...request, titleKey: 'farm_25' }), 'PROGRESSION_IDEMPOTENCY_CONFLICT');
  await denied(progression.equip(b.id, request), 'TITLE_NOT_UNLOCKED');
  const changed = await blocked(a.id, () => [progression.equip(a.id, title('farm_25', 1)), progression.equip(a.id, title(null, 1))]);
  assert.equal(changed.filter((item) => item.value).length, 1); assert.equal(changed.find((item) => item.error).error.response.code, 'PROGRESSION_VERSION_CONFLICT');
  assert.equal((await progression.me(a.id)).presentation.version, 2);
  await http('POST', '/v1/community/progression/title', { token: sessionA.token, body: { ...title('farm_first', 2), titleKey: '<img onerror=evil()>' }, status: 400 });
  await http('POST', '/v1/community/progression/refresh', { token: sessionA.token, body: { userId: b.id }, status: 400 });
  assert.equal(await db.getRepository(E.WalletBalance).count(), 0); assert.equal(await db.getRepository(E.RewardGrant).count(), 0);
  assert.equal((await db.getRepository(E.User).findOneByOrFail({ id: a.id })).communityRole, 'user');
  pass('actual PG blocking chains prove refresh dedupe, same UUID replay, conflicting CAS exclusion; no wallet/reward/role changes');
  await db.getRepository(E.PlayerProgression).insert({ userId: a.id, level: 10, experience: '10000' });
  await db.getRepository(E.RailPlayerStats).insert({ userId: a.id, completedGames: 10, rankedGames: 0 });
  const now = new Date(); const state = towerEngine.createDemonTowerState(now.getTime(), toBusinessLocalDate(now), randomBytes(32).toString('hex')); state.level = 20;
  state.weapons.push({ ...state.weapons[0], id: 'w2' }, { ...state.weapons[0], id: 'w3' }, { ...state.weapons[0], id: 'w4' });
  await db.getRepository(E.DemonTowerProfile).save({ userId: a.id, version: 1, state, createdAt: now, updatedAt: now });
  const synced = await progression.refresh(a.id, {}); safeView(synced);
  for (const key of ['community_10', 'rail_first', 'rail_10', 'tower_5', 'tower_20', 'tower_collection']) assert.ok(synced.overview.achievements.find((item) => item.key === key).unlockedAt);
  assert.equal(synced.overview.achievements.find((item) => item.key === 'daily_champion').eligible, false);
  assert.equal((await progression.me(b.id)).achievements.some((item) => item.eligible), false);
  pass('retained authoritative farm/platform/rail/tower metrics are isolated by owner; no invented champion or exposed private state');
}
async function ensureTitle(person, key) {
  const current = await progression.me(person.id);
  if (current.presentation.equippedTitle?.key !== key) await progression.equip(person.id, title(key, current.presentation.version));
}
async function socketClient(session) {
  const ticket = await chat.issueSocketTicket(session.user.id, session.sessionId);
  const socket = new WebSocket(`${baseUrl.replace('http:', 'ws:')}/ws/chat`, { origin: baseUrl });
  const events = []; const observers = new Set(); const client = { socket, events };
  clients.push(client);
  socket.on('message', (raw) => { assert.ok(raw.length <= 65536); events.push(JSON.parse(raw.toString())); assert.ok(events.length <= 200); for (const fn of observers) fn(); });
  client.next = (type, predicate = () => true) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { observers.delete(inspect); reject(new Error('SOCKET_FRAME_DEADLINE')); }, 5000);
    function inspect() {
      const failure = events.find((event) => event.type === 'chat.error');
      if (failure) {
        clearTimeout(timer); observers.delete(inspect);
        const error = new Error('SOCKET_REJECTED');
        error.code = typeof failure.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(failure.code) ? failure.code : 'SOCKET_REJECTED';
        reject(error); return;
      }
      const index = events.findIndex((event) => event.type === type && predicate(event));
      if (index >= 0) { clearTimeout(timer); observers.delete(inspect); resolve(events.splice(index, 1)[0]); }
    }
    observers.add(inspect); inspect();
  });
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('SOCKET_OPEN_DEADLINE')), 5000); socket.once('open', () => { clearTimeout(timer); resolve(); }); socket.once('error', () => { clearTimeout(timer); reject(new Error('SOCKET_OPEN_FAILED')); }); });
  socket.send(JSON.stringify({ type: 'chat.authenticate', protocolVersion: 1, requestId: randomUUID(), ticket: ticket.ticket }));
  await client.next('chat.authenticated');
  const requestId = randomUUID(); socket.send(JSON.stringify({ type: 'chat.subscribe', protocolVersion: 1, requestId, roomSlug: 'general', afterSequence: 0 }));
  await client.next('chat.ack', (event) => event.requestId === requestId); await client.next('chat.ready');
  return client;
}
async function sendSocketMessage(client, type, input) {
  assert.ok(['chat.send', 'chat.direct.send'].includes(type));
  const requestId = randomUUID(), clientMessageId = randomUUID();
  client.socket.send(JSON.stringify({ type, protocolVersion: 1, requestId, clientMessageId, ...input }));
  const ack = await client.next('chat.ack', (event) => event.requestId === requestId);
  assert.equal(ack.action, type === 'chat.send' ? 'send' : 'direct-send');
  assert.equal(ack.clientMessageId, clientMessageId); assert.match(ack.messageId, /^[0-9a-f-]{36}$/);
  assert.equal(ack.roomSlug ?? ack.conversationId, input.roomSlug ?? input.conversationId);
  return ack.messageId;
}
async function projections(a, b, sessionA, sessionB) {
  phase = 'public and chat projections'; await ensureTitle(a, 'farm_first');
  await db.getRepository(E.PlayerProfile).save(db.getRepository(E.PlayerProfile).create({ userId: a.id, nickname: 'Synthetic member', privacySettings: { equipment: 'friends', battleRecord: 'friends', plant: 'friends', honors: 'self', friendCount: 'self', recentActivity: 'self' }, title: 'untrusted legacy profile title' }));
  const publicView = await profiles.get(a.publicId, null); safeView(publicView);
  assert.equal(publicView.equippedTitle.key, 'farm_first'); assert.ok(!('honors' in publicView)); assert.ok(!('vip' in publicView));
  assert.ok((await profiles.get(a.publicId, a.id)).honors.length >= 2);
  phase = 'group socket authentication'; const viewer = await socketClient(sessionB); const writer = await socketClient(sessionA);
  // send() only persists. Production's gateway publishes AFTER its sender ACK;
  // exercise that actual path instead of calling a service and inventing a push.
  phase = 'group socket send acknowledgement';
  const sentId = await sendSocketMessage(writer, 'chat.send', { roomSlug: 'general', body: 'synthetic title projection only' });
  phase = 'group socket title projection'; const pushed = await viewer.next('chat.message.created', (event) => event.message.id === sentId); safeView(pushed); assert.equal(pushed.message.author.title.key, 'farm_first');
  assert.equal((await writer.next('chat.message.created', (event) => event.message.id === sentId)).message.author.title.key, 'farm_first');
  phase = 'group history title change';
  await ensureTitle(a, 'farm_25');
  assert.equal((await chat.history(b.id, 'general', {})).items[0].author.title.key, 'farm_25'); assert.equal((await chat.messageForViewer(b.id, sentId)).author.title.key, 'farm_25');
  assert.equal((await db.getRepository(E.ChatMessage).findOneByOrFail({ id: sentId })).body, 'synthetic title projection only');
  phase = 'direct socket title projection'; const [userLowId, userHighId] = [a.id, b.id].sort(); const now = new Date();
  await db.getRepository(E.Friendship).insert({ userLowId, userHighId, firstBecameFriendsAt: now, currentStartedAt: now, endedAt: null, endedReason: null });
  const conversation = await direct.openConversation(b.id, a.publicId); assert.equal(conversation.friend.title.key, 'farm_25');
  const messageId = await sendSocketMessage(writer, 'chat.direct.send', { conversationId: conversation.id, body: 'synthetic private title metadata' });
  const dm = await viewer.next('chat.direct.message.created', (event) => event.message.id === messageId); safeView(dm); assert.equal(dm.message.author.title.key, 'farm_25');
  assert.equal((await writer.next('chat.direct.message.created', (event) => event.message.id === messageId)).message.author.title.key, 'farm_25');
  assert.equal((await direct.history(b.id, conversation.id, {})).items[0].author.title.key, 'farm_25');
  phase = 'rail title projection'; const room = await db.getRepository(E.RailRoom).save(db.getRepository(E.RailRoom).create({ creatorId: a.id, hostUserId: a.id, clientRequestId: randomUUID(), requestHash: 'a'.repeat(64), mode: 'room', title: 'synthetic projection room', status: 'waiting', version: 1, maxPlayers: 9, botCount: 0, rankingEligible: false, latestChatSequence: 0, createdAt: now, expiresAt: new Date(now.getTime() + 3600_000) }));
  for (const actor of [a, b]) await db.getRepository(E.RailRoomMember).insert({ roomId: room.id, userId: actor.id, role: 'participant', ready: false, active: true, lastSequence: 0, actionWindowCount: 0, joinedAt: now, leftAt: null });
  const railMessage = await rail.send(a.id, room.id, { clientMessageId: randomUUID(), channel: 'player', body: 'synthetic rail projection' });
  assert.equal(railMessage.author.title.key, 'farm_25'); safeView((await rail.list(b.id, room.id)).items);
  pass('real authenticated loopback WS group/direct delivery and PG history/Rail/public projections carry current server-owned titles only');
  phase = 'blocked title projection'; await db.getRepository(E.UserBlock).insert({ blockerId: b.id, blockedId: a.id, reason: null });
  assert.ok(!('title' in (await chat.messageForViewer(b.id, sentId)).author)); await denied(profiles.get(a.publicId, b.id), 'USER_NOT_FOUND'); await assert.rejects(direct.history(b.id, conversation.id, {}));
  await db.getRepository(E.UserBlock).delete({ blockerId: b.id, blockedId: a.id });
  await db.getRepository(E.User).update(a.id, { accountStatus: 'suspended' });
  assert.ok(!('title' in (await chat.messageForViewer(b.id, sentId)).author)); assert.ok(!('title' in (await rail.list(b.id, room.id)).items[0].author));
  await db.getRepository(E.User).update(a.id, { accountStatus: 'active' });
  process.env.FEATURE_COMMUNITY_PROGRESSION_ENABLED = 'false';
  assert.ok(!('title' in (await chat.messageForViewer(b.id, sentId)).author)); await denied(progression.refresh(a.id, {}), 'PROGRESSION_DISABLED'); await denied(membership.requireVip(db.manager, a.id, new Date()), 'PROGRESSION_DISABLED');
  process.env.FEATURE_COMMUNITY_PROGRESSION_ENABLED = 'true';
  pass('blocks/restrictions/feature switches suppress badges and reject writes without exposing full private honors or member expiry');
}
async function deletionAndNoRewards() {
  phase = 'actual account anonymization'; const person = await user('erase'); const session = await login(person); const now = new Date();
  await db.getRepository(E.DeskPlant).save(db.getRepository(E.DeskPlant).create({ userId: person.id, totalHarvests: 1 }));
  await db.getRepository(E.CommunityMembershipGrant).insert({ userId: person.id, campaignKey: 'launch_vip_202609', startsAt: now, expiresAt: new Date(now.getTime() + 720 * 3600_000), createdAt: now });
  await ensureTitle(person, 'farm_first');
  await lifecycle.requestDeletion(person.id, session.sessionId, randomUUID());
  await denied(membership.requireVip(db.manager, person.id, now), 'PROGRESSION_ACTIVE_ACCOUNT_REQUIRED');
  // Explicit due-time argument in an isolated lifecycle test, not a claim of real seven-day passage.
  assert.equal(await lifecycle.processDueDeletions(10, new Date(now.getTime() + 8 * 86400_000)), 1);
  assert.equal((await db.getRepository(E.User).findOneByOrFail({ id: person.id })).accountStatus, 'deleted');
  for (const entity of [E.CommunityMembershipGrant, E.CommunityAchievementUnlock, E.CommunityUserPresentation]) assert.equal(await db.getRepository(entity).countBy({ userId: person.id }), 0);
  assert.equal(await db.getRepository(E.WalletBalance).count(), 0); assert.equal(await db.getRepository(E.WalletLedger).count(), 0); assert.equal(await db.getRepository(E.RewardGrant).count(), 0);
  pass('actual soft-delete finalization erases membership/unlocks/presentation; all cosmetic and VIP operations create zero money or reward grants');
}
async function cleanup() {
  phase = 'exact synthetic cleanup';
  for (const client of clients) client.socket.terminate();
  if (gateway) await gateway.onModuleDestroy(); if (app) await app.close();
  await Promise.all(inFlight);
  if (!db?.isInitialized || !baseline || !primaryKeys) return;
  const current = await snapshot(); assert.deepEqual(Object.keys(current), Object.keys(baseline), 'Unknown schema means refuse cleanup');
  const extras = [];
  for (const [table, state] of Object.entries(current)) {
    const keys = primaryKeys[table]; const key = (row) => JSON.stringify(keys.map((column) => row[column]));
    const old = new Set(baseline[table].rows.map(key));
    for (const row of state.rows) if (!old.has(key(row))) extras.push({ table, keys, row });
  }
  const runner = db.createQueryRunner(); await runner.connect(); await runner.startTransaction();
  try {
    let pending = extras;
    for (let pass = 0; pending.length && pass < 40; pass++) {
      const retry = [];
      for (const item of pending) {
        await runner.query('SAVEPOINT exact_progression_cleanup');
        try {
          await runner.query(`DELETE FROM ${ident(item.table)} WHERE ${item.keys.map((column, index) => `${ident(column)}=$${index + 1}`).join(' AND ')}`, item.keys.map((column) => item.row[column]));
          await runner.query('RELEASE SAVEPOINT exact_progression_cleanup');
        } catch (error) { await runner.query('ROLLBACK TO SAVEPOINT exact_progression_cleanup'); if (error.code !== '23503') throw error; retry.push(item); }
      }
      assert.ok(retry.length < pending.length, 'Exact foreign-key cleanup must make progress'); pending = retry;
    }
    assert.equal(pending.length, 0);
    // Only these seeded mutex/room rows are intentionally mutated by the tested services.
    for (const table of ['chat_rooms', 'community_capacity_guards']) for (const row of baseline[table].rows) {
      const keys = primaryKeys[table]; const columns = Object.keys(row).filter((column) => !keys.includes(column));
      await runner.query(`UPDATE ${ident(table)} SET ${columns.map((column, index) => `${ident(column)}=$${index + 1}`).join(',')} WHERE ${keys.map((column, index) => `${ident(column)}=$${columns.length + index + 1}`).join(' AND ')}`, [...columns.map((column) => row[column]), ...keys.map((column) => row[column])]);
    }
    await runner.commitTransaction();
  } catch (error) { await runner.rollbackTransaction(); throw error; } finally { await runner.release(); }
  const restored = await snapshot();
  for (const table of Object.keys(baseline)) { assert.equal(restored[table].count, baseline[table].count, `Restored ${table} count`); assert.equal(restored[table].digest, baseline[table].digest, `Restored ${table} fingerprint`); }
  pass(`exact synthetic primary-key cleanup restores every ${Object.keys(baseline).length} table fingerprint`);
}
async function main() {
  let failedPhase;
  try { await setup(); const people = await giftAndMembership(); await concurrencyAndMetrics(people.a, people.b, people.sessionA); await projections(people.a, people.b, people.sessionA, people.sessionB); await deletionAndNoRewards(); }
  catch (error) { failedPhase = phase; throw error; }
  finally { try { await cleanup(); if (failedPhase) phase = failedPhase; } finally { if (db?.isInitialized) await db.destroy(); } }
  process.stdout.write(`PROGRESSION_REHEARSAL_OK ${checks.length} scenarios\n`);
}
main().catch((error) => {
  // Never print stack, SQL, assertion values, credentials or private synthetic tokens.
  const rawCode = error?.code ?? error?.response?.code;
  const code = typeof rawCode === 'string' && /^[A-Z0-9_]{1,64}$/.test(rawCode) ? rawCode : 'ASSERTION_OR_APPLICATION_FAILURE';
  process.stderr.write(`PROGRESSION_REHEARSAL_FAILED phase=${phase} code=${code}\n`); process.exitCode = 1;
});
