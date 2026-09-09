#!/usr/bin/env node
'use strict';

/** Synthetic-only candidate acceptance: real PostgreSQL row locks and real
 * Nest HTTP/controllers/guards/multipart, but no provider, mail or worker runs.
 * Caller owns the disposable internal Docker network and database. */
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { createRequire } = require('node:module');
const path = require('node:path');
assert.equal(process.env.ACCOUNT_REHEARSAL_CONFIRMATION, 'ISOLATED_ACCOUNT_ONLY:20260908');
assert.equal(process.env.DB_HOST, 'growth-pg-btpam6', 'An explicitly reviewed isolated host is required');
assert.equal(process.env.DB_DATABASE, 'community_account_rehearsal');
assert.equal(process.env.DB_PORT || '5432', '5432');
assert.ok(process.env.DB_USERNAME && process.env.DB_PASSWORD, 'Dedicated isolated credentials required');
assert.ok(!process.env.DATABASE_URL && !process.env.AUTH_EMAIL_WEBHOOK_URL && !process.env.SMTP_HOST, 'No production connection/provider configuration allowed');
assert.notEqual(process.env.NODE_ENV, 'production');
Object.assign(process.env, {
  NODE_ENV: 'test', LOCAL_DEV: 'false', AUTH_EMAIL_OUTBOX_PUMP_ENABLED: 'false',
  FEATURE_REGISTRATION_ENABLED: 'true', FEATURE_PASSWORD_RESET_ENABLED: 'true',
  FEATURE_ACCOUNT_DELETION_ENABLED: 'true', FEATURE_DEVELOPMENT_WORKSPACE_ENABLED: 'true',
  COMMUNITY_MAX_ACTIVE_USERS: '100', AUTH_REFRESH_COOKIE_NAME: 'account_rehearsal_refresh',
  JWT_SECRET: 'account-rehearsal-jwt-never-production-at-least-32-characters',
  AUTH_TOKEN_PEPPER: 'account-rehearsal-pepper-never-production-at-least-32-characters',
  AUTH_EMAIL_OUTBOX_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  AUTH_EMAIL_OUTBOX_ENCRYPTION_KEY_ID: 'account-rehearsal-ephemeral',
});
const appRoot = process.env.ACCOUNT_REHEARSAL_APP_ROOT || '/app';
const fromApp = createRequire(path.join(appRoot, 'packages/backend/package.json'));
fromApp('reflect-metadata');
const { DataSource } = fromApp('typeorm');
const { JwtService } = fromApp('@nestjs/jwt');
const { NestFactory } = fromApp('@nestjs/core');
const { Module } = fromApp('@nestjs/common');
const dist = process.env.ACCOUNT_REHEARSAL_BACKEND_DIST || path.join(appRoot, 'packages/backend/dist');
const load = (file) => fromApp(path.join(dist, file));
const E = load('database/entities');
const { migrations } = load('database/migrations');
assert.equal(Math.max(...migrations.map((m) => Number(m.name.slice(-13)))), 1700000000032, 'Review rehearsal before future migrations');
const { AuthService } = load('modules/auth/auth.service');
const { AuthController } = load('modules/auth/auth.controller');
const { JwtAuthGuard } = load('modules/auth/jwt-auth.guard');
const { AccountAdminGuard } = load('modules/auth/account-admin.guard');
const { BetaAccessService } = load('modules/auth/beta-access.service');
const { AuthRateLimitService } = load('modules/auth/auth-rate-limit.service');
const { CommunityCapacityService } = load('modules/auth/community-capacity.service');
const { AuthEmailOutboxService } = load('modules/auth/auth-email-outbox.service');
const { PasswordResetService } = load('modules/auth/password-reset.service');
const { AccountLifecycleService } = load('modules/auth/account-lifecycle.service');
const { AuthSensitiveDataService } = load('modules/auth/auth-sensitive-data.service');
const { DevelopmentService } = load('modules/development/development.service');
const { DevelopmentController, DevelopmentAccessController } = load('modules/development/development.controller');
const { DevelopmentAccessGuard } = load('modules/development/development-access.guard');
const { DevelopmentAttachmentAuthorGuard } = load('modules/development/development-attachment-author.guard');
const { NotificationService } = load('modules/community/notification.service');
const { CommunityHealthController } = load('community-health.controller');

