#!/usr/bin/env node
'use strict';

/** Real HTTP acceptance, restricted to the reviewed synthetic preview stack.
 * Never accepts production hosts, DB/env files or arbitrary account identities.
 * This exercises saves and wallet rewards only for the two named QA fixtures.
 * Output contains check labels/counts, never credentials, tokens or response bodies.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');

assert.equal(process.env.DEMON_TOWER_HTTP_CONFIRMATION, 'ISOLATED_TOWER_HTTP_ONLY:hgbacy');
assert.equal(process.env.NODE_ENV, 'test');
assert.ok(!process.env.DB_HOST && !process.env.DATABASE_URL, 'No database connection belongs in HTTP acceptance');
const origin = process.env.DEMON_TOWER_HTTP_ORIGIN;
assert.ok(['http://demon-tower-ui-api-hgbacy:3000', 'http://demon-tower-ui-web-hgbacy'].includes(origin));
const credentialsPath = process.env.DEMON_TOWER_HTTP_CREDENTIALS;
assert.equal(credentialsPath, '/audit/browser-credentials.json');
const fd = fs.openSync(credentialsPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
let credentials;
try {
  const stat = fs.fstatSync(fd);
  assert.ok(stat.isFile() && (stat.mode & 0o077) === 0 && stat.size < 16384 && stat.uid === process.getuid());
  credentials = JSON.parse(fs.readFileSync(fd, 'utf8'));
} finally { fs.closeSync(fd); }
assert.equal(credentials.confirmation, 'ISOLATED_TOWER_UI_ONLY:hgbacy');
const actors = ['collaborator', 'admin'].map((label) => {
  const account = credentials.accounts.find((entry) => entry.label === label);
  assert.equal(account?.username, `qa_${label}`);
  assert.match(account.publicId, /^[a-f0-9-]{36}$/);
  assert.ok(typeof account.password === 'string' && account.password.length >= 32);
  return { ...account, token: null, cookie: null, view: null, lastRequest: null };
});
let phase = 'configuration';
const checks = [];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const mark = (label) => { checks.push(label); console.log(`PASS ${label}`); };
const game = (suffix) => `/api/v1/games/demon-tower/${suffix}`;

async function request(actor, path, method = 'GET', body, overrides = {}) {
  assert.ok(path.startsWith('/api/') && !path.startsWith('//'));
  const response = await fetch(origin + path, {
    method, redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: {
      Origin: 'http://127.0.0.1:4488',
      ...(actor?.token ? { Authorization: `Bearer ${actor.token}` } : {}),
      ...(actor?.cookie ? { Cookie: actor.cookie } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...overrides,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const raw = await response.text();
  let data = null;
  try { if (raw) data = JSON.parse(raw); } catch { /* Nginx errors are intentionally not logged. */ }
  return { status: response.status, data, headers: response.headers };
}
function expect(result, status, code) {
  assert.ok((Array.isArray(status) ? status : [status]).includes(result.status), `HTTP status mismatch at ${phase}`);
  if (code) assert.equal(result.data?.code, code);
  return result.data;
}
function publicView(value) {
  const serialized = JSON.stringify(value);
  assert.ok(!/"(?:rngSeed|rngCounter|lootPity|requestHash|passwordHash|state|userId|email)"\s*:/.test(serialized));
  for (const actor of actors) { assert.ok(!serialized.includes(actor.password)); if (actor.token) assert.ok(!serialized.includes(actor.token)); }
}
async function login(actor) {
  const result = await request(null, '/api/v1/auth/account/login', 'POST', { username: actor.username, password: actor.password });
  const data = expect(result, 200);
  assert.equal(data.user.publicId, actor.publicId);
  assert.equal(data.user.accountStatus, 'active');
  assert.ok(typeof data.accessToken === 'string' && data.accessToken.length > 40);
  const cookie = result.headers.getSetCookie().find((value) => value.startsWith('zbrs_audit_refresh='));
  assert.ok(cookie && /HttpOnly/i.test(cookie) && /SameSite=Strict/i.test(cookie));
  actor.token = data.accessToken; actor.cookie = cookie.split(';')[0];
}
async function read(actor) {
  actor.view = expect(await request(actor, game('overview')), 200);
  publicView(actor.view); return actor.view;
}
async function act(actor, kind, payload = {}) {
  await delay(260); // Keep normal functional cases below the dedicated six-per-second gate.
  const view = await read(actor);
  const input = { requestId: randomUUID(), expectedVersion: view.profile?.version ?? 0, kind, payload };
  const result = expect(await request(actor, game('actions'), 'POST', input), 201);
  publicView(result); actor.view = result.overview; actor.lastRequest = input;
  return result;
}

