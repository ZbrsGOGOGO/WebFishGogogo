'use strict';
// Explicitly synthetic PostgreSQL only. Never accepts a production DB/env bundle.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { randomUUID } = require('node:crypto');
const fromApp = createRequire('/app/packages/backend/package.json');
fromApp('reflect-metadata');
const { DataSource } = fromApp('typeorm');
const load = name => fromApp(`/app/packages/backend/dist/${name}`);
const E = load('database/entities');
const { migrations } = load('database/migrations');
const { FishGrowthService } = load('modules/community/progression/fish-growth.service');
const { MembershipService } = load('modules/community/progression/membership.service');
const { SupportLedgerService } = load('modules/community/progression/support-ledger.service');
const { CommunityProgressionService } = load('modules/community/progression/community-progression.service');
const { loadTitleBadges } = load('modules/community/progression/title-projection');
let db;
(async () => {
  assert.equal(process.env.FISH_REHEARSAL_CONFIRMATION, 'SYNTHETIC_FISH_SUPPORT_20260910');
  assert.equal(process.env.DB_DATABASE, 'fish_support_candidate');
  assert.equal(process.env.DB_HOST, 'fish-support-pg-c2xt5i');
  assert.equal(process.env.NODE_ENV, 'test');
  assert.equal(process.env.LOCAL_DEV, 'false');
  for (const key of ['DATABASE_URL', 'REDIS_URL', 'AUTH_EMAIL_WEBHOOK_URL', 'SMTP_HOST']) assert.ok(!process.env[key]);
  assert.equal(process.env.AUTH_EMAIL_OUTBOX_PUMP_ENABLED, 'false');
  db = await new DataSource({ type: 'postgres', host: process.env.DB_HOST, username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE, entities: E.entities, migrations,
    synchronize: false, logging: false, extra: { max: 10, statement_timeout: 15000, lock_timeout: 10000 } }).initialize();
  assert.equal((await db.query('SELECT current_database() db'))[0].db, 'fish_support_candidate');
  assert.equal((await db.runMigrations()).length, 0);
  const users = await db.getRepository(E.User).find();
  assert.equal(users.length, 3); assert(users.every(u => u.email.endsWith('@fish-test.invalid')));
  const admin = users.find(u => u.username === 'fish_qa_admin'), user = users.find(u => u.username === 'fish_qa_user'), other = users.find(u => u.username === 'fish_qa_other');
  assert(admin && user && other); assert.equal(admin.communityRole, 'admin'); assert.equal(user.communityRole, 'user');
  let now = new Date('2099-09-10T01:00:00Z'); const clock = { now: () => now };
  const fish = new FishGrowthService(db, clock), membership = new MembershipService(), ledger = new SupportLedgerService(db, membership, clock);
  const progression = new CommunityProgressionService(db, membership, clock);
  const beat = { tabId: randomUUID(), sequence: 1, mode: 'game' };
  await Promise.all(Array.from({ length: 10 }, () => fish.heartbeat(other.id, beat)));
  now = new Date(now.getTime() + 60000);
  await Promise.all(Array.from({ length: 10 }, () => fish.heartbeat(other.id, { ...beat, sequence: 2 })));
  assert.equal((await progression.me(other.id)).fish.experience, 2);
  console.log('PASS real PG concurrent same-account heartbeat: one interval, no duplicate XP');
  await Promise.all(Array.from({ length: 10 }, () => fish.heartbeat(other.id, { tabId: randomUUID(), sequence: 3, mode: 'game' })));
  assert.equal((await progression.me(other.id)).fish.experience, 2);
  console.log('PASS real PG ten competing tabs: no multiplied time');
  const receipt = () => ({ requestId: randomUUID(), username: other.username, orderReference: `SYNTH-${randomUUID()}`, months: 1, amountFen: 1000, confirmed: true });
  const one = receipt();
  const replays = await Promise.all(Array.from({ length: 8 }, () => ledger.grant(admin.id, one)));
  assert.equal(replays.filter(r => !r.replayed).length, 1);
  const grants = [receipt(), receipt(), receipt()];
  await Promise.all(grants.map(g => ledger.grant(admin.id, g)));
  const rows = await db.getRepository(E.CommunitySupportEntry).find({ where: { userId: other.id }, order: { startsAt: 'ASC' } });
  assert.equal(rows.length, 4);
  for (let i = 1; i < rows.length; i++) assert.equal(+rows[i].startsAt, +rows[i - 1].expiresAt);
  assert.equal(+rows.at(-1).expiresAt - +rows[0].startsAt, 120 * 86400000);
  console.log('PASS real PG concurrent supporter grants: idempotent receipt and contiguous expiry stacking');
  const duplicate = receipt();
  const raced = await Promise.allSettled([ledger.grant(admin.id, duplicate), ledger.grant(admin.id, { ...duplicate, requestId: randomUUID(), username: user.username })]);
  assert.equal(raced.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(raced.filter(r => r.status === 'rejected').length, 1);
  console.log('PASS real PG cross-account duplicate order race: database uniqueness preserved');
  for (const g of [...grants, one, duplicate]) {
    const entry = await db.getRepository(E.CommunitySupportEntry).findOneBy({ id: g.requestId });
    if (entry) await Promise.all([ledger.revoke(admin.id, entry.id, { confirmed: true }), ledger.revoke(admin.id, entry.id, { confirmed: true })]);
  }
  // Revoke the possible alternate UUID from the same synthetic race as well.
  const remaining = await db.getRepository(E.CommunitySupportEntry).find();
  for (const row of remaining) if (!row.revokedAt) await ledger.revoke(admin.id, row.id, { confirmed: true });
  assert.equal((await ledger.adminView(admin.id)).totals.orders, 0);
  assert.equal((await ledger.adminView(admin.id)).grossTotals.orders, 5);
  console.log('PASS real PG revoke races preserve gross audit and remove valid entitlement totals');
  await assert.rejects(ledger.adminView(user.id), e => e.status === 403);
  await assert.rejects(ledger.grant(user.id, receipt()), e => e.status === 403);
  await progression.equip(other.id, { requestId: randomUUID(), expectedVersion: 0, titleKey: 'fish_1' });
  assert.equal((await loadTitleBadges(db.manager, [other.id])).get(other.id).label, '初入鱼场');
  assert.equal(await db.getRepository(E.WalletBalance).count(), 0);
  assert.equal((await db.getRepository(E.User).findOneByOrFail({ id: user.id })).communityRole, 'user');
  console.log('PASS real PG title projection and admin restrictions; zero wallets or privilege changes');
  // Synthetic service tests used an injected future clock. Only the other account holds those test metrics;
  // untouched user/admin accounts are reserved for subsequent wall-clock HTTP/browser validation.
  console.log('FISH_SUPPORT_POSTGRES_REHEARSAL_OK: 6 groups; synthetic-only records retained for audit');
})().catch(error => { console.error('FISH_SUPPORT_REHEARSAL_FAILED', error.name, String(error.message).slice(0, 200)); process.exitCode = 1; })
  .finally(async () => { if (db?.isInitialized) await db.destroy(); });
