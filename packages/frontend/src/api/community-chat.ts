import { CommunityApiError, communityHttp } from './community-http';
import { communityIdempotencyHeaders } from './community-idempotency';

export const COMMUNITY_CHAT_ROOM_SLUGS = [
  'general',
  'developer',
  'product',
  'qa',
  'sales',
  'hr',
] as const;

export type CommunityChatRoomSlug = typeof COMMUNITY_CHAT_ROOM_SLUGS[number];

export const COMMUNITY_CHAT_ROOM_DEFINITIONS: ReadonlyArray<{
  slug: CommunityChatRoomSlug;
  name: string;
  shortDescription: string;
}> = [
  { slug: 'general', name: '综合茶水间', shortDescription: '跨岗位的日常经验、协作复盘与轻量交流。' },
  { slug: 'developer', name: '研发工位', shortDescription: '工程实践、排障思路、交付经验与技术协作。' },
  { slug: 'product', name: '产品会议室', shortDescription: '需求拆解、用户研究、范围控制与产品复盘。' },
  { slug: 'qa', name: '质量保障台', shortDescription: '测试策略、缺陷复现、质量流程与发布保障。' },
  { slug: 'sales', name: '客户会客区', shortDescription: '沟通方法、客户协作、项目推进与销售经验。' },
  { slug: 'hr', name: '组织支持室', shortDescription: '招聘、组织协作、员工体验与人力资源实践。' },
] as const;

export type CommunityChatPresenceBand =
  | 'quiet'
  | 'active'
  | 'busy'
  | 'very_busy'
  | 'unavailable';

export interface CommunityChatMentionCandidate {
  publicId: string;
  displayName: string;
  avatarKey?: string | null;
}

export interface CommunityChatRoom {
  slug: CommunityChatRoomSlug;
  name: string;
  description: string;
  readOnly: boolean;
  closed: boolean;
  slowModeSeconds: number;
  retryAfterSeconds: number | null;
  presenceBand: CommunityChatPresenceBand;
  latestSequence: number;
  mentionCandidates: CommunityChatMentionCandidate[];
}

export interface CommunityChatRoomPage {
  items: CommunityChatRoom[];
  serverTime: string;
}

export interface CommunityChatAuthor {
  publicId: string;
  displayName: string;
  avatarKey?: string | null;
  battleProfession?: string | null;
}

export type CommunityChatMessageVisibility =
  | 'visible'
  | 'blocked_placeholder'
  | 'withdrawn_placeholder'
  | 'moderated_placeholder';

export interface CommunityChatReplyPreview {
  messageId: string;
  authorDisplayName: string;
  bodyPreview: string | null;
  visibility: CommunityChatMessageVisibility;
}

export interface CommunityChatMessagePermissions {
  canWithdraw: boolean;
  withdrawUntil: string | null;
  canReport: boolean;
}

export interface CommunityChatMessage {
  id: string;
  roomSlug: CommunityChatRoomSlug;
  sequence: number;
  version: number;
  clientMessageId?: string | null;
  visibility: CommunityChatMessageVisibility;
  body: string | null;
  author: CommunityChatAuthor;
  replyTo: CommunityChatReplyPreview | null;
  mentionPublicIds: string[];
  createdAt: string;
  updatedAt: string;
  permissions: CommunityChatMessagePermissions;
}

export interface CommunityChatMessagePage {
  items: CommunityChatMessage[];
  latestSequence: number;
  oldestSequence: number | null;
  hasMoreBefore: boolean;
  nextBeforeSequence?: number | null;
  hasMoreAfter?: boolean;
  nextAfterSequence?: number | null;
}

export interface CommunityChatSocketTicket {
  ticket: string;
  expiresAt: string;
  protocolVersion: 1;
}

export type CommunityChatReportReason =
  | 'harassment'
  | 'spam'
  | 'privacy'
  | 'illegal'
  | 'other';

