import type {
  CommunityChatMentionCandidate,
  CommunityChatMessage,
  CommunityChatPresenceBand,
  CommunityChatRoomSlug,
} from '../../api/community';

export const COMMUNITY_CHAT_PROTOCOL_VERSION = 1 as const;

export interface ChatAuthenticateCommand {
  type: 'chat.authenticate';
  protocolVersion: 1;
  requestId: string;
  ticket: string;
}

export interface ChatSubscribeCommand {
  type: 'chat.subscribe';
  protocolVersion: 1;
  requestId: string;
  roomSlug: CommunityChatRoomSlug;
  afterSequence: number;
}

export interface ChatUnsubscribeCommand {
  type: 'chat.unsubscribe';
  protocolVersion: 1;
  requestId: string;
  roomSlug: CommunityChatRoomSlug;
}

export interface ChatSendCommand {
  type: 'chat.send';
  protocolVersion: 1;
  requestId: string;
  clientMessageId: string;
  roomSlug: CommunityChatRoomSlug;
  body: string;
  replyToMessageId?: string;
  mentionPublicIds?: string[];
}

export interface ChatWithdrawCommand {
  type: 'chat.withdraw';
  protocolVersion: 1;
  requestId: string;
  roomSlug: CommunityChatRoomSlug;
  messageId: string;
}

export type CommunityChatClientCommand =
  | ChatAuthenticateCommand
  | ChatSubscribeCommand
  | ChatUnsubscribeCommand
  | ChatSendCommand
  | ChatWithdrawCommand;

export interface ChatAuthenticatedEvent {
  type: 'chat.authenticated';
  protocolVersion: 1;
  sessionId: string;
  serverTime: string;
}

export interface ChatReadyRoomState {
  roomSlug: CommunityChatRoomSlug;
  latestSequence: number;
  /** 服务端发现恢复游标不连续时，明确要求从该序号之后走 REST 补齐。 */
  gapAfterSequence?: number;
  presenceBand?: CommunityChatPresenceBand;
  mentionCandidates?: CommunityChatMentionCandidate[];
}

export interface ChatReadyEvent {
  type: 'chat.ready';
  protocolVersion: 1;
  rooms: ChatReadyRoomState[];
}

export interface ChatAckEvent {
  type: 'chat.ack';
  protocolVersion: 1;
  action: 'subscribe' | 'unsubscribe' | 'send' | 'withdraw';
  requestId: string;
  roomSlug?: CommunityChatRoomSlug;
  clientMessageId?: string;
  messageId?: string;
  sequence?: number;
  serverTime: string;
}

export interface ChatMessageCreatedEvent {
  type: 'chat.message.created';
  protocolVersion: 1;
  message: CommunityChatMessage;
}

export interface ChatMessageUpdatedEvent {
  type: 'chat.message.updated';
  protocolVersion: 1;
  message: CommunityChatMessage;
}

export interface ChatPresenceEvent {
  type: 'chat.presence';
  protocolVersion: 1;
  roomSlug: CommunityChatRoomSlug;
  presenceBand: CommunityChatPresenceBand;
}

export interface ChatErrorEvent {
  type: 'chat.error';
  protocolVersion: 1;
  code: string;
  message: string;
  requestId?: string;
  clientMessageId?: string;
  roomSlug?: CommunityChatRoomSlug;
  retryAfterSeconds?: number;
}

export type CommunityChatServerEvent =
  | ChatAuthenticatedEvent
  | ChatReadyEvent
  | ChatAckEvent
  | ChatMessageCreatedEvent
  | ChatMessageUpdatedEvent
  | ChatPresenceEvent
  | ChatErrorEvent;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasProtocolVersion(value: Record<string, unknown>): boolean {
  return value.protocolVersion === COMMUNITY_CHAT_PROTOCOL_VERSION;
}

function isRoomSlug(value: unknown): value is CommunityChatRoomSlug {
  return value === 'general' || value === 'developer' || value === 'product' ||
    value === 'qa' || value === 'sales' || value === 'hr';
}

function isPresenceBand(value: unknown): value is CommunityChatPresenceBand {
  return value === 'quiet' || value === 'active' || value === 'busy' ||
    value === 'very_busy' || value === 'unavailable';
}

function isMessage(value: unknown): value is CommunityChatMessage {
  if (!isRecord(value) || !isRecord(value.author) || !isRecord(value.permissions)) return false;
  return typeof value.id === 'string' &&
    isRoomSlug(value.roomSlug) &&
    typeof value.sequence === 'number' &&
    typeof value.version === 'number' &&
    typeof value.author.publicId === 'string' &&
    typeof value.author.displayName === 'string' &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string';
}

/** 无法确认结构或协议版本的帧会被忽略，不能让未知服务端数据进入 UI。 */
export function parseCommunityChatServerEvent(raw: unknown): CommunityChatServerEvent | null {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!isRecord(value) || typeof value.type !== 'string' || !hasProtocolVersion(value)) return null;

  if (value.type === 'chat.authenticated') {
    return typeof value.sessionId === 'string' && typeof value.serverTime === 'string'
      ? value as unknown as ChatAuthenticatedEvent
      : null;
  }
  if (value.type === 'chat.ready') {
    if (!Array.isArray(value.rooms) || !value.rooms.every((room) =>
      isRecord(room) && isRoomSlug(room.roomSlug) && typeof room.latestSequence === 'number' &&
      (room.presenceBand == null || isPresenceBand(room.presenceBand)))) return null;
    return value as unknown as ChatReadyEvent;
  }
  if (value.type === 'chat.ack') {
    return typeof value.requestId === 'string' &&
      (value.action === 'subscribe' || value.action === 'unsubscribe' || value.action === 'send' || value.action === 'withdraw') &&
      typeof value.serverTime === 'string'
      ? value as unknown as ChatAckEvent
      : null;
  }
  if (value.type === 'chat.message.created' || value.type === 'chat.message.updated') {
    return isMessage(value.message) ? value as unknown as ChatMessageCreatedEvent | ChatMessageUpdatedEvent : null;
  }
  if (value.type === 'chat.presence') {
    return isRoomSlug(value.roomSlug) && isPresenceBand(value.presenceBand)
      ? value as unknown as ChatPresenceEvent
      : null;
  }
  if (value.type === 'chat.error') {
    return typeof value.code === 'string' && typeof value.message === 'string'
      ? value as unknown as ChatErrorEvent
      : null;
  }
  return null;
}
