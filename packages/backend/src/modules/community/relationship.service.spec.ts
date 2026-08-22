import { randomUUID } from 'node:crypto';

import { IsNull, type DataSource } from 'typeorm';

import { CommunityNotification } from '../../database/entities/community-notification.entity';
import { FriendRequest } from '../../database/entities/friend-request.entity';
import { Friendship } from '../../database/entities/friendship.entity';
import { OutboxEvent } from '../../database/entities/outbox-event.entity';
import { PlayerProfile } from '../../database/entities/player-profile.entity';
import { UserBlock } from '../../database/entities/user-block.entity';
import { User } from '../../database/entities/user.entity';
import { createLocalDevDataSource } from '../../database/local-dev-datasource';
import type { CommunityClock } from './community-clock';
import { NotificationService } from './notification.service';
import { RelationshipPolicyService } from './relationship-policy.service';
import { RelationshipService } from './relationship.service';

describe('RelationshipService transactional invariants', () => {
  let dataSource: DataSource;
  let service: RelationshipService;
  const clock: CommunityClock = { now: () => new Date('2026-08-22T08:00:00Z') };
  const originalEnv = { ...process.env };

  beforeAll(() => {
    process.env.LOCAL_DEV = 'true';
    process.env.NODE_ENV = 'test';
    delete process.env.FEATURE_COMMUNITY_WRITES_ENABLED;
  });

  beforeEach(async () => {
    dataSource = await createLocalDevDataSource();
    const policy = new RelationshipPolicyService();
    const notifications = new NotificationService(dataSource);
    service = new RelationshipService(
      dataSource,
      policy,
      notifications,
      clock,
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('atomically merges opposite pending requests into one friendship', async () => {
    const [alice, bob] = await Promise.all([
      activeUser('alice@example.com', 'Alice'),
      activeUser('bob@example.com', 'Bob'),
    ]);

    const first = await service.sendRequest(alice.id, bob.publicId, 'request-alice-bob');
    const merged = await service.sendRequest(bob.id, alice.publicId, 'request-bob-alice');

    expect(first.status).toBe('pending');
    expect(merged.status).toBe('friend');
    expect(await dataSource.getRepository(Friendship).countBy({ endedAt: IsNull() })).toBe(1);
    expect(await dataSource.getRepository(FriendRequest).countBy({ status: 'pending' })).toBe(0);
    const notifications = await dataSource.getRepository(CommunityNotification).find();
    expect(notifications.filter((item) => item.eventType === 'friend.requested')).toHaveLength(0);
    expect(notifications.filter((item) => item.eventType === 'friend.accepted')).toHaveLength(2);
    expect(await dataSource.getRepository(OutboxEvent).count()).toBe(0);
  });

  it('keeps block as the final state in both PostgreSQL lock orders', async () => {
    const [alice, bob] = await Promise.all([
      activeUser('alice@example.com', 'Alice'),
      activeUser('bob@example.com', 'Bob'),
    ]);
    const pending = await service.sendRequest(alice.id, bob.publicId, 'request-before-race');

    // pg-mem 不模拟 PostgreSQL FOR UPDATE 等待；分别验证锁竞争的两种提交顺序。
    await service.accept(bob.id, pending.requestId!, 'accept-race-key');
    await service.block(bob.id, alice.publicId, 'block-race-key');

    expect(
      await dataSource.getRepository(UserBlock).exist({
        where: { blockerId: bob.id, blockedId: alice.id },
      }),
    ).toBe(true);
    expect(await dataSource.getRepository(Friendship).countBy({ endedAt: IsNull() })).toBe(0);
    expect(await dataSource.getRepository(FriendRequest).countBy({ status: 'pending' })).toBe(0);
    await expect(
      service.sendRequest(alice.id, bob.publicId, 'blocked-request-key'),
    ).rejects.toMatchObject({ response: { code: 'RELATIONSHIP_UNAVAILABLE' } });

    const [carol, dave] = await Promise.all([
      activeUser('carol@example.com', 'Carol'),
      activeUser('dave@example.com', 'Dave'),
    ]);
    const secondPending = await service.sendRequest(
      carol.id,
      dave.publicId,
      'second-pending-key',
    );
    await service.block(dave.id, carol.publicId, 'block-before-accept-key');
    await expect(
      service.accept(dave.id, secondPending.requestId!, 'accept-after-block-key'),
    ).rejects.toMatchObject({ response: { code: 'FRIEND_REQUEST_NOT_PENDING' } });
  });

  it('removes stale request notifications after accept, reject and cancel', async () => {
    const [recipient, accepted, rejected, cancelled] = await Promise.all([
      activeUser('recipient@example.com', 'Recipient'),
      activeUser('accepted@example.com', 'Accepted'),
      activeUser('rejected@example.com', 'Rejected'),
      activeUser('cancelled@example.com', 'Cancelled'),
    ]);
    const acceptedRequest = await service.sendRequest(
      accepted.id,
      recipient.publicId,
      'accepted-request-key',
    );
    const rejectedRequest = await service.sendRequest(
      rejected.id,
      recipient.publicId,
      'rejected-request-key',
    );
    const cancelledRequest = await service.sendRequest(
      cancelled.id,
      recipient.publicId,
      'cancelled-request-key',
    );

    await service.accept(recipient.id, acceptedRequest.requestId!, 'accept-key');
    await service.reject(recipient.id, rejectedRequest.requestId!, 'reject-key');
    await service.cancel(cancelled.id, cancelledRequest.requestId!, 'cancel-key');

    expect(
      await dataSource.getRepository(CommunityNotification).countBy({
        eventType: 'friend.requested',
      }),
    ).toBe(0);
    expect(
      await dataSource.getRepository(CommunityNotification).countBy({
        eventType: 'friend.accepted',
      }),
    ).toBe(2);
  });

  it('uses stable database cursors across a full friend page', async () => {
    const owner = await activeUser('friend-page-owner@example.com', 'Owner');
    const friends = await Promise.all(
      Array.from({ length: 55 }, (_, index) =>
        activeUser(`friend-page-${index}@example.com`, `Friend ${index}`),
      ),
    );
    const friendshipRepo = dataSource.getRepository(Friendship);
    await friendshipRepo.save(
      friends.map((friend, index) => {
        const [userLowId, userHighId] =
          owner.id < friend.id
            ? [owner.id, friend.id]
            : [friend.id, owner.id];
        const startedAt = new Date(clock.now().getTime() - index * 1_000);
        return friendshipRepo.create({
          userLowId,
          userHighId,
          firstBecameFriendsAt: startedAt,
          currentStartedAt: startedAt,
          endedAt: null,
          endedReason: null,
        });
      }),
    );

    const first = await service.listFriends(owner.id);
    expect(first.items).toHaveLength(50);
    expect(first.total).toBe(55);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await service.listFriends(owner.id, first.nextCursor!);
    expect(second.items).toHaveLength(5);
    expect(second.nextCursor).toBeNull();
    expect(
      new Set([...first.items, ...second.items].map((item) => item.publicId)).size,
    ).toBe(55);
  });

  it('fails closed when production community writes are not explicitly enabled', async () => {
    const [alice, bob] = await Promise.all([
      activeUser('alice@example.com', 'Alice'),
      activeUser('bob@example.com', 'Bob'),
    ]);
    process.env.LOCAL_DEV = 'false';
    process.env.NODE_ENV = 'production';
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'false';
    await expect(
      service.sendRequest(alice.id, bob.publicId, 'disabled-write-key'),
    ).rejects.toMatchObject({ response: { code: 'COMMUNITY_WRITES_DISABLED' } });
    process.env.LOCAL_DEV = 'true';
    process.env.NODE_ENV = 'test';
    delete process.env.FEATURE_COMMUNITY_WRITES_ENABLED;
  });

  async function activeUser(email: string, displayName: string): Promise<User> {
    const repo = dataSource.getRepository(User);
    const user = await repo.save(
      repo.create({
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