export interface CommunityChatReportResult {
  reportId: string;
  status: 'received';
}

export function isCommunityChatRoomSlug(value: string): value is CommunityChatRoomSlug {
  return COMMUNITY_CHAT_ROOM_SLUGS.includes(value as CommunityChatRoomSlug);
}

export function getCommunityChatRooms(): Promise<CommunityChatRoomPage> {
  return communityHttp.get('/v1/chat/rooms');
}

export function getCommunityChatMessages(
  roomSlug: CommunityChatRoomSlug,
  options: {
    afterSequence?: number;
    beforeSequence?: number;
    limit?: number;
  } = {},
): Promise<CommunityChatMessagePage> {
  if (options.afterSequence != null && options.beforeSequence != null) {
    throw new Error('聊天室历史请求不能同时指定 afterSequence 和 beforeSequence');
  }
  return communityHttp.get(
    `/v1/chat/rooms/${encodeURIComponent(roomSlug)}/messages`,
    {
      query: {
        afterSequence: options.afterSequence,
        beforeSequence: options.beforeSequence,
        limit: options.limit ?? 50,
      },
    },
  );
}

/** Ticket 是 60 秒单次凭证。401 不自动刷新或重放，避免消费两张并发票据。 */
export function createCommunityChatSocketTicket(): Promise<CommunityChatSocketTicket> {
  return communityHttp.post(
    '/v1/chat/socket-tickets',
    undefined,
    { retryAfterRefresh: false },
  );
}

export function reportCommunityChatMessage(
  messageId: string,
  payload: { reason: CommunityChatReportReason; detail?: string },
  idempotencyKey: string,
): Promise<CommunityChatReportResult> {
  return communityHttp.post(
    `/v1/chat/messages/${encodeURIComponent(messageId)}/report`,
    payload,
    {
      headers: communityIdempotencyHeaders(idempotencyKey),
      retryAfterRefresh: false,
    },
  );
}

function stableCode(error: CommunityApiError): string | undefined {
  if (!error.body || typeof error.body !== 'object' || !('code' in error.body)) return undefined;
  const code = (error.body as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

export function communityChatErrorMessage(error: unknown): string {
  if (!(error instanceof CommunityApiError)) {
    return error instanceof Error && error.message ? error.message : '聊天室请求失败，请稍后重试';
  }
  switch (stableCode(error)) {
    case 'CHAT_ROOM_READ_ONLY':
      return '房间当前只读，消息没有发送';
    case 'CHAT_ROOM_CLOSED':
      return '房间当前关闭，消息没有发送';
    case 'CHAT_SLOW_MODE':
      return '发言间隔尚未结束，请按页面倒计时后重试';
    case 'CHAT_MESSAGE_TOO_LONG':
      return '消息需为 1–500 个字符';
    case 'CHAT_MENTION_NOT_ALLOWED':
      return '@ 对象不在服务端允许名单中';
    case 'CHAT_WITHDRAW_WINDOW_EXPIRED':
      return '消息已超过 2 分钟撤回期限';
    case 'CHAT_ACCOUNT_RESTRICTED':
      return '当前账号不能使用聊天室';
    default:
      if (error.status === 0) return '网络连接失败，请稍后重试';
      if (error.status === 401) return '登录状态已失效，请重新登录后进入聊天室';
      if (error.status === 403) return '当前账号没有聊天室权限';
      if (error.status === 404) return '没有找到该房间或消息';
      if (error.status === 409) return '消息状态已经变化，请刷新后重试';
      if (error.status === 429) return '操作过于频繁，请按页面提示稍后再试';
      return error.message || '聊天室请求失败，请稍后重试';
  }
}

export const communityChatApi = {
  listRooms: getCommunityChatRooms,
  listMessages: getCommunityChatMessages,
  createSocketTicket: createCommunityChatSocketTicket,
  reportMessage: reportCommunityChatMessage,
};
