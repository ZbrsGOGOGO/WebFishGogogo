import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { fishProgressView, type FishHeartbeatInput } from '@stealth-reader/shared';
import { createLocalDevDataSource } from '../../../database/local-dev-datasource';
import { CommunityFishProgress, CommunitySupportEntry } from '../../../database/entities/community-growth.entity';
import { CommunityMembershipGrant } from '../../../database/entities/community-progression.entity';
import { User, WalletBalance } from '../../../database/entities';
import { FishGrowthService, readFishProgress } from './fish-growth.service';
import { MembershipService } from './membership.service';
import { SupportLedgerService } from './support-ledger.service';
import { CommunityProgressionService } from './community-progression.service';
import { loadTitleBadges } from './title-projection';

describe('fish time leases and verified supporter ledger', () => {
  let db: DataSource, fish: FishGrowthService, ledger: SupportLedgerService, member: MembershipService, now: Date, admin: User, user: User;
  const env = { ...process.env };
  beforeEach(async () => {
    process.env.FEATURE_COMMUNITY_PROGRESSION_ENABLED = 'true'; process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true';
    db = await createLocalDevDataSource(); now = new Date('2099-09-10T01:00:00Z'); const clock = { now: () => now };
    member = new MembershipService(); fish = new FishGrowthService(db, clock); ledger = new SupportLedgerService(db, member, clock);
    const repo = db.getRepository(User);
    admin = await repo.save(repo.create({ username: 'growth_admin', displayName: '管理员', email: 'admin@synthetic.invalid', passwordHash: 'synthetic', accountStatus: 'active', communityRole: 'admin' }));
    user = await repo.save(repo.create({ username: 'growth_user', displayName: '摸鱼同事', email: 'user@synthetic.invalid', passwordHash: 'synthetic', accountStatus: 'active' }));
  });
  afterEach(async () => { await db.destroy(); process.env = { ...env }; });
  const advance = (seconds: number): void => { now = new Date(now.getTime() + seconds * 1000); };
  const input = (): FishHeartbeatInput => ({ tabId: randomUUID(), sequence: 1, mode: 'game' });
  const grant = () => ({ requestId: randomUUID(), username: user.username!, orderReference: `SYNTH-${randomUUID()}`, months: 1, amountFen: 1500, confirmed: true });

  it('starts at zero, uses only server intervals, makes duplicate/out-of-order heartbeats no-ops', async () => {
    const beat = input(); expect((await fish.heartbeat(user.id, beat)).experience).toBe(0);
    advance(30); expect((await fish.heartbeat(user.id, { ...beat, sequence: 2 })).activeSeconds).toBe(30);
    advance(30); expect((await fish.heartbeat(user.id, { ...beat, sequence: 3 })).experience).toBe(2);
    advance(30); expect((await fish.heartbeat(user.id, { ...beat, sequence: 3 })).experience).toBe(2);
    expect((await fish.heartbeat(user.id, beat)).experience).toBe(2);
    expect(await db.getRepository(WalletBalance).count()).toBe(0);
    expect((await member.view(db.manager, user.id, now)).active).toBe(false);
  });
  it('does not multiply time across tabs; lease takeover never backfills offline time', async () => {
    const a = input(), b = input(); await fish.heartbeat(user.id, a); advance(30);
    expect((await fish.heartbeat(user.id, b)).experience).toBe(0);
    await fish.heartbeat(user.id, { ...a, sequence: 2 }); advance(76);
    expect((await fish.heartbeat(user.id, { ...b, sequence: 2 })).activeSeconds).toBe(30);
    advance(30); expect((await fish.heartbeat(user.id, { ...b, sequence: 3 })).experience).toBe(2);
    advance(500); expect((await fish.heartbeat(user.id, { ...b, sequence: 4 })).experience).toBe(2);
  });
  it('pauses hidden/inactive intervals and does not add a game bonus across mode switches', async () => {
    const a = input(); await fish.heartbeat(user.id, a); advance(30);
    await fish.heartbeat(user.id, { ...a, sequence: 2, mode: 'pause' }); advance(30);
    await fish.heartbeat(user.id, { ...a, sequence: 3, mode: 'browse' }); advance(60);
    const switched = await fish.heartbeat(user.id, { ...a, sequence: 4, mode: 'game' });
    expect(switched).toMatchObject({ experience: 1, activeSeconds: 60, gameSeconds: 0 });
  });
  it('caps daily points, resets at Shanghai midnight, and preserves lifetime XP', async () => {
    const a = input(); await fish.heartbeat(user.id, a);
    await db.getRepository(CommunityFishProgress).update(user.id, { experience: 358, activeSeconds: 14370, gameSeconds: 14370, dailyActiveSeconds: 14370, dailyGameSeconds: 14370 });
    advance(60); expect((await fish.heartbeat(user.id, { ...a, sequence: 2 })).todayExperience).toBe(360);
    advance(60); expect((await fish.heartbeat(user.id, { ...a, sequence: 3 })).activeSeconds).toBe(14400);
    now = new Date('2099-09-10T16:00:01Z');
    const next = await fish.heartbeat(user.id, { ...a, sequence: 4 });
    expect(next.todayExperience).toBe(0); expect(next.experience).toBe(359);
  });
  it('exposes all six milestones and reuses explicit public title ownership', async () => {
    expect([0, 120, 600, 1800, 5400, 12000].map(x => fishProgressView(x).rank.label)).toEqual(['初入鱼场', '摸鱼小将', '摸鱼达人', '打窝仙人', '潮汐海灵', '摸鱼之王']);
    await fish.heartbeat(user.id, input()); await db.getRepository(CommunityFishProgress).update(user.id, { experience: 600 });
    const progression = new CommunityProgressionService(db, member, { now: () => now });
    expect((await loadTitleBadges(db.manager, [user.id])).size).toBe(0);
    await progression.equip(user.id, { requestId: randomUUID(), expectedVersion: 0, titleKey: 'fish_3' });
    expect((await loadTitleBadges(db.manager, [user.id])).get(user.id)?.label).toBe('摸鱼达人');
    expect((await progression.me(admin.id)).fish?.experience).toBe(0);
  });
  it.each([null, { ...input(), seconds: 99999 }, { ...input(), sequence: -1 }, { ...input(), mode: 'admin' }])('rejects forged time payload %j', async raw => {
    await expect(fish.heartbeat(user.id, raw)).rejects.toMatchObject({ status: 400 });
    expect(await db.getRepository(CommunityFishProgress).count()).toBe(0);
  });
  it('gates inactive accounts and writes without recording time', async () => {
    await db.getRepository(User).update(user.id, { accountStatus: 'suspended' });
    await expect(fish.heartbeat(user.id, input())).rejects.toMatchObject({ status: 401 });
    await db.getRepository(User).update(user.id, { accountStatus: 'active' }); process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'false';
    await expect(fish.heartbeat(user.id, input())).rejects.toMatchObject({ status: 503 });
    expect((await readFishProgress(db.manager, user.id, now)).experience).toBe(0);
  });
  it('records CNY, months, expiry, and idempotent support without granting role/currency/XP', async () => {
    const g = grant(); await ledger.grant(admin.id, g);
    expect(await ledger.grant(admin.id, g)).toMatchObject({ replayed: true });
    expect((await member.requireVip(db.manager, user.id, now)).source).toBe('afdian_support');
    const view = await ledger.adminView(admin.id);
    expect(view.totals).toEqual({ currency: 'CNY', orders: 1, months: 1, amountFen: 1500 });
    expect(view.activeHolders).toBe(1); expect(view.entries[0].username).toBe(user.username);
    expect(JSON.stringify(view)).not.toMatch(/orderHash|requestHash|password|email|SYNTH-/);
    expect((await db.getRepository(User).findOneByOrFail({ id: user.id })).communityRole).toBe('user');
    expect(await db.getRepository(WalletBalance).count()).toBe(0); expect(await db.getRepository(CommunityFishProgress).count()).toBe(0);
  });
  it('stacks after the original gift without rewriting it, and expires exactly at the last boundary', async () => {
    const expiry = new Date(now.getTime() + 86_400_000);
    await db.getRepository(CommunityMembershipGrant).insert({ userId: user.id, campaignKey: 'launch_vip_202609', startsAt: now, expiresAt: expiry, createdAt: now });
    await ledger.grant(admin.id, grant()); await ledger.grant(admin.id, { ...grant(), months: 2 });
    expect((await member.view(db.manager, user.id, now)).expiresAt).toBe(new Date(expiry.getTime() + 90 * 86_400_000).toISOString());
    expect((await db.getRepository(CommunityMembershipGrant).findOneByOrFail({ userId: user.id })).expiresAt).toEqual(expiry);
    now = new Date(expiry.getTime() + 90 * 86_400_000);
    await expect(member.requireVip(db.manager, user.id, now)).rejects.toMatchObject({ status: 403 });
  });
  it('rejects duplicate receipts across request IDs and never reactivates revoked orders', async () => {
    const g = grant(); await ledger.grant(admin.id, g);
    await expect(ledger.grant(admin.id, { ...g, requestId: randomUUID() })).rejects.toMatchObject({ response: { code: 'SUPPORT_ORDER_DUPLICATE' } });
    await expect(ledger.grant(admin.id, { ...g, months: 2 })).rejects.toMatchObject({ response: { code: 'SUPPORT_REQUEST_CONFLICT' } });
    await ledger.revoke(admin.id, g.requestId, { confirmed: true }); await ledger.revoke(admin.id, g.requestId, { confirmed: true });
    expect((await member.view(db.manager, user.id, now)).active).toBe(false);
    const view = await ledger.adminView(admin.id); expect(view.totals.orders).toBe(0); expect(view.grossTotals.orders).toBe(1);
    await ledger.grant(admin.id, g); expect((await member.view(db.manager, user.id, now)).active).toBe(false);
  });
  it.each(['user', 'moderator'] as const)('denies %s roles for admin reads, grants and revocations', async role => {
    await db.getRepository(User).update(user.id, { communityRole: role });
    for (const task of [() => ledger.adminView(user.id), () => ledger.grant(user.id, grant()), () => ledger.revoke(user.id, randomUUID(), { confirmed: true })]) await expect(task()).rejects.toMatchObject({ status: 403 });
    expect(await db.getRepository(CommunitySupportEntry).count()).toBe(0);
  });
  it.each([{ amountFen: 0 }, { amountFen: 1.5 }, { months: 13 }, { confirmed: false }, { currency: 'USD' }, { username: 'missing' }])('rejects invalid or unknown support input %j', async fields => {
    await expect(ledger.grant(admin.id, { ...grant(), ...fields })).rejects.toBeDefined(); expect(await db.getRepository(CommunitySupportEntry).count()).toBe(0);
  });
});
