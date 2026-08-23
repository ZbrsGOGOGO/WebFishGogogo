import { randomUUID } from 'node:crypto';

import type { DataSource } from 'typeorm';

import {
  EnergyState,
  Guild,
  GuildBossContribution,
  GuildBossRun,
  GuildLedger,
  GuildMember,
  User,
  WalletBalance,
} from '../../database/entities';
import { createLocalDevDataSource } from '../../database/local-dev-datasource';
import { cumulativeExperienceForLevel, PlatformAssetsService } from '../platform';
import type { CommunityClock } from './community-clock';
import { GuildService } from './guild.service';

describe('GuildService unified economy', () => {
  let dataSource: DataSource;
  let assets: PlatformAssetsService;
  let service: GuildService;
  let now: Date;
  const originalEnv = { ...process.env };

  beforeAll(() => {
    process.env.LOCAL_DEV = 'true';
    process.env.NODE_ENV = 'test';
    delete process.env.FEATURE_COMMUNITY_WRITES_ENABLED;
  });

  beforeEach(async () => {
    dataSource = await createLocalDevDataSource();
    now = new Date('2026-08-23T08:00:00.000Z');
    const clock: CommunityClock = { now: () => new Date(now) };
    assets = new PlatformAssetsService(clock);
    service = new GuildService(dataSource, assets, clock);
  });

  afterEach(async () => dataSource.destroy());
  afterAll(() => { process.env = originalEnv; });

  it('creates, joins, donates and upgrades without minting a second currency', async () => {
    const owner = await activeUser('guild-owner@example.com', '负责人');
    const member = await activeUser('guild-member@example.com', '成员');
    await prepare(owner.id, 22_500);
    await prepare(member.id, 0);

    const created = await service.create(
      owner.id,
      '准时下班联盟',
      'guild-create-owner-0001',
    );
    const replay = await service.create(
      owner.id,
      '准时下班联盟',
      'guild-create-owner-0001',
    );
    expect(replay).toEqual(created);
    expect((created as any).player.officeCoins).toBe(3_000);
    const guild = await dataSource.getRepository(Guild).findOneByOrFail({
      nameKey: '准时下班联盟',
    });
    expect(await dataSource.getRepository(GuildMember).count()).toBe(1);
    expect(await officeCoins(owner.id)).toBe(3_000);

    const joined = await service.join(member.id, guild.id, 'guild-join-member-0001') as any;
    expect(joined.membership.guild.memberCount).toBe(2);
    const donated = await service.donate(member.id, 500, 'guild-donate-member-0001') as any;
    expect(donated.player.officeCoins).toBe(0);
    expect(donated.membership.guild.treasury).toBe(500);
    expect(donated.membership.me.activity).toBe(500);
    expect(await officeCoins(member.id)).toBe(0);
    expect(await dataSource.getRepository(GuildLedger).count()).toBe(1);

    const ownerDonation = await service.donate(owner.id, 2_500, 'guild-donate-owner-0001') as any;
    expect(ownerDonation.membership.guild.treasury).toBe(3_000);
    expect(ownerDonation.membership.me.activity).toBe(500);
    const upgraded = await service.upgradeBuilding(
      owner.id,
      'project_room',
      'guild-building-owner-0001',
    ) as any;
    expect(upgraded.membership.guild.treasury).toBe(1_000);
    expect(upgraded.membership.buildings.find((item: any) => item.key === 'project_room').level).toBe(1);
    expect(await dataSource.getRepository(GuildLedger).count()).toBe(3);
  });

  it('keeps the system locked below Lv.15 and does not debit the creation cost', async () => {
    const user = await activeUser('guild-locked@example.com', '新人');
    const overview = await service.overview(user.id) as any;
    expect(overview.unlocked).toBe(false);
    await expect(service.create(user.id, '新人小组', 'guild-create-locked-0001'))
      .rejects.toMatchObject({ response: { code: 'GUILD_LEVEL_LOCKED' } });
    expect(await officeCoins(user.id)).toBe(500);
    expect(await dataSource.getRepository(Guild).count()).toBe(0);
  });

  it('shares one server-authoritative boss health pool and rewards each member once per day', async () => {
    const owner = await activeUser('boss-owner@example.com', '负责人');
    const member = await activeUser('boss-member@example.com', '协作成员');
    await prepare(owner.id, 20_000);
    await prepare(member.id, 0);
    const created = await service.create(owner.id, '攻坚项目组', 'boss-guild-create-0001') as any;
    await service.join(member.id, created.membership.guild.id, 'boss-guild-join-0001');

    const ownerResult = await service.attackBoss(owner.id, 'boss-owner-attack-0001') as any;
    const replay = await service.attackBoss(owner.id, 'boss-owner-attack-0001') as any;
    expect(replay).toEqual(ownerResult);
    expect(ownerResult.membership.boss.leaderboard).toHaveLength(1);
    expect(ownerResult.membership.boss.remainingHp).toBeLessThan(
      ownerResult.membership.boss.maxHp,
    );
    expect(ownerResult.membership.boss.myContribution.damage).toBeGreaterThan(0);
    expect(ownerResult.player.energy).toBe(110);
    expect(await officeCoins(owner.id)).toBe(620);

    await expect(service.attackBoss(owner.id, 'boss-owner-attack-0002'))
      .rejects.toMatchObject({ response: { code: 'GUILD_BOSS_DAILY_ATTEMPT_USED' } });
    const memberResult = await service.attackBoss(member.id, 'boss-member-attack-0001') as any;
    expect(memberResult.membership.boss.leaderboard).toHaveLength(2);
    expect(memberResult.membership.boss.remainingHp).toBeLessThan(
      ownerResult.membership.boss.remainingHp,
    );
    expect(await dataSource.getRepository(GuildBossRun).count()).toBe(1);
    expect(await dataSource.getRepository(GuildBossContribution).count()).toBe(2);
    expect((await dataSource.getRepository(EnergyState).findOneByOrFail({ userId: member.id })).balance)
      .toBe(110);
    expect(await officeCoins(member.id)).toBe(620);

    now = new Date('2026-08-24T08:00:00.000Z');
    const nextDay = await service.attackBoss(owner.id, 'boss-owner-attack-next-day-0001') as any;
    expect(nextDay.membership.boss.serviceDate).toBe('2026-08-24');
    expect(await dataSource.getRepository(GuildBossRun).count()).toBe(2);
  });

  async function prepare(userId: string, extraCoins: number): Promise<void> {
    await dataSource.transaction(async (manager) => {
      await assets.ensurePlatformState(manager, userId);
      await assets.addExperience(manager, userId, cumulativeExperienceForLevel(15));
      if (extraCoins > 0) {
        await assets.creditWallet(manager, userId, 'office_coin', extraCoins, {
          sourceType: 'guild_test',
          sourceId: userId,
          reason: 'guild-test-fixture',
          idempotencyKey: `guild-test-credit:${userId}`,
        });
      }
    });
  }

  async function officeCoins(userId: string): Promise<number> {
    const wallet = await dataSource.getRepository(WalletBalance).findOneByOrFail({
      userId,
      currency: 'office_coin',
    });
    return Number(wallet.balance);
  }

  function activeUser(email: string, displayName: string): Promise<User> {
    return dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        email,
        emailNormalized: email,
        passwordHash: 'unused-test-hash',
        displayName,
        publicId: randomUUID(),
        accountStatus: 'active',
        socialVerificationStatus: 'unverified',
        communityRole: 'user',
        emailVerifiedAt: now,
        passwordChangedAt: now,
        onboardingCompleted: true,
      }),
    );
  }
});
