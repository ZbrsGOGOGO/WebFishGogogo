import {
  API_BASE_URL,
} from '../../api/config';
import {
  CommunityApiError,
  communityChatApi,
  createCommunityIdempotencyKey,
  type CommunityChatRoomSlug,
  type CommunityChatSocketTicket,
} from '../../api/community';
import {
  COMMUNITY_CHAT_PROTOCOL_VERSION,
  parseCommunityChatServerEvent,
  type ChatSendCommand,
  type ChatDirectReadCommand,
  type ChatDirectSendCommand,
  type CommunityChatClientCommand,
  type CommunityChatServerEvent,
} from './chat-protocol';

export type CommunityChatConnectionStatus =
  | 'idle'
  | 'ticketing'
  | 'connecting'
  | 'authenticating'
  | 'ready'
  | 'reconnecting'
  | 'failed'
  | 'closed';

export interface CommunityChatConnectionSnapshot {
  status: CommunityChatConnectionStatus;
  reconnectAttempt: number;
  lastError: string | null;
}

export type CommunityChatConnectionEvent =
  | { kind: 'state'; snapshot: CommunityChatConnectionSnapshot }
  | { kind: 'protocol'; event: CommunityChatServerEvent };

export type CommunityChatConnectionListener = (
  event: CommunityChatConnectionEvent,
) => void;

interface ChatWebSocketLike {
  readyState: number;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface CommunityChatConnectionOptions {
  ticketProvider?: () => Promise<CommunityChatSocketTicket>;
  socketFactory?: (url: string) => ChatWebSocketLike;
  websocketUrl?: () => string;
  random?: () => number;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancelSchedule?: (timer: ReturnType<typeof setTimeout>) => void;
}

const SOCKET_OPEN = 1;

export function resolveCommunityChatWebSocketUrl(
  apiBaseUrl = API_BASE_URL,
  browserOrigin = globalThis.location?.origin ?? 'http://localhost',
): string {
  const apiUrl = new URL(apiBaseUrl, browserOrigin);
  apiUrl.protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  apiUrl.pathname = '/ws/chat';
  apiUrl.search = '';
  apiUrl.hash = '';
  return apiUrl.toString();
}

export function communityChatReconnectDelay(
  attempt: number,
  random = Math.random,
): number {
  const base = Math.min(30_000, 1_000 * 2 ** Math.max(0, attempt));
  const jitter = 0.8 + Math.min(1, Math.max(0, random())) * 0.4;
  return Math.round(base * jitter);
}

function connectionFailureMessage(error: unknown): string {
  if (error instanceof CommunityApiError) {
    if (error.status === 401) return '登录状态已失效，无法获取聊天室连接票据';
    if (error.status === 403) return '当前账号没有聊天室连接权限';
    if (error.status === 0) return '网络连接失败，稍后自动重连';
  }
  return error instanceof Error && error.message
    ? error.message
    : '聊天室连接失败，稍后自动重连';
}

export class CommunityChatConnection {
  private readonly ticketProvider: () => Promise<CommunityChatSocketTicket>;
  private readonly socketFactory: (url: string) => ChatWebSocketLike;
  private readonly websocketUrl: () => string;
  private readonly random: () => number;
  private readonly schedule: CommunityChatConnectionOptions['schedule'];
  private readonly cancelSchedule: NonNullable<CommunityChatConnectionOptions['cancelSchedule']>;
  private readonly listeners = new Set<CommunityChatConnectionListener>();
  private readonly desiredRooms = new Map<CommunityChatRoomSlug, number>();
  private socket: ChatWebSocketLike | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private snapshot: CommunityChatConnectionSnapshot = {
    status: 'idle',
    reconnectAttempt: 0,
    lastError: null,
  };
  private generation = 0;
  private manuallyClosed = false;
  private authenticated = false;

  constructor(options: CommunityChatConnectionOptions = {}) {
    this.ticketProvider = options.ticketProvider ?? communityChatApi.createSocketTicket;
    this.socketFactory = options.socketFactory ?? ((url) => new WebSocket(url));
    this.websocketUrl = options.websocketUrl ?? (() => resolveCommunityChatWebSocketUrl());
    this.random = options.random ?? Math.random;
    this.schedule = options.schedule ?? ((callback, delay) => globalThis.setTimeout(callback, delay));
    this.cancelSchedule = options.cancelSchedule ?? ((timer) => globalThis.clearTimeout(timer));
  }

  getSnapshot(): CommunityChatConnectionSnapshot {
    return { ...this.snapshot };
  }

  addListener(listener: CommunityChatConnectionListener): () => void {
    this.listeners.add(listener);
    listener({ kind: 'state', snapshot: this.getSnapshot() });
    return () => this.listeners.delete(listener);
  }

