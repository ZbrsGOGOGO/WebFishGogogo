import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { DataSource } from 'typeorm';
import { WebSocket } from 'ws';

import {
  AuthSession,
  ChatRoom,
  PlayerProfile,
  User,
} from '../../database/entities';
import { createLocalDevDataSource } from '../../database/local-dev-datasource';
import { ChatModerationService } from './chat-moderation.service';
import { ChatRealtimeService } from './chat-realtime.service';
import { ChatService } from './chat.service';
import { ChatWebSocketGateway } from './chat-websocket.gateway';
import type { DirectMessageService } from './direct-message.service';

describe('ChatWebSocketGateway real socket protocol', () => {
  let dataSource: DataSource;
  let realtime: ChatRealtimeService;
  let chat: ChatService;
  let directMessages: {
    send: jest.Mock;
    withdraw: jest.Mock;
    markRead: jest.Mock;
    messageForViewer: jest.Mock;
    publishMessageEvent: jest.Mock;
  };
  let gateway: ChatWebSocketGateway;
  let server: Server;
  let baseUrl: string;
  const sockets: WebSocket[] = [];
  const originalEnv = { ...process.env };

  beforeAll(() => {
    process.env.LOCAL_DEV = 'true';
    process.env.FEATURE_COMMUNITY_CHAT_ENABLED = 'true';
    process.env.FEATURE_CHAT_WRITES_ENABLED = 'true';
    process.env.CHAT_LOCAL_MEMORY_BUS_ENABLED = 'true';
    process.env.CHAT_LOCAL_MODERATION_ENABLED = 'true';
    process.env.PUBLIC_SITE_ORIGIN = 'http://localhost:5173';
    process.env.CHAT_LOCAL_ORIGIN_RELAXED = 'false';
  });

  beforeEach(async () => {
    dataSource = await createLocalDevDataSource();
    await dataSource
      .createQueryBuilder()
      .update(ChatRoom)
      .set({ slowModeSeconds: 0 })
      .execute();
    realtime = new ChatRealtimeService();
    await realtime.onModuleInit();
    chat = new ChatService(dataSource, realtime, new ChatModerationService());
    directMessages = {
      send: jest.fn(),
      withdraw: jest.fn(),
      markRead: jest.fn(),
      messageForViewer: jest.fn(),
      publishMessageEvent: jest.fn(),
    };
    gateway = new ChatWebSocketGateway(
      chat,
      realtime,
      directMessages as unknown as DirectMessageService,
      dataSource,
    );
    server = createServer((_request, response) => {
      response.writeHead(404).end();
    });
    gateway.attach(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN) socket.close();
      if (socket.readyState !== WebSocket.CLOSED) socket.terminate();
    }
    sockets.length = 0;
    await gateway.onModuleDestroy();
    await realtime.onModuleDestroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (dataSource.isInitialized) await dataSource.destroy();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('authenticates with a single-use ticket and emits parser-compatible frames in ack-first order', async () => {
    const user = await activeUser('socket@example.com', 'Socket User');
    const session = await authSession(user.id);
    const issued = await chat.issueSocketTicket(user.id, session.id);
    const socket = await openSocket('/ws/chat', 'http://localhost:5173');
    const events = collect(socket);
    socket.send(
      JSON.stringify({
        type: 'chat.authenticate',
        protocolVersion: 1,
        requestId: 'auth-1',
        ticket: issued.ticket,
      }),
    );
    expect(await events.next('chat.authenticated')).toMatchObject({
      protocolVersion: 1,
      sessionId: session.id,
    });

    socket.send(
      JSON.stringify({
        type: 'chat.subscribe',
        protocolVersion: 1,
        requestId: 'subscribe-1',
        roomSlug: 'general',
        afterSequence: 0,
      }),
    );
    expect(await events.next('chat.ack')).toMatchObject({
      protocolVersion: 1,
      action: 'subscribe',
      requestId: 'subscribe-1',
    });
    expect(await events.next('chat.ready')).toMatchObject({
      protocolVersion: 1,
      rooms: [{ roomSlug: 'general', latestSequence: 0 }],
    });
    expect(await events.next('chat.presence')).toMatchObject({
      protocolVersion: 1,
      roomSlug: 'general',
      presenceBand: 'quiet',
    });

    const clientMessageId = randomUUID();
    socket.send(
      JSON.stringify({
        type: 'chat.send',
        protocolVersion: 1,
        requestId: 'send-1',
        clientMessageId,
        roomSlug: 'general',
        body: 'A real WebSocket message.',
      }),
    );
    const sendAck = await events.next('chat.ack');
    const created = await events.next('chat.message.created');
    expect(sendAck).toMatchObject({
      protocolVersion: 1,
      action: 'send',
      requestId: 'send-1',
      clientMessageId,
      sequence: 1,
    });
    expect(created).toMatchObject({
      protocolVersion: 1,
      message: {
        roomSlug: 'general',
        sequence: 1,
        clientMessageId,
        visibility: 'visible',
        body: 'A real WebSocket message.',
      },
    });
    expect(events.types().indexOf('chat.ack')).toBeLessThan(
      events.types().indexOf('chat.message.created'),
    );

    socket.send(
      JSON.stringify({
        type: 'chat.subscribe',
        requestId: 'bad-version',
        roomSlug: 'developer',
        afterSequence: 0,
      }),
    );
    expect(await events.next('chat.error')).toMatchObject({
      protocolVersion: 1,
      code: 'CHAT_PROTOCOL_VERSION_UNSUPPORTED',
      requestId: 'bad-version',
    });

    const replay = await openSocket('/ws/chat', 'http://localhost:5173');
    const replayEvents = collect(replay);
    replay.send(
      JSON.stringify({
        type: 'chat.authenticate',
        protocolVersion: 1,
        requestId: 'auth-replay',
        ticket: issued.ticket,
      }),
    );
    expect(await replayEvents.next('chat.error')).toMatchObject({
      protocolVersion: 1,
      code: 'CHAT_TICKET_INVALID',
    });
    await expect(closeCode(replay)).resolves.toBe(4401);
  });

  it('rejects a foreign Origin and every token-bearing URL before the upgrade', async () => {
    await expect(rejectedUpgrade('/ws/chat', 'https://evil.example')).resolves.toBe(403);
    await expect(
      rejectedUpgrade('/ws/chat?token=must-not-be-accepted', 'http://localhost:5173'),
    ).resolves.toBe(404);
  });

  it.each(['revoked', 'expired', 'suspended'] as const)(
    'rechecks the authenticated principal before a business frame when it is %s',
    async (condition) => {
      const user = await activeUser(
        `principal-${condition}@example.com`,
        `Principal ${condition}`,
      );
      const session = await authSession(user.id);
      const client = await authenticatedSocket(
        user.id,
        session.id,
        `principal-${condition}`,
      );
      if (condition === 'revoked') {
        await dataSource.getRepository(AuthSession).update(
          { id: session.id },
          { revokedAt: new Date(), revokeReason: 'device_revoked' },
        );
      } else if (condition === 'expired') {
        await dataSource.getRepository(AuthSession).update(
          { id: session.id },
          { expiresAt: new Date(Date.now() - 1_000) },
        );
      } else {
        await dataSource.getRepository(User).update(
          { id: user.id },
          { accountStatus: 'suspended' },
        );
      }

      const closed = closeCode(client.socket);
      client.socket.send(JSON.stringify({
        type: 'chat.direct.read',
        protocolVersion: 1,
        requestId: `invalid-${condition}`,
        conversationId: randomUUID(),
        throughSequence: 0,
      }));

      expect(await client.events.next('chat.error')).toMatchObject({
        code: 'INVALID_SESSION',
        requestId: `invalid-${condition}`,
      });
      await expect(closed).resolves.toBe(4401);
      expect(directMessages.markRead).not.toHaveBeenCalled();
    },
  );

  it('closes an idle authenticated connection on heartbeat after its session is revoked', async () => {
    const user = await activeUser('idle-revoked@example.com', 'Idle Revoked');
    const session = await authSession(user.id);
    const client = await authenticatedSocket(user.id, session.id, 'idle-revoked');
    await dataSource.getRepository(AuthSession).update(
      { id: session.id },
      { revokedAt: new Date(), revokeReason: 'logout_all' },
    );

    const closed = closeCode(client.socket);
    await (gateway as unknown as { heartbeatTick(): Promise<void> }).heartbeatTick();

    expect(await client.events.next('chat.error')).toMatchObject({
      code: 'INVALID_SESSION',
    });
    await expect(closed).resolves.toBe(4401);
  });

  it('routes private message, withdrawal and read events only to both participants', async () => {
    const [author, recipient, outsider] = await Promise.all([
      activeUser('direct-author@example.com', 'Direct Author'),
      activeUser('direct-recipient@example.com', 'Direct Recipient'),
      activeUser('direct-outsider@example.com', 'Direct Outsider'),
    ]);
    const [authorSession, recipientSession, outsiderSession] = await Promise.all([
      authSession(author.id),
      authSession(recipient.id),
      authSession(outsider.id),
    ]);
    const [authorFirst, authorSecond, recipientClient, outsiderClient] = await Promise.all([
      authenticatedSocket(author.id, authorSession.id, 'author-first'),
      authenticatedSocket(author.id, authorSession.id, 'author-second'),
      authenticatedSocket(recipient.id, recipientSession.id, 'recipient'),
      authenticatedSocket(outsider.id, outsiderSession.id, 'outsider'),
    ]);
    const conversationId = randomUUID();
    const messageId = randomUUID();
    const message = {
      id: messageId,
      conversationId,
      sequence: 1,
      version: 1,
      visibility: 'visible',
      body: '仅参与者可见的私聊',
    };
    directMessages.send.mockResolvedValue(message);
    directMessages.withdraw.mockResolvedValue({
      ...message,
      version: 2,
      visibility: 'withdrawn_placeholder',
      body: null,
    });
    directMessages.messageForViewer.mockImplementation(
      async (viewerId: string) => ({ ...message, viewerId }),
    );
    directMessages.publishMessageEvent.mockImplementation(
      async (kind: 'created' | 'updated', emittedConversationId: string, emittedMessageId: string) => {
        await realtime.publish({
          scope: 'direct',
          kind,
          conversationId: emittedConversationId,
          messageId: emittedMessageId,
          participantIds: [author.id, recipient.id],
        });
      },
    );
    directMessages.markRead.mockImplementation(
      async (readerUserId: string, emittedConversationId: string, lastReadSequence: number) => {
        await realtime.publish({
          scope: 'direct',
          kind: 'read',
          conversationId: emittedConversationId,
          readerUserId,
          lastReadSequence,
          participantIds: [author.id, recipient.id],
        });
        return { conversationId: emittedConversationId, lastReadSequence, unreadCount: 0 };
      },
    );

    authorFirst.socket.send(JSON.stringify({
      type: 'chat.direct.send',
      protocolVersion: 1,
      requestId: 'direct-send-1',
      clientMessageId: 'direct-client-message-1',
      conversationId,
      body: '仅参与者可见的私聊',
    }));
    expect(await authorFirst.events.next('chat.ack')).toMatchObject({
      action: 'direct-send',
      requestId: 'direct-send-1',
      conversationId,
      messageId,
    });
    await Promise.all([
      authorFirst.events.next('chat.direct.message.created'),
      authorSecond.events.next('chat.direct.message.created'),
      recipientClient.events.next('chat.direct.message.created'),
    ]);
    expect(outsiderClient.events.types()).not.toContain('chat.direct.message.created');
    expect(
      directMessages.messageForViewer.mock.calls.map(([viewerId]) => viewerId).sort(),
    ).toEqual([author.id, recipient.id].sort());

    authorFirst.socket.send(JSON.stringify({
      type: 'chat.direct.withdraw',
      protocolVersion: 1,
      requestId: 'direct-withdraw-1',
      conversationId,
      messageId,
    }));
    expect(await authorFirst.events.next('chat.ack')).toMatchObject({
      action: 'direct-withdraw',
      requestId: 'direct-withdraw-1',
      conversationId,
      messageId,
    });
    await Promise.all([
      authorFirst.events.next('chat.direct.message.updated'),
      authorSecond.events.next('chat.direct.message.updated'),
      recipientClient.events.next('chat.direct.message.updated'),
    ]);
    expect(outsiderClient.events.types()).not.toContain('chat.direct.message.updated');

    recipientClient.socket.send(JSON.stringify({
      type: 'chat.direct.read',
      protocolVersion: 1,
      requestId: 'direct-read-1',
      conversationId,
      throughSequence: 1,
    }));
    const [authorRead, recipientRead, readAck] = await Promise.all([
      authorFirst.events.next('chat.direct.read.updated'),
      recipientClient.events.next('chat.direct.read.updated'),
      recipientClient.events.next('chat.ack'),
    ]);
    expect(authorRead).toMatchObject({
      conversationId,
      reader: 'other',
      lastReadSequence: 1,
    });
    expect(recipientRead).toMatchObject({
      conversationId,
      reader: 'self',
      lastReadSequence: 1,
    });
    expect(readAck).toMatchObject({
      action: 'direct-read',
      requestId: 'direct-read-1',
      unreadCount: 0,
    });
    expect(outsiderClient.events.types()).not.toContain('chat.direct.read.updated');
  });

  it('builds one public-room message view per user and fans it out to all of their sockets', async () => {
    const user = await activeUser('public-multi-tab@example.com', 'Public Multi Tab');
    const session = await authSession(user.id);
    const [first, second] = await Promise.all([
      authenticatedSocket(user.id, session.id, 'public-first'),
      authenticatedSocket(user.id, session.id, 'public-second'),
    ]);
    for (const [index, client] of [first, second].entries()) {
      client.socket.send(JSON.stringify({
        type: 'chat.subscribe',
        protocolVersion: 1,
        requestId: `public-subscribe-${index}`,
        roomSlug: 'general',
        afterSequence: 0,
      }));
      await client.events.next('chat.ack');
      await client.events.next('chat.ready');
    }
    const message = await chat.send(user.id, {
      clientMessageId: randomUUID(),
      roomSlug: 'general',
      body: '同一用户多标签只查询一次视图',
    });
    const messageForViewer = jest.spyOn(chat, 'messageForViewer');

    await chat.publishMessageEvent('created', 'general', message.id);

    await Promise.all([
      first.events.next('chat.message.created'),
      second.events.next('chat.message.created'),
    ]);
    expect(messageForViewer).toHaveBeenCalledTimes(1);
    expect(messageForViewer).toHaveBeenCalledWith(user.id, message.id);
  });

  async function openSocket(path: string, origin: string): Promise<WebSocket> {
    const socket = new WebSocket(`${baseUrl}${path}`, { origin });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    return socket;
  }

  async function rejectedUpgrade(path: string, origin: string): Promise<number> {
    const socket = new WebSocket(`${baseUrl}${path}`, { origin });
    sockets.push(socket);
    return new Promise<number>((resolve, reject) => {
      socket.once('unexpected-response', (_request, response) => {
        response.resume();
        resolve(response.statusCode ?? 0);
      });
      socket.once('open', () => reject(new Error('Upgrade unexpectedly succeeded')));
      socket.once('error', () => undefined);
    });
  }

  async function authenticatedSocket(
    userId: string,
    sessionId: string,
    requestId: string,
  ): Promise<{ socket: WebSocket; events: EventCollector }> {
    const ticket = await chat.issueSocketTicket(userId, sessionId);
    const socket = await openSocket('/ws/chat', 'http://localhost:5173');
    const events = collect(socket);
    socket.send(JSON.stringify({
      type: 'chat.authenticate',
      protocolVersion: 1,
      requestId,
      ticket: ticket.ticket,
    }));
    await events.next('chat.authenticated');
    return { socket, events };
  }

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
        userAgent: 'jest websocket',
        ipHash: null,
        lastSeenAt: new Date(),
        expiresAt: new Date(Date.now() + 3_600_000),
        revokedAt: null,
        revokeReason: null,
      }),
    );
  }
});

