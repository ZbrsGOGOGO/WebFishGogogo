import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { IncomingMessage, Server } from 'node:http';
import type { Socket } from 'node:net';
import { randomUUID } from 'node:crypto';
import {
  WebSocket,
  WebSocketServer,
  type RawData,
} from 'ws';
import { DataSource, In } from 'typeorm';

import { AuthSession } from '../../database/entities';
import type { ChatRoomSlug } from '../../database/entities/chat.entity';
import { ChatException, chatException } from './chat.errors';
import { isCommunityChatEnabled } from './chat-gates';
import { ChatRealtimeService } from './chat-realtime.service';
import { ChatService } from './chat.service';
import { DirectMessageService } from './direct-message.service';
import {
  isChatRoomSlug,
  isDirectChatRealtimeEvent,
  type ChatDirectMessageRealtimeEvent,
  type ChatDirectReadRealtimeEvent,
  type ChatRealtimeEvent,
  type ChatRoomRealtimeEvent,
} from './chat.types';

const AUTH_DEADLINE_MS = 5_000;
const HEARTBEAT_MS = 30_000;
const FRAME_WINDOW_MS = 10_000;
const MAX_FRAMES_PER_WINDOW = 40;
const MAX_PAYLOAD_BYTES = 16 * 1024;
const PRINCIPAL_RECHECK_BATCH_SIZE = 500;

interface ConnectionState {
  id: string;
  authenticated: boolean;
  userId: string | null;
  sessionId: string | null;
  subscriptions: Map<ChatRoomSlug, number>;
  isAlive: boolean;
  frameWindowStartedAt: number;
  frameCount: number;
  authTimer: NodeJS.Timeout;
}

type ClientFrame = Record<string, unknown> & { type: string };

