import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';

import {
  DirectConversationMember,
  DirectMessage,
  Friendship,
  PlayerProfile,
  User,
  UserBlock,
} from '../../database/entities';
import { createLocalDevDataSource } from '../../database/local-dev-datasource';
import { ChatModerationService } from './chat-moderation.service';
import { ChatRealtimeService } from './chat-realtime.service';
import { DirectMessageService } from './direct-message.service';

describe('DirectMessageService', () => {
  let dataSource: DataSource;
  let realtime: ChatRealtimeService;
  let service: DirectMessageService;
  const originalEnv = { ...process.env };

  beforeAll(() => {
    process.env.LOCAL_DEV = 'true';
    process.env.FEATURE_COMMUNITY_CHAT_ENABLED = 'true';
    process.env.FEATURE_CHAT_WRITES_ENABLED = 'true';
    process.env.CHAT_LOCAL_MEMORY_BUS_ENABLED = 'true';
    process.env.CHAT_LOCAL_MODERATION_ENABLED = 'true';
  });

  beforeEach(async () => {
    process.env.LOCAL_DEV = 'true';
    process.env.FEATURE_COMMUNITY_CHAT_ENABLED = 'true';
    process.env.FEATURE_CHAT_WRITES_ENABLED = 'true';
    process.env.CHAT_LOCAL_MEMORY_BUS_ENABLED = 'true';
    process.env.CHAT_LOCAL_MODERATION_ENABLED = 'true';
    dataSource = await createLocalDevDataSource();
    realtime = new ChatRealtimeService();
    await realtime.onModuleInit();
    service = new DirectMessageService(
      dataSource,
      realtime,
      new ChatModerationService(),
    );
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (realtime) await realtime.onModuleDestroy();
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('creates one canonical conversation for active unblocked friends', async () => {
    const [alice, bob, outsider] = await Promise.all([
      activeUser('alice@example.com', 'alice_user', 'Alice'),
      activeUser('bob@example.com', 'bob_user', 'Bob'),
      activeUser('outsider@example.com', 'outsider_user', 'Outsider'),
    ]);
    await expect(
      service.openConversation(alice.id, outsider.publicId),
    ).rejects.toMatchObject({ response: { code: 'CHAT_DIRECT_FRIEND_REQUIRED' } });

    await makeFriends(alice.id, bob.id);
    const first = await service.openConversation(alice.id, bob.publicId);
    const replay = await service.openConversation(bob.id, alice.publicId);
    jest.spyOn(dataSource, 'transaction').mockRejectedValueOnce(
      Object.assign(new Error('duplicate conversation race'), { code: '23505' }),
    );
    const racedReplay = await service.openConversation(alice.id, bob.publicId);

    expect(replay.id).toBe(first.id);
    expect(racedReplay.id).toBe(first.id);
    expect(first).toMatchObject({
      friend: {
        publicId: bob.publicId,
        username: 'bob_user',
        displayName: 'Bob',
      },
      latestSequence: 0,
      lastMessage: null,
      unreadCount: 0,
      canSend: true,
    });
    const page = await service.listConversations(alice.id);
    expect(page).toMatchObject({
      items: [{ id: first.id, canSend: true }],
      nextCursor: null,
      totalUnread: 0,
    });
    expect(
      await dataSource.getRepository(DirectConversationMember).count({
        where: { conversationId: first.id },
      }),
    ).toBe(2);
  });

  it('keeps sequences, client idempotency and unread cursors monotonic', async () => {
    const [alice, bob] = await Promise.all([
      activeUser('sequence-alice@example.com', 'sequence_alice', 'Alice'),
      activeUser('sequence-bob@example.com', 'sequence_bob', 'Bob'),
    ]);
    await makeFriends(alice.id, bob.id);
    const conversation = await service.openConversation(alice.id, bob.publicId);
    const clientMessageId = randomUUID();
    const first = await service.send(alice.id, {
      conversationId: conversation.id,
      clientMessageId,
      body: '第一条私聊',
    });
    const replay = await service.send(alice.id, {
      conversationId: conversation.id,
      clientMessageId,
      body: '第一条私聊',
    });
    expect(replay).toMatchObject({ id: first.id, sequence: 1 });
    await expect(
      service.send(alice.id, {
        conversationId: conversation.id,
        clientMessageId,
        body: '冲突的消息',
      }),
    ).rejects.toMatchObject({ response: { code: 'CHAT_IDEMPOTENCY_CONFLICT' } });

    const second = await service.send(bob.id, {
      conversationId: conversation.id,
      clientMessageId: randomUUID(),
      body: '收到',
      replyToMessageId: first.id,
    });
    expect(second).toMatchObject({ sequence: 2 });
    expect(second.replyTo).toMatchObject({
      messageId: first.id,
      bodyPreview: '第一条私聊',
    });

    const beforeRead = await service.listConversations(alice.id);
    expect(beforeRead).toMatchObject({
      totalUnread: 1,
      items: [{ unreadCount: 1, latestSequence: 2 }],
    });
    const publish = jest.spyOn(realtime, 'publish');
    const marked = await service.markRead(alice.id, conversation.id, 2);
    const stale = await service.markRead(alice.id, conversation.id, 1);
    expect(marked).toEqual({
      conversationId: conversation.id,
      lastReadSequence: 2,
      unreadCount: 0,
    });
    expect(stale).toEqual(marked);
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'direct',
        kind: 'read',
        conversationId: conversation.id,
        readerUserId: alice.id,
        lastReadSequence: 2,
        participantIds: expect.arrayContaining([alice.id, bob.id]),
      }),
    );
    expect(await dataSource.getRepository(DirectMessage).count()).toBe(2);
  });

  it('keeps history readable after friendship removal but disables new sends', async () => {
    const [alice, bob] = await Promise.all([
      activeUser('former-alice@example.com', 'former_alice', 'Alice'),
      activeUser('former-bob@example.com', 'former_bob', 'Bob'),
    ]);
    const friendship = await makeFriends(alice.id, bob.id);
    const conversation = await service.openConversation(alice.id, bob.publicId);
    const message = await service.send(alice.id, {
      conversationId: conversation.id,
      clientMessageId: randomUUID(),
      body: '历史会被保留',
    });
    friendship.endedAt = new Date();
    friendship.endedReason = 'removed';
    await dataSource.getRepository(Friendship).save(friendship);

    const history = await service.history(bob.id, conversation.id, {});
    expect(history.items).toEqual([
      expect.objectContaining({ id: message.id, body: '历史会被保留' }),
    ]);
    expect((await service.listConversations(bob.id)).items[0]).toMatchObject({
      id: conversation.id,
      canSend: false,
    });
    await expect(
      service.send(bob.id, {
        conversationId: conversation.id,
        clientMessageId: randomUUID(),
        body: '删友后不能再发送',
      }),
    ).rejects.toMatchObject({ response: { code: 'CHAT_DIRECT_FRIEND_REQUIRED' } });
  });

  it('anonymizes a deleted account in both the conversation list and history', async () => {
    const [alice, bob] = await Promise.all([
      activeUser('deleted-peer-alice@example.com', 'deleted_peer_alice', 'Alice'),
      activeUser('deleted-peer-bob@example.com', 'deleted_peer_bob', 'Bob'),
    ]);
    await makeFriends(alice.id, bob.id);
    const conversation = await service.openConversation(alice.id, bob.publicId);
    await service.send(bob.id, {
      conversationId: conversation.id,
      clientMessageId: randomUUID(),
      body: '注销前的消息',
    });
    bob.accountStatus = 'deleted';
    await dataSource.getRepository(User).save(bob);

    const listed = (await service.listConversations(alice.id)).items[0];
    expect(listed).toMatchObject({
      friend: {
        publicId: '00000000-0000-4000-8000-000000000000',
        displayName: '已注销用户',
      },
      canSend: false,
    });
    expect(listed.friend).not.toHaveProperty('username');
    expect(listed.lastMessage).toMatchObject({
      visibility: 'withdrawn_placeholder',
      body: null,
      author: {
        publicId: '00000000-0000-4000-8000-000000000000',
        displayName: '已注销用户',
      },
    });
    expect((await service.history(alice.id, conversation.id, {})).items[0]).toMatchObject({
      visibility: 'withdrawn_placeholder',
      author: { displayName: '已注销用户' },
    });
  });

  it('hides an entire conversation across either direction of a block', async () => {
    const [alice, bob] = await Promise.all([
      activeUser('blocked-alice@example.com', 'blocked_alice', 'Alice'),
      activeUser('blocked-bob@example.com', 'blocked_bob', 'Bob'),
    ]);
    await makeFriends(alice.id, bob.id);
    const conversation = await service.openConversation(alice.id, bob.publicId);
    const message = await service.send(alice.id, {
      conversationId: conversation.id,
      clientMessageId: randomUUID(),
      body: '拉黑后不可见',
    });
    await dataSource.getRepository(UserBlock).save(
      dataSource.getRepository(UserBlock).create({
        blockerId: bob.id,
        blockedId: alice.id,
        reason: null,
      }),
    );

    expect((await service.listConversations(alice.id)).items).toEqual([]);
    expect((await service.listConversations(bob.id)).items).toEqual([]);
    await expect(service.history(alice.id, conversation.id, {})).rejects.toMatchObject({
      response: { code: 'CHAT_DIRECT_CONVERSATION_NOT_FOUND' },
    });
    await expect(service.messageForViewer(bob.id, message.id)).rejects.toMatchObject({
      response: { code: 'CHAT_DIRECT_CONVERSATION_NOT_FOUND' },
    });
    expect(await service.participants(conversation.id)).toEqual([]);
  });

  it('supports two-minute withdrawal and participant-only idempotent reports', async () => {
    const [alice, bob, outsider] = await Promise.all([
      activeUser('report-alice@example.com', 'report_alice', 'Alice'),
      activeUser('report-bob@example.com', 'report_bob', 'Bob'),
      activeUser('report-outsider@example.com', 'report_outsider', 'Outsider'),
    ]);
    await makeFriends(alice.id, bob.id);
    const conversation = await service.openConversation(alice.id, bob.publicId);
    const first = await service.send(alice.id, {
      conversationId: conversation.id,
      clientMessageId: randomUUID(),
      body: '可撤回也可举报的消息',
    });
    const reportKey = randomUUID();
    const report = await service.report(bob.id, first.id, reportKey, {
      reason: 'harassment',
      detail: '请复核',
    });
    await expect(
      service.report(bob.id, first.id, reportKey, {
        reason: 'harassment',
        detail: '请复核',
      }),
    ).resolves.toEqual(report);
    await expect(
      service.report(alice.id, first.id, randomUUID(), { reason: 'spam' }),
    ).rejects.toMatchObject({ response: { code: 'CHAT_REPORT_FORBIDDEN' } });
    await expect(
      service.report(outsider.id, first.id, randomUUID(), { reason: 'spam' }),
    ).rejects.toMatchObject({
      response: { code: 'CHAT_DIRECT_CONVERSATION_NOT_FOUND' },
    });

    const withdrawn = await service.withdraw(alice.id, conversation.id, first.id);
    expect(withdrawn).toMatchObject({
      id: first.id,
      visibility: 'withdrawn_placeholder',
      body: null,
      version: 2,
    });

    const expired = await service.send(alice.id, {
      conversationId: conversation.id,
      clientMessageId: randomUUID(),
      body: '超时消息',
    });
    await dataSource.getRepository(DirectMessage).update(
      { id: expired.id },
      { createdAt: new Date(Date.now() - 121_000) },
    );
    await expect(
      service.withdraw(alice.id, conversation.id, expired.id),
    ).rejects.toMatchObject({
      response: { code: 'CHAT_WITHDRAW_WINDOW_EXPIRED' },
    });
  });

  async function activeUser(
    email: string,
    username: string,
    displayName: string,
  ): Promise<User> {
    const user = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        email,
        emailNormalized: email,
        username,
        usernameNormalized: username.toLowerCase(),
        passwordHash: 'unused-test-hash',
        displayName,
        publicId: randomUUID(),
        accountStatus: 'active',
        socialVerificationStatus: 'unverified',
        communityRole: 'user',
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

  async function makeFriends(left: string, right: string): Promise<Friendship> {
    const [userLowId, userHighId] = left < right ? [left, right] : [right, left];
    const now = new Date();
    return dataSource.getRepository(Friendship).save(
      dataSource.getRepository(Friendship).create({
        userLowId,
        userHighId,
        firstBecameFriendsAt: now,
        currentStartedAt: now,
        endedAt: null,
        endedReason: null,
      }),
    );
  }
});
