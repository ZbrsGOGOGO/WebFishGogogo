import { randomUUID } from 'node:crypto';

import type { DataSource } from 'typeorm';

import { AccountAppeal } from '../../database/entities/account-appeal.entity';
import { AccountDeletionRequest } from '../../database/entities/account-deletion-request.entity';
import { AccountRestriction } from '../../database/entities/account-restriction.entity';
import { AdminAuditLog } from '../../database/entities/admin-audit-log.entity';
import { AuthRefreshToken } from '../../database/entities/auth-refresh-token.entity';
import { AuthSession } from '../../database/entities/auth-session.entity';
import { CommunityNotification } from '../../database/entities/community-notification.entity';
import { DemonTowerCommand, DemonTowerContribution, DemonTowerDailyAward, DemonTowerDailyProgress, DemonTowerProfile, DemonTowerWorldFloor } from '../../database/entities/demon-tower.entity';
import {
  DevelopmentAttachmentRecord,
  DevelopmentEvent,
  DevelopmentMember,
  DevelopmentRequest,
} from '../../database/entities/development.entity';
import { FriendEncouragement } from '../../database/entities/friend-encouragement.entity';
import { FriendRequest } from '../../database/entities/friend-request.entity';
import { Friendship } from '../../database/entities/friendship.entity';
import { PlayerProfile } from '../../database/entities/player-profile.entity';
import { RailChatMessageRecord, RailDailyAward, RailDailyScore, RailPlayerStats, RailRoom, RailRoomMember } from '../../database/entities/rail-room.entity';
import { User } from '../../database/entities/user.entity';
import { UserBlock } from '../../database/entities/user-block.entity';
import { createLocalDevDataSource } from '../../database/local-dev-datasource';
import { AccountLifecycleService } from './account-lifecycle.service';
import { AuthEmailOutboxService } from './auth-email-outbox.service';
import { AuthSensitiveDataService } from './auth-sensitive-data.service';
import type { EmailDeliveryService } from './email-delivery.service';
import { hashPassword } from './password.util';

