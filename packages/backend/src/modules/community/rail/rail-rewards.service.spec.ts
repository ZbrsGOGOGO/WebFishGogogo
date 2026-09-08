import { Logger } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import { CommunityNotification, RailDailyAward, RailDailyScore, RailPlayerStats, RewardGrant, User, WalletBalance, WalletLedger } from '../../../database/entities';
import { createLocalDevDataSource } from '../../../database/local-dev-datasource';
import { PlatformAssetsService } from '../../platform/platform-assets.service';
import { NotificationService } from '../notification.service';
import { RailRewardsService } from './rail-rewards.service';

/** Query/ledger integration; real transaction-race/rollback proof belongs to the isolated PG gate. */
describe('RailRewardsService entity integration', () => {
  let db: DataSource;
  let rewards: RailRewardsService;
  let assets: PlatformAssetsService;
  let notifications: NotificationService;
  const originalEnv = { ...process.env };
  const yesterday = '2026-09-12';
  beforeEach(async () => {
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true';
    db = await createLocalDevDataSource();
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'hrtime'] }).setSystemTime(new Date('2026-09-12T16:05:00.000Z'));
    assets = new PlatformAssetsService({ now: () => new Date() });
    notifications = new NotificationService(db);
    rewards = new RailRewardsService(db, assets, notifications);
  });
  afterEach(async () => {
    rewards?.onModuleDestroy(); jest.useRealTimers(); jest.restoreAllMocks();
    if (db?.isInitialized) await db.destroy();
    process.env = { ...originalEnv };
  });
  async function user(label: string, status: User['accountStatus'] = 'active'): Promise<User> {
    const repo = db.getRepository(User);
    return repo.save(repo.create({ email: `${label}@rail-reward-test.invalid`, username: label, passwordHash: 'not-a-real-password', displayName: label, accountStatus: status }));
  }
  async function score(actor: User, rate = 5000, date = yesterday, at = '2026-09-12T03:00:00Z', demonTotal = 10): Promise<void> {
    await db.getRepository(RailDailyScore).insert({ userId: actor.id, serviceDate: date, rateBasisPoints: rate, survived: rate === 10000 ? 2 : 1, eligibleRounds: 2, demonTotal, roomId: null, achievedAt: new Date(at) });
  }
  it('sorts by survival, earliest achievement then stable account ID, never by subjective demon rating', async () => {
    const a = await user('alice'); const b = await user('bob'); const c = await user('carol'); const d = await user('dora'); const blocked = await user('banned', 'banned');
    await score(a, 5000, yesterday, '2026-09-12T05:00:00Z', 80);
    await score(b, 5000, yesterday, '2026-09-12T04:00:00Z', 1);
    await score(c, 10000); await score(d, 5000, yesterday, '2026-09-12T04:00:00Z', 80); await score(blocked, 10000);
    const board = await rewards.leaderboard(yesterday);
    const tie = [b, d].sort((left, right) => left.id.localeCompare(right.id));
    expect(board.items.map((entry) => entry.publicId)).toEqual([c.publicId, ...tie.map((entry) => entry.publicId), a.publicId]);
    expect(JSON.stringify(board)).not.toMatch(/email|password|accountStatus|communityRole|userId/);
    expect(JSON.stringify(board)).not.toContain(a.id);
    expect(board.dailyChampionCoins).toBe(100);
  });
  it('returns only the personal aggregate, defaults to zero and does not initialize wallets/stats on reads', async () => {
    const a = await user('alice'); const blocked = await user('suspended', 'suspended');
    expect(await rewards.me(a.id)).toEqual({ completedGames: 0, survived: 0, eligibleRounds: 0, rateBasisPoints: 0, demonTotal: 0, demonMvpCount: 0, rankedGames: 0 });
    expect(await db.getRepository(RailPlayerStats).count()).toBe(0);
    expect(await db.getRepository(WalletBalance).count()).toBe(0);
    await db.getRepository(RailPlayerStats).insert({ userId: a.id, completedGames: 2, survived: 3, eligibleRounds: 6, demonTotal: 25, demonMvpCount: 1, rankedGames: 1 });
    expect(await rewards.me(a.id)).toMatchObject({ rateBasisPoints: 5000, completedGames: 2, rankedGames: 1 });
    await expect(rewards.me(blocked.id)).rejects.toMatchObject({ response: { code: 'RAIL_ACTIVE_ACCOUNT_REQUIRED' } });
  });
  it('validates actual calendar dates, future dates and runtime malformed query values', async () => {
    for (const date of ['2026-02-30', '2026-13-01', '2026-9-12', '2026-09-14', '<script>', null, ['2026-09-12']]) await expect(rewards.leaderboard(date as string)).rejects.toMatchObject({ response: { code: 'RAIL_DATE_INVALID' } });
    expect((await rewards.leaderboard()).date).toBe('2026-09-13');
    await expect(rewards.settleDay('2026-02-30')).rejects.toMatchObject({ response: { code: 'RAIL_DATE_INVALID' } });
  });
  it('awards exactly one daily 100-coin credit with ledger/grant/notification and repeat settlement is inert', async () => {
    const a = await user('alice'); const b = await user('bob');
    await db.transaction((manager) => assets.ensurePlatformState(manager, a.id));
    const before = Number((await db.getRepository(WalletBalance).findOneByOrFail({ userId: a.id, currency: 'office_coin' })).balance);
    await score(a, 10000); await score(b, 5000, yesterday, '2026-09-12T01:00:00Z', 80);
    expect(await rewards.settleDay(yesterday)).toBe(true);
    expect(await rewards.settleDay(yesterday)).toBe(false);
    expect(await db.getRepository(RailDailyAward).count()).toBe(1);
    expect(await db.getRepository(RewardGrant).count({ where: { sourceType: 'rail_daily_champion' } })).toBe(1);
    const ledgers = await db.getRepository(WalletLedger).find({ where: { sourceType: 'rail_daily_champion' } });
    expect(ledgers).toHaveLength(1); expect(Number(ledgers[0].delta)).toBe(100);
    expect(Number((await db.getRepository(WalletBalance).findOneByOrFail({ userId: a.id, currency: 'office_coin' })).balance)).toBe(before + 100);
    expect(await db.getRepository(WalletBalance).count({ where: { userId: b.id } })).toBe(0);
    const notices = await db.getRepository(CommunityNotification).find({ where: { eventType: 'rail_daily_champion' } });
    expect(notices).toHaveLength(1); expect(notices[0].payload.resourcePath).toBe(`/games/rail/leaderboard?date=${yesterday}`);
    expect((await rewards.leaderboard(yesterday)).award).toMatchObject({ status: 'awarded', coins: 100, winner: { publicId: a.publicId } });
  });
  it('waits until Beijing 00:05 and never settles current-day scores early', async () => {
    const a = await user('alice'); await score(a);
    jest.setSystemTime(new Date('2026-09-12T16:04:59.999Z'));
    expect(await rewards.settleDay(yesterday)).toBe(false);
    expect(await rewards.settleDay('2026-09-13')).toBe(false);
    expect(await db.getRepository(RailDailyAward).count()).toBe(0);
    jest.setSystemTime(new Date('2026-09-12T16:05:00.000Z'));
    expect(await rewards.settleDay(yesterday)).toBe(true);
    expect(await rewards.settleDay('2026-09-13')).toBe(false);
  });
  it('excludes suspended/deleted winners and finalizes no-player days without issuing money', async () => {
    const a = await user('alice', 'suspended'); const b = await user('bob');
    await score(a, 10000); await score(b, 5000);
    expect(await rewards.settleDay(yesterday)).toBe(true);
    expect((await db.getRepository(RailDailyAward).findOneByOrFail({ serviceDate: yesterday })).winnerUserId).toBe(b.id);
    await score(a, 10000, '2026-09-11');
    expect(await rewards.settleDay('2026-09-11')).toBe(true);
    expect((await rewards.leaderboard('2026-09-11')).award).toMatchObject({ status: 'no_eligible_score', winner: null, coins: 0 });
    expect(await db.getRepository(WalletBalance).count({ where: { userId: a.id } })).toBe(0);
  });
  it('uses exactly one transaction manager for the prize, balance and notification and propagates failures', async () => {
    const a = await user('alice'); await score(a);
    let grantManager: EntityManager | undefined; let notificationManager: EntityManager | undefined;
    const grant = assets.grantReward.bind(assets);
    jest.spyOn(assets, 'grantReward').mockImplementation(async (manager, command) => { grantManager = manager; return grant(manager, command); });
    jest.spyOn(notifications, 'create').mockImplementation(async (manager) => { notificationManager = manager; throw new Error('synthetic rail notification failure'); });
    await expect(rewards.settleDay(yesterday)).rejects.toThrow('synthetic rail notification failure');
    expect(grantManager).toBeDefined(); expect(notificationManager).toBe(grantManager);
    // No rollback claim here: pg-mem does not emulate transaction rollback.
  });
  it('does not misreport unrelated unique failures as an already-completed daily claim', async () => {
    const a = await user('alice'); await score(a);
    jest.spyOn(db, 'transaction').mockRejectedValue(Object.assign(new Error('unrelated unique failure'), { code: '23505' }));
    await expect(rewards.settleDay(yesterday)).rejects.toThrow('unrelated unique failure');
  });
  it('treats a competing committed claim as a safe loser only after verifying the exact date row', async () => {
    const a = await user('alice'); await score(a);
    await db.getRepository(RailDailyAward).insert({ serviceDate: yesterday, winnerUserId: a.id, coins: 100, rateBasisPoints: 5000, awardedAt: new Date() });
    jest.spyOn(db, 'transaction').mockRejectedValue(Object.assign(new Error('synthetic concurrent claim'), { code: '23505' }));
    expect(await rewards.settleDay(yesterday)).toBe(false);
  });
  it('keeps settlement and automatic scan disabled behind the write gate', async () => {
    const a = await user('alice'); await score(a);
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'false';
    expect(await rewards.settleDay(yesterday)).toBe(false);
    await rewards.settleDue();
    expect(await db.getRepository(RailDailyAward).count()).toBe(0);
    expect(await db.getRepository(RewardGrant).count()).toBe(0);
  });
  it('scans prior dates as text and isolates a failed catch-up date so another date can settle', async () => {
    // pg-mem cannot group a CAST(date AS text) select. Assert the query and supply only raw date rows;
    // the production PostgreSQL rehearsal must execute this exact query against real date OID 1082.
    const repo = db.getRepository(RailDailyScore);
    const query = repo.createQueryBuilder('score');
    const select = jest.spyOn(query, 'select');
    jest.spyOn(query, 'getRawMany').mockResolvedValue([{ serviceDate: '2026-09-10' }, { serviceDate: '2026-09-11' }]);
    jest.spyOn(repo, 'createQueryBuilder').mockReturnValue(query);
    const settle = jest.spyOn(rewards, 'settleDay').mockRejectedValueOnce(new Error('temporary failure')).mockResolvedValueOnce(true);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    await rewards.settleDue();
    expect(select).toHaveBeenCalledWith('CAST(score.service_date AS text)', 'serviceDate');
    expect(settle.mock.calls).toEqual([['2026-09-10'], ['2026-09-11']]);
  });
});
