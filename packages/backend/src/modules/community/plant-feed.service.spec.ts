import { randomUUID } from 'node:crypto';

import { IsNull, type DataSource } from 'typeorm';

import { CommunityCommandReceipt } from '../../database/entities/community-command-receipt.entity';
import { CommunityNotification } from '../../database/entities/community-notification.entity';
import { DeskPlantCycle } from '../../database/entities/desk-plant-cycle.entity';
import { DeskPlantRewardClaim } from '../../database/entities/desk-plant-reward-claim.entity';
import { DeskPlant } from '../../database/entities/desk-plant.entity';
import { FriendEncouragement } from '../../database/entities/friend-encouragement.entity';
import { OutboxEvent } from '../../database/entities/outbox-event.entity';
import { PlayerProfile } from '../../database/entities/player-profile.entity';
import { PlayerProgression } from '../../database/entities/player-progression.entity';
import { RewardGrant } from '../../database/entities/reward-grant.entity';
import { User } from '../../database/entities/user.entity';
import { WalletBalance } from '../../database/entities/wallet-balance.entity';
import { WalletLedger } from '../../database/entities/wallet-ledger.entity';
import { createLocalDevDataSource } from '../../database/local-dev-datasource';
import { PlatformAssetsService } from '../platform';
import type { CommunityClock } from './community-clock';
import { DeskPlantService } from './desk-plant.service';
import { FeedService } from './feed.service';
import { NotificationService } from './notification.service';
import { RelationshipPolicyService } from './relationship-policy.service';
import { RelationshipService } from './relationship.service';