async function run() {
  phase = 'anonymous-routing-and-authority';
  const catalog = expect(await request(null, game('catalog')), 200);
  assert.equal(catalog.enabled, true); assert.equal(catalog.weapons.length, 20); assert.equal(catalog.skills.length, 16); assert.equal(catalog.floors.length, 9);
  publicView(catalog);
  for (const endpoint of ['overview', 'actions']) {
    expect(await request(null, game(endpoint), endpoint === 'actions' ? 'POST' : 'GET', endpoint === 'actions' ? {} : undefined), 401);
  }
  for (const endpoint of ['leaderboard', 'contributions']) {
    publicView(expect(await request(null, game(endpoint)), 200));
    expect(await request(null, game(endpoint), 'GET', undefined, { Authorization: 'Bearer deliberately-invalid-test-token' }), 401);
  }
  for (const suffix of ['score', 'wallet', 'profiles/another-user', '../demon-tower-elsewhere/catalog']) expect(await request(null, game(suffix)), 404);
  mark('anonymous catalog/public ranks work; private saves, forged sessions and nonexistent score/wallet routes fail closed');

  phase = 'login-and-explicit-enrollment';
  for (const actor of actors) {
    await login(actor);
    expect(await request(actor, '/api/v1/farm'), 200); // Same unified-wallet initialization used by the workbench header.
    const before = await read(actor);
    assert.equal(before.profile, null, 'Use only fresh named synthetic game profiles');
    const first = await act(actor, 'enroll');
    assert.equal(first.officeCoinsGranted, 0);
    assert.equal(first.overview.wallet.officeCoinBalance, before.wallet.officeCoinBalance);
    assert.equal(first.overview.profile.version, 1);
    assert.equal(first.overview.profile.weapons.length, 5);
    assert.deepEqual(first.overview.profile.weapons.map((item) => item.id), ['w1', 'w5', 'w9', 'w13', 'w17']);
  }
  mark('real account login and explicit free enrollment: five starter classes, no enrollment charge or bonus duplication');

  phase = 'payload-validation-and-ownership';
  const a = actors[0], b = actors[1];
  const original = (await read(a)).profile;
  const base = { requestId: randomUUID(), expectedVersion: original.version, kind: 'train', payload: {} };
  const invalid = [
    null, [], { ...base, userId: b.publicId }, { ...base, score: 1000000 }, { ...base, expectedVersion: -1 },
    { ...base, expectedVersion: 1.5 }, { ...base, requestId: 'not-a-uuid' }, { ...base, kind: 'pay' },
    { ...base, payload: { reward: 999 } }, { ...base, kind: 'allocate', payload: { attribute: 'STR', points: -1 } },
    { ...base, kind: 'allocate', payload: { attribute: 'STR', points: Number.MAX_SAFE_INTEGER + 1 } },
    JSON.parse(JSON.stringify(base).replace('"payload":{}', '"payload":{"__proto__":{"polluted":true}}')),
  ];
  for (const body of invalid) expect(await request(a, game('actions'), 'POST', body), 400);
  const after = await read(a);
  assert.equal(after.profile.version, original.version);
  assert.equal(after.profile.totalExperience, original.totalExperience);
  assert.equal((await read(b)).profile.version, 1);
  for (const query of ['contributions?floor=0', 'contributions?floor=10', 'contributions?floor=1&floor=2', 'leaderboard?date=2026-02-30', 'leaderboard?date=2999-01-01']) expect(await request(null, game(query)), 400);
  mark('hostile numbers, extra fields, prototype keys, cross-account identity, dates and floor queries are rejected without save mutation');

  phase = 'version-and-idempotency-races';
  await delay(1100);
  const version = (await read(a)).profile.version;
  const commands = Array.from({ length: 6 }, () => ({ requestId: randomUUID(), expectedVersion: version, kind: 'train', payload: {} }));
  const raced = await Promise.all(commands.map((input) => request(a, game('actions'), 'POST', input)));
  assert.equal(raced.filter((result) => result.status === 201).length, 1);
  assert.ok(raced.filter((result) => result.status !== 201).every((result) => result.status === 409 && result.data.code === 'DEMON_TOWER_VERSION_CONFLICT'));
  const acceptedInput = commands[raced.findIndex((result) => result.status === 201)];
  const trained = await read(a);
  const replay = expect(await request(a, game('actions'), 'POST', acceptedInput), 201);
  assert.equal(replay.replayed, true); assert.equal(replay.overview.profile.version, trained.profile.version);
  expect(await request(a, game('actions'), 'POST', { ...acceptedInput, kind: 'rest' }), 409, 'DEMON_TOWER_IDEMPOTENCY_CONFLICT');
  assert.equal((await read(b)).profile.totalExperience, 0);
  mark('six simultaneous distinct commands accept one version; exact receipt replays and altered UUID payload conflicts stay caller-scoped');

  phase = 'daily-reward-wallet-and-replay';
  await act(a, 'train'); await act(a, 'train');
  const ready = await read(a), beforeBalance = ready.wallet.officeCoinBalance;
  const claim = { requestId: randomUUID(), expectedVersion: ready.profile.version, kind: 'claim_reward', payload: {} };
  const copies = await Promise.all(Array.from({ length: 4 }, () => request(a, game('actions'), 'POST', claim)));
  for (const result of copies) expect(result, 201);
  assert.equal(copies.filter((result) => !result.data.replayed).length, 1);
  assert.ok(copies.every((result) => result.data.officeCoinsGranted === 30));
  const claimed = await read(a);
  assert.equal(claimed.wallet.officeCoinBalance, beforeBalance + 30);
  assert.equal(claimed.profile.daily.rewardClaimed, true);
  await act(a, 'allocate', { attribute: 'STR', points: 1 });
  const newer = await read(a);
  const oldReceipt = expect(await request(a, game('actions'), 'POST', claim), 201);
  assert.equal(oldReceipt.overview.profile.version, newer.profile.version);
  assert.equal(oldReceipt.overview.wallet.officeCoinBalance, newer.wallet.officeCoinBalance);
  const farm = expect(await request(a, '/api/v1/farm'), 200);
  assert.equal(farm.growth.officeCoins, newer.wallet.officeCoinBalance);
  mark('four daily claims credit exactly 30 coins once; farm and tower share the balance and old receipts retain newer saves');

  phase = 'loadout-and-material-upgrade';
  const beforeUpgrade = await read(b);
  const upgraded = await act(b, 'upgrade', { itemType: 'skill', itemId: 's1' });
  assert.equal(upgraded.overview.profile.skills.find((item) => item.id === 's1').quality, 1);
  assert.equal(upgraded.overview.wallet.officeCoinBalance, beforeUpgrade.wallet.officeCoinBalance);
  assert.ok(upgraded.overview.profile.materials.soul < beforeUpgrade.profile.materials.soul);
  const loadout = { ...upgraded.overview.profile.loadout, mainHand: 'w17', artifact: null };
  const equipped = await act(b, 'equip', loadout);
  assert.equal(equipped.overview.profile.loadout.mainHand, 'w17'); assert.equal(equipped.overview.profile.loadout.artifact, null);
  const badEquip = { requestId: randomUUID(), expectedVersion: equipped.overview.profile.version, kind: 'equip', payload: { ...loadout, artifact: 'w17' } };
  expect(await request(b, game('actions'), 'POST', badEquip), 409, 'DEMON_TOWER_DUPLICATE_EQUIPMENT');
  mark('free skill upgrade spends bound materials only; luck weapon can occupy main hand but cannot duplicate its auxiliary slot');

  phase = 'persistent-battle-and-session-revocation';
  let foundBattle = false;
  for (let attempt = 0; attempt < 12; attempt++) {
    const explored = await act(a, 'explore');
    if (explored.overview.profile.battle) { foundBattle = true; break; }
  }
  assert.equal(foundBattle, true, 'No battle in bounded live exploration; deterministic battle cases are covered separately in real PG');
  const fighting = await read(a);
  const attack = { requestId: randomUUID(), expectedVersion: fighting.profile.version, kind: 'attack', payload: { targetId: fighting.profile.battle.enemies[0].id } };
  const turns = await Promise.all(Array.from({ length: 3 }, () => request(a, game('actions'), 'POST', attack)));
  turns.forEach((result) => expect(result, 201));
  assert.equal(turns.filter((result) => !result.data.replayed).length, 1);
  const persisted = await read(a);
  assert.equal(persisted.profile.battle?.turn ?? persisted.profile.lastReport.turns, 1);
  expect(await request(a, '/api/v1/auth/logout', 'POST'), 204);
  const revokedToken = a.token;
  for (const endpoint of ['overview', 'leaderboard', 'contributions']) expect(await request(a, game(endpoint)), 401);
  expect(await request(a, game('actions'), 'POST', attack), 401);
  await login(a); assert.notEqual(a.token, revokedToken);
  const restored = await read(a);
  assert.equal(restored.profile.version, persisted.profile.version);
  assert.deepEqual(restored.profile.battle, persisted.profile.battle);
  const confirmed = expect(await request(a, game('actions'), 'POST', attack), 201);
  assert.equal(confirmed.replayed, true); assert.equal(confirmed.overview.profile.version, persisted.profile.version);
  if (restored.profile.battle) {
    const fled = await act(a, 'flee'); assert.equal(fled.officeCoinsGranted, 0); assert.equal(fled.overview.profile.lastReport.outcome, 'fled');
  }
  mark('three duplicated battle turns execute once; revoked sessions fail even on optional-auth ranks, relogin restores battle and safely confirms the old receipt');
}

run().then(() => console.log(JSON.stringify({ status: 'DEMON_TOWER_HTTP_OK', checks: checks.length, origin, production: false })))
  .catch((error) => { console.error(`DEMON_TOWER_HTTP_FAILED phase=${phase} class=${error?.constructor?.name || 'Error'}`); process.exitCode = 1; })
  .finally(async () => {
    for (const actor of actors) if (actor.cookie) {
      try { expect(await request(actor, '/api/v1/auth/logout', 'POST'), 204); }
      catch { console.error('DEMON_TOWER_HTTP_SESSION_CLEANUP_FAILED'); process.exitCode = 1; }
      actor.token = null; actor.cookie = null;
    }
  });