describe('AccountLifecycleService', () => {
  let dataSource: DataSource;
  let service: AccountLifecycleService;
  let sensitive: AuthSensitiveDataService;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    process.env.LOCAL_DEV = 'true';
    process.env.FEATURE_ACCOUNT_DELETION_ENABLED = 'true';
    process.env.AUTH_TOKEN_PEPPER = 'account-lifecycle-test-pepper-that-is-long-enough';
    delete process.env.AUTH_EMAIL_OUTBOX_ENCRYPTION_KEY;
    dataSource = await createLocalDevDataSource();
    const delivery = {
      assertPasswordResetDeliveryAvailable: jest.fn(),
      assertRegistrationDeliveryAvailable: jest.fn(),
      sendPasswordReset: jest.fn(),
      sendRegistrationCode: jest.fn(),
    } as unknown as EmailDeliveryService;
    sensitive = new AuthSensitiveDataService();
    service = new AccountLifecycleService(
      dataSource,
      sensitive,
      new AuthEmailOutboxService(dataSource, delivery),
    );
  });

  afterEach(async () => {
    service?.onModuleDestroy();
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('keeps only the requesting session during cooling off and supports idempotent cancellation', async () => {
    const user = await seedUser(dataSource, 'delete@example.com');
    const current = await seedSession(dataSource, user.id, '1');
    const other = await seedSession(dataSource, user.id, '2');

    const first = await service.requestDeletion(
      user.id,
      current.id,
      'delete-request-idempotency-key',
    );
    const replay = await service.requestDeletion(
      user.id,
      current.id,
      'delete-request-idempotency-key',
    );
    expect(replay).toEqual(first);
    expect(first).toMatchObject({ status: 'cooling_off', canCancel: true });
    await expect(
      dataSource.getRepository(User).findOneByOrFail({ id: user.id }),
    ).resolves.toMatchObject({ accountStatus: 'deleting' });
    await expect(
      dataSource.getRepository(AuthSession).findOneByOrFail({ id: current.id }),
    ).resolves.toMatchObject({ revokedAt: null });
    await expect(
      dataSource.getRepository(AuthSession).findOneByOrFail({ id: other.id }),
    ).resolves.toMatchObject({ revokeReason: 'account_deletion_requested' });
    await expect(
      dataSource.getRepository(AuthRefreshToken).findOneByOrFail({ sessionId: other.id }),
    ).resolves.toMatchObject({ status: 'revoked' });

    const cancelled = await service.cancelDeletion(user.id);
    expect(cancelled).toMatchObject({ status: 'cancelled', canCancel: false });
    await expect(
      dataSource.getRepository(User).findOneByOrFail({ id: user.id }),
    ).resolves.toMatchObject({ accountStatus: 'active' });
    expect(await dataSource.getRepository(AccountDeletionRequest).count()).toBe(1);
  });

  it('collapses concurrent deletion retries with the same idempotency key', async () => {
    const user = await seedUser(dataSource, 'concurrent-delete@example.com');
    const session = await seedSession(dataSource, user.id, '9');
    const [left, right] = await Promise.all([
      service.requestDeletion(
        user.id,
        session.id,
        'concurrent-delete-idempotency-key',
      ),
      service.requestDeletion(
        user.id,
        session.id,
        'concurrent-delete-idempotency-key',
      ),
    ]);
    expect(left).toEqual(right);
    expect(
      await dataSource.getRepository(AccountDeletionRequest).count({
        where: { userId: user.id },
      }),
    ).toBe(1);
  });

  it('durably anonymizes an expired request and removes private social graph and inbox rows', async () => {
    const user = await seedUser(dataSource, 'private-delete@example.com', 'Private Person');
    const peer = await seedUser(dataSource, 'peer@example.com', 'Peer');
    const current = await seedSession(dataSource, user.id, '3');
    await seedPrivateSocialRows(dataSource, user, peer);
    const oldEmail = user.email;
    const oldPublicId = user.publicId;

    await service.requestDeletion(
      user.id,
      current.id,
      'second-delete-idempotency-key',
    );
    const request = await dataSource
      .getRepository(AccountDeletionRequest)
      .findOneByOrFail({ userId: user.id, status: 'cooling_off' });
    const due = new Date(request.scheduledFor.getTime() + 1_000);
    await expect(service.processDueDeletions(10, due)).resolves.toBe(1);

    const deleted = await dataSource.getRepository(User).findOneByOrFail({ id: user.id });
    expect(deleted).toMatchObject({
      publicId: oldPublicId,
      accountStatus: 'deleted',
      displayName: null,
      socialVerificationStatus: 'unverified',
      emailVerifiedAt: null,
    });
    expect(deleted.email).toBe(`deleted+${oldPublicId}@invalid.local`);
    expect(JSON.stringify(deleted)).not.toContain(oldEmail);
    await expect(
      dataSource.getRepository(PlayerProfile).findOneByOrFail({ userId: user.id }),
    ).resolves.toMatchObject({
      nickname: null,
      avatarKey: null,
      bio: null,
      battleProfession: null,
      title: '已注销用户',
    });
    expect(await dataSource.getRepository(AuthSession).count({ where: { userId: user.id } })).toBe(0);
    expect(await dataSource.getRepository(FriendRequest).count()).toBe(0);
    expect(await dataSource.getRepository(Friendship).count()).toBe(0);
    expect(await dataSource.getRepository(UserBlock).count()).toBe(0);
    expect(await dataSource.getRepository(FriendEncouragement).count()).toBe(0);
    expect(await dataSource.getRepository(CommunityNotification).count()).toBe(0);
    await expect(
      dataSource.getRepository(AccountDeletionRequest).findOneByOrFail({ id: request.id }),
    ).resolves.toMatchObject({ status: 'completed', completedAt: expect.any(Date) });
    const persisted = JSON.stringify({
      appeals: await dataSource.getRepository(AccountAppeal).find(),
      restrictions: await dataSource.getRepository(AccountRestriction).find(),
    });
    expect(persisted).not.toContain('Private Person');
    expect(persisted).not.toContain(oldEmail);
  });

  it('clears demon tower private saves and receipts while preserving peers, world progress and award accounting', async () => {
    const user = await seedUser(dataSource, 'tower-delete@example.com');
    const peer = await seedUser(dataSource, 'tower-peer@example.com');
    const session = await seedSession(dataSource, user.id, 'd');
    const now = new Date('2026-09-08T12:00:00.000Z');
    const profiles = dataSource.getRepository(DemonTowerProfile);
    for (const owner of [user, peer]) {
      await profiles.save(profiles.create({ userId: owner.id, version: 1,
        state: { privateSeed: `${owner.id}:private`, privateCombatLog: ['private report'] },
        actionWindowAt: null, actionWindowCount: 0, createdAt: now, updatedAt: now }));
    }
    const worlds = dataSource.getRepository(DemonTowerWorldFloor);
    await worlds.save(worlds.create({ floor: 1, bossHp: 2300, bossMaxHp: 2400,
      passageProgress: 0, passageRequired: 60, version: 2, unlockedAt: now,
      defeatedAt: null, completedAt: null, updatedAt: now }));
    const commands = dataSource.getRepository(DemonTowerCommand);
    for (const owner of [user, peer]) {
      await commands.save(commands.create({ userId: owner.id, requestId: randomUUID(), kind: 'enroll',
        requestHash: 'd'.repeat(64), expectedVersion: 0, appliedVersion: 1,
        receipt: { events: ['private receipt'] }, createdAt: now }));
    }
    const contributions = dataSource.getRepository(DemonTowerContribution);
    for (const owner of [user, peer]) {
      await contributions.save(contributions.create({ floor: 1, userId: owner.id,
        bossDamage: 50, passageContribution: 0, level: 1, updatedAt: now }));
    }
    const daily = dataSource.getRepository(DemonTowerDailyProgress);
    for (const owner of [user, peer]) {
      await daily.save(daily.create({ serviceDate: '2026-09-08', userId: owner.id,
        officeCoins: 0, bossDamage: 50, passageContribution: 0, bossAttempts: 1,
        actionCount: 1, level: 1, achievedAt: now, updatedAt: now }));
    }
    const awards = dataSource.getRepository(DemonTowerDailyAward);
    await awards.save(awards.create({ serviceDate: '2026-09-08', winnerUserId: user.id,
      bossDamage: 50, coins: 100, awardedAt: now }));
    const beforeWorld = await worlds.findOneByOrFail({ floor: 1 });
    const beforePeer = await profiles.createQueryBuilder('profile').addSelect('profile.state')
      .where('profile.userId = :id', { id: peer.id }).getOneOrFail();

    await service.requestDeletion(user.id, session.id, 'tower-delete-idempotency');
    const request = await dataSource.getRepository(AccountDeletionRequest).findOneByOrFail({ userId: user.id });
    await expect(service.processDueDeletions(10, new Date(request.scheduledFor.getTime() + 1000))).resolves.toBe(1);

    expect(await profiles.countBy({ userId: user.id })).toBe(0);
    expect(await commands.countBy({ userId: user.id })).toBe(0);
    expect(await contributions.countBy({ userId: user.id })).toBe(0);
    expect(await daily.countBy({ userId: user.id })).toBe(0);
    expect(await commands.countBy({ userId: peer.id })).toBe(1);
    expect(await contributions.countBy({ userId: peer.id })).toBe(1);
    expect(await daily.countBy({ userId: peer.id })).toBe(1);
    expect(await worlds.findOneByOrFail({ floor: 1 })).toEqual(beforeWorld);
    expect(await profiles.createQueryBuilder('profile').addSelect('profile.state')
      .where('profile.userId = :id', { id: peer.id }).getOneOrFail()).toEqual(beforePeer);
    expect(await awards.findOneByOrFail({ serviceDate: '2026-09-08' })).toMatchObject({
      winnerUserId: null, bossDamage: 50, coins: 100, awardedAt: now,
    });
  });

  it('removes private development files and clears authored review text when account deletion completes', async () => {
    const user = await seedUser(dataSource, 'dev-delete@example.com');
    const peer = await seedUser(dataSource, 'dev-peer@example.com');
    await dataSource.getRepository(User).update(user.id, {
      username: 'private_developer', usernameNormalized: 'private_developer',
    });
    const session = await seedSession(dataSource, user.id, '7');
    const requests = dataSource.getRepository(DevelopmentRequest);
    const [own, other] = await requests.save([user, peer].map((author) => requests.create({
      authorId: author.id,
      clientRequestId: randomUUID(),
      requestHash: 'a'.repeat(64),
      title: '私有协作提案',
      category: 'feature',
      description: '账号注销时不得留下自己的私有附件和讨论正文。',
      status: 'submitted',
      version: 1,
      attachmentCount: author.id === user.id ? 1 : 0,
      attachmentBytes: author.id === user.id ? 6 : 0,
    })));
    const notifications = dataSource.getRepository(CommunityNotification);
    await notifications.save(notifications.create({
      userId: peer.id,
      actorUserId: null,
      category: 'system',
      eventType: 'development.request.created',
      resourceType: 'development_request',
      resourceId: own.id,
      payload: { title: '待审核', summary: own.title },
      dedupeKey: `development-request:${own.id}:created`,
      readAt: null,
      availableAt: new Date(),
      expiresAt: null,
    }));
    const files = dataSource.getRepository(DevelopmentAttachmentRecord);
    await files.save(files.create({
      requestId: own.id,
      filename: 'private.txt',
      mediaType: 'text/plain',
      bytes: 6,
      sha256: 'b'.repeat(64),
      content: Buffer.from('secret'),
      extraction: 'text',
      excerpt: 'secret',
      warnings: [],
    }));
    const events = dataSource.getRepository(DevelopmentEvent);
    const comments = await events.save([own, other].map((request) => events.create({
      requestId: request.id, actorId: user.id, kind: 'comment', body: 'private review text', status: null,
    })));
    const members = dataSource.getRepository(DevelopmentMember);
    await members.save([
      members.create({ userId: user.id, grantedByUserId: peer.id, grantedAt: new Date(), revokedAt: null }),
      members.create({ userId: peer.id, grantedByUserId: user.id, grantedAt: new Date(), revokedAt: null }),
    ]);

    await service.requestDeletion(user.id, session.id, 'development-delete-idempotency-key');
    const deletion = await dataSource.getRepository(AccountDeletionRequest).findOneByOrFail({ userId: user.id });
    await expect(service.processDueDeletions(10, new Date(deletion.scheduledFor.getTime() + 1000))).resolves.toBe(1);

    expect(await requests.findOneBy({ id: own.id })).toBeNull();
    expect(await requests.findOneBy({ id: other.id })).not.toBeNull();
    expect(await files.count()).toBe(0);
    expect(await notifications.count({ where: { resourceId: own.id } })).toBe(0);
    expect(await events.findOneBy({ id: comments[0].id })).toBeNull();
    expect(await events.findOneBy({ id: comments[1].id })).toMatchObject({ body: '账号已注销，内容已清理。' });
    expect(await members.findOneBy({ userId: user.id })).toBeNull();
    expect(await members.findOneBy({ userId: peer.id })).toMatchObject({ grantedByUserId: null });
    expect(await dataSource.getRepository(User).findOneByOrFail({ id: user.id }))
      .toMatchObject({ username: null, usernameNormalized: null });
  });

  it('scrubs rail snapshots and chat without exposing a password room or erasing another member', async () => {
    const user = await seedUser(dataSource, 'rail-delete@example.com', 'Private Rail Name');
    const peer = await seedUser(dataSource, 'rail-peer@example.com', 'Remaining Peer');
    const session = await seedSession(dataSource, user.id, '8');
    const room = await dataSource.getRepository(RailRoom).save(dataSource.getRepository(RailRoom).create({ creatorId: user.id, hostUserId: user.id, clientRequestId: randomUUID(), requestHash: 'a'.repeat(64), mode: 'room', title: 'Private Rail Name 的房间', status: 'running', passwordHash: 'opaque-test-password-hash', maxPlayers: 3, botCount: 1, version: 1, rankingEligible: false, latestChatSequence: 2, createdAt: new Date(), startedAt: new Date(), expiresAt: new Date(Date.now() + 3600000), finishedAt: null, leaderboardDate: null, engineState: { players: [{ id: user.publicId, displayName: user.displayName, left: false, missedRequired: false }, { id: peer.publicId, displayName: peer.displayName, left: false, missedRequired: false }] } }));
    for (const [index, person] of [user, peer].entries()) {
      await dataSource.getRepository(RailRoomMember).insert({ roomId: room.id, userId: person.id, role: 'participant', ready: true, active: true, lastSequence: 0, joinedAt: new Date(), leftAt: null });
      await dataSource.getRepository(RailChatMessageRecord).insert({ roomId: room.id, authorId: person.id, clientMessageId: randomUUID(), requestHash: 'a'.repeat(64), sequence: index + 1, channel: 'player', body: person.id === user.id ? 'my private rail message' : 'keep peer message', status: 'visible', createdAt: new Date(), withdrawnAt: null });
    }
    await dataSource.getRepository(RailPlayerStats).insert({ userId: user.id, completedGames: 1, survived: 1, eligibleRounds: 2, demonTotal: 3, demonMvpCount: 0, rankedGames: 1 });
    await dataSource.getRepository(RailDailyScore).insert({ userId: user.id, serviceDate: '2026-09-07', rateBasisPoints: 5000, survived: 1, eligibleRounds: 2, demonTotal: 3, roomId: room.id, achievedAt: new Date() });
    await dataSource.getRepository(RailDailyAward).insert({ serviceDate: '2026-09-07', winnerUserId: user.id, rateBasisPoints: 5000, coins: 100, awardedAt: new Date() });
    await service.requestDeletion(user.id, session.id, 'rail-delete-idempotency-key');
    const deletion = await dataSource.getRepository(AccountDeletionRequest).findOneByOrFail({ userId: user.id });
    expect(await service.processDueDeletions(10, new Date(deletion.scheduledFor.getTime() + 1000))).toBe(1);
    const stored = await dataSource.getRepository(RailRoom).createQueryBuilder('room').addSelect(['room.engineState', 'room.passwordHash']).where('room.id = :id', { id: room.id }).getOneOrFail();
    expect(stored).toMatchObject({ creatorId: null, hostUserId: peer.id, title: '轨道协作组', passwordHash: 'opaque-test-password-hash' });
    expect(JSON.stringify(stored.engineState)).not.toContain('Private Rail Name');
    expect(stored.engineState?.players).toEqual([{ id: user.publicId, displayName: '已注销同事', left: true, missedRequired: true }, { id: peer.publicId, displayName: peer.displayName, left: false, missedRequired: false }]);
    expect(await dataSource.getRepository(RailRoomMember).findOneBy({ roomId: room.id, userId: user.id })).toMatchObject({ active: false, ready: false, leftAt: expect.any(Date) });
    expect(await dataSource.getRepository(RailRoomMember).findOneBy({ roomId: room.id, userId: peer.id })).toMatchObject({ active: true, leftAt: null });
    expect(await dataSource.getRepository(RailChatMessageRecord).findOneBy({ authorId: user.id })).toMatchObject({ body: '', status: 'withdrawn' });
    expect(await dataSource.getRepository(RailChatMessageRecord).findOneBy({ authorId: peer.id })).toMatchObject({ body: 'keep peer message', status: 'visible' });
    expect(await dataSource.getRepository(RailPlayerStats).count({ where: { userId: user.id } })).toBe(0);
    expect(await dataSource.getRepository(RailDailyScore).count({ where: { userId: user.id } })).toBe(0);
    expect(await dataSource.getRepository(RailDailyAward).findOneBy({ serviceDate: '2026-09-07' })).toMatchObject({ winnerUserId: null, coins: 100 });
  });

  it('encrypts appeal reasons and requires an active admin for an idempotent decision', async () => {
    const restricted = await seedUser(dataSource, 'restricted@example.com');
    const admin = await seedUser(dataSource, 'admin@example.com', 'Admin', 'admin');
    const ordinary = await seedUser(dataSource, 'ordinary@example.com');
    restricted.accountStatus = 'suspended';
    await dataSource.getRepository(User).save(restricted);
    const restrictionId = randomUUID();
    const encryptedRestriction = sensitive.encrypt(
      'account-restriction-reason',
      restrictionId,
      'Safety review pending',
    );
    await dataSource.getRepository(AccountRestriction).save(
      dataSource.getRepository(AccountRestriction).create({
        id: restrictionId,
        userId: restricted.id,
        accountStatus: 'suspended',
        reasonCode: 'SAFETY_REVIEW',
        reasonKeyId: encryptedRestriction.keyId,
        reasonCiphertext: encryptedRestriction.ciphertext,
        reasonNonce: encryptedRestriction.nonce,
        reasonAuthTag: encryptedRestriction.authTag,
        restrictedAt: new Date(),
        restrictionEndsAt: null,
        liftedAt: null,
      }),
    );

    await expect(service.getStatus(restricted.id)).resolves.toMatchObject({
      accountStatus: 'suspended',
      reasonCode: 'SAFETY_REVIEW',
      reason: 'Safety review pending',
      canAppeal: true,
    });
    const reason = 'Please review the account restriction and supporting context.';
    const appeal = await service.submitAppeal(restricted.id, reason);
    const replay = await service.submitAppeal(restricted.id, 'A second reason is ignored.');
    expect(replay.id).toBe(appeal.id);
    const stored = await dataSource.getRepository(AccountAppeal).findOneByOrFail({ id: appeal.id });
    expect(JSON.stringify(stored)).not.toContain(reason);
    await expect(service.adminAppealDetail(admin.id, appeal.id)).resolves.toMatchObject({
      id: appeal.id,
      reason,
    });
    await expect(
      service.decideAppeal(
        ordinary.id,
        appeal.id,
        'approved',
        'Approval requires an administrator.',
      ),
    ).rejects.toMatchObject({ response: { code: 'ADMIN_ACCESS_REQUIRED' } });

    const decisionReason = 'Restriction was reviewed and can be lifted.';
    const decision = await service.decideAppeal(
      admin.id,
      appeal.id,
      'approved',
      decisionReason,
    );
    expect(decision).toMatchObject({ status: 'approved', decisionReason });
    await expect(
      service.decideAppeal(admin.id, appeal.id, 'approved', decisionReason),
    ).resolves.toMatchObject({ status: 'approved' });
    await expect(
      dataSource.getRepository(User).findOneByOrFail({ id: restricted.id }),
    ).resolves.toMatchObject({ accountStatus: 'active' });
    const auditJson = JSON.stringify(await dataSource.getRepository(AdminAuditLog).find());
    expect(auditJson).not.toContain(reason);
    expect(auditJson).not.toContain(decisionReason);
  });

  it('keeps restriction status and appeals available while account deletion fails closed', async () => {
    const restricted = await seedUser(dataSource, 'feature-off-restricted@example.com');
    restricted.accountStatus = 'suspended';
    await dataSource.getRepository(User).save(restricted);
    process.env.FEATURE_ACCOUNT_DELETION_ENABLED = 'false';

    await expect(service.getStatus(restricted.id)).resolves.toMatchObject({
      accountStatus: 'suspended',
      canAppeal: true,
    });
    await expect(
      service.submitAppeal(
        restricted.id,
        '账号处置可能有误，请在不开放注销功能时仍允许复核。',
      ),
    ).resolves.toMatchObject({ status: 'pending' });
    await expect(service.getDeletion(restricted.id)).rejects.toMatchObject({
      status: 503,
      response: { code: 'FEATURE_NOT_AVAILABLE' },
    });
  });
});

