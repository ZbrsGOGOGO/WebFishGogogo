import { randomUUID } from 'node:crypto';

import { type DataSource } from 'typeorm';

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

  it('uses a 30-second first cycle and replays harvest without duplicate rewards', async () => {
    const user = await activeUser('plant@example.com', 'Plant');
    const cared = await plants.care(user.id, 'plant-care-first-key');
    const caredReplay = await plants.care(user.id, 'plant-care-first-key');
    expect(caredReplay).toEqual(cared);
    expect((cared as any).farm.state).toBe('growing');
    expect((cared as any).farm.plant.cycleSeconds).toBe(30);
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
      }),
    );
    expect((harvested as any).farm.plant.cycleSeconds).toBe(5 * 60);
    expect((harvested as any).farm.plant.level).toBe(2);
    expect((harvested as any).farm.growth).toMatchObject({
      farmCoins: 42,
      totalHarvests: 1,
      skillPointsAvailable: 1,
    });
    expect((harvested as any).farm.crops).toHaveLength(6);
    expect((harvested as any).farm.tools).toHaveLength(3);
    expect((harvested as any).farm.skills).toHaveLength(3);
    expect(await dataSource.getRepository(DeskPlantCycle).count()).toBe(2);
    expect(await dataSource.getRepository(RewardGrant).count()).toBe(1);
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
    ).toBe(20);
    expect(
      (await dataSource.getRepository(WalletBalance).findOneByOrFail({
        userId: user.id,
        currency: 'office_coin',
      })).balance,
    ).toBe(5);
    expect(await dataSource.getRepository(OutboxEvent).count()).toBe(0);
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
    expect(tool.cost).toBe(20);
    expect(tool.farm.growth.farmCoins).toBe(22);
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

  it('uses the 05:00 service-day boundary and grants the standard reward once per day', async () => {
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
    expect((sameServiceDay as any).reward.standardRewardGranted).toBe(false);

    now = new Date(now.getTime() + 20 * 60 * 60 * 1_000 + 1_000);
    const nextServiceDay = await plants.harvestAndCare(
      user.id,
      'boundary-next-day-harvest',
    );
    expect((nextServiceDay as any).reward.standardRewardGranted).toBe(true);
    expect(await dataSource.getRepository(RewardGrant).count()).toBe(2);
    expect(
      await dataSource.getRepository(DeskPlantRewardClaim).countBy({
        rewardType: 'standard',
      }),
    ).toBe(2);
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