describe('ChatWebSocketGateway heartbeat cardinality', () => {
  it('queries a room presence band once for one thousand subscribed connections', async () => {
    const realtime = {
      subscribe: jest.fn(() => () => undefined),
      touchPresenceBatch: jest.fn(
        async (_roomSlug: string, _connectionIds: readonly string[]) => undefined,
      ),
      presenceBand: jest.fn(async (_roomSlug: string) => 'very_busy' as const),
    };
    const sessions = Array.from({ length: 1_000 }, (_, index) => ({
      id: `session-${index}`,
      userId: `user-${index}`,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { accountStatus: 'active' },
    }));
    const dataSource = {
      getRepository: jest.fn(() => ({
        find: jest.fn(async () => sessions),
      })),
    };
    const gateway = new ChatWebSocketGateway(
      {} as ChatService,
      realtime as unknown as ChatRealtimeService,
      {} as DirectMessageService,
      dataSource as unknown as DataSource,
    );
    const internals = gateway as unknown as {
      states: Map<
        WebSocket,
        {
          id: string;
          authenticated: boolean;
          userId: string;
          sessionId: string;
          subscriptions: Map<'general', number>;
          isAlive: boolean;
          frameWindowStartedAt: number;
          frameCount: number;
          authTimer: NodeJS.Timeout;
        }
      >;
      heartbeatTick(): Promise<void>;
    };
    for (let index = 0; index < 1_000; index += 1) {
      const socket = {
        readyState: WebSocket.OPEN,
        ping: jest.fn(),
        send: jest.fn(),
        terminate: jest.fn(),
      } as unknown as WebSocket;
      internals.states.set(socket, {
        id: `connection-${index}`,
        authenticated: true,
        userId: `user-${index}`,
        sessionId: `session-${index}`,
        subscriptions: new Map([['general', 0]]),
        isAlive: true,
        frameWindowStartedAt: Date.now(),
        frameCount: 0,
        authTimer: setTimeout(() => undefined, 60_000),
      });
    }
    await internals.heartbeatTick();
    expect(realtime.touchPresenceBatch).toHaveBeenCalledTimes(1);
    expect(realtime.touchPresenceBatch.mock.calls[0][1]).toHaveLength(1_000);
    expect(realtime.presenceBand).toHaveBeenCalledTimes(1);
    for (const state of internals.states.values()) clearTimeout(state.authTimer);
    await gateway.onModuleDestroy();
  });
});

interface EventCollector {
  next(type: string): Promise<Record<string, unknown>>;
  types(): string[];
}

function collect(socket: WebSocket): EventCollector {
  const events: Array<Record<string, unknown>> = [];
  const waiters = new Set<() => void>();
  socket.on('message', (data) => {
    const event = JSON.parse(data.toString()) as Record<string, unknown>;
    events.push(event);
    for (const waiter of waiters) waiter();
  });
  return {
    next: (type) =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        const deadline = setTimeout(() => {
          waiters.delete(check);
          reject(new Error(`Timed out waiting for ${type}; received ${events.map((e) => e.type)}`));
        }, 3_000);
        const check = (): void => {
          const index = events.findIndex((event) => event.type === type && !event.__consumed);
          if (index < 0) return;
          const event = events[index];
          event.__consumed = true;
          clearTimeout(deadline);
          waiters.delete(check);
          resolve(event);
        };
        waiters.add(check);
        check();
      }),
    types: () => events.map((event) => String(event.type)),
  };
}

function closeCode(socket: WebSocket): Promise<number> {
  if (socket.readyState === WebSocket.CLOSED) return Promise.resolve(4401);
  return new Promise((resolve) => socket.once('close', (code) => resolve(code)));
}
