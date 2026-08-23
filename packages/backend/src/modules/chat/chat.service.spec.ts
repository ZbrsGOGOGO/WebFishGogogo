import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';

import {
  AuthSession,
  ChatMessage,
  ChatMessageMention,
  ChatRoom,
  Friendship,
  PlayerProfile,
  User,
  UserBlock,
} from '../../database/entities';
import { createLocalDevDataSource } from '../../database/local-dev-datasource';
import { ChatModerationService } from './chat-moderation.service';
import { ChatRealtimeService } from './chat-realtime.service';
import { ChatService } from './chat.service';

describe('ChatService safety and persistence invariants', () => {
  let dataSource: DataSource;
  let realtime: ChatRealtimeService;
  let service: ChatService;
  const originalEnv = { ...process.env };

  beforeAll(() => {
    process.env.LOCAL_DEV = 'true';
    process.env.FEATURE_COMMUNITY_CHAT_ENABLED = 'true';
    process.env.FEATURE_CHAT_WRITES_ENABLED = 'true';
    process.env.FEATURE_SOCIAL_VERIFICATION_ENABLED = 'false';
    process.env.CHAT_LOCAL_MEMORY_BUS_ENABLED = 'true';
    process.env.CHAT_LOCAL_MODERATION_ENABLED = 'true';
  });

  beforeEach(async () => {
    process.env.LOCAL_DEV = 'true';
    process.env.FEATURE_COMMUNITY_CHAT_ENABLED = 'true';
    process.env.FEATURE_CHAT_WRITES_ENABLED = 'true';
    process.env.FEATURE_SOCIAL_VERIFICATION_ENABLED = 'false';
    process.env.CHAT_LOCAL_MEMORY_BUS_ENABLED = 'true';
    process.env.CHAT_LOCAL_MODERATION_ENABLED = 'true';
    dataSource = await createLocalDevDataSource();
    await dataSource
      .createQueryBuilder()
      .update(ChatRoom)
      .set({ slowModeSeconds: 0 })
      .execute();
    realtime = new ChatRealtimeService();
    await realtime.onModuleInit();
    service = new ChatService(dataSource, realtime, new ChatModerationService());
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (realtime) await realtime.onModuleDestroy();
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('seeds only the six fixed rooms and fails closed when realtime is unavailable', async () => {
    const user = await activeUser('rooms@example.com', 'Rooms');
    const rooms = await service.listRooms(user.id);
    expect(rooms.items.map((room) => room.slug)).toEqual([
      'general',
      'developer',
      'product',
      'qa',
      'sales',
      'hr',
    ]);
    expect(rooms.items.every((room) => room.readOnly === false)).toBe(true);
    expect(rooms.items.every((room) => typeof room.presenceBand === 'string')).toBe(true);

    await realtime.onModuleDestroy();
    const degraded = await service.listRooms(user.id);
    expect(degraded.items.every((room) => room.readOnly)).toBe(true);
    expect(degraded.items.every((room) => room.presenceBand === 'unavailable')).toBe(true);
    await expect(
      service.send(user.id, {
        clientMessageId: randomUUID(),
        roomSlug: 'general',
        body: 'This message must never be accepted while Redis is unavailable.',
      }),
    ).rejects.toMatchObject({ response: { code: 'CHAT_ROOM_READ_ONLY' } });
  });

  it('lets every active registered user send while keeping global gates and reports available', async () => {
    const author = await activeUser('gated-author@example.com', 'Gated Author');
    const reporter = await activeUser('gated-reporter@example.com', 'Gated Reporter');
    process.env.FEATURE_COMMUNITY_CHAT_ENABLED = 'false';
    await expect(service.listRooms(author.id)).rejects.toMatchObject({
      response: { code: 'CHAT_DISABLED' },
    });
    process.env.FEATURE_COMMUNITY_CHAT_ENABLED = 'true';

    author.socialVerificationStatus = 'unverified';
    await dataSource.getRepository(User).save(author);
    process.env.FEATURE_SOCIAL_VERIFICATION_ENABLED = 'true';
    const message = await service.send(author.id, {
      clientMessageId: randomUUID(),
      roomSlug: 'general',
      body: 'Registered users can speak without a separate social verification step.',
    });
    expect(message.author.publicId).toBe(author.publicId);

    process.env.FEATURE_CHAT_WRITES_ENABLED = 'false';
    expect((await service.listRooms(author.id)).items.every((room) => room.readOnly)).toBe(true);
    await expect(
      service.send(author.id, {
        clientMessageId: randomUUID(),
        roomSlug: 'general',
        body: 'Write-gated send must be rejected.',
      }),
    ).rejects.toMatchObject({ response: { code: 'CHAT_ROOM_READ_ONLY' } });
    await expect(
      service.report(reporter.id, message.id, randomUUID(), {
        reason: 'spam',
      }),
    ).resolves.toMatchObject({ status: 'received' });
    process.env.FEATURE_CHAT_WRITES_ENABLED = 'true';
  });

  it('allocates monotonic room sequences and replays an identical clientMessageId exactly', async () => {
    const firstAuthor = await activeUser('first@example.com', 'First');
    const secondAuthor = await activeUser('second@example.com', 'Second');
    const clientMessageId = randomUUID();
    const [first, replay] = await Promise.all([
      service.send(firstAuthor.id, {
        clientMessageId,
        roomSlug: 'general',
        body: 'First persisted message.',
      }),
      service.send(firstAuthor.id, {
        clientMessageId,
        roomSlug: 'general',
        body: 'First persisted message.',
      }),
    ]);
    const second = await service.send(secondAuthor.id, {
      clientMessageId: randomUUID(),
      roomSlug: 'general',
      body: 'Second persisted message.',
    });
    expect(replay).toMatchObject({ id: first.id, sequence: first.sequence });
    expect([first.sequence, second.sequence]).toEqual([1, 2]);
    expect(await dataSource.getRepository(ChatMessage).count()).toBe(2);
    await expect(
      service.send(firstAuthor.id, {
        clientMessageId,
        roomSlug: 'general',
        body: 'A conflicting body.',
      }),
    ).rejects.toMatchObject({ response: { code: 'CHAT_IDEMPOTENCY_CONFLICT' } });
  });

  it('returns a body-free placeholder across either direction of a block', async () => {
    const author = await activeUser('blocked-author@example.com', 'Blocked Author');
    const viewer = await activeUser('blocked-viewer@example.com', 'Blocked Viewer');
    const body = 'Sensitive message body that must not cross a block boundary.';
    await service.send(author.id, {
      clientMessageId: randomUUID(),
      roomSlug: 'developer',
      body,
    });
    await dataSource.getRepository(UserBlock).save(
      dataSource.getRepository(UserBlock).create({
        blockerId: viewer.id,
        blockedId: author.id,
        reason: 'test',
      }),
    );
    const history = await service.history(viewer.id, 'developer', {});
    expect(history.items[0]).toMatchObject({
      visibility: 'blocked_placeholder',
      body: null,
    });
    expect(JSON.stringify(history)).not.toContain(body);
  });

  it('hydrates a full history page with fixed batch queries', async () => {
    const author = await activeUser('history-batch-author@example.com', 'Batch Author');
    const viewer = await activeUser('history-batch-viewer@example.com', 'Batch Viewer');
    const messageRepo = dataSource.getRepository(ChatMessage);
    await messageRepo.save(
      Array.from({ length: 25 }, (_, index) =>
        messageRepo.create({
          roomSlug: 'general',
          authorId: author.id,
          clientMessageId: randomUUID(),
          requestHash: `${index}`.padStart(64, '0'),
          sequence: index + 1,
          body: `Batch history message ${index + 1}`,
          replyToMessageId: null,
          status: 'visible',
          version: 1,
          moderationProvider: 'local-test',
          moderationDecision: 'allow',
          moderationReference: null,
          withdrawnAt: null,
        }),
      ),
    );
    await dataSource.getRepository(ChatRoom).update(
      { slug: 'general' },
      { latestSequence: 25 },
    );

    const messageFind = jest.spyOn(messageRepo, 'find');
    const userFind = jest.spyOn(dataSource.getRepository(User), 'find');
    const profileFind = jest.spyOn(dataSource.getRepository(PlayerProfile), 'find');
    const mentionFind = jest.spyOn(dataSource.getRepository(ChatMessageMention), 'find');
    const blockFind = jest.spyOn(dataSource.getRepository(UserBlock), 'find');
    const history = await service.history(viewer.id, 'general', { limit: 25 });

    expect(history.items).toHaveLength(25);
    expect(messageFind).toHaveBeenCalledTimes(1);
    expect(userFind).toHaveBeenCalledTimes(1);
    expect(profileFind).toHaveBeenCalledTimes(1);
    expect(mentionFind).toHaveBeenCalledTimes(1);
    expect(blockFind).toHaveBeenCalledTimes(1);
  });

  it('keeps only the latest 200 messages in each room', async () => {
    const author = await activeUser('retention@example.com', 'Retention');
    const repo = dataSource.getRepository(ChatMessage);
    await repo.save(Array.from({ length: 205 }, (_, index) => repo.create({
      id: randomUUID(),
      roomSlug: 'general',
      authorId: author.id,
      clientMessageId: randomUUID(),
      requestHash: index.toString(16).padStart(64, '0'),
      sequence: index + 1,
      body: `Message ${index + 1}`,
      replyToMessageId: null,
      status: 'visible',
      version: 1,
      moderationProvider: 'local-test',
      moderationDecision: 'allow',
      moderationReference: null,
      withdrawnAt: null,
    })));
    await dataSource.getRepository(ChatRoom).update(
      { slug: 'general' },
      { latestSequence: 205 },
    );

    await service.onModuleInit();

    const retained = await repo.find({ where: { roomSlug: 'general' }, order: { sequence: 'ASC' } });
    expect(retained).toHaveLength(200);
    expect(retained[0].sequence).toBe(6);
    expect(retained.at(-1)?.sequence).toBe(205);
  });

  it('replaces deleted chat identities and removes deleted mention public ids', async () => {
    const author = await activeUser('deleted-chat-author@example.com', 'Deleted Chat Author');
    const mentioned = await activeUser('deleted-chat-mention@example.com', 'Deleted Mention');
    const viewer = await activeUser('deleted-chat-viewer@example.com', 'Viewer');
    await makeFriends(author.id, mentioned.id);
    const body = 'A retained room message that must become a private placeholder.';
    await service.send(author.id, {
      clientMessageId: randomUUID(),
      roomSlug: 'general',
      body,
      mentionPublicIds: [mentioned.publicId],
    });
    mentioned.accountStatus = 'deleted';
    author.accountStatus = 'deleted';
    await dataSource.getRepository(User).save([mentioned, author]);

    const history = await service.history(viewer.id, 'general', {});
    expect(history.items[0]).toMatchObject({
      visibility: 'withdrawn_placeholder',
      body: null,
      author: {
        publicId: '00000000-0000-4000-8000-000000000000',
        displayName: '已注销用户',
      },
      mentionPublicIds: [],
    });
    const serialized = JSON.stringify(history);
    expect(serialized).not.toContain(body);
    expect(serialized).not.toContain(author.publicId);
    expect(serialized).not.toContain(mentioned.publicId);
  });

  it('enforces friend-only mentions, slow mode, two-minute withdrawal and idempotent reports', async () => {
    const author = await activeUser('author@example.com', 'Author');
    const friend = await activeUser('friend@example.com', 'Friend');
    const stranger = await activeUser('stranger@example.com', 'Stranger');
    await makeFriends(author.id, friend.id);
    const first = await service.send(author.id, {
      clientMessageId: randomUUID(),
      roomSlug: 'qa',
      body: 'Hello allowed friend.',
      mentionPublicIds: [friend.publicId],
    });
    await expect(
      service.send(author.id, {
        clientMessageId: randomUUID(),
        roomSlug: 'product',
        body: 'This mention is not allowed.',
        mentionPublicIds: [stranger.publicId],
      }),
    ).rejects.toMatchObject({ response: { code: 'CHAT_MENTION_NOT_ALLOWED' } });

    await dataSource.getRepository(ChatRoom).update(
      { slug: 'general' },
      { slowModeSeconds: 60 },
    );
    await service.send(author.id, {
      clientMessageId: randomUUID(),
      roomSlug: 'general',
      body: 'Slow-mode first message.',
    });
    await expect(
      service.send(author.id, {
        clientMessageId: randomUUID(),
        roomSlug: 'general',
        body: 'Slow-mode second message.',
      }),
    ).rejects.toMatchObject({ response: { code: 'CHAT_SLOW_MODE' } });

    const withdrawn = await service.withdraw(author.id, 'qa', first.id);
    expect(withdrawn).toMatchObject({ visibility: 'withdrawn_placeholder', body: null });
    const reportKey = randomUUID();
    const report = await service.report(friend.id, first.id, reportKey, {
      reason: 'other',
      detail: 'test report',
    });
    const replay = await service.report(friend.id, first.id, reportKey, {
      reason: 'other',
      detail: 'test report',
    });
    expect(replay).toEqual(report);
  });

  it('issues a hashed, session-bound, single-use ticket with a hard expiry', async () => {
    const user = await activeUser('ticket@example.com', 'Ticket');
    const session = await authSession(user.id);
    const issued = await service.issueSocketTicket(user.id, session.id);
    expect(issued.ticket).not.toMatch(/^[0-9a-f]{64}$/);
    const stored = await dataSource.query(
      'SELECT ticket_hash FROM chat_socket_tickets WHERE session_id = $1',
      [session.id],
    ) as Array<{ ticket_hash: string }>;
    expect(stored[0].ticket_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored[0].ticket_hash).not.toContain(issued.ticket);
    await expect(service.consumeSocketTicket(issued.ticket)).resolves.toEqual({
      userId: user.id,
      sessionId: session.id,
    });
    await expect(service.consumeSocketTicket(issued.ticket)).rejects.toMatchObject({
      response: { code: 'CHAT_TICKET_INVALID' },
    });

    const expiring = await service.issueSocketTicket(user.id, session.id);
    await dataSource.query(
      'UPDATE chat_socket_tickets SET expires_at = $1 WHERE consumed_at IS NULL',
      [new Date(Date.now() - 1_000)],
    );
    await expect(service.consumeSocketTicket(expiring.ticket)).rejects.toMatchObject({
      response: { code: 'CHAT_TICKET_INVALID' },
    });
  });

  it('does not declare a production HTTPS moderation endpoint usable without a strong credential', async () => {
    const user = await activeUser('moderation-gate@example.com', 'Moderation Gate');
    process.env.LOCAL_DEV = 'false';
    process.env.CHAT_MODERATION_ENDPOINT = 'https://moderation.example.test/v1/messages';
    process.env.CHAT_MODERATION_API_TOKEN = 'short';
    const missingCredential = new ChatModerationService();
    expect(missingCredential.isAvailable()).toBe(false);
    const bypassedCompose = new ChatService(dataSource, realtime, missingCredential);
    expect((await bypassedCompose.listRooms(user.id)).items.every((room) => room.readOnly)).toBe(
      true,
    );
    process.env.CHAT_MODERATION_API_TOKEN = 'a-secure-token-with-at-least-24-bytes';
    const configured = new ChatModerationService();
    expect(configured.isAvailable()).toBe(true);
    jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('provider offline'));
    await expect(
      configured.moderate({
        messageId: randomUUID(),
        roomSlug: 'general',
        authorPublicId: user.publicId,
        body: 'Never logged moderation test body.',
      }),
    ).rejects.toMatchObject({ response: { code: 'CHAT_ROOM_READ_ONLY' } });
    expect(configured.isAvailable()).toBe(false);
    process.env.LOCAL_DEV = 'true';
    delete process.env.CHAT_MODERATION_ENDPOINT;
    delete process.env.CHAT_MODERATION_API_TOKEN;
  });

  it('supports the production built-in moderation fallback without enabling LOCAL_DEV', async () => {
    process.env.LOCAL_DEV = 'false';
    process.env.CHAT_BUILTIN_MODERATION_ENABLED = 'true';
    delete process.env.CHAT_MODERATION_ENDPOINT;
    delete process.env.CHAT_MODERATION_API_TOKEN;
    const moderation = new ChatModerationService();

    expect(moderation.isAvailable()).toBe(true);
    await expect(
      moderation.moderate({
        messageId: randomUUID(),
        roomSlug: 'general',
        authorPublicId: randomUUID(),
        body: '下班后一起打副本吗？',
      }),
    ).resolves.toMatchObject({ decision: 'allow', provider: 'builtin-rules-v1' });
    await expect(
      moderation.moderate({
        messageId: randomUUID(),
        roomSlug: 'general',
        authorPublicId: randomUUID(),
        body: '刷单返利，请私聊。',
      }),
    ).resolves.toMatchObject({ decision: 'reject', provider: 'builtin-rules-v1' });
  });

  async function activeUser(email: string, displayName: string): Promise<User> {
    const user = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        email,
        emailNormalized: email,
        passwordHash: 'unused',
        displayName,
        publicId: randomUUID(),
        accountStatus: 'active',
        socialVerificationStatus: 'verified',
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
        avatarKey: 'avatar-default-01',
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
        title: 'New colleague',
      }),
    );
    return user;
  }

  async function authSession(userId: string): Promise<AuthSession> {
    return dataSource.getRepository(AuthSession).save(
      dataSource.getRepository(AuthSession).create({
        userId,
        userAgent: 'jest',
        ipHash: null,
        lastSeenAt: new Date(),
        expiresAt: new Date(Date.now() + 3_600_000),
        revokedAt: null,
        revokeReason: null,
      }),
    );
  }

  async function makeFriends(left: string, right: string): Promise<void> {
    const [userLowId, userHighId] = left < right ? [left, right] : [right, left];
    const now = new Date();
    await dataSource.getRepository(Friendship).save(
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
