import 'reflect-metadata';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import type { DataSource } from 'typeorm';
import { AuthSession, User } from '../../../database/entities';
import { createLocalDevDataSource } from '../../../database/local-dev-datasource';
import { ChatWebSocketGateway } from '../../chat/chat-websocket.gateway';
import type { ChatService } from '../../chat/chat.service';
import type { ChatRealtimeService } from '../../chat/chat-realtime.service';
import type { DirectMessageService } from '../../chat/direct-message.service';
import { PaperArenaGateway } from './paper-arena.gateway';
import { PaperArenaService } from './paper-arena.service';

describe('paper arena real websocket security and shared HTTP server', () => {
  let db: DataSource, arena: PaperArenaService, gateway: PaperArenaGateway, chatGateway: ChatWebSocketGateway, server: Server, address: string;
  let sockets: WebSocket[] = [];
  const original = { ...process.env };
  beforeAll(async () => {
    process.env.LOCAL_DEV = 'true'; process.env.FEATURE_PAPER_ARENA_ENABLED = 'true'; process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true'; process.env.PUBLIC_SITE_ORIGIN = 'http://localhost:5173';
    db = await createLocalDevDataSource();
  });
  beforeEach(async () => {
    arena = new PaperArenaService(db); gateway = new PaperArenaGateway(arena);
    chatGateway = new ChatWebSocketGateway({} as ChatService, { subscribe: () => () => undefined } as unknown as ChatRealtimeService, {} as DirectMessageService, db);
    server = createServer((_req, response) => response.writeHead(404).end());
    // Chat registers first, exactly like production. It must not claim this path.
    chatGateway.attach(server); gateway.attach(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    address = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`; sockets = [];
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    sockets.forEach(socket => socket.terminate());
    await gateway.onModuleDestroy(); await chatGateway.onModuleDestroy(); arena.onModuleDestroy();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
  afterAll(async () => { process.env = original; if (db?.isInitialized) await db.destroy(); });
  function open(origin = 'http://localhost:5173', path = '/ws/paper-arena'): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(address + path, { origin, handshakeTimeout: 1500 }); sockets.push(socket);
      socket.on('error', () => undefined);
      socket.once('open', () => resolve(socket));
      socket.once('unexpected-response', (_request, response) => { response.resume(); reject(new Error(String(response.statusCode))); socket.terminate(); });
      socket.once('error', reject);
    });
  }
  function message(socket: WebSocket, type: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { socket.off('message', receive); reject(new Error(`Timed out waiting for ${type}`)); }, 2500);
      const receive = (raw: Buffer) => { const value = JSON.parse(raw.toString()); if (value.type === type) { clearTimeout(timer); socket.off('message', receive); resolve(value); } };
      socket.on('message', receive);
    });
  }
  function closed(socket: WebSocket): Promise<number> { return new Promise(resolve => socket.once('close', resolve)); }
  async function setup() {
    const user = await db.getRepository(User).save(db.getRepository(User).create({ email: `${randomUUID()}@socket.test.invalid`, passwordHash: 'synthetic-only', accountStatus: 'active', displayName: '联机测试员' }));
    const session = await db.getRepository(AuthSession).save({ userId: user.id, expiresAt: new Date(Date.now() + 600_000), revokedAt: null, lastSeenAt: new Date() });
    const room = await arena.create(user.id, { requestId: randomUUID(), name: '测试房间', maxPlayers: 4, targetKills: 20, password: '' });
    const ticket = await arena.ticket(user.id, session.id, room.id, {}); return { user, session, room, ticket };
  }
  async function authenticate(socket: WebSocket, ticket: string) {
    const authenticated = message(socket, 'paper.authenticated'), snapshot = message(socket, 'paper.snapshot');
    socket.send(JSON.stringify({ type: 'paper.authenticate', protocolVersion: 1, ticket })); await authenticated; return snapshot;
  }
  it('allows only the configured origin and exact path without query tickets', async () => {
    await expect(open('https://untrusted.invalid')).rejects.toThrow('403');
    await expect(open('http://localhost:5173', '/ws/paper-arena?ticket=secret')).rejects.toThrow('404');
    await expect(open('http://localhost:5173', '/ws/unknown')).rejects.toThrow('404');
    process.env.FEATURE_PAPER_ARENA_ENABLED = 'false'; await expect(open()).rejects.toThrow('404'); process.env.FEATURE_PAPER_ARENA_ENABLED = 'true';
  });
  it('requires authentication before any input and rejects binary frames', async () => {
    const first = await open(), firstClose = closed(first); first.send(JSON.stringify({ type: 'paper.input', seq: 1 })); expect(await firstClose).toBe(4401);
    const second = await open(), secondClose = closed(second); second.send(Buffer.from('binary')); expect(await secondClose).toBe(4400);
  });
  it('authenticates once, streams safe snapshots, and both viewers receive the same authoritative score', async () => {
    const context = await setup(), socket = await open();
    const first = await authenticate(socket, context.ticket.ticket); expect(first.room.myPlayerId).toBe(context.room.myPlayerId);
    expect(JSON.stringify(first)).not.toContain(context.ticket.ticket); expect(JSON.stringify(first)).not.toContain('controls');
    await arena.start(context.user.id, context.room.id, {});
    const next = message(socket, 'paper.snapshot'); arena.tick(Date.now() + 100);
    const view = await next; expect(view.room.game.tick).toBe(2); expect(view.room.game.scores).toEqual((await arena.get(context.user.id, context.room.id)).game.scores);
    const replay = await open(), replayClose = closed(replay); replay.send(JSON.stringify({ type: 'paper.authenticate', protocolVersion: 1, ticket: context.ticket.ticket })); expect(await replayClose).toBe(4401);
  });
  it('closes forged position/score frames and high-rate floods without advancing the game', async () => {
    const context = await setup(), socket = await open(); await authenticate(socket, context.ticket.ticket);
    const end = closed(socket); socket.send(JSON.stringify({ type: 'paper.input', seq: 1, forward: 0, strafe: 0, yaw: 0, pitch: 0, fire: false, reload: false, score: 100 })); expect(await end).toBe(4400);
    expect((await arena.get(context.user.id, context.room.id)).game.tick).toBe(0);
    const ticket = await arena.ticket(context.user.id, context.session.id, context.room.id, {}), flood = await open(); await authenticate(flood, ticket.ticket);
    const stop = closed(flood); for (let i = 0; i < 55; i++) flood.send(JSON.stringify({ type: 'paper.input', seq: i, forward: 0, strafe: 0, yaw: 0, pitch: 0, fire: false, reload: false })); expect(await stop).toBe(4429);
  });
  it('takes over one seat on reconnect and expires revoked sessions', async () => {
    const context = await setup(), first = await open(); await authenticate(first, context.ticket.ticket);
    const secondTicket = await arena.ticket(context.user.id, context.session.id, context.room.id, {}), second = await open(), oldClose = closed(first);
    await authenticate(second, secondTicket.ticket); expect(await oldClose).toBe(4409);
    expect((await arena.get(context.user.id, context.room.id)).players.find(p => p.id === context.room.myPlayerId)?.connected).toBe(true);
    const revoked = closed(second); await db.getRepository(AuthSession).update(context.session.id, { revokedAt: new Date() });
    await (gateway as unknown as { checkPrincipals(): Promise<void> }).checkPrincipals(); expect(await revoked).toBe(4401);
    expect((await arena.list(context.user.id)).currentRoomId).toBeNull();
  });
  it('a delayed invalidation of an old session cannot evict a newly authenticated socket', async () => {
    const context = await setup(), first = await open(); await authenticate(first, context.ticket.ticket);
    // Hold the old close callback to model a slow peer while its DB validation
    // is outstanding; this used to remove the newly connected account's seat.
    const connectionMap = (gateway as unknown as { connections: Map<WebSocket, unknown> }).connections;
    const oldServerSocket = [...connectionMap.keys()][0];
    jest.spyOn(oldServerSocket, 'close').mockImplementation(() => undefined);
    let entered!: () => void, release!: () => void;
    const enteredPromise = new Promise<void>(resolve => { entered = resolve; });
    const hold = new Promise<void>(resolve => { release = resolve; });
    jest.spyOn(arena, 'validPrincipals').mockImplementationOnce(async () => { entered(); await hold; return new Set(); });
    const pending = (gateway as unknown as { checkPrincipals(): Promise<void> }).checkPrincipals();
    await enteredPromise;
    try {
      const session = await db.getRepository(AuthSession).save({ userId: context.user.id, expiresAt: new Date(Date.now() + 600_000), revokedAt: null, lastSeenAt: new Date() });
      const ticket = await arena.ticket(context.user.id, session.id, context.room.id, {}), second = await open();
      await authenticate(second, ticket.ticket);
      release(); await pending;
      expect(second.readyState).toBe(WebSocket.OPEN);
      const view = await arena.get(context.user.id, context.room.id);
      expect(view.humans).toBe(1); expect(view.players.find(player => player.id === view.myPlayerId)?.connected).toBe(true);
    } finally { release(); await pending; }
  });
});
