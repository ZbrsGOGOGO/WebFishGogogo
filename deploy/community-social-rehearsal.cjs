#!/usr/bin/env node
'use strict';

/**
 * Isolated system acceptance: real PostgreSQL + Redis pub/sub + two Nest HTTP
 * and WebSocket instances using the candidate's actual controllers/guards/
 * services. Only synthetic users are created; no production snapshot is read.
 * Account registration/login, browser rendering, TLS/proxy and upstream news
 * providers are deliberately left to the separate full-API acceptance suite.
 */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const path = require('node:path');

assert.equal(process.env.SOCIAL_REHEARSAL_CONFIRMATION, 'ISOLATED_SOCIAL_ONLY:20260908');
assert.equal(process.env.DB_DATABASE, 'community_social_rehearsal');
assert.match(process.env.DB_HOST || '', /^rail-rehearsal-pg-[a-z0-9]{6,16}$/);
assert.equal(process.env.DB_PORT || '5432', '5432');
assert.ok(process.env.DB_USERNAME && process.env.DB_PASSWORD, 'Dedicated isolated PG credentials required');
assert.ok(!process.env.DATABASE_URL, 'Connection-string overrides are forbidden');
assert.ok(!process.env.DB_SCHEMA || process.env.DB_SCHEMA === 'public');
assert.notEqual(process.env.NODE_ENV, 'production');
assert.notEqual(process.env.LOCAL_DEV, 'true', 'pg-mem and local moderation/bus adapters are forbidden');
const redisUrl = new URL(process.env.REDIS_URL || '');
assert.equal(redisUrl.protocol, 'redis:');
assert.match(redisUrl.hostname, /^full-audit-redis-[a-z0-9]{6,16}$/);
assert.equal(redisUrl.port || '6379', '6379');
assert.equal(redisUrl.pathname, '/3');
assert.ok(!redisUrl.username && !redisUrl.password && !redisUrl.search && !redisUrl.hash);
process.env.NODE_ENV = 'test';
process.env.LOCAL_DEV = 'false';
process.env.DB_LOGGING = 'false';
process.env.CHAT_LOCAL_MEMORY_BUS_ENABLED = 'false';
process.env.CHAT_LOCAL_MODERATION_ENABLED = 'false';
process.env.CHAT_BUILTIN_MODERATION_ENABLED = 'true';
process.env.FEATURE_COMMUNITY_CHAT_ENABLED = 'true';
process.env.FEATURE_CHAT_WRITES_ENABLED = 'true';
process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true';
process.env.FEATURE_SOCIAL_VERIFICATION_ENABLED = 'false';
process.env.PUBLIC_SITE_ORIGIN = 'http://social-rehearsal.invalid';
process.env.CHAT_LOCAL_ORIGIN_RELAXED = 'false';

const appRoot = process.env.SOCIAL_REHEARSAL_APP_ROOT || '/app';
const fromApp = createRequire(path.join(appRoot, 'packages/backend/package.json'));
fromApp('reflect-metadata');
const { DataSource, In } = fromApp('typeorm');
const { Module } = fromApp('@nestjs/common');
const { NestFactory } = fromApp('@nestjs/core');
const { JwtService } = fromApp('@nestjs/jwt');
const { createClient } = fromApp('redis');
const { WebSocket } = fromApp('ws');
const dist = path.join(appRoot, 'packages/backend/dist');
const load = (file) => fromApp(path.join(dist, file));
const E = load('database/entities');
const { AppDataSource: db } = load('database/data-source');
const { JwtAuthGuard } = load('modules/auth/jwt-auth.guard');
const { ChatService } = load('modules/chat/chat.service');
const { ChatController } = load('modules/chat/chat.controller');
const { DirectMessageService } = load('modules/chat/direct-message.service');
const { DirectMessageController } = load('modules/chat/direct-message.controller');
const { ChatWebSocketGateway } = load('modules/chat/chat-websocket.gateway');
const { ChatRealtimeService } = load('modules/chat/chat-realtime.service');
const { ChatModerationService } = load('modules/chat/chat-moderation.service');
const { RelationshipPolicyService } = load('modules/community/relationship-policy.service');
const { RelationshipService } = load('modules/community/relationship.service');
const { RelationshipController } = load('modules/community/relationship.controller');
const { NotificationService } = load('modules/community/notification.service');
const { NotificationController } = load('modules/community/notification.controller');
const { migrations } = load('database/migrations');
assert.ok(migrations.some((migration) => Number(migration.name.slice(-13)) === 1700000000029));
assert.ok(migrations.every((migration) => Number(migration.name.slice(-13)) <= 1700000000029));
const jwt = new JwtService({ secret: `synthetic-social-rehearsal-${randomUUID()}` });
const users = [], stacks = [], clients = [], checks = [], ownedConnectionIds = new Set();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let baseline, originalRooms, redis;
const businessTables = ['users', 'chat_messages', 'chat_socket_tickets', 'chat_direct_conversations',
  'chat_direct_messages', 'chat_direct_conversation_members', 'chat_direct_message_reports',
  'friendships', 'friend_requests', 'user_blocks', 'community_notifications', 'community_command_receipts'];