@Injectable()
export class ChatWebSocketGateway implements OnModuleDestroy {
  private readonly logger = new Logger(ChatWebSocketGateway.name);
  private readonly wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_PAYLOAD_BYTES,
    perMessageDeflate: false,
    clientTracking: true,
  });
  private readonly states = new Map<WebSocket, ConnectionState>();
  private readonly userConnections = new Map<string, Set<WebSocket>>();
  private attachedServer: Server | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private readonly stopRealtimeListener: () => void;

  constructor(
    private readonly chat: ChatService,
    private readonly realtime: ChatRealtimeService,
    private readonly directMessages: DirectMessageService,
    private readonly dataSource: DataSource,
  ) {
    this.stopRealtimeListener = this.realtime.subscribe((event) =>
      this.broadcastRealtimeEvent(event),
    );
    this.wss.on('connection', (socket) => this.accept(socket));
  }

  attach(server: Server): void {
    if (this.attachedServer === server) return;
    if (this.attachedServer) {
      throw new Error('Chat WebSocket gateway is already attached to another server.');
    }
    this.attachedServer = server;
    server.on('upgrade', this.onUpgrade);
    this.heartbeat = setInterval(() => void this.heartbeatTick(), HEARTBEAT_MS);
    this.heartbeat.unref?.();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopRealtimeListener();
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    if (this.attachedServer) this.attachedServer.off('upgrade', this.onUpgrade);
    this.attachedServer = null;
    for (const socket of this.states.keys()) socket.terminate();
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
  }

  private readonly onUpgrade = (
    request: IncomingMessage,
    socket: Socket,
    head: Buffer,
  ): void => {
    let url: URL;
    try {
      url = new URL(request.url ?? '', 'http://chat.invalid');
    } catch {
      this.rejectUpgrade(socket, 400, 'Bad Request');
      return;
    }
    if (url.pathname !== '/ws/chat' || url.search !== '') {
      this.rejectUpgrade(socket, 404, 'Not Found');
      return;
    }
    if (!isCommunityChatEnabled()) {
      this.rejectUpgrade(socket, 404, 'Not Found');
      return;
    }
    if (!this.isAllowedOrigin(request.headers.origin)) {
      this.rejectUpgrade(socket, 403, 'Forbidden');
      return;
    }
    this.wss.handleUpgrade(request, socket, head, (client) => {
      this.wss.emit('connection', client, request);
    });
  };

  private accept(socket: WebSocket): void {
    const authTimer = setTimeout(() => {
      if (socket.readyState === WebSocket.OPEN) socket.close(4401, 'Authentication required');
    }, AUTH_DEADLINE_MS);
    authTimer.unref?.();
    const state: ConnectionState = {
      id: randomUUID(),
      authenticated: false,
      userId: null,
      sessionId: null,
      subscriptions: new Map(),
      isAlive: true,
      frameWindowStartedAt: Date.now(),
      frameCount: 0,
      authTimer,
    };
    this.states.set(socket, state);
    socket.on('pong', () => {
      state.isAlive = true;
    });
    socket.on('message', (data, isBinary) => {
      void this.handleFrame(socket, state, data, isBinary);
    });
    socket.on('close', () => void this.cleanup(socket, state));
    socket.on('error', () => {
      // The close handler performs cleanup. Errors never include frame data in logs.
    });
  }

  private async handleFrame(
    socket: WebSocket,
    state: ConnectionState,
    data: RawData,
    isBinary: boolean,
  ): Promise<void> {
    if (isBinary) {
      socket.close(4400, 'Text frames only');
      return;
    }
    if (!this.consumeFrameBudget(state)) {
      this.sendError(socket, chatException('CHAT_RATE_LIMITED', '发送请求过于频繁。', 429, 10));
      socket.close(4429, 'Rate limited');
      return;
    }
    let frame: ClientFrame;
    try {
      const parsed = JSON.parse(rawDataText(data)) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      const candidate = parsed as Record<string, unknown>;
      if (typeof candidate.type !== 'string') throw new Error();
      frame = candidate as ClientFrame;
    } catch {
      this.sendError(socket, chatException('CHAT_FRAME_INVALID', '消息帧格式无效。'));
      if (!state.authenticated) socket.close(4401, 'Authentication required');
      return;
    }

    if (!state.authenticated) {
      if (frame.type !== 'chat.authenticate') {
        this.sendError(socket, chatException('CHAT_AUTH_REQUIRED', '第一帧必须完成认证。', 401));
        socket.close(4401, 'Authentication required');
        return;
      }
      await this.authenticate(socket, state, frame);
      return;
    }

    if (!(await this.recheckPrincipalForFrame(socket, state, frame))) return;

    if (frame.protocolVersion !== 1) {
      this.sendError(
        socket,
        chatException('CHAT_PROTOCOL_VERSION_UNSUPPORTED', '不支持的聊天室协议版本。', 400),
        stringField(frame, 'requestId'),
        stringField(frame, 'clientMessageId'),
        stringField(frame, 'roomSlug'),
        stringField(frame, 'conversationId'),
      );
      return;
    }

    try {
      switch (frame.type) {
        case 'chat.subscribe':
          await this.subscribeRoom(socket, state, frame);
          break;
        case 'chat.unsubscribe':
          await this.unsubscribeRoom(socket, state, frame);
          break;
        case 'chat.send':
          await this.sendMessage(socket, state, frame);
          break;
        case 'chat.withdraw':
          await this.withdrawMessage(socket, state, frame);
          break;
        case 'chat.direct.send':
          await this.sendDirectMessage(socket, state, frame);
          break;
        case 'chat.direct.withdraw':
          await this.withdrawDirectMessage(socket, state, frame);
          break;
        case 'chat.direct.read':
          await this.readDirectConversation(socket, state, frame);
          break;
        default:
          throw chatException('CHAT_FRAME_UNSUPPORTED', '不支持的消息帧。');
      }
    } catch (error) {
      this.sendOperationError(socket, error, frame);
    }
  }

  private async authenticate(
    socket: WebSocket,
    state: ConnectionState,
    frame: ClientFrame,
  ): Promise<void> {
    try {
      if (frame.protocolVersion !== 1 || typeof frame.ticket !== 'string') {
        throw chatException('CHAT_TICKET_INVALID', '连接凭证无效。', 401);
      }
      const principal = await this.chat.consumeSocketTicket(frame.ticket);
      const maxConnections = this.maxConnectionsPerUser();
      const existing = this.userConnections.get(principal.userId) ?? new Set<WebSocket>();
      if (existing.size >= maxConnections) {
        throw chatException('CHAT_CONNECTION_LIMIT', '当前账号打开的聊天室连接过多。', 429);
      }
      clearTimeout(state.authTimer);
      state.authenticated = true;
      state.userId = principal.userId;
      state.sessionId = principal.sessionId;
      existing.add(socket);
      this.userConnections.set(principal.userId, existing);
      this.send(socket, {
        type: 'chat.authenticated',
        sessionId: principal.sessionId,
        serverTime: new Date().toISOString(),
      });
    } catch (error) {
      const exception = this.asChatException(error, 'CHAT_AUTH_FAILED', '聊天室认证失败。');
      this.sendError(socket, exception, stringField(frame, 'requestId'));
      socket.close(exception.getStatus() === 403 ? 4403 : 4401, 'Authentication failed');
    }
  }

  private async subscribeRoom(
    socket: WebSocket,
    state: ConnectionState,
    frame: ClientFrame,
  ): Promise<void> {
    const requestId = requiredString(frame, 'requestId');
    const roomSlug = requiredRoom(frame);
    const afterSequence = optionalNonNegativeInteger(frame.afterSequence) ?? 0;
    const room = await this.chat.room(state.userId!, roomSlug);
    state.subscriptions.set(roomSlug, afterSequence);
    await this.realtime.touchPresence(roomSlug, state.id);
    this.send(socket, {
      type: 'chat.ack',
      action: 'subscribe',
      requestId,
      roomSlug,
      serverTime: new Date().toISOString(),
    });
    const rooms = await Promise.all(
      [...state.subscriptions].map(async ([slug, after]) => {
        const snapshot = slug === roomSlug ? room : await this.chat.room(state.userId!, slug);
        return {
          roomSlug: slug,
          latestSequence: snapshot.latestSequence,
          ...(snapshot.latestSequence > after ? { gapAfterSequence: after } : {}),
          presenceBand: snapshot.presenceBand,
          mentionCandidates: snapshot.mentionCandidates,
        };
      }),
    );
    this.send(socket, { type: 'chat.ready', rooms });
    this.send(socket, {
      type: 'chat.presence',
      roomSlug,
      presenceBand: await this.realtime.presenceBand(roomSlug),
    });
  }

  private async unsubscribeRoom(
    socket: WebSocket,
    state: ConnectionState,
    frame: ClientFrame,
  ): Promise<void> {
    const requestId = requiredString(frame, 'requestId');
    const roomSlug = requiredRoom(frame);
    state.subscriptions.delete(roomSlug);
    await this.realtime.removePresence(roomSlug, state.id);
    this.send(socket, {
      type: 'chat.ack',
      action: 'unsubscribe',
      requestId,
      roomSlug,
      serverTime: new Date().toISOString(),
    });
  }

  private async sendMessage(
    socket: WebSocket,
    state: ConnectionState,
    frame: ClientFrame,
  ): Promise<void> {
    const requestId = requiredString(frame, 'requestId');
    const clientMessageId = requiredString(frame, 'clientMessageId');
    const roomSlug = requiredRoom(frame);
    if (!state.subscriptions.has(roomSlug)) {
      throw chatException('CHAT_ROOM_NOT_SUBSCRIBED', '请先订阅聊天室。', 409);
    }
    if (typeof frame.body !== 'string') {
      throw chatException('CHAT_MESSAGE_TOO_LONG', '消息须为 1 到 500 个字符。', 422);
    }
    const mentionPublicIds = optionalStringArray(frame.mentionPublicIds, 5);
    const message = await this.chat.send(state.userId!, {
      clientMessageId,
      roomSlug,
      body: frame.body,
      ...(typeof frame.replyToMessageId === 'string'
        ? { replyToMessageId: frame.replyToMessageId }
        : {}),
      ...(mentionPublicIds ? { mentionPublicIds } : {}),
    });
    this.send(socket, {
      type: 'chat.ack',
      action: 'send',
      requestId,
      roomSlug,
      clientMessageId,
      messageId: message.id,
      sequence: message.sequence,
      serverTime: new Date().toISOString(),
    });
    await this.chat.publishMessageEvent('created', roomSlug, message.id);
  }

  private async withdrawMessage(
    socket: WebSocket,
    state: ConnectionState,
    frame: ClientFrame,
  ): Promise<void> {
    const requestId = requiredString(frame, 'requestId');
    const roomSlug = requiredRoom(frame);
    const messageId = requiredString(frame, 'messageId');
    const message = await this.chat.withdraw(state.userId!, roomSlug, messageId);
    this.send(socket, {
      type: 'chat.ack',
      action: 'withdraw',
      requestId,
      roomSlug,
      messageId: message.id,
      sequence: message.sequence,
      serverTime: new Date().toISOString(),
    });
    await this.chat.publishMessageEvent('updated', roomSlug, message.id);
  }

  private async sendDirectMessage(
    socket: WebSocket,
    state: ConnectionState,
    frame: ClientFrame,
  ): Promise<void> {
    const requestId = requiredString(frame, 'requestId');
    const clientMessageId = requiredString(frame, 'clientMessageId');
    const conversationId = requiredString(frame, 'conversationId');
    if (typeof frame.body !== 'string') {
      throw chatException('CHAT_MESSAGE_TOO_LONG', '消息须为 1 到 500 个字符。', 422);
    }
    const message = await this.directMessages.send(state.userId!, {
      conversationId,
      clientMessageId,
      body: frame.body,
      ...(typeof frame.replyToMessageId === 'string'
        ? { replyToMessageId: frame.replyToMessageId }
        : {}),
    });
    this.send(socket, {
      type: 'chat.ack',
      action: 'direct-send',
      requestId,
      conversationId,
      clientMessageId,
      messageId: message.id,
      sequence: message.sequence,
      serverTime: new Date().toISOString(),
    });
    await this.directMessages.publishMessageEvent(
      'created',
      conversationId,
      message.id,
    );
  }

  private async withdrawDirectMessage(
    socket: WebSocket,
    state: ConnectionState,
    frame: ClientFrame,
  ): Promise<void> {
    const requestId = requiredString(frame, 'requestId');
    const conversationId = requiredString(frame, 'conversationId');
    const messageId = requiredString(frame, 'messageId');
    const message = await this.directMessages.withdraw(
      state.userId!,
      conversationId,
      messageId,
    );
    this.send(socket, {
      type: 'chat.ack',
      action: 'direct-withdraw',
      requestId,
      conversationId,
      messageId: message.id,
      sequence: message.sequence,
      serverTime: new Date().toISOString(),
    });
    await this.directMessages.publishMessageEvent(
      'updated',
      conversationId,
      message.id,
    );
  }

  private async readDirectConversation(
    socket: WebSocket,
    state: ConnectionState,
    frame: ClientFrame,
  ): Promise<void> {
    const requestId = requiredString(frame, 'requestId');
    const conversationId = requiredString(frame, 'conversationId');
    const throughSequence = requiredNonNegativeInteger(frame, 'throughSequence');
    // markRead 在数据库提交后自行发布定向 read 事件，gateway 不重复发布。
    const result = await this.directMessages.markRead(
      state.userId!,
      conversationId,
      throughSequence,
    );
    this.send(socket, {
      type: 'chat.ack',
      action: 'direct-read',
      requestId,
      conversationId: result.conversationId,
      lastReadSequence: result.lastReadSequence,
      unreadCount: result.unreadCount,
      serverTime: new Date().toISOString(),
    });
  }

  private async broadcastRealtimeEvent(event: ChatRealtimeEvent): Promise<void> {
    if (isDirectChatRealtimeEvent(event)) {
      return event.kind === 'read'
        ? this.broadcastDirectRead(event)
        : this.broadcastDirectMessage(event);
    }
    return this.broadcastRoomMessage(event);
  }

  private async broadcastRoomMessage(event: ChatRoomRealtimeEvent): Promise<void> {
    const socketsByUser = new Map<string, WebSocket[]>();
    for (const [socket, state] of this.states) {
      if (
        socket.readyState !== WebSocket.OPEN ||
        !state.authenticated ||
        !state.userId ||
        !state.subscriptions.has(event.roomSlug)
      ) {
        continue;
      }
      const sockets = socketsByUser.get(state.userId) ?? [];
      sockets.push(socket);
      socketsByUser.set(state.userId, sockets);
    }
    await Promise.allSettled(
      [...socketsByUser].map(async ([userId, sockets]) => {
        const message = await this.chat.messageForViewer(userId, event.messageId);
        for (const socket of sockets) {
          this.send(socket, {
            type: event.kind === 'created' ? 'chat.message.created' : 'chat.message.updated',
            message,
          });
        }
      }),
    );
  }

  private async broadcastDirectMessage(
    event: ChatDirectMessageRealtimeEvent,
  ): Promise<void> {
    const participantIds = [...new Set(event.participantIds)];
    if (participantIds.length !== 2) return;
    await Promise.allSettled(
      participantIds.map(async (userId) => {
        const sockets = this.openUserSockets(userId);
        if (sockets.length === 0) return;
        // 一个用户即使打开多个标签页，也只生成一次个性化消息视图。
        const message = await this.directMessages.messageForViewer(
          userId,
          event.messageId,
        );
        for (const socket of sockets) {
          this.send(socket, {
            type:
              event.kind === 'created'
                ? 'chat.direct.message.created'
                : 'chat.direct.message.updated',
            message,
          });
        }
      }),
    );
  }

  private broadcastDirectRead(event: ChatDirectReadRealtimeEvent): Promise<void> {
    const participantIds = [...new Set(event.participantIds)];
    if (
      participantIds.length !== 2 ||
      !participantIds.includes(event.readerUserId)
    ) {
      return Promise.resolve();
    }
    for (const userId of participantIds) {
      for (const socket of this.openUserSockets(userId)) {
        this.send(socket, {
          type: 'chat.direct.read.updated',
          conversationId: event.conversationId,
          reader: userId === event.readerUserId ? 'self' : 'other',
          lastReadSequence: event.lastReadSequence,
        });
      }
    }
    return Promise.resolve();
  }

  private openUserSockets(userId: string): WebSocket[] {
    const sockets = this.userConnections.get(userId);
    if (!sockets) return [];
    return [...sockets].filter((socket) => {
      const state = this.states.get(socket);
      return (
        socket.readyState === WebSocket.OPEN &&
        state?.authenticated === true &&
        state.userId === userId
      );
    });
  }

  private async heartbeatTick(): Promise<void> {
    const authenticatedConnections: Array<{
      socket: WebSocket;
      state: ConnectionState;
    }> = [];
    const roomConnections = new Map<ChatRoomSlug, Array<{ socket: WebSocket; state: ConnectionState }>>();
    for (const [socket, state] of this.states) {
      if (!state.isAlive) {
        socket.terminate();
        continue;
      }
      state.isAlive = false;
      socket.ping();
      if (!state.authenticated) continue;
      authenticatedConnections.push({ socket, state });
    }

    let activeSessions: Map<string, string>;
    try {
      activeSessions = await this.activeSessionUsers(
        authenticatedConnections.map(({ state }) => state),
      );
    } catch {
      this.logger.error('Chat connection session heartbeat recheck failed.');
      for (const { socket, state } of authenticatedConnections) {
        this.closeForSessionCheckFailure(socket, state);
      }
      return;
    }

    for (const { socket, state } of authenticatedConnections) {
      if (
        socket.readyState !== WebSocket.OPEN ||
        this.states.get(socket) !== state
      ) {
        continue;
      }
      if (
        !state.sessionId ||
        !state.userId ||
        activeSessions.get(state.sessionId) !== state.userId
      ) {
        this.closeForInvalidSession(socket, state);
        continue;
      }
      for (const roomSlug of state.subscriptions.keys()) {
        const connections = roomConnections.get(roomSlug) ?? [];
        connections.push({ socket, state });
        roomConnections.set(roomSlug, connections);
      }
    }
    await Promise.all(
      [...roomConnections].map(async ([roomSlug, connections]) => {
        await this.realtime.touchPresenceBatch(
          roomSlug,
          connections.map(({ state }) => state.id),
        );
        const presenceBand = await this.realtime.presenceBand(roomSlug);
        for (const { socket } of connections) {
          this.send(socket, { type: 'chat.presence', roomSlug, presenceBand });
        }
      }),
    );
  }

  private async recheckPrincipalForFrame(
    socket: WebSocket,
    state: ConnectionState,
    frame: ClientFrame,
  ): Promise<boolean> {
    try {
      if (await this.isActivePrincipal(state)) return true;
    } catch {
      this.logger.error('Chat connection session frame recheck failed.');
      this.closeForSessionCheckFailure(socket, state, frame);
      return false;
    }
    this.closeForInvalidSession(socket, state, frame);
    return false;
  }

  private async isActivePrincipal(state: ConnectionState): Promise<boolean> {
    if (!state.userId || !state.sessionId) return false;
    const session = await this.dataSource.getRepository(AuthSession).findOne({
      where: { id: state.sessionId, userId: state.userId },
      relations: { user: true },
    });
    return Boolean(
      session &&
      session.revokedAt === null &&
      session.expiresAt.getTime() > Date.now() &&
      session.user?.accountStatus === 'active',
    );
  }

  private async activeSessionUsers(
    states: readonly ConnectionState[],
  ): Promise<Map<string, string>> {
    const sessionIds = [
      ...new Set(
        states
          .map((state) => state.sessionId)
          .filter((sessionId): sessionId is string => Boolean(sessionId)),
      ),
    ];
    const active = new Map<string, string>();
    const now = Date.now();
    for (let index = 0; index < sessionIds.length; index += PRINCIPAL_RECHECK_BATCH_SIZE) {
      const sessions = await this.dataSource.getRepository(AuthSession).find({
        where: { id: In(sessionIds.slice(index, index + PRINCIPAL_RECHECK_BATCH_SIZE)) },
        relations: { user: true },
      });
      for (const session of sessions) {
        if (
          session.revokedAt === null &&
          session.expiresAt.getTime() > now &&
          session.user?.accountStatus === 'active'
        ) {
          active.set(session.id, session.userId);
        }
      }
    }
    return active;
  }

  private closeForInvalidSession(
    socket: WebSocket,
    state: ConnectionState,
    frame?: ClientFrame,
  ): void {
    state.authenticated = false;
    this.sendError(
      socket,
      chatException('INVALID_SESSION', '登录会话已失效。', 401),
      frame ? stringField(frame, 'requestId') : undefined,
      frame ? stringField(frame, 'clientMessageId') : undefined,
      frame ? stringField(frame, 'roomSlug') : undefined,
      frame ? stringField(frame, 'conversationId') : undefined,
    );
    socket.close(4401, 'Session invalid');
  }

  private closeForSessionCheckFailure(
    socket: WebSocket,
    state: ConnectionState,
    frame?: ClientFrame,
  ): void {
    state.authenticated = false;
    this.sendError(
      socket,
      chatException('CHAT_INTERNAL_ERROR', '聊天室操作失败，请稍后再试。', 500),
      frame ? stringField(frame, 'requestId') : undefined,
      frame ? stringField(frame, 'clientMessageId') : undefined,
      frame ? stringField(frame, 'roomSlug') : undefined,
      frame ? stringField(frame, 'conversationId') : undefined,
    );
    socket.close(1011, 'Session validation unavailable');
  }

  private async cleanup(socket: WebSocket, state: ConnectionState): Promise<void> {
    clearTimeout(state.authTimer);
    this.states.delete(socket);
    if (state.userId) {
      const connections = this.userConnections.get(state.userId);
      connections?.delete(socket);
      if (connections?.size === 0) this.userConnections.delete(state.userId);
    }
    await Promise.allSettled(
      [...state.subscriptions.keys()].map((room) =>
        this.realtime.removePresence(room, state.id),
      ),
    );
  }

  private sendOperationError(socket: WebSocket, error: unknown, frame: ClientFrame): void {
    const exception = this.asChatException(error, 'CHAT_INTERNAL_ERROR', '聊天室操作失败，请稍后再试。');
    this.sendError(
      socket,
      exception,
      stringField(frame, 'requestId'),
      stringField(frame, 'clientMessageId'),
      stringField(frame, 'roomSlug'),
      stringField(frame, 'conversationId'),
    );
    if (!(error instanceof ChatException)) {
      this.logger.error(`Chat operation failed with code ${exception.code}.`);
    }
  }

  private sendError(
    socket: WebSocket,
    exception: ChatException,
    requestId?: string,
    clientMessageId?: string,
    roomSlug?: string,
    conversationId?: string,
  ): void {
    this.send(socket, {
      type: 'chat.error',
      code: exception.code,
      message: exception.publicMessage,
      ...(requestId ? { requestId } : {}),
      ...(clientMessageId ? { clientMessageId } : {}),
      ...(roomSlug ? { roomSlug } : {}),
      ...(conversationId ? { conversationId } : {}),
      ...(exception.retryAfterSeconds === undefined
        ? {}
        : { retryAfterSeconds: exception.retryAfterSeconds }),
    });
  }

  private send(socket: WebSocket, value: unknown): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({ protocolVersion: 1, ...(value as Record<string, unknown>) }),
      );
    }
  }

  private consumeFrameBudget(state: ConnectionState): boolean {
    const now = Date.now();
    if (now - state.frameWindowStartedAt >= FRAME_WINDOW_MS) {
      state.frameWindowStartedAt = now;
      state.frameCount = 0;
    }
    state.frameCount += 1;
    return state.frameCount <= MAX_FRAMES_PER_WINDOW;
  }

  private maxConnectionsPerUser(): number {
    const configured = Number(process.env.CHAT_MAX_CONNECTIONS_PER_USER ?? '3');
    return Number.isSafeInteger(configured) && configured >= 1 && configured <= 10
      ? configured
      : 3;
  }

  private isAllowedOrigin(raw: string | string[] | undefined): boolean {
    const origin = Array.isArray(raw) ? raw[0] : raw;
    if (!origin) return false;
    const configured = configuredSiteOrigin();
    if (configured && origin === configured) return true;
    if (
      process.env.LOCAL_DEV === 'true' &&
      process.env.CHAT_LOCAL_ORIGIN_RELAXED === 'true'
    ) {
      try {
        const url = new URL(origin);
        return (
          (url.protocol === 'http:' || url.protocol === 'https:') &&
          ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
        );
      } catch {
        return false;
      }
    }
    return false;
  }

  private rejectUpgrade(socket: Socket, status: number, reason: string): void {
    if (socket.destroyed) return;
    socket.end(
      `HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
    );
  }

  private asChatException(error: unknown, code: string, message: string): ChatException {
    return error instanceof ChatException ? error : chatException(code, message, 500);
  }
}

function configuredSiteOrigin(): string | null {
  const raw = process.env.PUBLIC_SITE_ORIGIN;
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

function rawDataText(data: RawData): string {
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  return Buffer.from(data).toString('utf8');
}

function requiredString(frame: Record<string, unknown>, key: string): string {
  const value = frame[key];
  if (typeof value !== 'string' || value.length < 1 || value.length > 160) {
    throw chatException('CHAT_FRAME_INVALID', `${key} 无效。`);
  }
  return value;
}

function stringField(frame: Record<string, unknown>, key: string): string | undefined {
  const value = frame[key];
  return typeof value === 'string' && value.length <= 160 ? value : undefined;
}

function requiredRoom(frame: Record<string, unknown>): ChatRoomSlug {
  const value = requiredString(frame, 'roomSlug');
  if (!isChatRoomSlug(value)) throw chatException('CHAT_ROOM_NOT_FOUND', '聊天室不存在。', 404);
  return value;
}

function optionalNonNegativeInteger(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw chatException('CHAT_FRAME_INVALID', '消息游标无效。');
  }
  return Number(value);
}

function requiredNonNegativeInteger(
  frame: Record<string, unknown>,
  key: string,
): number {
  const value = optionalNonNegativeInteger(frame[key]);
  if (value === undefined) {
    throw chatException('CHAT_FRAME_INVALID', `${key} 无效。`);
  }
  return value;
}

function optionalStringArray(value: unknown, max: number): string[] | undefined {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.length > max ||
    value.some((item) => typeof item !== 'string' || item.length > 100)
  ) {
    throw chatException('CHAT_MENTION_NOT_ALLOWED', '一次最多 @ 5 位允许的好友。', 403);
  }
  return value as string[];
}