const PASSWORD = 'Synthetic-Office#2026';
const NEXT_PASSWORD = 'Synthetic-Changed#2026';
const NativeDate = Date;
let clock = NativeDate.now();
class TestDate extends NativeDate { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
const checks = [];
let db, app, baseUrl, baseline, primaryKeys, auth, development, reset, lifecycle, outbox, jwt;
let capturedResetToken;
const check = (name) => { checks.push(name); process.stdout.write(`PASS ${name}\n`); };
const codeOf = (error) => error?.response?.code;
const denied = (promise, code) => assert.rejects(promise, (error) => codeOf(error) === code, code);
const context = (user) => ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) });
const registration = (username) => ({ username, password: PASSWORD, consents: {
  termsVersion: '2026-08-22', privacyVersion: '2026-08-22',
  communityGuidelinesVersion: '2026-08-22', adultDeclarationVersion: '2026-08-22',
} });
const proposal = () => ({ clientRequestId: randomUUID(), title: 'synthetic account acceptance', category: 'feature', description: 'Synthetic-only proposal with explicit reproducible acceptance criteria.' });
const ident = (value) => { assert.match(value, /^[a-z0-9_]+$/); return `"${value}"`; };

async function snapshot() {
  const tables = await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
  const result = {};
  for (const { tablename } of tables) {
    const [fingerprint] = await db.query(`SELECT count(*)::integer AS count, md5(COALESCE(string_agg(to_jsonb(t)::text, E'\\n' ORDER BY to_jsonb(t)::text), '')) AS digest FROM ${ident(tablename)} t`);
    // PostgreSQL JSON preserves timestamp microseconds; JS Date does not.
    const rows = (await db.query(`SELECT row_to_json(t) AS row FROM ${ident(tablename)} t`)).map((entry) => entry.row);
    result[tablename] = { ...fingerprint, rows };
  }
  return result;
}
async function setup() {
  db = await new DataSource({ type: 'postgres', host: process.env.DB_HOST, port: 5432,
    username: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE,
    entities: E.entities, migrations, synchronize: false, logging: false,
    extra: { max: 16, application_name: 'synthetic-account-rehearsal', options: '-c statement_timeout=15000 -c lock_timeout=10000 -c idle_in_transaction_session_timeout=20000' },
  }).initialize();
  assert.equal((await db.query('SELECT current_database() AS name'))[0].name, 'community_account_rehearsal');
  const before = await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
  if (before.some((row) => row.tablename === 'users')) assert.equal(await db.getRepository(E.User).count(), 0, 'Refuse existing users');
  const seeded = new Set(['migrations', 'tools', 'tool_professions', 'item_definitions', 'crop_definitions', 'task_definitions', 'chat_rooms', 'community_capacity_guards']);
  for (const { tablename } of before) {
    if (!seeded.has(tablename)) assert.equal(Number((await db.query(`SELECT count(*) FROM ${ident(tablename)}`))[0].count), 0, `Refuse existing business rows in ${tablename}`);
  }
  await db.runMigrations({ transaction: 'all' });
  assert.deepEqual(await db.runMigrations({ transaction: 'all' }), []);
  baseline = await snapshot();
  primaryKeys = {};
  for (const table of Object.keys(baseline)) {
    const rows = await db.query(`SELECT a.attname AS name FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey) WHERE i.indrelid=$1::regclass AND i.indisprimary ORDER BY a.attnum`, [table]);
    primaryKeys[table] = rows.map((row) => row.name);
    assert.ok(primaryKeys[table].length, `Missing cleanup primary key for ${table}`);
  }
  global.Date = TestDate;
  const neverSend = () => { throw new Error('MAIL_SENDING_FORBIDDEN_IN_REHEARSAL'); };
  outbox = new AuthEmailOutboxService(db, { assertRegistrationDeliveryAvailable() {}, assertPasswordResetDeliveryAvailable() {}, sendRegistrationCode: neverSend, sendPasswordReset: neverSend });
  const enqueue = outbox.enqueuePasswordReset.bind(outbox);
  outbox.enqueuePasswordReset = async (manager, command, now) => { capturedResetToken = command.token; return enqueue(manager, command, now); };
  const limiter = new AuthRateLimitService(db);
  jwt = new JwtService({ secret: process.env.JWT_SECRET });
  auth = new AuthService(db, jwt, new BetaAccessService(), outbox, limiter, new CommunityCapacityService());
  reset = new PasswordResetService(db, limiter, outbox);
  lifecycle = new AccountLifecycleService(db, new AuthSensitiveDataService(), outbox);
  development = new DevelopmentService(db, new NotificationService(db));
  class AcceptanceModule {}
  Module({ controllers: [AuthController, DevelopmentController, DevelopmentAccessController, CommunityHealthController], providers: [
    { provide: DataSource, useValue: db }, { provide: JwtService, useValue: jwt },
    { provide: AuthService, useValue: auth }, { provide: DevelopmentService, useValue: development },
    JwtAuthGuard, DevelopmentAccessGuard, DevelopmentAttachmentAuthorGuard,
  ] })(AcceptanceModule);
  app = await NestFactory.create(AcceptanceModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  baseUrl = `http://127.0.0.1:${app.getHttpServer().address().port}`;
  process.env.PUBLIC_SITE_ORIGIN = baseUrl;
  check('strict isolated database, schema 0030, real Nest HTTP and no mail/background workers');
}
async function http(method, url, { token, cookie, body, form, origin = baseUrl, status = 200 } = {}) {
  assert.ok(url.startsWith('/v1/') || url === '/health' || url === '/health/ready');
  const headers = { origin };
  if (token) headers.authorization = `Bearer ${token}`;
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${baseUrl}${url}`, { method, headers, body: form || (body === undefined ? undefined : JSON.stringify(body)), signal: AbortSignal.timeout(15000), redirect: 'error' });
  assert.equal(response.status, status, `${method} ${url} status`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const json = response.headers.get('content-type')?.includes('application/json') ? JSON.parse(buffer.toString('utf8')) : null;
  return { response, json, buffer, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function account(label) {
  const username = `ar_${label.slice(0, 10)}_${randomUUID().slice(0, 6)}`;
  const result = await http('POST', '/v1/auth/account/register', { body: registration(username), status: 201 });
  assert.ok(result.json.accessToken && result.cookie, 'Registration must issue the session through HTTP');
  assert.ok(!('refreshToken' in result.json), 'Refresh capability must remain outside JSON');
  assert.match(result.response.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(result.response.headers.get('set-cookie'), /SameSite=Strict/i);
  const user = await db.getRepository(E.User).findOneByOrFail({ usernameNormalized: username });
  assert.equal(user.communityRole, 'user');
  assert.equal(await db.getRepository(E.ConsentRecord).countBy({ userId: user.id }), 4);
  return { user, username, token: result.json.accessToken, cookie: result.cookie, refresh: decodeURIComponent(result.cookie.split('=').slice(1).join('=')), sessionId: jwt.decode(result.json.accessToken).sid };
}
async function login(person, password = PASSWORD) {
  const result = await http('POST', '/v1/auth/account/login', { body: { username: person.username, password } });
  return { ...person, token: result.json.accessToken, cookie: result.cookie, refresh: decodeURIComponent(result.cookie.split('=').slice(1).join('=')), sessionId: jwt.decode(result.json.accessToken).sid };
}
async function httpAccounts() {
  const person = await account('http');
  await http('GET', '/v1/auth/me', { status: 401 });
  assert.equal((await http('GET', '/v1/auth/me', { token: person.token })).json.publicId, person.user.publicId);
  await http('POST', '/v1/auth/account/register', { body: registration(person.username.toUpperCase()), status: 409 });
  await http('POST', '/v1/auth/refresh', { cookie: person.cookie, origin: 'https://attacker.invalid', status: 403 });
  const rotated = await http('POST', '/v1/auth/refresh', { cookie: person.cookie });
  assert.notEqual(rotated.cookie, person.cookie);
  const sessionBefore = await db.getRepository(E.AuthSession).findOneByOrFail({ id: person.sessionId });
  await http('POST', '/v1/auth/password-change', { token: rotated.json.accessToken, body: { currentPassword: 'Wrong-Password#2026', newPassword: NEXT_PASSWORD }, status: 401 });
  assert.equal((await db.getRepository(E.AuthSession).findOneByOrFail({ id: person.sessionId })).revokedAt, sessionBefore.revokedAt);
  await http('POST', '/v1/auth/password-change', { token: rotated.json.accessToken, body: { currentPassword: PASSWORD, newPassword: NEXT_PASSWORD }, status: 204 });
  await http('GET', '/v1/auth/me', { token: rotated.json.accessToken, status: 401 });
  await http('POST', '/v1/auth/refresh', { cookie: rotated.cookie, status: 401 });
  await http('POST', '/v1/auth/account/login', { body: { username: person.username, password: PASSWORD }, status: 401 });
  const changed = await login(person, NEXT_PASSWORD);
  const device = await login(person, NEXT_PASSWORD);
  const stranger = await account('foreign');
  await http('DELETE', `/v1/auth/sessions/${device.sessionId}`, { token: stranger.token, status: 404 });
  await http('DELETE', `/v1/auth/sessions/${device.sessionId}`, { token: changed.token, status: 204 });
  await http('GET', '/v1/auth/me', { token: device.token, status: 401 });
  await http('POST', '/v1/auth/logout', { cookie: changed.cookie, status: 204 });
  await http('GET', '/v1/auth/me', { token: changed.token, status: 401 });
  await http('POST', '/v1/auth/logout', { cookie: changed.cookie, status: 204 });
  check('HTTP registration/consents/normalization, HttpOnly cookie/CSRF, rotation, password verification, owned devices and idempotent logout');
}

async function blockedAccount(person, launch, { waiters = 1, beforeRelease } = {}) {
  const blocker = db.createQueryRunner();
  await blocker.connect(); await blocker.startTransaction();
  const [{ pid }] = await blocker.query('SELECT pg_backend_pid() AS pid');
  await blocker.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [person.user.id]);
  const pending = launch().map((operation) => Promise.resolve(operation).then((value) => ({ ok: true, value }), (error) => ({ ok: false, code: codeOf(error), sqlCode: error?.code })));
  try {
    const deadline = NativeDate.now() + 7000;
    let observed = 0;
    while (NativeDate.now() < deadline) {
      const blocked = await db.query("SELECT pid, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'");
      const chain = new Set([pid]);
      // Row-lock queues can make a later waiter depend on an earlier waiter,
      // not directly on the original holder. Verify the complete lock chain.
      for (let pass = 0; pass < blocked.length; pass += 1) {
        for (const row of blocked) if (row.blockers.some((holder) => chain.has(holder))) chain.add(row.pid);
      }
      observed = chain.size - 1;
      if (observed >= waiters) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.ok(observed >= waiters, 'Operations must be observed waiting on a real PostgreSQL account lock');
    const probe = db.createQueryRunner();
    await probe.connect(); await probe.startTransaction();
    try {
      // Old refresh grabbed these rows before waiting on User: this NOWAIT
      // probe deterministically fails on that implementation, without relying
      // on PostgreSQL randomly choosing a deadlock victim.
      await probe.query('SELECT id FROM auth_sessions WHERE user_id=$1 FOR UPDATE NOWAIT', [person.user.id]);
      await probe.query('SELECT t.id FROM auth_refresh_tokens t JOIN auth_sessions s ON s.id=t.session_id WHERE s.user_id=$1 FOR UPDATE OF t NOWAIT', [person.user.id]);
    } finally { await probe.rollbackTransaction(); await probe.release(); }
    if (beforeRelease) await beforeRelease();
    await blocker.commitTransaction();
    return await Promise.all(pending);
  } finally {
    if (blocker.isTransactionActive) await blocker.rollbackTransaction();
    await blocker.release();
    await Promise.all(pending);
  }
}
async function concurrentAccounts() {
  for (const kind of ['logout', 'logout_all', 'device', 'password']) {
    const person = await account(`race_${kind}`);
    const mutation = () => kind === 'logout' ? auth.logout(person.refresh)
      : kind === 'logout_all' ? auth.logoutAll(person.user.id)
      : kind === 'device' ? auth.revokeDeviceSession(person.user.id, person.sessionId, person.sessionId)
      : auth.changePassword(person.user.id, { currentPassword: PASSWORD, newPassword: NEXT_PASSWORD });
    const results = await blockedAccount(person, () => [auth.refresh(person.refresh), mutation()], { waiters: 2 });
    assert.equal(results[1].ok, true, `${kind} must finish without SQL deadlock`);
    assert.ok(results[0].ok || results[0].code === 'INVALID_REFRESH_TOKEN', 'Refresh must either precede revocation or be denied');
    assert.ok((await db.getRepository(E.AuthSession).findOneByOrFail({ id: person.sessionId })).revokedAt);
    assert.equal(Number((await db.query("SELECT count(*) FROM auth_refresh_tokens WHERE session_id=$1 AND status='active'", [person.sessionId]))[0].count), 0);
    await http('GET', '/v1/auth/me', { token: person.token, status: 401 });
  }
  check('real PG lock barriers and NOWAIT probes: refresh versus logout, all-device logout, device revoke and password change');
  const expiring = await account('expiry');
  await db.getRepository(E.AuthSession).update({ id: expiring.sessionId }, { expiresAt: new Date(clock + 1000) });
  await db.getRepository(E.AuthRefreshToken).update({ sessionId: expiring.sessionId }, { expiresAt: new Date(clock + 1000) });
  const before = await db.getRepository(E.AuthRefreshToken).countBy({ sessionId: expiring.sessionId });
  const [expired] = await blockedAccount(expiring, () => [auth.refresh(expiring.refresh)], { beforeRelease: () => { clock += 1001; } });
  assert.equal(expired.code, 'INVALID_REFRESH_TOKEN');
  assert.equal(await db.getRepository(E.AuthRefreshToken).countBy({ sessionId: expiring.sessionId }), before);
  assert.equal((await db.getRepository(E.AuthSession).findOneByOrFail({ id: expiring.sessionId })).revokeReason, 'expired');
  check('real lock wait crosses refresh expiry: no renewed capability or session extension');
}
async function passwordRecoveryAndDeletion() {
  const person = await account('recovery');
  await reset.request(person.user.email);
  assert.ok(capturedResetToken);
  const resetToken = capturedResetToken;
  const saved = JSON.stringify(await db.getRepository(E.AuthEmailOutbox).find());
  assert.ok(!saved.includes(resetToken) && !saved.includes(person.user.email), 'Outbox must retain ciphertext only');
  await db.getRepository(E.PasswordResetToken).update({ userId: person.user.id }, { expiresAt: new Date(clock + 1000) });
  const [expired] = await blockedAccount(person, () => [reset.reset(resetToken, NEXT_PASSWORD)], { beforeRelease: () => { clock += 1001; } });
  assert.equal(expired.code, 'PASSWORD_RESET_TOKEN_INVALID');
  assert.equal((await db.getRepository(E.User).findOneByOrFail({ id: person.user.id })).passwordHash, person.user.passwordHash);
  assert.equal((await db.getRepository(E.AuthSession).findOneByOrFail({ id: person.sessionId })).revokedAt, null);
  clock += 61_000;
  await reset.request(person.user.email);
  const liveToken = capturedResetToken;
  const results = await blockedAccount(person, () => [reset.reset(liveToken, NEXT_PASSWORD), reset.reset(liveToken, NEXT_PASSWORD)], { waiters: 2 });
  assert.equal(results.filter((item) => item.ok).length, 1);
  assert.equal(results.find((item) => !item.ok).code, 'PASSWORD_RESET_TOKEN_INVALID');
  await http('GET', '/v1/auth/me', { token: person.token, status: 401 });
  await login(person, NEXT_PASSWORD);
  const unknown = await reset.request(`missing-${randomUUID()}@users.invalid`);
  assert.equal(unknown, undefined);
  check('real PG reset expiry/one-time concurrent consume, encrypted durable mail without sending, old sessions immediately unusable');
  const deleting = await account('deletion');
  const other = await login(deleting);
  const key = randomUUID();
  const outcomes = await blockedAccount(deleting, () => [auth.refresh(other.refresh), lifecycle.requestDeletion(deleting.user.id, deleting.sessionId, key)], { waiters: 2 });
  assert.equal(outcomes[1].ok, true);
  assert.equal((await db.getRepository(E.User).findOneByOrFail({ id: deleting.user.id })).accountStatus, 'deleting');
  assert.ok((await db.getRepository(E.AuthSession).findOneByOrFail({ id: other.sessionId })).revokedAt);
  assert.equal((await lifecycle.requestDeletion(deleting.user.id, deleting.sessionId, key)).status, 'cooling_off');
  await http('GET', '/v1/auth/me', { token: deleting.token, status: 401 });
  await lifecycle.cancelDeletion(deleting.user.id);
  await http('GET', '/v1/auth/me', { token: deleting.token });
  check('real PG deletion/refresh race, restricted account access, idempotent deletion request and cooling-off cancellation');
}

function malformedDocx() {
  // A stored (uncompressed) bounded ZIP tests XML parsing, not ZIP-ratio
  // rejection. All bytes are synthetic and never sent to the public website.
  const entries = [
    ['[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['word/document.xml', '<w:document>' + '<w:t>'.repeat(16000) + '</w:document>'],
  ];
  let offset = 0; const locals = []; const central = [];
  for (const [filename, text] of entries) {
    const name = Buffer.from(filename); const data = Buffer.from(text);
    let crc = 0xffffffff;
    for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
    const directory = Buffer.alloc(46); directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(0x0800, 8);
    directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(data.length, 20); directory.writeUInt32LE(data.length, 24); directory.writeUInt16LE(name.length, 28); directory.writeUInt32LE(offset, 42);
    locals.push(local, name, data); central.push(directory, name); offset += local.length + name.length + data.length;
  }
  const directory = Buffer.concat(central); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

async function developmentHttp() {
  const owner = await account('owner');
  const author = await account('author');
  const other = await account('other');
  const outsider = await account('outsider');
  // Explicitly synthetic role fixtures in this empty isolated database only.
  await db.getRepository(E.User).update({ id: owner.user.id }, { communityRole: 'admin' });
  await http('GET', '/v1/development/requests', { token: outsider.token, status: 403 });
  await http('POST', '/v1/development/members', { token: owner.token, body: { username: author.username }, status: 201 });
  await http('POST', '/v1/development/members', { token: owner.token, body: { username: other.username }, status: 201 });
  assert.equal((await db.getRepository(E.User).findOneByOrFail({ id: author.user.id })).communityRole, 'user');
  await denied(new AccountAdminGuard(db).canActivate(context({ id: author.user.id })), 'ADMIN_ACCESS_REQUIRED');
  assert.equal(await new AccountAdminGuard(db).canActivate(context({ id: owner.user.id })), true);
  await http('POST', '/v1/development/members', { token: author.token, body: { username: outsider.username }, status: 403 });
  const input = proposal();
  const created = await http('POST', '/v1/development/requests', { token: author.token, body: input, status: 201 });
  const id = created.json.id;
  const replay = await http('POST', '/v1/development/requests', { token: author.token, body: input, status: 201 });
  assert.equal(replay.json.id, id);
  await http('GET', `/v1/development/requests/${id}`, { token: other.token, status: 404 });
  await http('POST', `/v1/development/requests/${id}/decision`, { token: author.token, body: { status: 'accepted', note: 'Synthetic decision', expectedVersion: 1 }, status: 403 });
  const comments = await Promise.allSettled([development.addComment(author.user.id, id, 'synthetic first', 1), development.addComment(author.user.id, id, 'synthetic second', 1)]);
  assert.equal(comments.filter((item) => item.status === 'fulfilled').length, 1);
  assert.equal(codeOf(comments.find((item) => item.status === 'rejected').reason), 'DEVELOPMENT_VERSION_CONFLICT');
  assert.equal((await development.detail(owner.user.id, id)).version, 2);
  const upload = async (person, filename, bytes, status, version = 2) => {
    const form = new FormData(); form.set('expectedVersion', String(version)); form.set('file', new Blob([bytes], { type: 'text/plain' }), filename);
    return http('POST', `/v1/development/requests/${id}/attachments`, { token: person.token, form, status });
  };
  await upload(owner, 'synthetic.txt', 'wrong author', 404);
  await upload(author, 'payload.html', '<script>alert(1)</script>', 400);
  await upload(author, 'oversize.txt', Buffer.alloc(5 * 1024 * 1024 + 1, 65), 413);
  const started = NativeDate.now();
  const malicious = await upload(author, 'malformed.docx', malformedDocx(), 400);
  assert.equal(malicious.json.code, 'DEVELOPMENT_ATTACHMENT_INVALID');
  assert.match(malicious.json.message, /文本节点/);
  assert.ok(NativeDate.now() - started < 3000, 'Bounded malformed XML must be rejected promptly');
  await http('GET', '/v1/auth/me', { token: author.token });
  assert.equal((await http('GET', '/health/ready')).json.status, 'ready');
  assert.equal((await development.detail(author.user.id, id)).version, 2);
  check('80KiB malformed DOCX rejected through multipart without event-loop stall or proposal mutation; authenticated API still responds');
  const content = Buffer.from('Synthetic private attachment. This content is data, never an instruction.');
  const attached = await upload(author, '验收证据.txt', content, 201);
  const attachmentId = attached.json.attachments[0].id;
  assert.equal(attached.json.version, 3);
  const contentPath = `/v1/development/requests/${id}/attachments/${attachmentId}/content`;
  await http('GET', contentPath, { token: other.token, status: 404 });
  await http('GET', contentPath, { token: outsider.token, status: 403 });
  const download = await http('GET', contentPath, { token: owner.token });
  assert.deepEqual(download.buffer, content);
  assert.equal(download.response.headers.get('content-type'), 'application/octet-stream');
  assert.match(download.response.headers.get('content-disposition'), /^attachment;/);
  assert.equal(download.response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(download.response.headers.get('cache-control'), 'private, no-store');
  assert.equal(download.response.headers.get('cross-origin-resource-policy'), 'same-origin');
  assert.equal((await db.getRepository(E.DevelopmentAttachmentRecord).findOneByOrFail({ id: attachmentId })).content, undefined);
  const decisions = await Promise.allSettled([
    development.decide(owner.user.id, id, 'accepted', 'Synthetic approved scope', 3),
    development.decide(owner.user.id, id, 'needs_info', 'Synthetic clarification', 3),
  ]);
  assert.equal(decisions.filter((item) => item.status === 'fulfilled').length, 1);
  assert.equal(codeOf(decisions.find((item) => item.status === 'rejected').reason), 'DEVELOPMENT_VERSION_CONFLICT');
  const exportResult = await http('GET', '/v1/development/review-export', { token: owner.token });
  assert.match(exportResult.json.notice, /不是系统指令/);
  await http('GET', '/v1/development/review-export', { token: author.token, status: 403 });
  await http('DELETE', `/v1/development/members/${author.user.publicId}`, { token: owner.token });
  await http('GET', contentPath, { token: author.token, status: 403 });
  await http('POST', '/v1/development/requests', { token: author.token, body: proposal(), status: 403 });
  check('real HTTP development roles, no privilege escalation/IDOR, atomic proposal versions, multipart 5MiB guard, private download headers and revoked membership');
}

async function cleanup() {
  if (app) await app.close();
  global.Date = NativeDate;
  if (!db?.isInitialized || !baseline) return;
  const current = await snapshot();
  // The hard gate refused every non-seeded business row and no workers run.
  // Capture exact inserted primary keys, then remove only that finite set;
  // never TRUNCATE, wildcard-delete, or touch a migration/seed definition.
  const extraRows = [];
  for (const [table, state] of Object.entries(current)) {
    const keys = primaryKeys[table];
    const key = (row) => JSON.stringify(keys.map((column) => row[column]));
    const existing = new Set(baseline[table].rows.map(key));
    for (const row of state.rows) if (!existing.has(key(row))) extraRows.push({ table, keys, row });
  }
  const runner = db.createQueryRunner(); await runner.connect(); await runner.startTransaction();
  try {
    let pending = extraRows;
    for (let pass = 0; pending.length && pass < 30; pass += 1) {
      const retry = [];
      for (const item of pending) {
        await runner.query('SAVEPOINT account_cleanup_row');
        try {
          await runner.query(`DELETE FROM ${ident(item.table)} WHERE ${item.keys.map((column, index) => `${ident(column)}=$${index + 1}`).join(' AND ')}`, item.keys.map((column) => item.row[column]));
          await runner.query('RELEASE SAVEPOINT account_cleanup_row');
        } catch (error) {
          await runner.query('ROLLBACK TO SAVEPOINT account_cleanup_row');
          if (error.code !== '23503') throw error;
          retry.push(item);
        }
      }
      assert.ok(retry.length < pending.length, 'Cleanup dependency graph must make progress'); pending = retry;
    }
    assert.equal(pending.length, 0, 'Every exact synthetic artifact must be removed');
    // Registration intentionally updates the migration-seeded capacity mutex.
    for (const row of baseline.community_capacity_guards.rows) await runner.query('UPDATE community_capacity_guards SET updated_at=$1 WHERE scope=$2', [row.updated_at, row.scope]);
    await runner.commitTransaction();
  } catch (error) { await runner.rollbackTransaction(); throw error; }
  finally { await runner.release(); }
  const restored = await snapshot();
  for (const table of Object.keys(baseline)) {
    assert.equal(restored[table].count, baseline[table].count, `Restored ${table} count`);
    assert.equal(restored[table].digest, baseline[table].digest, `Restored ${table} full-content fingerprint`);
  }
  check(`exact synthetic cleanup and all ${Object.keys(baseline).length} table fingerprints restored`);
}
async function main() {
  try { await setup(); await httpAccounts(); await concurrentAccounts(); await passwordRecoveryAndDeletion(); await developmentHttp(); }
  finally { try { await cleanup(); } finally { if (db?.isInitialized) await db.destroy(); } }
  process.stdout.write(`ACCOUNT_REHEARSAL_OK ${checks.length} system scenarios\n`);
}
main().catch((error) => {
  // Error objects from DB/HTTP may contain synthetic credentials; output only
  // a bounded name/code and assertion message, never rows, cookies or dumps.
  process.stderr.write(`ACCOUNT_REHEARSAL_FAILED ${error?.code || error?.name || 'ERROR'} ${error?.operator ? String(error.message).split('\n')[0] : ''}\n`);
  process.exitCode = 1;
});
