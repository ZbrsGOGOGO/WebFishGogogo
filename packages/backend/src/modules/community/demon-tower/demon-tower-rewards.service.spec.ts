import { Logger } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import { CommunityNotification, DemonTowerContribution, DemonTowerDailyAward, DemonTowerDailyProgress, DemonTowerWorldFloor, RewardGrant, User, WalletBalance, WalletLedger } from '../../../database/entities';
import { createLocalDevDataSource } from '../../../database/local-dev-datasource';
import { PlatformAssetsService } from '../../platform/platform-assets.service';
import { NotificationService } from '../notification.service';
import { DemonTowerRewardsService } from './demon-tower-rewards.service';
import { initialDemonTowerWorld } from './demon-tower.rules';

/** Real entity/query integration. pg-mem is not proof of locking or rollback; the PG rehearsal covers those. */
describe('DemonTowerRewardsService', () => {
  let db: DataSource;
  let rewards: DemonTowerRewardsService;
  let assets: PlatformAssetsService;
  let notifications: NotificationService;
  let now: Date;
  const originalEnv = { ...process.env };
  const yesterday = '2099-09-08';
  beforeEach(async () => {
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true'; process.env.FEATURE_COMMUNITY_DEMON_TOWER_ENABLED = 'true';
    now = new Date('2099-09-08T16:05:00Z');
    db = await createLocalDevDataSource();
    assets = new PlatformAssetsService({ now: () => now });
    notifications = new NotificationService(db);
    rewards = new DemonTowerRewardsService(db, assets, notifications, { now: () => now });
  });
  afterEach(async () => { rewards?.onModuleDestroy(); jest.restoreAllMocks(); if (db?.isInitialized) await db.destroy(); process.env = { ...originalEnv }; });
  async function user(label: string, status: User['accountStatus'] = 'active'): Promise<User> {
    const repo = db.getRepository(User);
    return repo.save(repo.create({ email: `${label}@tower-reward-test.invalid`, username: label, passwordHash: 'synthetic-only', displayName: label, accountStatus: status }));
  }
  async function score(actor: User, damage = 100, date = yesterday, at = '2099-09-08T03:00:00Z'): Promise<void> {
    await db.getRepository(DemonTowerDailyProgress).insert({ userId: actor.id, serviceDate: date, bossDamage: damage, officeCoins: 0, passageContribution: 0, bossAttempts: damage ? 1 : 0, actionCount: 1, level: 1, achievedAt: new Date(at), updatedAt: new Date(at) });
  }
  it('ranks only effective damage and active users, with earliest achievement and stable ties, without private IDs', async () => {
    const a = await user('alice'); const b = await user('bob'); const c = await user('carol'); const suspended = await user('suspended', 'suspended');
    await score(a, 100, yesterday, '2099-09-08T04:00:00Z'); await score(b, 100); await score(c, 150); await score(suspended, 900);
    await db.getRepository(DemonTowerDailyProgress).update({ userId: a.id, serviceDate: yesterday }, { passageContribution: 500 });
    const board = await rewards.leaderboard(yesterday, a.id);
    expect(board.entries.map((entry) => entry.publicId)).toEqual([c.publicId, b.publicId, a.publicId]);
    expect(board.me).toMatchObject({ rank: 3, score: 100, passageContribution: 500 });
    expect(JSON.stringify(board)).not.toMatch(/email|password|userId|requestHash|state|seed/);
    expect(JSON.stringify(board)).not.toContain(a.id);
    await expect(rewards.leaderboard(yesterday, suspended.id)).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_ACTIVE_ACCOUNT_REQUIRED' } });
  });
  it('shows construction separately, never treats it as score or initializes wallets on reads', async () => {
    const a = await user('alice');
    await db.getRepository(DemonTowerWorldFloor).insert(initialDemonTowerWorld());
    await db.getRepository(DemonTowerContribution).insert({ userId: a.id, floor: 1, bossDamage: 0, passageContribution: 50, level: 1, updatedAt: now });
    const list = await rewards.contributions('1', a.id);
    expect(list.me).toMatchObject({ rank: 1, bossDamage: 0, passageContribution: 50, score: 0 });
    expect((await rewards.leaderboard()).entries).toEqual([]);
    expect(await db.getRepository(WalletBalance).count()).toBe(0);
    expect(await db.getRepository(RewardGrant).count()).toBe(0);
  });
  it('returns only the top 50 publicly but the exact caller rank beyond 50 for both independent boards', async () => {
    // pg-mem cannot count DISTINCT composite records of mixed types (date/UUID or int/UUID).
    // These joins are many-to-one and each score PK occurs once, so COUNT(*) is equivalent here.
    // The real PostgreSQL rehearsal executes the original, unmodified TypeORM queries as well.
    const createRunner = db.createQueryRunner.bind(db);
    jest.spyOn(db, 'createQueryRunner').mockImplementation((mode) => {
      const runner = createRunner(mode); const query = runner.query.bind(runner);
      jest.spyOn(runner, 'query').mockImplementation(async (sql: string, parameters?: unknown[], structured?: boolean) => {
        const compatible = sql.replace(/COUNT\(DISTINCT\("score"\."(?:service_date|floor)", "score"\."user_id"\)\)/g, 'COUNT(*)');
        return structured === true ? query(compatible, parameters, true) : query(compatible, parameters);
      });
      return runner;
    });
    const actors: User[] = [];
    for (let index = 0; index < 53; index++) actors.push(await user(`rank-${index}`));
    const suspended = await user('hidden-leader', 'suspended');
    const zero = await user('zero-input');
    await db.getRepository(DemonTowerWorldFloor).insert(initialDemonTowerWorld());
    for (const [index, actor] of actors.entries()) {
      await score(actor, 100, yesterday, new Date(Date.parse('2099-09-08T03:00:00Z') + index * 1000).toISOString());
      await db.getRepository(DemonTowerContribution).insert({ userId: actor.id, floor: 1, bossDamage: 100, passageContribution: 100 - index, level: 1, updatedAt: now });
    }
    await score(suspended, 900); await score(zero, 0);
    await db.getRepository(DemonTowerContribution).insert([
      { userId: suspended.id, floor: 1, bossDamage: 900, passageContribution: 900, level: 1, updatedAt: now },
      { userId: zero.id, floor: 1, bossDamage: 0, passageContribution: 0, level: 1, updatedAt: now },
    ]);
    const caller = actors[52];
    await db.getRepository(User).update({ id: caller.id }, { displayName: '最新昵称' });
    for (const board of [await rewards.leaderboard(yesterday, caller.id), await rewards.contributions('1', caller.id)]) {
      expect(board.entries).toHaveLength(50);
      expect(board.entries.map((entry) => entry.publicId)).toEqual(actors.slice(0, 50).map((actor) => actor.publicId));
      expect(board.me).toMatchObject({ rank: 53, publicId: caller.publicId, displayName: '最新昵称', bossDamage: 100, score: 100 });
      expect(board.entries).not.toContainEqual(expect.objectContaining({ publicId: caller.publicId }));
      expect(JSON.stringify(board)).not.toMatch(/email|password|userId|requestHash|seed/);
      expect(JSON.stringify(board)).not.toContain(caller.id);
    }
    expect((await rewards.leaderboard(yesterday)).me).toBeNull();
    expect((await rewards.contributions('1')).me).toBeNull();
    expect((await rewards.leaderboard(yesterday, zero.id)).me).toBeNull();
    expect((await rewards.contributions('1', zero.id)).me).toBeNull();
    expect(await db.getRepository(WalletBalance).count()).toBe(0);
    expect(await db.getRepository(RewardGrant).count()).toBe(0);
  });
  it('credits one 100-coin grant, ledger, award and notification and makes retries inert', async () => {
    const a = await user('alice'); await score(a);
    expect(await rewards.settleDay(yesterday)).toBe(true);
    expect(await rewards.settleDay(yesterday)).toBe(false);
    expect(await db.getRepository(DemonTowerDailyAward).count()).toBe(1);
    expect(await db.getRepository(RewardGrant).count({ where: { sourceType: 'demon_tower_daily_champion' } })).toBe(1);
    const ledger = await db.getRepository(WalletLedger).find({ where: { sourceType: 'demon_tower_daily_champion' } });
    expect(ledger).toHaveLength(1); expect(Number(ledger[0].delta)).toBe(100);
    expect(Number((await db.getRepository(WalletBalance).findOneByOrFail({ userId: a.id, currency: 'office_coin' })).balance)).toBe(600);
    expect(await db.getRepository(CommunityNotification).count({ where: { eventType: 'demon_tower_daily_champion' } })).toBe(1);
    expect((await db.getRepository(CommunityNotification).findOneByOrFail({ eventType: 'demon_tower_daily_champion' })).payload.resourcePath).toBe(`/games/demon-tower/leaderboard?date=${yesterday}`);
    expect((await rewards.leaderboard(yesterday)).award).toEqual({ status: 'awarded', officeCoins: 100, winnerPublicId: a.publicId });
  });
  it('does not reward construction-only, zero-input or inactive players', async () => {
    const a = await user('alice', 'suspended'); const b = await user('bob');
    await score(a, 300); await score(b, 0);
    await db.getRepository(DemonTowerDailyProgress).update({ userId: b.id, serviceDate: yesterday }, { passageContribution: 500 });
    expect(await rewards.settleDay(yesterday)).toBe(true);
    expect((await rewards.leaderboard(yesterday)).award).toMatchObject({ status: 'no_eligible_player', officeCoins: 0 });
    expect(await db.getRepository(WalletBalance).count()).toBe(0);
  });
  it('honors Shanghai 00:05 cutoff, validates dates and never awards the current day', async () => {
    const a = await user('alice'); await score(a);
    now = new Date('2099-09-08T16:04:59.999Z');
    expect(await rewards.settleDay(yesterday)).toBe(false);
    now = new Date('2099-09-08T16:05:00.000Z');
    expect(await rewards.settleDay(yesterday)).toBe(true);
    expect(await rewards.settleDay('2099-09-09')).toBe(false);
    for (const date of ['2099-02-30', '2099-09-10', null, ['2099-09-08']]) await expect(rewards.leaderboard(date as string)).rejects.toMatchObject({ response: { code: 'DEMON_TOWER_DATE_INVALID' } });
  });
  it('uses the same transaction manager for money and notices and propagates notice failure', async () => {
    const a = await user('alice'); await score(a);
    let grantManager: EntityManager | undefined; let noticeManager: EntityManager | undefined;
    const grant = assets.grantReward.bind(assets);
    jest.spyOn(assets, 'grantReward').mockImplementation(async (manager, command) => { grantManager = manager; return grant(manager, command); });
    jest.spyOn(notifications, 'create').mockImplementation(async (manager) => { noticeManager = manager; throw new Error('synthetic notice failure'); });
    await expect(rewards.settleDay(yesterday)).rejects.toThrow('synthetic notice failure');
    expect(grantManager).toBeDefined(); expect(noticeManager).toBe(grantManager);
  });
  it('holds user lock before claiming the date, consistent with account lifecycle', async () => {
    const a = await user('alice'); await score(a);
    const seen: string[] = [];
    const createRunner = db.createQueryRunner.bind(db);
    jest.spyOn(db, 'createQueryRunner').mockImplementation((mode) => {
      const runner = createRunner(mode); const query = runner.query.bind(runner);
      jest.spyOn(runner, 'query').mockImplementation(async (sql: string, parameters?: unknown[], structured?: boolean) => { seen.push(sql); return structured === true ? query(sql, parameters, true) : query(sql, parameters); });
      return runner;
    });
    await rewards.settleDay(yesterday);
    const userLock = seen.findIndex((sql) => sql.includes('"users"') && sql.includes('FOR NO KEY UPDATE'));
    const awardInsert = seen.findIndex((sql) => sql.startsWith('INSERT INTO "demon_tower_daily_awards"'));
    expect(userLock).toBeGreaterThanOrEqual(0); expect(awardInsert).toBeGreaterThan(userLock);
  });
  it('honors both feature and maintenance gates and does not scan or initialize anything', async () => {
    const a = await user('alice'); await score(a);
    for (const name of ['FEATURE_COMMUNITY_WRITES_ENABLED', 'FEATURE_COMMUNITY_DEMON_TOWER_ENABLED']) {
      process.env[name] = 'false';
      expect(await rewards.settleDay(yesterday)).toBe(false); await rewards.settleDue();
      process.env[name] = 'true';
    }
    expect(await db.getRepository(DemonTowerDailyAward).count()).toBe(0);
    expect(await db.getRepository(WalletBalance).count()).toBe(0);
  });
  it('does not swallow unrelated unique errors and only accepts an existing exact award as a concurrent loser', async () => {
    const a = await user('alice'); await score(a);
    jest.spyOn(db, 'transaction').mockRejectedValue(Object.assign(new Error('other constraint'), { code: '23505' }));
    await expect(rewards.settleDay(yesterday)).rejects.toThrow('other constraint');
    await db.getRepository(DemonTowerDailyAward).insert({ serviceDate: yesterday, winnerUserId: a.id, bossDamage: 100, coins: 100, awardedAt: now });
    expect(await rewards.settleDay(yesterday)).toBe(false);
  });
  it('scans date strings and isolates one failed catch-up award without disclosing SQL or user data', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const query = db.getRepository(DemonTowerDailyProgress).createQueryBuilder('score');
    jest.spyOn(query, 'getRawMany').mockResolvedValue([{ serviceDate: '2099-09-06' }, { serviceDate: '2099-09-07' }]);
    const repository = db.getRepository(DemonTowerDailyProgress);
    jest.spyOn(repository, 'createQueryBuilder').mockReturnValue(query);
    const settle = jest.spyOn(rewards, 'settleDay').mockRejectedValueOnce(new Error('private SQL synthetic-user')).mockResolvedValueOnce(true);
    await rewards.settleDue();
    expect(query.getQuery().replaceAll('"', '')).toContain('CAST(score.service_date AS text)');
    expect(settle.mock.calls).toEqual([['2099-09-06'], ['2099-09-07']]);
    expect(JSON.stringify(warn.mock.calls)).toContain('2099-09-06');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private SQL');
  });
});
