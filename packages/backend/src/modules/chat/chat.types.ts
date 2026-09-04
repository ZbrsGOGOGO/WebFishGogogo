import type {
  ChatMessageStatus,
  ChatRoomSlug,
} from '../../database/entities/chat.entity';

export const CHAT_ROOM_SLUGS: readonly ChatRoomSlug[] = [
  'general',
  'developer',
  'product',
  'qa',
  'sales',
  'hr',
] as const;

export type ChatPresenceBand =
  | 'quiet'
  | 'active'
  | 'busy'
  | 'very_busy'
  | 'unavailable';

export interface ChatMentionCandidateView {
  publicId: string;
  displayName: string;
  avatarKey?: string;
}

export interface ChatRoomView {
  slug: ChatRoomSlug;
  name: string;
  description: string;
  readOnly: boolean;
  closed: boolean;
  slowModeSeconds: number;
  retryAfterSeconds: number | null;
  presenceBand: ChatPresenceBand;
  latestSequence: number;
  mentionCandidates: ChatMentionCandidateView[];
}

export type ChatMessageVisibility =
  | 'visible'
  | 'blocked_placeholder'
  | 'withdrawn_placeholder'
  | 'moderated_placeholder';

export interface ChatMessageView {
  id: string;
  roomSlug: ChatRoomSlug;
  sequence: number;
  version: number;
  clientMessageId?: string;
  visibility: ChatMessageVisibility;
  body: string | null;
  author: {
    publicId: string;
    displayName: string;
    avatarKey?: string;
    battleProfession?: string;
  };
  replyTo: {
    messageId: string;
    authorDisplayName: string;
    bodyPreview: string | null;
    visibility: ChatMessageVisibility;
  } | null;
  mentionPublicIds: string[];
  createdAt: string;
  updatedAt: string;
  permissions: {
    canWithdraw: boolean;
    withdrawUntil: string | null;
    canReport: boolean;
  };
}

export interface ChatHistoryPage {
  items: ChatMessageView[];
  latestSequence: number;
  oldestSequence: number | null;
  hasMoreBefore: boolean;
  nextBeforeSequence?: number;
  hasMoreAfter: boolean;
  nextAfterSequence?: number;
}

export interface ChatRoomRealtimeEvent {
  kind: 'created' | 'updated';
  roomSlug: ChatRoomSlug;
  messageId: string;
}

/**
 * 私聊实时事件只在 Redis 与后端实例之间流转。participantIds 是
 * 内部用户 ID，gateway 必须用它定向已认证连接，不得原样发往浏览器。
 */
export interface ChatDirectMessageRealtimeEvent {
  scope: 'direct';
  kind: 'created' | 'updated';
  conversationId: string;
  messageId: string;
  participantIds: string[];
}

export interface ChatDirectReadRealtimeEvent {
  scope: 'direct';
  kind: 'read';
  conversationId: string;
  readerUserId: string;
  lastReadSequence: number;
  participantIds: string[];
}

export type ChatRealtimeEvent =
  | ChatRoomRealtimeEvent
  | ChatDirectMessageRealtimeEvent
  | ChatDirectReadRealtimeEvent;

export function isDirectChatRealtimeEvent(
  event: ChatRealtimeEvent,
): event is ChatDirectMessageRealtimeEvent | ChatDirectReadRealtimeEvent {
  return 'scope' in event && event.scope === 'direct';
}

export interface ChatPrincipal {
  userId: string;
  sessionId: string;
}

export interface ChatModerationResult {
  decision: 'allow' | 'reject' | 'review';
  provider: string;
  reference: string | null;
}

export function statusVisibility(status: ChatMessageStatus): ChatMessageVisibility {
  if (status === 'withdrawn') return 'withdrawn_placeholder';
  if (status === 'moderated') return 'moderated_placeholder';
  return 'visible';
}

export function isChatRoomSlug(value: string): value is ChatRoomSlug {
  return (CHAT_ROOM_SLUGS as readonly string[]).includes(value);
}