const seededTables = new Set(['migrations', 'tools', 'tool_professions', 'item_definitions',
  'crop_definitions', 'task_definitions', 'chat_rooms', 'community_capacity_guards']);
function pass(name, expected) { checks.push({ name, expected, actual: 'passed' }); process.stdout.write(`PASS ${name}: ${expected}\n`); }
async function fingerprints() {
  const names = await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
  const result = {};
  for (const { tablename } of names) {
    assert.match(tablename, /^[a-z0-9_]+$/);
    [result[tablename]] = await db.query(`SELECT count(*)::integer AS count, md5(COALESCE(string_agg(to_jsonb(t)::text, E'\\n' ORDER BY to_jsonb(t)::text), '')) AS digest FROM "${tablename}" t`);
  }
  return result;
}
async function request(stack, session, method, route, body, expectedStatus = 200, extraHeaders = {}) {
  const response = await fetch(`${stack.base}/api/v1${route}`, {
    method, redirect: 'error', signal: AbortSignal.timeout(8_000),
    headers: { ...(session ? { authorization: `Bearer ${session.token}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...extraHeaders },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  const value = text ? JSON.parse(text) : null;
  assert.equal(response.status, expectedStatus, `${method} ${route}: HTTP ${response.status}, code=${value?.code || ''}`);
  return value;
}
function safeView(value) {
  const serialized = JSON.stringify(value);
  for (const user of users) {
    assert.ok(!serialized.includes(user.email), 'Email must not be projected');
    assert.ok(!serialized.includes(user.id), 'Internal user ID must not be projected');
  }
  assert.ok(!/"(?:passwordHash|ticketHash|requestHash|sessionId|moderationReference)"\s*:/.test(serialized));
}
async function user(label) {
  assert.ok(users.length < 8);
  const email = `social-rehearsal.${randomUUID()}@users.invalid`;
  const value = await db.getRepository(E.User).save(db.getRepository(E.User).create({
    email, emailNormalized: email, displayName: `social-rehearsal ${label}`,
    passwordHash: 'synthetic-only-not-a-login-password', publicId: randomUUID(),
    accountStatus: 'active', communityRole: 'user', socialVerificationStatus: 'unverified',
    emailVerifiedAt: new Date(), passwordChangedAt: new Date(), onboardingCompleted: true,
  }));
  users.push(value);
  return value;
}
async function session(person) {
  const row = await db.getRepository(E.AuthSession).save(db.getRepository(E.AuthSession).create({
    userId: person.id, userAgent: 'isolated-social-system-rehearsal', lastSeenAt: new Date(),
    expiresAt: new Date(Date.now() + 3_600_000), revokedAt: null, revokeReason: null,
  }));
  return { ...row, token: jwt.sign({ sub: person.id, sid: row.id, typ: 'access' }, { expiresIn: '1h' }) };
}
async function startStack() {
  const realtime = new ChatRealtimeService();
  await realtime.onModuleInit();
  assert.equal(realtime.isAvailable(), true, 'Real Redis must be connected');
  const moderation = new ChatModerationService();
  const chat = new ChatService(db, realtime, moderation);
  const direct = new DirectMessageService(db, realtime, moderation);
  const notification = new NotificationService(db);
  const relationships = new RelationshipService(db, new RelationshipPolicyService(), notification, { now: () => new Date() });
  class SocialSystemHarness {}
  Module({ controllers: [ChatController, DirectMessageController, RelationshipController, NotificationController],
    providers: [{ provide: DataSource, useValue: db }, { provide: JwtService, useValue: jwt }, JwtAuthGuard,
      { provide: ChatService, useValue: chat }, { provide: DirectMessageService, useValue: direct },
      { provide: RelationshipService, useValue: relationships }, { provide: NotificationService, useValue: notification }],
  })(SocialSystemHarness);
  const app = await NestFactory.create(SocialSystemHarness, { logger: false, abortOnError: false });
  app.setGlobalPrefix('api');
  const gateway = new ChatWebSocketGateway(chat, realtime, direct, db);
  gateway.attach(app.getHttpServer());
  const stack = { app, gateway, realtime, chat, direct, notification, relationships };
  stacks.push(stack);
  await app.listen(0, '127.0.0.1');
  stack.base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
  return stack;
}
function collector(socket) {
  const events = [], waiters = new Set();
  socket.on('message', (data) => { events.push({ value: JSON.parse(data.toString()), consumed: false }); for (const fn of waiters) fn(); });
  return {
    events,
    next(type, predicate = () => true) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { waiters.delete(check); reject(new Error(`WebSocket deadline: ${type}`)); }, 5_000);
        function check() {
          const hit = events.find((item) => !item.consumed && item.value.type === type && predicate(item.value));
          if (!hit) return;
          hit.consumed = true; clearTimeout(timer); waiters.delete(check); resolve(hit.value);
        }
        waiters.add(check); check();
      });
    },
  };
}
async function socketClient(stack, login) {
  const ticket = await request(stack, login, 'POST', '/chat/socket-tickets', {}, 201);
  const socket = new WebSocket(`${stack.base.replace('http:', 'ws:')}/ws/chat`, { origin: process.env.PUBLIC_SITE_ORIGIN });
  const client = { socket, ...collector(socket), login, stack, closeCode: null };
  socket.on('close', (code) => { client.closeCode = code; });
  clients.push(client);
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  socket.send(JSON.stringify({ type: 'chat.authenticate', protocolVersion: 1, requestId: randomUUID(), ticket: ticket.ticket }));
  await client.next('chat.authenticated');
  for (const state of stack.gateway.states.values()) ownedConnectionIds.add(state.id);
  return client;
}
async function frame(client, type, input, expected = 'chat.ack') {
  const requestId = randomUUID();
  client.socket.send(JSON.stringify({ type, protocolVersion: 1, requestId, ...input }));
  return client.next(expected, (event) => event.requestId === requestId);
}
async function subscribe(client) {
  await frame(client, 'chat.subscribe', { roomSlug: 'general', afterSequence: 0 });
  await client.next('chat.ready');
}
async function waitForDatabase(predicate, label) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await pause(20);
  }
  throw new Error(`Real PostgreSQL lock deadline: ${label}`);
}
async function queuedSendRestriction(stack, sender) {
  const holder = db.createQueryRunner();
  let sending, restricting;
  const clientMessageId = randomUUID();
  const outcomes = {};
  await holder.connect();
  await holder.startTransaction();
  try {
    const [{ pid }] = await holder.query('SELECT pg_backend_pid() AS pid');
    await holder.query("SELECT slug FROM chat_rooms WHERE slug='general' FOR UPDATE");
    sending = stack.chat.send(sender.id, { clientMessageId, roomSlug: 'general', body: 'Synthetic queued send versus account restriction' })
      .then((value) => { outcomes.message = value; }, (error) => { outcomes.sendError = error; });
    await waitForDatabase(async () => Number((await db.query(
      'SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND $1::integer=ANY(pg_blocking_pids(pid))', [pid],
    ))[0].count) > 0, 'sender is truly waiting behind the held room row');
    restricting = db.getRepository(E.User).update(sender.id, { accountStatus: 'suspended' })
      .then(() => { outcomes.restricted = true; }, (error) => { outcomes.restrictError = error; });
    await waitForDatabase(async () => {
      assert.ok(!outcomes.restricted, 'Account restriction must not overtake the queued send');
      return Number((await db.query(`SELECT count(*) FROM pg_stat_activity
        WHERE datname=current_database() AND wait_event_type='Lock'
        AND query LIKE '%UPDATE%"users"%' AND query LIKE '%account_status%'`))[0].count) > 0;
    }, 'account restriction is truly waiting behind the sender user lock');
    await holder.commitTransaction();
    await Promise.all([sending, restricting]);
    if (outcomes.sendError) throw outcomes.sendError;
    if (outcomes.restrictError) throw outcomes.restrictError;
    assert.ok(outcomes.message && outcomes.restricted);
    assert.equal((await db.getRepository(E.User).findOneByOrFail({ id: sender.id })).accountStatus, 'suspended');
    await assert.rejects(stack.chat.send(sender.id, { clientMessageId: randomUUID(), roomSlug: 'general', body: 'Must not send after committed restriction' }),
      (error) => error.response?.code === 'CHAT_ACCOUNT_RESTRICTED');
    pass('queued send versus restriction', 'pg_blocking_pids confirms real room wait and user-row wait; send commits before suspension; later sends are denied');
  } finally {
    if (holder.isTransactionActive) await holder.rollbackTransaction();
    await holder.release();
    await Promise.allSettled([sending, restricting].filter(Boolean));
    await db.getRepository(E.User).update(sender.id, { accountStatus: 'active' });
  }
}
async function setup() {
  await db.initialize();
  assert.equal((await db.query('SELECT current_database() AS name'))[0].name, 'community_social_rehearsal');
  const initialTables = new Set((await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).map((row) => row.tablename));
  for (const table of initialTables) {
    assert.match(table, /^[a-z0-9_]+$/);
    if (!seededTables.has(table)) assert.equal(Number((await db.query(`SELECT count(*) FROM "${table}"`))[0].count), 0, `Refuse existing ${table}`);
  }
  await db.runMigrations({ transaction: 'all' });
  assert.equal(Number((await db.query('SELECT max(timestamp) AS timestamp FROM migrations'))[0].timestamp), 1700000000029);
  baseline = await fingerprints();
  for (const table of businessTables) assert.equal(baseline[table].count, 0, `Refuse existing ${table}`);
  originalRooms = (await db.query('SELECT row_to_json(t) AS value FROM chat_rooms t')).map((row) => row.value);
  redis = createClient({ url: redisUrl.toString(), socket: { reconnectStrategy: false } });
  await redis.connect();
  assert.equal(await redis.dbSize(), 0, 'Redis DB 3 must start empty');
  await db.getRepository(E.ChatRoom).update({ slug: 'general' }, { slowModeSeconds: 0 });
  pass('isolation', 'empty-business PostgreSQL migrated to 0029; real isolated Redis DB 3; no production data');
}
async function exercise() {
  const [first, second] = [await startStack(), await startStack()];
  const [author, viewer, outsider] = [await user('author'), await user('viewer'), await user('outsider')];
  const [authorLogin, viewerLogin, outsiderLogin] = [await session(author), await session(viewer), await session(outsider)];
  for (const route of ['/chat/rooms', '/friends', '/notifications', '/chat/direct-conversations']) await request(first, null, 'GET', route, undefined, 401);
  safeView(await request(first, viewerLogin, 'GET', '/chat/rooms'));
  pass('HTTP auth boundary', 'unauthenticated chat/friends/notifications/DM return 401; active ordinary account can read rooms');
  await queuedSendRestriction(first, author);

  const key = randomUUID();
  const pending = await request(first, authorLogin, 'POST', '/friend-requests', { publicId: viewer.publicId }, 201, { 'idempotency-key': key });
  const replay = await request(second, authorLogin, 'POST', '/friend-requests', { publicId: viewer.publicId }, 201, { 'idempotency-key': key });
  assert.deepEqual(pending, replay);
  assert.equal((await request(second, outsiderLogin, 'POST', `/friend-requests/${pending.requestId}/accept`, {}, 404, { 'idempotency-key': randomUUID() })).code, 'FRIEND_REQUEST_NOT_FOUND');
  await request(second, viewerLogin, 'POST', `/friend-requests/${pending.requestId}/accept`, {}, 201, { 'idempotency-key': randomUUID() });
  const friends = await request(first, viewerLogin, 'GET', '/friends'); safeView(friends); assert.equal(friends.total, 1);
  pass('friend requests', 'idempotent cross-instance request; wrong recipient rejected; intended recipient creates one friendship');

  const conversation = await request(first, authorLogin, 'POST', '/chat/direct-conversations', { friendPublicId: viewer.publicId }, 201);
  safeView(conversation);
  const duplicate = await request(second, viewerLogin, 'POST', '/chat/direct-conversations', { friendPublicId: author.publicId }, 201);
  assert.equal(duplicate.id, conversation.id);
  const historyPath = `/chat/direct-conversations/${conversation.id}/messages`;
  assert.equal((await request(first, outsiderLogin, 'GET', historyPath, undefined, 404)).code, 'CHAT_DIRECT_CONVERSATION_NOT_FOUND');
  await request(first, outsiderLogin, 'POST', `/chat/direct-conversations/${conversation.id}/read`, { throughSequence: 0 }, 404);
  pass('private conversation authorization', 'canonical friend pair has one room; unrelated account cannot read or mutate read cursor');

  const authorClient = await socketClient(first, authorLogin);
  const current = await socketClient(second, viewerLogin);
  const outsiderClient = await socketClient(second, outsiderLogin);
  await subscribe(authorClient); await subscribe(current);
  const sent = await frame(authorClient, 'chat.direct.send', { conversationId: conversation.id, clientMessageId: randomUUID(), body: 'Synthetic cross-instance direct message' });
  const delivered = await current.next('chat.direct.message.created', (event) => event.message.id === sent.messageId);
  safeView(delivered.message);
  await pause(60);
  assert.ok(!outsiderClient.events.some((event) => event.value.type.startsWith('chat.direct.message.')));
  pass('Redis cross-instance routing', 'real WebSocket send on API A arrives on API B for recipient but never unrelated account');

  for (const condition of ['revoked', 'expired']) {
    for (const kind of ['room', 'direct-message', 'direct-read']) {
      const staleLogin = await session(viewer);
      const stale = await socketClient(second, staleLogin);
      if (kind === 'room') await subscribe(stale);
      await db.getRepository(E.AuthSession).update(staleLogin.id, condition === 'revoked'
        ? { revokedAt: new Date(), revokeReason: 'device_revoked' }
        : { expiresAt: new Date(Date.now() - 1_000) });
      let type, match;
      if (kind === 'room') {
        const ack = await frame(authorClient, 'chat.send', { roomSlug: 'general', clientMessageId: randomUUID(), body: `Synthetic ${condition} room check` });
        type = 'chat.message.created'; match = (event) => event.message.id === ack.messageId;
      } else if (kind === 'direct-message') {
        const ack = await frame(authorClient, 'chat.direct.send', { conversationId: conversation.id, clientMessageId: randomUUID(), body: `Synthetic ${condition} direct check` });
        type = 'chat.direct.message.created'; match = (event) => event.message.id === ack.messageId;
      } else {
        const latest = (await db.getRepository(E.DirectConversation).findOneByOrFail({ id: conversation.id })).latestSequence;
        await frame(authorClient, 'chat.direct.read', { conversationId: conversation.id, throughSequence: latest });
        type = 'chat.direct.read.updated'; match = (event) => event.conversationId === conversation.id;
      }
      await current.next(type, match);
      assert.equal((await stale.next('chat.error')).code, 'INVALID_SESSION');
      for (let spin = 0; spin < 50 && stale.closeCode === null; spin += 1) await pause(10);
      assert.equal(stale.closeCode, 4401);
      assert.ok(!stale.events.some((event) => event.value.type === type));
      await request(first, staleLogin, 'GET', '/chat/rooms', undefined, 401);
      pass(`idle ${condition} ${kind}`, 'invalid session receives no broadcast and closes 4401 before heartbeat; other live session still receives; HTTP token also denied');
    }
  }

  const clientMessageId = randomUUID();
  const sendInput = { conversationId: conversation.id, clientMessageId, body: 'Synthetic exact retry payload' };
  const original = await frame(authorClient, 'chat.direct.send', sendInput);
  const replaySend = await frame(authorClient, 'chat.direct.send', sendInput);
  assert.equal(replaySend.messageId, original.messageId); assert.equal(replaySend.sequence, original.sequence);
  assert.equal((await frame(authorClient, 'chat.direct.send', { ...sendInput, body: 'Different payload' }, 'chat.error')).code, 'CHAT_IDEMPOTENCY_CONFLICT');
  assert.equal((await frame(current, 'chat.direct.withdraw', { conversationId: conversation.id, messageId: original.messageId }, 'chat.error')).code, 'CHAT_WITHDRAW_FORBIDDEN');
  await frame(authorClient, 'chat.direct.withdraw', { conversationId: conversation.id, messageId: original.messageId });
  const withdrawn = await current.next('chat.direct.message.updated', (event) => event.message.id === original.messageId);
  assert.equal(withdrawn.message.body, null); assert.equal(withdrawn.message.visibility, 'withdrawn_placeholder');
  pass('DM retry and withdrawal', 'same payload has one sequence; changed retry conflicts; other author cannot withdraw; withdrawal replaces content across Redis');

  for (let index = 0; index < 67; index += 1) await first.direct.send(author.id, { conversationId: conversation.id, clientMessageId: randomUUID(), body: `Synthetic history ${index}` });
  const all = (await db.getRepository(E.DirectMessage).find({ where: { conversationId: conversation.id }, order: { sequence: 'ASC' } }));
  const newest = await request(second, viewerLogin, 'GET', historyPath);
  assert.equal(newest.items.length, 50); safeView(newest);
  const older = await request(second, viewerLogin, 'GET', `${historyPath}?beforeSequence=${newest.nextBeforeSequence}`);
  assert.equal(new Set([...older.items, ...newest.items].map((item) => item.id)).size, all.length);
  const forward = await request(second, viewerLogin, 'GET', `${historyPath}?afterSequence=0&limit=20`);
  assert.deepEqual(forward.items.map((item) => item.sequence), all.slice(0, 20).map((item) => item.sequence));
  await request(second, viewerLogin, 'GET', `${historyPath}?afterSequence=0&beforeSequence=10`, undefined, 400);
  await request(second, viewerLogin, 'GET', `${historyPath}?limit=201`, undefined, 400);
  await request(second, viewerLogin, 'POST', `/chat/direct-conversations/${conversation.id}/read`, { throughSequence: all.at(-1).sequence }, 200);
  assert.equal((await request(second, viewerLogin, 'GET', '/chat/direct-conversations')).totalUnread, 0);
  pass('DM reconnect/history/read', 'HTTP newest and older pages have no duplicates or omissions; forward cursor ordered; invalid cursors/limits rejected; read count reaches zero');

  await request(first, authorLogin, 'DELETE', `/friends/${viewer.publicId}`, undefined, 204, { 'idempotency-key': randomUUID() });
  assert.ok((await request(second, viewerLogin, 'GET', historyPath)).items.length > 0);
  assert.equal((await request(second, viewerLogin, 'GET', '/chat/direct-conversations')).items[0].canSend, false);
  assert.equal((await frame(authorClient, 'chat.direct.send', { conversationId: conversation.id, clientMessageId: randomUUID(), body: 'Must not send after unfriend' }, 'chat.error')).code, 'CHAT_DIRECT_FRIEND_REQUIRED');
  await request(second, viewerLogin, 'POST', '/blocks', { publicId: author.publicId }, 201, { 'idempotency-key': randomUUID() });
  for (const login of [authorLogin, viewerLogin]) {
    await request(first, login, 'GET', historyPath, undefined, 404);
    assert.equal((await request(first, login, 'GET', '/chat/direct-conversations')).items.length, 0);
  }
  await request(second, viewerLogin, 'DELETE', `/blocks/${author.publicId}`, undefined, 204, { 'idempotency-key': randomUUID() });
  assert.equal((await request(second, viewerLogin, 'GET', '/friends')).total, 0);
  pass('unfriend/block/unblock', 'unfriend preserves private history but disables sending; either-side block hides entire DM; unblock does not recreate friendship');

  await request(first, viewerLogin, 'PUT', '/notifications/read-all', undefined, 204);
  const notification = first.notification;
  for (const category of [undefined, 'farm']) {
    const now = Date.now();
    const make = (key, extra = {}) => notification.create(db.manager, {
      userId: viewer.id, category: 'farm', eventType: 'farm.ready', title: `social-rehearsal ${key}`,
      summary: 'Synthetic scheduled maturity reminder', dedupeKey: randomUUID(), availableAt: new Date(now - 60_000), ...extra,
    });
    const deliveredNotice = await make('delivered');
    const future = await make('future', { availableAt: new Date(now + 3_600_000) });
    const expired = await make('expired', { expiresAt: new Date(now - 1_000) });
    const blocked = await make('blocked', { actorUserId: outsider.id });
    await db.getRepository(E.UserBlock).save({ blockerId: outsider.id, blockedId: viewer.id, reason: null });
    await request(first, outsiderLogin, 'PUT', `/notifications/${deliveredNotice.id}/read`, undefined, 404);
    await request(second, viewerLogin, 'PUT', category ? '/notifications/read-by-category' : '/notifications/read-all', category ? { category } : undefined, 204);
    assert.ok((await db.getRepository(E.CommunityNotification).findOneByOrFail({ id: deliveredNotice.id })).readAt);
    for (const row of [future, expired, blocked]) assert.equal((await db.getRepository(E.CommunityNotification).findOneByOrFail({ id: row.id })).readAt, null);
    await db.getRepository(E.CommunityNotification).update(future.id, { availableAt: new Date(now - 1_000) });
    assert.equal((await request(second, viewerLogin, 'GET', '/notifications')).unreadCount, 1);
    await request(second, viewerLogin, 'PUT', `/notifications/${future.id}/read`, undefined, 204);
    await db.getRepository(E.UserBlock).delete({ blockerId: outsider.id, blockedId: viewer.id });
    await db.getRepository(E.CommunityNotification).delete(blocked.id);
    pass(`scheduled notification ${category || 'all'}`, 'actual HTTP bulk-read affects only delivered visible notices; future reminder remains unread on arrival; foreign owner cannot mark it read');
  }
}
async function cleanup() {
  for (const client of clients) client.socket.terminate();
  for (const stack of stacks) {
    for (const state of stack.gateway.states.values()) ownedConnectionIds.add(state.id);
    await stack.gateway.onModuleDestroy();
    await stack.app.close();
    await stack.realtime.onModuleDestroy();
  }
  if (redis?.isOpen) {
    await pause(50);
    for (const slug of ['general', 'developer', 'product', 'qa', 'sales', 'hr']) {
      const key = `zbrs:community:chat:presence:${slug}`;
      const members = await redis.zRange(key, 0, -1);
      assert.ok(members.every((id) => ownedConnectionIds.has(id)), 'Refuse deleting unowned Redis presence');
      if (members.length) await redis.zRem(key, members);
    }
    assert.equal(await redis.dbSize(), 0, 'Redis synthetic state must return to empty baseline');
    await redis.quit();
  }
  if (db.isInitialized && baseline) {
    const ids = users.map((person) => person.id);
    if (ids.length) {
      assert.ok(users.every((person) => person.email.startsWith('social-rehearsal.') && person.email.endsWith('@users.invalid')));
      await db.transaction(async (manager) => {
        const conversations = await manager.getRepository(E.DirectConversation).find({ where: [{ userLowId: In(ids) }, { userHighId: In(ids) }] });
        assert.ok(conversations.every((row) => ids.includes(row.userLowId) && ids.includes(row.userHighId)), 'Refuse unowned conversation cleanup');
        if (conversations.length) await manager.getRepository(E.DirectConversation).delete({ id: In(conversations.map((row) => row.id)) });
        await manager.getRepository(E.ChatMessage).delete({ authorId: In(ids) });
        await manager.getRepository(E.User).delete({ id: In(ids) });
        for (const room of originalRooms) await manager.query(
          'UPDATE chat_rooms SET latest_sequence=$2, slow_mode_seconds=$3, updated_at=$4 WHERE slug=$1',
          [room.slug, room.latest_sequence, room.slow_mode_seconds, room.updated_at],
        );
      });
    }
    assert.deepEqual(await fingerprints(), baseline, 'Every public table row count and full-row fingerprint must match baseline');
    pass('precise cleanup', 'only synthetic users and their chat/relationship/notification rows removed; seeded room state restored; all-table fingerprint and Redis DB restored');
  }
  if (db.isInitialized) await db.destroy();
}
(async () => {
  let failure;
  try { await setup(); await exercise(); } catch (error) { failure = error; }
  try { await cleanup(); } catch (error) { failure ||= error; }
  if (failure) { process.stderr.write(`FAIL social rehearsal: ${failure.message}\n`); process.exitCode = 1; }
  else process.stdout.write(`${JSON.stringify({ result: 'passed', checks, usersCreated: users.length, productionDataRead: false })}\n`);
})().catch((error) => { process.stderr.write(`FAIL ${error.message}\n`); process.exitCode = 1; });