async function seedUser(
  dataSource: DataSource,
  email: string,
  displayName = 'Lifecycle Tester',
  communityRole: User['communityRole'] = 'user',
): Promise<User> {
  const users = dataSource.getRepository(User);
  const user = await users.save(
    users.create({
      email,
      emailNormalized: email,
      passwordHash: await hashPassword('Strong-password#2026'),
      displayName,
      publicId: randomUUID(),
      accountStatus: 'active',
      socialVerificationStatus: 'verified',
      communityRole,
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
      bio: 'Private profile biography',
      battleProfession: 'developer',
      privacySettings: {
        equipment: 'friends',
        battleRecord: 'friends',
        plant: 'friends',
        honors: 'friends',
        friendCount: 'self',
        recentActivity: 'self',
      },
      title: 'Office teammate',
    }),
  );
  return user;
}

async function seedSession(
  dataSource: DataSource,
  userId: string,
  suffix: string,
): Promise<AuthSession> {
  const sessions = dataSource.getRepository(AuthSession);
  const session = await sessions.save(
    sessions.create({
      userId,
      userAgent: `jest-${suffix}`,
      ipHash: null,
      lastSeenAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
      revokedAt: null,
      revokeReason: null,
    }),
  );
  const refreshTokens = dataSource.getRepository(AuthRefreshToken);
  await refreshTokens.save(
    refreshTokens.create({
      sessionId: session.id,
      tokenHash: suffix.padEnd(64, suffix),
      status: 'active',
      expiresAt: session.expiresAt,
      consumedAt: null,
      replacedById: null,
      revokedAt: null,
    }),
  );
  return session;
}

