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

describe('ChatWebSocketGateway real socket protocol', () => {
  let dataSource: DataSource;
  let realtime: ChatRealtimeService;
  let chat: ChatService;
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
    gateway = new ChatWebSocketGateway(chat, realtime);
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
    const gateway = new ChatWebSocketGateway(
      {} as ChatService,
      realtime as unknown as ChatRealtimeService,
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