  connect(): void {
    if (['ticketing', 'connecting', 'authenticating', 'ready'].includes(this.snapshot.status)) return;
    this.manuallyClosed = false;
    if (this.reconnectTimer) {
      this.cancelSchedule(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    void this.openFreshSocket();
  }

  reconnectNow(): void {
    this.generation += 1;
    this.socket?.close(1000, 'manual reconnect');
    this.socket = null;
    this.authenticated = false;
    this.snapshot.reconnectAttempt = 0;
    this.manuallyClosed = false;
    this.setState('idle', null);
    this.connect();
  }

  disconnect(): void {
    this.manuallyClosed = true;
    this.generation += 1;
    if (this.reconnectTimer) {
      this.cancelSchedule(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const socket = this.socket;
    this.socket = null;
    this.authenticated = false;
    if (socket) socket.close(1000, 'page released');
    this.setState('closed', null);
  }

  subscribeRoom(roomSlug: CommunityChatRoomSlug, afterSequence: number): void {
    this.desiredRooms.set(roomSlug, Math.max(0, afterSequence));
    if (this.authenticated) this.sendSubscribe(roomSlug);
  }

  updateRoomCursor(roomSlug: CommunityChatRoomSlug, afterSequence: number): void {
    if (!this.desiredRooms.has(roomSlug)) return;
    this.desiredRooms.set(roomSlug, Math.max(0, afterSequence));
  }

  unsubscribeRoom(roomSlug: CommunityChatRoomSlug): void {
    this.desiredRooms.delete(roomSlug);
    if (!this.authenticated || !this.isSocketOpen()) return;
    this.sendFrame({
      type: 'chat.unsubscribe',
      protocolVersion: COMMUNITY_CHAT_PROTOCOL_VERSION,
      requestId: createCommunityIdempotencyKey('chat-unsubscribe'),
      roomSlug,
    });
  }

  sendMessage(command: Omit<ChatSendCommand, 'type' | 'protocolVersion'>): void {
    if (this.snapshot.status !== 'ready' || !this.isSocketOpen()) {
      throw new Error('聊天室尚未连接，消息没有发送');
    }
    const characterCount = [...command.body].length;
    if (characterCount < 1 || characterCount > 500) {
      throw new Error('消息需为 1–500 个字符');
    }
    if ((command.mentionPublicIds?.length ?? 0) > 5) {
      throw new Error('每条消息最多 @ 5 人');
    }
    this.sendFrame({
      type: 'chat.send',
      protocolVersion: COMMUNITY_CHAT_PROTOCOL_VERSION,
      ...command,
    });
  }

  sendDirectMessage(
    command: Omit<ChatDirectSendCommand, 'type' | 'protocolVersion'>,
  ): void {
    if (this.snapshot.status !== 'ready' || !this.isSocketOpen()) {
      throw new Error('私聊尚未连接，消息没有发送');
    }
    const characterCount = [...command.body].length;
    if (characterCount < 1 || characterCount > 500) {
      throw new Error('消息需为 1–500 个字符');
    }
    this.sendFrame({
      type: 'chat.direct.send',
      protocolVersion: COMMUNITY_CHAT_PROTOCOL_VERSION,
      ...command,
    });
  }

  withdrawDirectMessage(
    conversationId: string,
    messageId: string,
    requestId: string,
  ): void {
    if (this.snapshot.status !== 'ready' || !this.isSocketOpen()) {
      throw new Error('私聊尚未连接，撤回请求没有发送');
    }
    this.sendFrame({
      type: 'chat.direct.withdraw',
      protocolVersion: COMMUNITY_CHAT_PROTOCOL_VERSION,
      requestId,
      conversationId,
      messageId,
    });
  }

  markDirectRead(
    command: Omit<ChatDirectReadCommand, 'type' | 'protocolVersion'>,
  ): void {
    if (this.snapshot.status !== 'ready' || !this.isSocketOpen()) {
      throw new Error('私聊尚未连接，已读状态没有同步');
    }
    this.sendFrame({
      type: 'chat.direct.read',
      protocolVersion: COMMUNITY_CHAT_PROTOCOL_VERSION,
      ...command,
    });
  }

  withdrawMessage(roomSlug: CommunityChatRoomSlug, messageId: string, requestId: string): void {
    if (this.snapshot.status !== 'ready' || !this.isSocketOpen()) {
      throw new Error('聊天室尚未连接，撤回请求没有发送');
    }
    this.sendFrame({
      type: 'chat.withdraw',
      protocolVersion: COMMUNITY_CHAT_PROTOCOL_VERSION,
      requestId,
      roomSlug,
      messageId,
    });
  }

  private async openFreshSocket(): Promise<void> {
    const currentGeneration = ++this.generation;
    this.setState(
      this.snapshot.reconnectAttempt > 0 ? 'reconnecting' : 'ticketing',
      null,
    );
    let ticket: CommunityChatSocketTicket;
    try {
      ticket = await this.ticketProvider();
    } catch (error) {
      if (currentGeneration !== this.generation || this.manuallyClosed) return;
      if (error instanceof CommunityApiError && (error.status === 401 || error.status === 403)) {
        this.setState('failed', connectionFailureMessage(error));
        return;
      }
      this.scheduleReconnect(connectionFailureMessage(error));
      return;
    }
    if (currentGeneration !== this.generation || this.manuallyClosed) return;
    if (!ticket.ticket || ticket.protocolVersion !== COMMUNITY_CHAT_PROTOCOL_VERSION) {
      this.setState('failed', '服务端返回的聊天室票据或协议版本无效');
      return;
    }

    this.setState('connecting', null);
    let socket: ChatWebSocketLike;
    try {
      socket = this.socketFactory(this.websocketUrl());
    } catch (error) {
      this.scheduleReconnect(connectionFailureMessage(error));
      return;
    }
    this.socket = socket;
    this.authenticated = false;
    socket.onopen = () => {
      if (currentGeneration !== this.generation || socket !== this.socket) return;
      this.setState('authenticating', null);
      this.sendFrame({
        type: 'chat.authenticate',
        protocolVersion: COMMUNITY_CHAT_PROTOCOL_VERSION,
        requestId: createCommunityIdempotencyKey('chat-auth'),
        ticket: ticket.ticket,
      });
    };
    socket.onmessage = (event) => {
      if (currentGeneration !== this.generation || socket !== this.socket) return;
      const parsed = parseCommunityChatServerEvent(event.data);
      if (!parsed) return;
      this.handleServerEvent(parsed);
    };
    socket.onerror = () => {
      if (currentGeneration === this.generation && socket === this.socket) {
        this.setState(this.snapshot.status, '实时连接发生网络错误');
      }
    };
    socket.onclose = (event) => {
      if (currentGeneration !== this.generation || socket !== this.socket) return;
      this.socket = null;
      this.authenticated = false;
      if (this.manuallyClosed) return;
      if (event.code === 4401 || event.code === 4403) {
        this.setState('failed', event.code === 4401 ? '聊天室认证已失效，请重新登录' : '当前账号没有聊天室权限');
        return;
      }
      this.scheduleReconnect('实时连接已断开，正在重新获取票据并补齐消息');
    };
  }

  private handleServerEvent(event: CommunityChatServerEvent): void {
    if (event.type === 'chat.authenticated') {
      this.authenticated = true;
      for (const roomSlug of this.desiredRooms.keys()) this.sendSubscribe(roomSlug);
      if (this.desiredRooms.size === 0) {
        this.snapshot.reconnectAttempt = 0;
        this.setState('ready', null);
      }
    }
    if (event.type === 'chat.ready') {
      if (!this.authenticated) return;
      this.snapshot.reconnectAttempt = 0;
      this.setState('ready', null);
    }
    if (event.type === 'chat.message.created' || event.type === 'chat.message.updated') {
      const current = this.desiredRooms.get(event.message.roomSlug);
      if (current != null && event.message.sequence > current) {
        this.desiredRooms.set(event.message.roomSlug, event.message.sequence);
      }
    }
    this.emit({ kind: 'protocol', event });
  }

  private sendSubscribe(roomSlug: CommunityChatRoomSlug): void {
    if (!this.isSocketOpen()) return;
    this.sendFrame({
      type: 'chat.subscribe',
      protocolVersion: COMMUNITY_CHAT_PROTOCOL_VERSION,
      requestId: createCommunityIdempotencyKey('chat-subscribe'),
      roomSlug,
      afterSequence: this.desiredRooms.get(roomSlug) ?? 0,
    });
  }

  private sendFrame(frame: CommunityChatClientCommand): void {
    if (!this.isSocketOpen()) throw new Error('聊天室实时连接不可用');
    this.socket!.send(JSON.stringify(frame));
  }

  private isSocketOpen(): boolean {
    return this.socket?.readyState === SOCKET_OPEN;
  }

  private scheduleReconnect(message: string): void {
    if (this.manuallyClosed || this.reconnectTimer) return;
    const attempt = this.snapshot.reconnectAttempt;
    const delay = communityChatReconnectDelay(attempt, this.random);
    this.snapshot.reconnectAttempt = attempt + 1;
    this.setState('reconnecting', message);
    this.reconnectTimer = this.schedule!(() => {
      this.reconnectTimer = null;
      void this.openFreshSocket();
    }, delay);
  }

  private setState(status: CommunityChatConnectionStatus, lastError: string | null): void {
    this.snapshot = { ...this.snapshot, status, lastError };
    this.emit({ kind: 'state', snapshot: this.getSnapshot() });
  }

  private emit(event: CommunityChatConnectionEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

let sharedConnection: CommunityChatConnection | null = null;
let sharedReferences = 0;

/** 当前浏览器标签页内所有房间页面共享这一实例，因此最多建立一条全站连接。 */
export function acquireCommunityChatConnection(): CommunityChatConnection {
  if (!sharedConnection) sharedConnection = new CommunityChatConnection();
  sharedReferences += 1;
  return sharedConnection;
}

export function releaseCommunityChatConnection(connection: CommunityChatConnection): void {
  if (connection !== sharedConnection) return;
  sharedReferences = Math.max(0, sharedReferences - 1);
  if (sharedReferences === 0) {
    sharedConnection.disconnect();
    sharedConnection = null;
  }
}

export function resetCommunityChatConnectionForTests(): void {
  sharedConnection?.disconnect();
  sharedConnection = null;
  sharedReferences = 0;
}