async function seedPrivateSocialRows(
  dataSource: DataSource,
  user: User,
  peer: User,
): Promise<void> {
  const [userLowId, userHighId] = [user.id, peer.id].sort();
  await dataSource.getRepository(FriendRequest).save(
    dataSource.getRepository(FriendRequest).create({
      requesterId: user.id,
      recipientId: peer.id,
      userLowId,
      userHighId,
      status: 'pending',
      respondedAt: null,
    }),
  );
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
  await dataSource.getRepository(UserBlock).save(
    dataSource.getRepository(UserBlock).create({
      blockerId: peer.id,
      blockedId: user.id,
      reason: 'Private block reason',
    }),
  );
  await dataSource.getRepository(FriendEncouragement).save(
    dataSource.getRepository(FriendEncouragement).create({
      senderId: user.id,
      recipientId: peer.id,
      serviceDate: '2026-08-22',
      type: 'coffee',
      idempotencyKey: 'private-encouragement',
      requestHash: 'e'.repeat(64),
      animationEnabled: true,
    }),
  );
  const notifications = dataSource.getRepository(CommunityNotification);
  await notifications.save([
    notifications.create({
      userId: user.id,
      actorUserId: peer.id,
      category: 'friend',
      eventType: 'friend.requested',
      resourceType: 'friend-request',
      resourceId: null,
      payload: { title: 'Private inbox', summary: 'Peer requested friendship.' },
      dedupeKey: 'private-inbox',
      readAt: null,
      availableAt: new Date(),
      expiresAt: null,
    }),
    notifications.create({
      userId: peer.id,
      actorUserId: user.id,
      category: 'friend',
      eventType: 'friend.accepted',
      resourceType: 'friendship',
      resourceId: null,
      payload: { title: 'Private actor', summary: 'Private Person accepted.' },
      dedupeKey: 'private-actor',
      readAt: null,
      availableAt: new Date(),
      expiresAt: null,
    }),
  ]);
}
