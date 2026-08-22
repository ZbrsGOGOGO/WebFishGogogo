import { randomUUID } from 'node:crypto';

import type { DataSource } from 'typeorm';

import { CommunityNotification } from '../../database/entities/community-notification.entity';
import { DeskPlant } from '../../database/entities/desk-plant.entity';
import { Friendship } from '../../database/entities/friendship.entity';
import { PlayerProfile } from '../../database/entities/player-profile.entity';
import { UserBlock } from '../../database/entities/user-block.entity';
import { User } from '../../database/entities/user.entity';
import { createLocalDevDataSource } from '../../database/local-dev-datasource';
import { NotificationService } from './notification.service';
import { PublicProfileController } from './public-profile.controller';
import { PublicProfileService } from './public-profile.service';
import { RelationshipPolicyService } from './relationship-policy.service';

describe('Public profile privacy and persistent notifications', () => {
  let dataSource: DataSource;
  let policy: RelationshipPolicyService;
  let profiles: PublicProfileService;
  let notifications: NotificationService;
  const originalEnv = { ...process.env };

  beforeAll(() => {
    process.env.LOCAL_DEV = 'true';
    process.env.NODE_ENV = 'test';
    delete process.env.FEATURE_COMMUNITY_WRITES_ENABLED;
  });

  beforeEach(async () => {
    dataSource = await createLocalDevDataSource();
    policy = new RelationshipPolicyService();
    profiles = new PublicProfileService(dataSource, policy);
    notifications = new NotificationService(dataSource);
  });

  afterEach(async () => dataSource.destroy());

  afterAll(() => {
    process.env = originalEnv;
  });

  it('only supports exact publicId lookup and trims fields by privacy and blocks', async () => {
    const [viewer, target] = await Promise.all([
      activeUser('viewer@example.com', 'Viewer'),
      activeUser('target@example.com', 'Target'),
    ]);
    await dataSource.getRepository(DeskPlant).save(
      dataSource.getRepository(DeskPlant).create({
        userId: target.id,
        state: 'idle',
        appearanceKey: 'desk_leaf',
        plantExperience: 50,
        level: 2,
        streakDays: 3,
        lastStandardRewardServiceDate: '2026-08-21',
        firstHarvestedAt: new Date(),
        feedingEnabled: true,
        feedAnimationEnabled: true,
        feedNotificationsEnabled: true,
      }),
    );

    const anonymous = await profiles.get(target.publicId, null);
    expect(anonymous).not.toHaveProperty('plant');
    expect(anonymous).not.toHaveProperty('battleLevel');
    expect(anonymous).not.toHaveProperty('friendCount');
    expect(JSON.stringify(anonymous)).not.toContain('target@example.com');
    expect(JSON.stringify(anonymous)).not.toMatch(/phone|email/i);

    const [userLowId, userHighId] = policy.pair(viewer.id, target.id);
    await dataSource.getRepository(Friendship).save(
      dataSource.getRepository(Friendship).create({
        userLowId,
        userHighId,
        firstBecameFriendsAt: new Date(),
        currentStartedAt: new Date(),
        endedAt: null,
        endedReason: null,
      }),
    );
    const friendView = await profiles.get(target.publicId, viewer.id);
    expect(friendView).toMatchObject({
      publicId: target.publicId,
      relationship: { status: 'friend', canFeed: true },
      plant: { appearanceKey: 'desk_leaf', careStreak: 3 },
      battleLevel: 1,
    });
    expect(friendView).not.toHaveProperty('friendCount');

    const controller = new PublicProfileController(profiles);
    await expect(
      controller.exactSearch(viewer.id, { email: 'target@example.com' }),
    ).rejects.toMatchObject({ response: { code: 'PUBLIC_ID_ONLY_SEARCH' } });
    await expect(
      controller.exactSearch(viewer.id, { phone: '17300000000' }),
    ).rejects.toMatchObject({ response: { code: 'PUBLIC_ID_ONLY_SEARCH' } });
    await expect(
      controller.exactSearch(viewer.id, { publicId: 'target@example.com' }),
    ).rejects.toBeDefined();
    await expect(
      controller.exactSearch(viewer.id, { publicId: target.publicId }),
    ).resolves.toMatchObject({ items: [{ publicId: target.publicId }] });

    await dataSource.getRepository(UserBlock).save(
      dataSource.getRepository(UserBlock).create({
        blockerId: viewer.id,
        blockedId: target.id,
        reason: null,
      }),
    );
    await expect(profiles.get(target.publicId, viewer.id)).rejects.toMatchObject({
      response: { code: 'USER_NOT_FOUND' },
    });
  });

  it('paginates, filters blocked actors and marks persistent notifications read', async () => {
    const [recipient, actor, blockedActor] = await Promise.all([
      activeUser('notifications@example.com', 'Recipient'),
      activeUser('actor@example.com', 'Actor'),
      activeUser('blocked-actor@example.com', 'Blocked actor'),
    ]);
    const availableAt = new Date(Date.now() - 60_000);
    await dataSource.transaction(async (manager) => {
      for (let index = 0; index < 35; index += 1) {
        await notifications.create(manager, {
          userId: recipient.id,
          actorUserId: actor.id,
          category: index < 31 ? 'friend' : 'system',
          eventType: 'test.notification',
          title: `通知 ${index}`,
          summary: `持久通知 ${index}`,
          resourcePath: '/friends',
          dedupeKey: `notification:${index}`,
          availableAt,
        });
      }
      await notifications.create(manager, {
        userId: recipient.id,
        actorUserId: blockedActor.id,
        category: 'friend',
        eventType: 'test.blocked-notification',
        title: '不应显示',
        summary: '拉黑关系需要统一过滤',
        dedupeKey: 'notification:blocked',
        availableAt,
      });
    });
    await dataSource.getRepository(UserBlock).save(
      dataSource.getRepository(UserBlock).create({
        blockerId: recipient.id,
        blockedId: blockedActor.id,
        reason: null,
      }),
    );

    const firstPage = await notifications.list(recipient.id);
    expect(firstPage.items).toHaveLength(30);
    expect(firstPage.unreadCount).toBe(35);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    expect(firstPage.items.map((item) => item.title)).not.toContain('不应显示');
    const secondPage = await notifications.list(
      recipient.id,
      firstPage.nextCursor!,
    );
    expect(secondPage.items).toHaveLength(5);
    expect(secondPage.nextCursor).toBeNull();
    expect(
      new Set([...firstPage.items, ...secondPage.items].map((item) => item.id)).size,
    ).toBe(35);

    process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'false';
    await notifications.markAllRead(recipient.id, 'friend');
    expect((await notifications.list(recipient.id)).unreadCount).toBe(4);
    const system = await dataSource.getRepository(CommunityNotification).findOneByOrFail({
      userId: recipient.id,
      category: 'system',
    });
    await notifications.markRead(recipient.id, system.id);
    expect((await notifications.list(recipient.id)).unreadCount).toBe(3);
    await notifications.markAllRead(recipient.id);
    expect((await notifications.list(recipient.id)).unreadCount).toBe(0);
    delete process.env.FEATURE_COMMUNITY_WRITES_ENABLED;
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
        emailVerifiedAt: new Date(),
        passwordChangedAt: new Date(),
        onboardingCompleted: true,
      }),
    );
    await dataSource.getRepository(PlayerProfile).save(
      dataSource.getRepository(PlayerProfile).create({
        userId: user.id,
        nickname: displayName,
        avatarKey: 'violet',
        bio: '公开简介',
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