describe('DeskPlantService and FeedService integration', () => {
  let dataSource: DataSource;
  let now: Date;
  let plants: DeskPlantService;
  let feeds: FeedService;
  let relationships: RelationshipService;
  const clock: CommunityClock = { now: () => new Date(now) };
  const originalEnv = { ...process.env };

  beforeAll(() => {
    process.env.LOCAL_DEV = 'true';
    process.env.NODE_ENV = 'test';
    delete process.env.FEATURE_COMMUNITY_WRITES_ENABLED;
  });

  beforeEach(async () => {
    process.env.FEATURE_SOCIAL_VERIFICATION_ENABLED = 'false';
    now = new Date('2026-08-22T00:00:00Z');
    dataSource = await createLocalDevDataSource();
    const policy = new RelationshipPolicyService();
    const notifications = new NotificationService(dataSource);
    feeds = new FeedService(dataSource, policy, notifications, clock);
    plants = new DeskPlantService(
      dataSource,
      policy,
      new PlatformAssetsService(clock),
      notifications,
      feeds,
      clock,
    );
    relationships = new RelationshipService(
      dataSource,
      policy,
      notifications,
      clock,
    );
  });

  afterEach(async () => dataSource.destroy());
  afterAll(() => {
    process.env = originalEnv;
  });

  it('reads exact daily office-coin income/spend at Shanghai midnight without mutation or another account leakage', async () => {
    now = new Date('2026-09-10T17:00:00Z'); // Sep 11 01:00, before the separate farm 05:00 cutoff.
    const user = await activeUser('daily-a@example.com', 'Daily A');
    const other = await activeUser('daily-b@example.com', 'Daily B');
    const ledger = dataSource.getRepository(WalletLedger);
    async function entry(userId: string, delta: string, date: string, currency = 'office_coin') {
      await ledger.save({ userId, delta, currency, balanceAfter: '1000', sourceType: 'synthetic', sourceId: randomUUID(), reason: 'test', idempotencyKey: randomUUID(), createdAt: new Date(date) });
    }
    await entry(user.id, '100', '2026-09-10T16:00:00Z');
    await entry(user.id, '-30', '2026-09-10T16:30:00Z');
    await entry(user.id, '999', '2026-09-10T15:59:59.999Z');
    await entry(user.id, '888', '2026-09-11T16:00:00Z');
    await entry(user.id, '777', '2026-09-10T16:10:00Z', 'inspiration');
    await entry(other.id, '500', '2026-09-10T16:20:00Z');
    const count = await ledger.count();
    expect(await plants.dailyWallet(user.id)).toMatchObject({ date: '2026-09-11', income: '100', spent: '30', timeZone: 'Asia/Shanghai' });
    expect(await ledger.count()).toBe(count);
    expect(await dataSource.getRepository(WalletBalance).count()).toBe(0);
    await dataSource.getRepository(User).update(user.id, { accountStatus: 'suspended' });
    await expect(plants.dailyWallet(user.id)).rejects.toThrow('Active account required');
    await expect(plants.dailyWallet(randomUUID())).rejects.toThrow('Active account required');
  });

  it('uses a 30-second first cycle and replays harvest without duplicate rewards', async () => {
    const user = await activeUser('plant@example.com', 'Plant');
    const initial = await plants.overview(user.id);
    expect(initial.plant.firstCycle).toBe(true);
    expect(initial.crops[0]).toMatchObject({
      baseHarvestCoins: 20,
      nextOrderBonusCoins: 100,
      totalHarvestCoins: 120,
      estimatedNetCoins: 110,
      seedCost: 10,
    });
    const cared = await plants.care(user.id, 'plant-care-first-key');
    const caredReplay = await plants.care(user.id, 'plant-care-first-key');
    expect(caredReplay).toEqual(cared);
    expect((cared as any).farm.state).toBe('growing');
    expect((cared as any).farm.plant.cycleSeconds).toBe(30);
    expect((cared as any).farm.plant.firstCycle).toBe(true);
    expect(await dataSource.getRepository(DeskPlantCycle).count()).toBe(1);

    now = new Date(now.getTime() + 31_000);
    const harvested = await plants.harvestAndCare(
      user.id,
      'plant-harvest-first-key',
    );
    const replay = await plants.harvestAndCare(
      user.id,
      'plant-harvest-first-key',
    );
    expect(replay).toEqual(harvested);
    expect((harvested as any).reward).toEqual(
      expect.objectContaining({
        standardRewardGranted: true,
        onboardingRewardGranted: true,
        baseCoins: 20,
        orderBonusCoins: 100,
        officeCoins: 120,
        summary: expect.stringContaining('当前余额 610'),
      }),
    );
    expect((harvested as any).farm.plant.cycleSeconds).toBe(5 * 60);
    expect((harvested as any).farm.plant.firstCycle).toBe(false);
    expect((harvested as any).farm.plant.level).toBe(2);
    expect((harvested as any).farm.growth).toMatchObject({
      farmCoins: 0,
      officeCoins: 610,
      totalHarvests: 1,
      skillPointsAvailable: 1,
    });
    expect((harvested as any).farm.crops).toHaveLength(6);
    expect((harvested as any).farm.tools).toHaveLength(3);
    expect((harvested as any).farm.skills).toHaveLength(3);
    expect(await dataSource.getRepository(DeskPlantCycle).count()).toBe(2);
    expect(await dataSource.getRepository(RewardGrant).count()).toBe(2);
    expect(await dataSource.getRepository(RewardGrant).countBy({
      sourceType: 'farm_harvest',
      sourceId: (await dataSource.getRepository(DeskPlantCycle).findOneByOrFail({
        userId: user.id,
        sequence: 1,
      })).id,
      ruleKey: 'farm-harvest-v1',
    })).toBe(1);
    expect(await dataSource.getRepository(WalletLedger).findOneByOrFail({
      userId: user.id,
      sourceType: 'farm_harvest',
    })).toMatchObject({ delta: 20, reason: 'farm-harvest-v1' });
    expect(await dataSource.getRepository(DeskPlantRewardClaim).count()).toBe(2);
    expect(
      (await dataSource.getRepository(DeskPlant).findOneByOrFail({ userId: user.id }))
        .plantExperience,
    ).toBe(52);
    expect(
      (await dataSource.getRepository(PlayerProgression).findOneByOrFail({
        userId: user.id,
      }))
        .experience,
    ).toBe(8);
    expect(
      (await dataSource.getRepository(WalletBalance).findOneByOrFail({
        userId: user.id,
        currency: 'office_coin',
      })).balance,
    ).toBe(610);
    expect(await dataSource.getRepository(OutboxEvent).count()).toBe(0);
  });

  it('keeps paying the base harvest after all three daily extra orders are used', async () => {
    const user = await activeUser('daily-base@example.com', 'Daily Base');
    await plants.care(user.id, 'daily-base-care');

    const harvests: any[] = [];
    now = new Date(now.getTime() + 31_000);
    harvests.push(await plants.harvestAndCare(user.id, 'daily-base-harvest-1'));
    for (let index = 2; index <= 4; index += 1) {
      now = new Date(now.getTime() + 5 * 60 * 1_000 + 1_000);
      harvests.push(await plants.harvestAndCare(user.id, `daily-base-harvest-${index}`));
    }

    expect(harvests.map((result) => result.reward.orderBonusCoins))
      .toEqual([100, 120, 140, 0]);
    expect(harvests.map((result) => result.reward.baseCoins))
      .toEqual([20, 20, 20, 20]);
    expect(harvests[3]).toMatchObject({
      farm: {
        state: 'growing',
        growth: { officeCoins: 900, totalHarvests: 4, ordersCompleted: 3 },
        crops: expect.arrayContaining([expect.objectContaining({
          nextOrderBonusCoins: 0,
          totalHarvestCoins: 20,
          estimatedNetCoins: 10,
        })]),
      },
      reward: {
        orderRewardGranted: false,
        baseCoins: 20,
        orderBonusCoins: 0,
        officeCoins: 20,
        summary: expect.stringContaining('本次仍已获得基础收益'),
      },
    });
    expect(await dataSource.getRepository(RewardGrant).countBy({
      sourceType: 'farm_harvest',
    })).toBe(4);
    expect(await dataSource.getRepository(RewardGrant).countBy({
      sourceType: 'farm_order',
    })).toBe(3);
    expect(await dataSource.getRepository(DeskPlantRewardClaim).countBy({
      rewardType: 'standard',
    })).toBe(3);
    expect((await dataSource.getRepository(PlayerProgression).findOneByOrFail({
      userId: user.id,
    })).experience).toBe(24);
  });

  it('reports the full batch seed cost without spending and allows an idempotent cheaper restart', async () => {
    const user = await activeUser('seed-balance@example.com', 'Seed Balance');
    await plants.care(user.id, 'seed-balance-first-care');
    // Returning Lv.13 player: four plots of coffee cost 440, not 110.
    await dataSource.getRepository(DeskPlantCycle).update(
      { userId: user.id },
      { harvestedAt: now },
    );
    await dataSource.getRepository(DeskPlant).update({ userId: user.id }, {
      state: 'idle',
      plantExperience: 1157,
      level: 13,
      totalHarvests: 1,
      selectedCropKey: 'overtime_coffee',
    });
    await dataSource.getRepository(WalletBalance).update(
      { userId: user.id, currency: 'office_coin' },
      { balance: '237' },
    );

    await expect(plants.care(user.id, 'seed-balance-insufficient')).rejects.toMatchObject({
      response: { code: 'OFFICE_COIN_INSUFFICIENT', required: 440, current: 237 },
    });
    const idle = await plants.overview(user.id);
    expect(idle).toMatchObject({
      state: 'idle',
      plant: { firstCycle: false },
      growth: { officeCoins: 237, plotCount: 4 },
    });
    expect(await dataSource.getRepository(DeskPlantCycle).count()).toBe(1);
    expect(await dataSource.getRepository(DeskPlantCycle).countBy({ harvestedAt: IsNull() })).toBe(0);
    expect(await dataSource.getRepository(WalletLedger).countBy({ sourceType: 'farm_seed' })).toBe(0);
    expect(await dataSource.getRepository(CommunityCommandReceipt).countBy({
      userId: user.id,
      idempotencyKey: 'seed-balance-insufficient',
    })).toBe(0);

    await plants.selectCrop(user.id, 'desk_mint', idle.growth.farmVersion, 'seed-balance-select-mint');
    const restarted = await plants.care(user.id, 'seed-balance-restart');
    expect(await plants.care(user.id, 'seed-balance-restart')).toEqual(restarted);
    // Even another key cannot debit an already growing cycle again.
    await plants.care(user.id, 'seed-balance-already-growing');
    expect(await plants.overview(user.id)).toMatchObject({
      state: 'growing',
      plant: { firstCycle: false, cycleSeconds: 300 },
      growth: { officeCoins: 197 },
    });
    expect(await dataSource.getRepository(DeskPlantCycle).count()).toBe(2);
    expect(await dataSource.getRepository(WalletLedger).countBy({ sourceType: 'farm_seed' })).toBe(1);
    expect(Number((await dataSource.getRepository(WalletLedger).findOneByOrFail({
      sourceType: 'farm_seed',
    })).delta)).toBe(-40);
  });

  it('keeps a mature harvest and its reward when the next batch is unaffordable', async () => {
    const user = await activeUser('harvest-balance@example.com', 'Harvest Balance');
    await plants.care(user.id, 'harvest-balance-first-care');
    now = new Date(now.getTime() + 31_000);
    await plants.harvestAndCare(user.id, 'harvest-balance-first-harvest');
    await dataSource.getRepository(DeskPlant).update({ userId: user.id }, {
      plantExperience: 1157,
      level: 13,
      selectedCropKey: 'overtime_coffee',
    });
    const matureCycle = await dataSource.getRepository(DeskPlantCycle).findOneByOrFail({
      userId: user.id,
      harvestedAt: IsNull(),
    });
    await dataSource.getRepository(DeskPlantCycle).update({ id: matureCycle.id }, {
      cropKey: 'meeting_tomato',
      maturesAt: now,
    });
    await dataSource.getRepository(WalletBalance).update(
      { userId: user.id, currency: 'office_coin' },
      { balance: '0' },
    );

    const harvested = await plants.harvestAndCare(user.id, 'harvest-balance-preserved');
    expect(harvested).toMatchObject({
      farm: {
        state: 'idle',
        plant: { firstCycle: false, experience: 1285, maturesAt: null },
        growth: { officeCoins: 396, totalHarvests: 2 },
      },
      reward: {
        orderRewardGranted: true,
        onboardingRewardGranted: false,
        farmExperience: 128,
        baseCoins: 264,
        orderBonusCoins: 132,
        officeCoins: 396,
        summary: expect.stringContaining('未开始下一轮'),
      },
    });
    expect(await plants.harvestAndCare(user.id, 'harvest-balance-preserved')).toEqual(harvested);
    expect(await plants.overview(user.id)).toMatchObject({
      state: 'idle',
      plant: { experience: 1285, firstCycle: false },
      growth: { officeCoins: 396, totalHarvests: 2 },
    });
    expect((await dataSource.getRepository(DeskPlantCycle).findOneByOrFail({
      id: matureCycle.id,
    })).harvestedAt).toEqual(now);
    expect(await dataSource.getRepository(DeskPlantCycle).count()).toBe(2);
    expect(await dataSource.getRepository(DeskPlantCycle).countBy({ harvestedAt: IsNull() })).toBe(0);
    expect(await dataSource.getRepository(WalletLedger).countBy({ sourceType: 'farm_seed' })).toBe(1);
    expect(await dataSource.getRepository(RewardGrant).count()).toBe(4);
    expect(await dataSource.getRepository(DeskPlantRewardClaim).count()).toBe(3);
  });

  it('treats feed as a capped, idempotent animation without moving assets', async () => {
    const [alice, bob] = await Promise.all([
      activeUser('alice@example.com', 'Alice'),
      activeUser('bob@example.com', 'Bob'),
    ]);
    const request = await relationships.sendRequest(
      alice.id,
      bob.publicId,
      'friend-for-feed-key',
    );
    await relationships.accept(bob.id, request.requestId!, 'accept-for-feed-key');

    const first = await feeds.send(
      alice.id,
      bob.publicId,
      'coffee',
      'feed-idempotency-key',
    );
    const replay = await feeds.send(
      alice.id,
      bob.publicId,
      'coffee',
      'feed-idempotency-key',
    );
    expect(replay).toEqual(first);
    expect(await dataSource.getRepository(FriendEncouragement).count()).toBe(1);
    expect(
      await dataSource.getRepository(CommunityNotification).countBy({
        eventType: 'feed.sent',
      }),
    ).toBe(1);
    expect(await dataSource.getRepository(RewardGrant).count()).toBe(0);
    expect(await dataSource.getRepository(WalletBalance).count()).toBe(0);
    await expect(
      feeds.send(alice.id, bob.publicId, 'cookie', 'feed-idempotency-key'),
    ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_KEY_REUSED' } });
    await expect(
      feeds.send(alice.id, bob.publicId, 'cookie', 'another-feed-key'),
    ).rejects.toMatchObject({ response: { code: 'ALREADY_FED_TODAY' } });

    const farm = await plants.overview(bob.id);
    expect(farm.pendingEncouragements).toBe(1);
  });

  it('requires a verified sender for friend feed only when verification is enabled', async () => {
    const [alice, bob] = await Promise.all([
      activeUser('verified-feed-alice@example.com', 'Feed Alice'),
      activeUser('verified-feed-bob@example.com', 'Feed Bob'),
    ]);
    const request = await relationships.sendRequest(
      alice.id,
      bob.publicId,
      'verified-feed-friend-request',
    );
    await relationships.accept(
      bob.id,
      request.requestId!,
      'verified-feed-friend-accept',
    );

    process.env.FEATURE_SOCIAL_VERIFICATION_ENABLED = 'true';
    await expect(
      feeds.send(
        alice.id,
        bob.publicId,
        'coffee',
        'unverified-feed-attempt',
      ),
    ).rejects.toMatchObject({
      response: { code: 'SOCIAL_VERIFICATION_REQUIRED' },
    });
    expect(await dataSource.getRepository(FriendEncouragement).count()).toBe(0);

    alice.socialVerificationStatus = 'verified';
    await dataSource.getRepository(User).save(alice);
    await expect(
      feeds.send(
        alice.id,
        bob.publicId,
        'coffee',
        'verified-feed-attempt',
      ),
    ).resolves.toMatchObject({ event: { type: 'coffee' } });
  });

  it('persists farm tool and skill upgrades behind version checks', async () => {
    const user = await activeUser('growth@example.com', 'Growth');
    await plants.care(user.id, 'growth-care');
    now = new Date(now.getTime() + 31_000);
    const harvested = await plants.harvestAndCare(user.id, 'growth-harvest') as any;

    const tool = await plants.upgradeTool(
      user.id,
      'watering_can',
      harvested.farm.growth.farmVersion,
      'growth-tool',
    ) as any;
    expect(tool.cost).toBe(200);
    expect(tool.farm.growth.farmCoins).toBe(0);
    expect(tool.farm.growth.officeCoins).toBe(410);
    expect(tool.farm.tools.find((item: any) => item.id === 'watering_can').level).toBe(1);
    await expect(plants.upgradeTool(user.id, 'planter_box', 2, 'growth-stale-tool'))
      .rejects.toMatchObject({ response: { code: 'FARM_VERSION_CONFLICT' } });

    const skill = await plants.upgradeSkill(
      user.id,
      'quick_care',
      tool.farm.growth.farmVersion,
      'growth-skill',
    ) as any;
    expect(skill.farm.growth.skillPointsAvailable).toBe(0);
    expect(skill.farm.skills.find((item: any) => item.id === 'quick_care').level).toBe(1);
    await expect(plants.selectCrop(
      user.id,
      'meeting_tomato',
      skill.farm.growth.farmVersion,
      'growth-locked-crop',
    )).rejects.toMatchObject({ response: { code: 'FARM_CROP_LOCKED' } });
  });

  it('uses the 05:00 service-day boundary and grants three daily orders', async () => {
    // 21:01Z = 次日北京时间 05:01；跨多轮后仍按 05:00 划分业务日。
    now = new Date('2026-08-21T21:01:00.000Z');
    const user = await activeUser('boundary@example.com', 'Boundary');
    await plants.care(user.id, 'boundary-care-key');

    now = new Date(now.getTime() + 31_000);
    const first = await plants.harvestAndCare(user.id, 'boundary-first-harvest');
    expect((first as any).reward.standardRewardGranted).toBe(true);

    now = new Date(now.getTime() + 20 * 60 * 60 * 1_000 + 1_000);
    const sameServiceDay = await plants.harvestAndCare(
      user.id,
      'boundary-same-day-harvest',
    );
    expect((sameServiceDay as any).reward.standardRewardGranted).toBe(true);

    now = new Date(now.getTime() + 20 * 60 * 60 * 1_000 + 1_000);
    const nextServiceDay = await plants.harvestAndCare(
      user.id,
      'boundary-next-day-harvest',
    );
    expect((nextServiceDay as any).reward.standardRewardGranted).toBe(true);
    expect(await dataSource.getRepository(RewardGrant).count()).toBe(6);
    expect(
      await dataSource.getRepository(DeskPlantRewardClaim).countBy({
        rewardType: 'standard',
      }),
    ).toBe(3);
    const plant = await dataSource.getRepository(DeskPlant).findOneByOrFail({
      userId: user.id,
    });
    expect(plant.streakDays).toBe(2);
    expect(plant.lastStandardRewardServiceDate).toBe('2026-08-23');
  });

  async function activeUser(email: string, displayName: string): Promise<User> {
    const user = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        email,
        emailNormalized: email,
        passwordHash: 'unused-test-hash',
        displayName,
        publicId: randomUUID(),
        accountStatus: 'active',
        socialVerificationStatus: 'unverified',
        emailVerifiedAt: now,
        passwordChangedAt: now,
        onboardingCompleted: true,
      }),
    );
    await dataSource.getRepository(PlayerProfile).save(
      dataSource.getRepository(PlayerProfile).create({
        userId: user.id,
        nickname: displayName,
        avatarKey: 'violet',
        bio: null,
        battleProfession: 'developer',
        privacySettings: {
          equipment: 'friends',
          battleRecord: 'friends',
          plant: 'friends',
          honors: 'friends',
          friendCount: 'self',
          recentActivity: 'self',
        },
        title: '初入工位',
      }),
    );
    return user;
  }
});
