import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import { PLAY_DAILY_CHAMPION_COINS, PLAY_GAME_KEYS, type ArcadeGameKey } from '@stealth-reader/shared';
import { CommunityNotification, PlayDailyAward, PlayDailyScore, PlayerProfile, RewardGrant, User, WalletBalance, WalletLedger } from '../../../database/entities';
import { createLocalDevDataSource } from '../../../database/local-dev-datasource';
import { PlatformAssetsService } from '../../platform/platform-assets.service';
import { NotificationService } from '../notification.service';
import { PlayRewardsService } from './play-rewards.service';

/** Real query/ledger integration. PostgreSQL lock and rollback assertions live in the isolated rehearsal script. */
describe('PlayRewardsService entity integration', () => {
  let db: DataSource;
  let assets: PlatformAssetsService;
  let notifications: NotificationService;
  let rewards: PlayRewardsService;
  const originalEnv = { ...process.env };
  const today = '2026-09-11';
  const yesterday = '2026-09-10';

  beforeEach(async () => {
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true';
    db = await createLocalDevDataSource();
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'hrtime'] }).setSystemTime(new Date('2026-09-10T16:05:00.000Z'));
    assets = new PlatformAssetsService({ now: () => new Date() });
    notifications = new NotificationService(db);
    rewards = new PlayRewardsService(db, assets, notifications);
  });
  afterEach(async () => {
    rewards?.onModuleDestroy(); jest.useRealTimers(); jest.restoreAllMocks();
    if (db?.isInitialized) await db.destroy();
    process.env = { ...originalEnv };
  });
  async function user(label: string, status: User['accountStatus'] = 'active', publicId?: string): Promise<User> {
    const repo = db.getRepository(User);
    return repo.save(repo.create({ email: `${label}@play-reward-test.invalid`, username: label, publicId, passwordHash: 'not-a-real-password', displayName: label, accountStatus: status }));
  }
  async function score(a: User, value: number, options: { gameKey?: ArcadeGameKey; date?: string; mode?: 'solo' | 'room'; at?: string } = {}): Promise<void> {
    await db.getRepository(PlayDailyScore).insert({ serviceDate: options.date ?? yesterday, gameKey: options.gameKey ?? 'snake', userId: a.id, score: value, mode: options.mode ?? 'solo', roomId: null, achievedAt: new Date(options.at ?? '2026-09-10T08:00:00Z') });
  }
  async function wallet(a: User, balance: number): Promise<void> { await db.getRepository(WalletBalance).save({ userId: a.id, currency: 'office_coin', balance: String(balance) }); }

  it('sorts shared-mode daily scores by score then earliest achievement and hides private account fields', async () => {
    const a = await user('alice'); const b = await user('bob'); const c = await user('carol'); const banned = await user('banned', 'banned');
    await score(a, 100, { mode: 'solo', at: '2026-09-10T09:00:00Z' });
    await score(b, 100, { mode: 'room', at: '2026-09-10T08:00:00Z' });
    await score(c, 90); await score(banned, 999);
    const board = await rewards.leaderboard('snake', yesterday);
    expect(board.items.map((entry) => entry.publicId)).toEqual([b.publicId, a.publicId, c.publicId]);
    expect(board.items.map((entry) => entry.rank)).toEqual([1, 2, 3]);
    expect(board.items[0].mode).toBe('room'); expect(board.items[1].mode).toBe('solo');
    expect(JSON.stringify(board)).not.toMatch(/password|email|userId|accountStatus|communityRole/);
    expect(JSON.stringify(board)).not.toContain(a.id);
  });

  it('validates real calendar dates and rejects future boards', async () => {
    for (const invalid of ['2026-02-30', '2026-09-12', '2026-9-10', 'not-a-date', '2026-09-10T00:00:00Z']) {
      await expect(rewards.leaderboard('snake', invalid)).rejects.toMatchObject({ response: { code: 'PLAY_DATE_INVALID' } });
    }
    expect((await rewards.leaderboard('snake')).date).toBe(today);
  });

  it('credits exactly one 100-coin champion grant/ledger/notification and ignores repeated settlement', async () => {
    const a = await user('alice'); const b = await user('bob');
    await db.transaction((manager) => assets.ensurePlatformState(manager, a.id));
    const before = Number((await db.getRepository(WalletBalance).findOneByOrFail({ userId: a.id, currency: 'office_coin' })).balance);
    await score(a, 100); await score(b, 90);
    expect(await rewards.settleDay(yesterday, 'snake')).toBe(true);
    expect(await rewards.settleDay(yesterday, 'snake')).toBe(false);
    expect(Number((await db.getRepository(WalletBalance).findOneByOrFail({ userId: a.id, currency: 'office_coin' })).balance)).toBe(before + PLAY_DAILY_CHAMPION_COINS);
    expect(await db.getRepository(PlayDailyAward).count()).toBe(1);
    expect(await db.getRepository(RewardGrant).count({ where: { sourceType: 'arcade_daily_champion' } })).toBe(1);
    const ledgers = await db.getRepository(WalletLedger).find({ where: { sourceType: 'arcade_daily_champion' } });
    expect(ledgers).toHaveLength(1); expect(Number(ledgers[0].delta)).toBe(100);
    expect(await db.getRepository(CommunityNotification).count({ where: { eventType: 'arcade_daily_champion' } })).toBe(1);
    expect(await db.getRepository(WalletBalance).count({ where: { userId: b.id } })).toBe(0);
    expect((await rewards.leaderboard('snake', yesterday)).award).toMatchObject({ status: 'awarded', coins: 100, winner: { publicId: a.publicId } });
  });

  it('does not settle yesterday before Beijing 00:05, and never pays today', async () => {
    const a = await user('alice'); await score(a, 100); await score(a, 100, { date: today });
    jest.setSystemTime(new Date('2026-09-10T16:04:59.999Z'));
    expect(await rewards.settleDay(yesterday, 'snake')).toBe(false);
    expect(await rewards.settleDay(today, 'snake')).toBe(false);
    expect(await db.getRepository(PlayDailyAward).count()).toBe(0);
    jest.setSystemTime(new Date('2026-09-10T16:05:00.000Z'));
    expect(await rewards.settleDay(yesterday, 'snake')).toBe(true);
    expect(await rewards.settleDay(today, 'snake')).toBe(false);
  });

  it('excludes suspended winners and leaves a zero-coin terminal award when nobody is eligible', async () => {
    const a = await user('alice', 'suspended'); const b = await user('bob');
    await score(a, 999); await score(b, 50);
    expect(await rewards.settleDay(yesterday, 'snake')).toBe(true);
    expect((await db.getRepository(PlayDailyAward).findOneByOrFail({ serviceDate: yesterday, gameKey: 'snake' })).winnerUserId).toBe(b.id);
    await score(a, 999, { gameKey: 'tank' });
    expect(await rewards.settleDay(yesterday, 'tank')).toBe(true);
    expect((await rewards.leaderboard('tank', yesterday)).award).toMatchObject({ status: 'no_eligible_score', winner: null, coins: 0 });
    expect(await db.getRepository(WalletBalance).count({ where: { userId: a.id } })).toBe(0);
  });

  it('caps daily six-game winnings at 600 coins using six distinct stable reward sources', async () => {
    const a = await user('alice');
    await db.transaction((manager) => assets.ensurePlatformState(manager, a.id));
    const before = Number((await db.getRepository(WalletBalance).findOneByOrFail({ userId: a.id, currency: 'office_coin' })).balance);
    for (const gameKey of PLAY_GAME_KEYS) { await score(a, 100, { gameKey }); await rewards.settleDay(yesterday, gameKey); await rewards.settleDay(yesterday, gameKey); }
    const grants = await db.getRepository(RewardGrant).find({ where: { sourceType: 'arcade_daily_champion' } });
    expect(grants).toHaveLength(6); expect(new Set(grants.map((entry) => entry.sourceId)).size).toBe(6);
    expect(Number((await db.getRepository(WalletBalance).findOneByOrFail({ userId: a.id, currency: 'office_coin' })).balance)).toBe(before + 600);
  });

  it('uses the exact same transaction manager for grant and notification and propagates notification failure', async () => {
    const a = await user('alice'); await score(a, 100);
    let grantManager: EntityManager | undefined; let noticeManager: EntityManager | undefined;
    const actualGrant = assets.grantReward.bind(assets);
    jest.spyOn(assets, 'grantReward').mockImplementation(async (manager, command) => { grantManager = manager; return actualGrant(manager, command); });
    jest.spyOn(notifications, 'create').mockImplementation(async (manager) => { noticeManager = manager; throw new Error('synthetic notification failure'); });
    await expect(rewards.settleDay(yesterday, 'snake')).rejects.toThrow('synthetic notification failure');
    expect(grantManager).toBeDefined(); expect(noticeManager).toBe(grantManager);
    // Intentionally no rollback assertion: pg-mem does NOT emulate PostgreSQL transactions.
  });

  it('locks only still-active award candidates in the locking query itself', async () => {
    const a = await user('alice'); await score(a, 100);
    const queries: { sql: string; parameters?: unknown[] }[] = [];
    jest.spyOn(db.logger, 'logQuery').mockImplementation((sql, parameters) => { queries.push({ sql, parameters }); });
    await rewards.settleDay(yesterday, 'snake');
    const candidateLock = queries.find((entry) => entry.sql.includes('FOR NO KEY UPDATE'));
    expect(candidateLock).toBeDefined();
    expect(candidateLock!.sql).toMatch(/WHERE .*"account_status"\s*=\s*\$2.*FOR NO KEY UPDATE/);
    expect(candidateLock!.parameters).toEqual([a.id, 'active']);
  });

  it('treats unique violations as a lost race only when this exact award is already committed', async () => {
    const unrelated = Object.assign(new Error('synthetic unrelated constraint'), { code: '23505' });
    await db.getRepository(PlayDailyAward).insert({ serviceDate: yesterday, gameKey: 'tank', winnerUserId: null, score: 0, coins: 0, awardedAt: new Date() });
    // Mock the post-rollback transaction rejection, not a pg-mem rollback that does not exist.
    jest.spyOn(db, 'transaction').mockRejectedValueOnce(unrelated);
    await expect(rewards.settleDay(yesterday, 'snake')).rejects.toBe(unrelated);
    await db.getRepository(PlayDailyAward).insert({ serviceDate: yesterday, gameKey: 'snake', winnerUserId: null, score: 0, coins: 0, awardedAt: new Date() });
    jest.spyOn(db, 'transaction').mockRejectedValueOnce(unrelated);
    expect(await rewards.settleDay(yesterday, 'snake')).toBe(false);
    expect(await db.getRepository(RewardGrant).count()).toBe(0);
  });

  it('builds a text-cast cutoff query and passes raw date strings unchanged to backfill', async () => {
    // pg-mem cannot execute this PostgreSQL grouped DATE→text projection.
    // Verify the actual query construction here; the isolated real-PG rehearsal
    // executes it and asserts every older positive-score group was settled.
    const repository = db.getRepository(PlayDailyScore);
    const query = repository.createQueryBuilder('score');
    jest.spyOn(repository, 'createQueryBuilder').mockReturnValue(query);
    jest.spyOn(query, 'getRawMany').mockResolvedValue([{ serviceDate: '2026-09-09', gameKey: 'snake' }, { serviceDate: yesterday, gameKey: 'tank' }]);
    const settlement = jest.spyOn(rewards, 'settleDay').mockResolvedValue(false);
    await rewards.settleDue();
    expect(query.getSql()).toMatch(/CAST\("score"\."service_date" AS text\)/);
    expect(query.getSql()).toMatch(/"score"\."service_date" < \$1/);
    expect(query.getParameters()).toEqual({ cutoff: today });
    expect(settlement.mock.calls).toEqual([['2026-09-09', 'snake'], [yesterday, 'tank']]);
  });

  it('isolates one failed date/game, settles later groups and retries the failed award without leaking error details', async () => {
    const a = await user('alice');
    const older = '2026-09-09';
    await score(a, 100, { date: older, gameKey: 'snake' });
    await score(a, 90, { date: older, gameKey: 'tank' });
    await score(a, 80, { gameKey: 'zhesi' });
    const pending = [{ serviceDate: older, gameKey: 'snake' }, { serviceDate: older, gameKey: 'tank' }, { serviceDate: yesterday, gameKey: 'zhesi' }];
    // Only the grouped scan is mocked for pg-mem; successful awards use the
    // real ledger path. No PostgreSQL rollback behavior is claimed here.
    const repository = db.getRepository(PlayDailyScore);
    const query = repository.createQueryBuilder('score');
    const build = jest.spyOn(repository, 'createQueryBuilder').mockReturnValueOnce(query);
    jest.spyOn(query, 'getRawMany').mockResolvedValue(pending);
    const settlement = jest.spyOn(rewards, 'settleDay').mockRejectedValueOnce(Object.assign(new Error(`private:${a.email}: SELECT * FROM users`), { name: 'PrivateFailureDetail' }));
    const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    await rewards.settleDue();
    expect(settlement.mock.calls).toEqual([[older, 'snake'], [older, 'tank'], [yesterday, 'zhesi']]);
    expect(await db.getRepository(PlayDailyAward).exist({ where: { serviceDate: older, gameKey: 'snake' } })).toBe(false);
    expect(await db.getRepository(PlayDailyAward).count()).toBe(2);
    expect(await db.getRepository(RewardGrant).count({ where: { sourceType: 'arcade_daily_champion' } })).toBe(2);
    expect(warning.mock.calls).toEqual([[`Daily game reward deferred for ${older}/snake; retained for retry without duplicate credit.`]]);
    expect(JSON.stringify(warning.mock.calls)).not.toMatch(/private:|SELECT|users|PrivateFailureDetail|alice/);

    build.mockReturnValueOnce(query);
    await rewards.settleDue();
    expect(settlement).toHaveBeenCalledTimes(6);
    expect(await db.getRepository(PlayDailyAward).count()).toBe(3);
    expect(await db.getRepository(RewardGrant).count({ where: { sourceType: 'arcade_daily_champion' } })).toBe(3);
    expect(await db.getRepository(WalletLedger).count({ where: { sourceType: 'arcade_daily_champion' } })).toBe(3);
    expect(await db.getRepository(CommunityNotification).count({ where: { eventType: 'arcade_daily_champion' } })).toBe(3);
    expect(warning).toHaveBeenCalledTimes(1);
  });

  it('releases the scan guard after query failure and logs only a static retry message', async () => {
    const repository = db.getRepository(PlayDailyScore);
    const query = repository.createQueryBuilder('score');
    jest.spyOn(repository, 'createQueryBuilder').mockReturnValue(query);
    const scan = jest.spyOn(query, 'getRawMany').mockRejectedValueOnce(new Error('private SQL credentials')).mockResolvedValue([{ serviceDate: yesterday, gameKey: 'tank' }]);
    const settlement = jest.spyOn(rewards, 'settleDay').mockResolvedValue(false);
    const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    await rewards.settleDue();
    expect(settlement).not.toHaveBeenCalled();
    expect(warning.mock.calls).toEqual([['Daily game reward scan deferred; will retry without duplicate credit.']]);
    await rewards.settleDue();
    expect(scan).toHaveBeenCalledTimes(2);
    expect(settlement.mock.calls).toEqual([[yesterday, 'tank']]);
  });

  it('does not pay or initialize wallets while community writes are disabled', async () => {
    const a = await user('alice'); await score(a, 100);
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'false';
    expect(await rewards.settleDay(yesterday, 'snake')).toBe(false); await rewards.settleDue();
    expect(await db.getRepository(PlayDailyAward).count()).toBe(0); expect(await db.getRepository(WalletBalance).count()).toBe(0);
  });

  it('requires active authentication for the office-coin board and performs no lazy wallet initialization', async () => {
    const a = await user('alice'); const suspended = await user('suspended', 'suspended');
    await expect(rewards.officeCoins(randomUUID())).rejects.toMatchObject({ response: { code: 'PLAY_ACTIVE_ACCOUNT_REQUIRED' } });
    await expect(rewards.officeCoins(suspended.id)).rejects.toMatchObject({ response: { code: 'PLAY_ACTIVE_ACCOUNT_REQUIRED' } });
    const board = await rewards.officeCoins(a.id);
    expect(board.items).toEqual([{ publicId: a.publicId, username: 'alice', displayName: 'alice', balance: 0, rank: 1 }]);
    expect(board.me).toEqual({ rank: 1, balance: 0 });
    expect(await db.getRepository(WalletBalance).count()).toBe(0); expect(await db.getRepository(PlayerProfile).count()).toBe(0);
    expect(await db.getRepository(RewardGrant).count()).toBe(0); expect(await db.getRepository(PlayDailyAward).count()).toBe(0);
  });

  it('ranks live balances, excludes inactive users and updates after spending without leaking account internals', async () => {
    const a = await user('alice'); const b = await user('bob'); const banned = await user('banned', 'banned');
    await wallet(a, 300); await wallet(b, 500); await wallet(banned, 9999);
    const first = await rewards.officeCoins(a.id);
    expect(first.items.map((entry) => entry.publicId)).toEqual([b.publicId, a.publicId]); expect(first.me).toEqual({ rank: 2, balance: 300 });
    expect(JSON.stringify(first)).not.toMatch(/email|password|userId|communityRole/); expect(JSON.stringify(first)).not.toContain(a.id);
    await wallet(b, 100);
    const afterSpending = await rewards.officeCoins(a.id);
    expect(afterSpending.items[0].publicId).toBe(a.publicId); expect(afterSpending.me).toEqual({ rank: 1, balance: 300 });
    expect(await db.getRepository(RewardGrant).count()).toBe(0); expect(await db.getRepository(WalletLedger).count()).toBe(0);
  });

  it('returns a stable public-ID tie order and an own rank outside the top 50', async () => {
    const people: User[] = [];
    for (let index = 1; index <= 52; index += 1) {
      people.push(await user(`member${index}`, 'active', `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`));
    }
    const last = people[51]; const board = await rewards.officeCoins(last.id);
    expect(board.items).toHaveLength(50); expect(board.items[0].publicId).toBe(people[0].publicId); expect(board.items[49].publicId).toBe(people[49].publicId);
    expect(board.me).toEqual({ rank: 52, balance: 0 });
    expect(await db.getRepository(WalletBalance).count()).toBe(0);
  });
});
