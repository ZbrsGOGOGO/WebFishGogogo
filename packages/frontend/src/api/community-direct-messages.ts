import { communityHttp } from './community-http';
import { communityIdempotencyHeaders } from './community-idempotency';
import type {
  CommunityChatAuthor,
  CommunityChatMessagePermissions,
  CommunityChatMessageVisibility,
  CommunityChatReplyPreview,
  CommunityChatReportReason,
  CommunityChatReportResult,
} from './community-chat';

export interface CommunityDirectConversationFriend {
  publicId: string;
  username?: string | null;
  displayName: string;
  avatarKey?: string | null;
  battleProfession?: string | null;
}

export interface CommunityDirectConversation {
  id: string;
  friend: CommunityDirectConversationFriend;
  latestSequence: number;
  lastMessage: CommunityDirectMessage | null;
  unreadCount: number;
  canSend: boolean;
  updatedAt: string;
}

export interface CommunityDirectConversationPage {
  items: CommunityDirectConversation[];
  totalUnread: number;
  nextCursor?: string | null;
}

export interface CommunityDirectMessage {
  id: string;
  conversationId: string;
  sequence: number;
  version: number;
  clientMessageId?: string | null;
  visibility: CommunityChatMessageVisibility;
  body: string | null;
  author: CommunityChatAuthor;
  replyTo: CommunityChatReplyPreview | null;
  createdAt: string;
  updatedAt: string;
  permissions: CommunityChatMessagePermissions;
}

export interface CommunityDirectMessagePage {
  items: CommunityDirectMessage[];
  latestSequence: number;
  oldestSequence: number | null;
  hasMoreBefore: boolean;
  nextBeforeSequence?: number | null;
  hasMoreAfter?: boolean;
  nextAfterSequence?: number | null;
}

export interface CommunityDirectReadState {
  conversationId: string;
  lastReadSequence: number;
  unreadCount: number;
}

export function getCommunityDirectConversations(
  cursor?: string,
): Promise<CommunityDirectConversationPage> {
  return communityHttp.get('/v1/chat/direct-conversations', { query: { cursor } });
}

export function openCommunityDirectConversation(
  friendPublicId: string,
): Promise<CommunityDirectConversation> {
  return communityHttp.post('/v1/chat/direct-conversations', { friendPublicId });
}

export function getCommunityDirectMessages(
  conversationId: string,
  options: { afterSequence?: number; beforeSequence?: number; limit?: number } = {},
): Promise<CommunityDirectMessagePage> {
  if (options.afterSequence != null && options.beforeSequence != null) {
    throw new Error('私聊历史请求不能同时指定 afterSequence 和 beforeSequence');
  }
  return communityHttp.get(
    `/v1/chat/direct-conversations/${encodeURIComponent(conversationId)}/messages`,
    { query: {
      afterSequence: options.afterSequence,
      beforeSequence: options.beforeSequence,
      limit: options.limit ?? 50,
    } },
  );
}

export function markCommunityDirectConversationRead(
  conversationId: string,
  throughSequence: number,
  idempotencyKey: string,
): Promise<CommunityDirectReadState> {
  return communityHttp.post(
    `/v1/chat/direct-conversations/${encodeURIComponent(conversationId)}/read`,
    { throughSequence },
    { headers: communityIdempotencyHeaders(idempotencyKey), retryAfterRefresh: false },
  );
}

export function reportCommunityDirectMessage(
  messageId: string,
  payload: { reason: CommunityChatReportReason; detail?: string },
  idempotencyKey: string,
): Promise<CommunityChatReportResult> {
  return communityHttp.post(
    `/v1/chat/direct-messages/${encodeURIComponent(messageId)}/report`,
    payload,
    { headers: communityIdempotencyHeaders(idempotencyKey), retryAfterRefresh: false },
  );
}

export const communityDirectMessagesApi = {
  listConversations: getCommunityDirectConversations,
  openConversation: openCommunityDirectConversation,
  listMessages: getCommunityDirectMessages,
  markRead: markCommunityDirectConversationRead,
  reportMessage: reportCommunityDirectMessage,
};
