import { communityHttp } from './community-http';
import { communityIdempotencyHeaders } from './community-idempotency';

export type CommunityPublicationStatus = 'draft' | 'pending_review' | 'published';
export type CommunityModerationStatus = 'normal' | 'limited' | 'hidden';
export type CommunityPostType = 'experience' | 'question' | 'retrospective';
export type CommunityPostSort = 'latest' | 'popular' | 'unresolved';
export type CommunityReviewDecision = 'approved' | 'rejected' | 'withdrawn';

export const COMMUNITY_CONTENT_CHANNELS = [
  'general',
  'developer',
  'product-manager',
  'qa',
  'sales',
  'human-resources',
  'questions',
  'retrospectives',
  'tools',
] as const;

export type CommunityContentChannel = typeof COMMUNITY_CONTENT_CHANNELS[number];

export interface CommunityContentAuthor {
  publicId: string;
  displayName: string;
  avatarKey: string;
  battleProfession?: string | null;
  ipRegion?: string | null;
}

/** 四组正交状态必须由服务端分别返回，前端不得压缩成单一 status。 */
export interface CommunityContentState {
  publicationStatus: CommunityPublicationStatus;
  moderationStatus: CommunityModerationStatus;
  deletedAt: string | null;
  version: number;
  lastReviewDecision?: CommunityReviewDecision | null;
  lastReviewReason?: string | null;
  moderationReason?: string | null;
}

export interface CommunityPostSummary extends CommunityContentState {
  id: string;
  type: CommunityPostType;
  channel: CommunityContentChannel;
  title: string;
  excerpt: string;
  tags: string[];
  author: CommunityContentAuthor;
  createdAt: string;
  updatedAt: string;
  commentCount: number;
  usefulCount: number;
  usefulByMe: boolean;
  bookmarked: boolean;
  followed: boolean;
  acceptedCommentId: string | null;
}

export interface CommunityPostPermissions {
  canComment: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canRestore: boolean;
  canSubmitReview: boolean;
  canWithdrawReview: boolean;
  canAcceptAnswer: boolean;
  canReport: boolean;
}

export interface CommunityPostDetail extends CommunityPostSummary {
  body: string;
  bodyFormat: 'plain_text' | 'restricted_markdown';
  restoreUntil?: string | null;
  writeEnabled: boolean;
  permissions: CommunityPostPermissions;
}

export interface CommunityComment extends CommunityContentState {
  id: string;
  postId: string;
  parentCommentId: string | null;
  depth: 0 | 1;
  body: string;
  author: CommunityContentAuthor;
  createdAt: string;
  updatedAt: string;
  usefulCount: number;
  permissions: {
    canReply: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canRestore: boolean;
    canSubmitReview: boolean;
    canWithdrawReview: boolean;
    canReport: boolean;
  };
}

export interface CommunityPostPage {
  items: CommunityPostSummary[];
  nextCursor?: string | null;
  total?: number;
  availableTags: string[];
  writeEnabled: boolean;
}

export interface CommunityCommentPage {
  items: CommunityComment[];
  nextCursor?: string | null;
}

export interface CommunityPostFilters {
  channel?: CommunityContentChannel | 'all';
  type?: CommunityPostType | 'all';
  tag?: string;
  q?: string;
  sort?: CommunityPostSort;
  cursor?: string;
}

export interface SaveCommunityPostPayload {
  type: CommunityPostType;
  channel: CommunityContentChannel;
  title: string;
  body: string;
  tags: string[];
  bodyFormat: 'plain_text' | 'restricted_markdown';
}

export interface CommunityPostRevision {
  id: string;
  version: number;
  title: string;
  body: string;
  publicationStatus: CommunityPublicationStatus;
  moderationStatus: CommunityModerationStatus;
  createdAt: string;
  effectiveAt?: string | null;
  reviewReason?: string | null;
}

export interface CommunityCommentRevision {
  id: string;
  version: number;
  body: string;
  publicationStatus: CommunityPublicationStatus;
  moderationStatus: CommunityModerationStatus;
  createdAt: string;
  effectiveAt?: string | null;
  reviewReason?: string | null;
}

export type CommunityReportReason =
  | 'illegal'
  | 'harassment'
  | 'spam'
  | 'misinformation'
  | 'privacy'
  | 'other';

export interface CommunityReportResult {
  reportId: string;
  receivedAt: string;
}

function expectedVersionOptions(version: number, idempotencyKey?: string) {
  return {
    headers: {
      'If-Match': `\"${version}\"`,
      ...(idempotencyKey ? communityIdempotencyHeaders(idempotencyKey) : {}),
    },
    retryAfterRefresh: false,
  } as const;
}

export function getCommunityPosts(filters: CommunityPostFilters = {}): Promise<CommunityPostPage> {
  const q = filters.q?.trim();
  return communityHttp.get(q ? '/v1/community/search' : '/v1/community/posts', {
    query: {
      channel: filters.channel === 'all' ? undefined : filters.channel,
      type: filters.type === 'all' ? undefined : filters.type,
      tag: filters.tag,
      q,
      sort: filters.sort ?? 'latest',
      cursor: filters.cursor,
    },
  });
}

export function getCommunityPost(id: string): Promise<CommunityPostDetail> {
  return communityHttp.get(`/v1/community/posts/${encodeURIComponent(id)}`);
}

export function createCommunityPost(
  payload: SaveCommunityPostPayload,
  idempotencyKey: string,
): Promise<CommunityPostDetail> {
  return communityHttp.post('/v1/community/posts', payload, {
    headers: communityIdempotencyHeaders(idempotencyKey),
    retryAfterRefresh: false,
  });
}

export function updateCommunityPost(
  id: string,
  payload: SaveCommunityPostPayload,
  expectedVersion: number,
  idempotencyKey: string,
): Promise<CommunityPostDetail> {
  return communityHttp.patch(
    `/v1/community/posts/${encodeURIComponent(id)}`,
    { ...payload, expectedVersion },
    expectedVersionOptions(expectedVersion, idempotencyKey),
  );
}

export function deleteCommunityPost(id: string, expectedVersion: number): Promise<CommunityPostDetail> {
  return communityHttp.delete(
    `/v1/community/posts/${encodeURIComponent(id)}`,
    expectedVersionOptions(expectedVersion),
  );
}

export function restoreCommunityPost(id: string, expectedVersion: number): Promise<CommunityPostDetail> {
  return communityHttp.post(
    `/v1/community/posts/${encodeURIComponent(id)}/restore`,
    { expectedVersion },
    expectedVersionOptions(expectedVersion),
  );
}

export function submitCommunityPostReview(id: string, expectedVersion: number): Promise<CommunityPostDetail> {
  return communityHttp.post(
    `/v1/community/posts/${encodeURIComponent(id)}/submit-review`,
    { expectedVersion },
    expectedVersionOptions(expectedVersion),
  );
}

export function withdrawCommunityPostReview(id: string, expectedVersion: number): Promise<CommunityPostDetail> {
  return communityHttp.post(
    `/v1/community/posts/${encodeURIComponent(id)}/withdraw-review`,
    { expectedVersion },
    expectedVersionOptions(expectedVersion),
  );
}

export function getCommunityPostRevisions(id: string): Promise<{ items: CommunityPostRevision[] }> {
  return communityHttp.get(`/v1/community/posts/${encodeURIComponent(id)}/revisions`);
}

export function getCommunityPostComments(id: string, cursor?: string): Promise<CommunityCommentPage> {
  return communityHttp.get(`/v1/community/posts/${encodeURIComponent(id)}/comments`, { query: { cursor } });
}

export function createCommunityComment(
  postId: string,
  body: string,
  parentCommentId: string | null,
  idempotencyKey: string,
): Promise<CommunityComment> {
  return communityHttp.post(
    `/v1/community/posts/${encodeURIComponent(postId)}/comments`,
    { body, parentCommentId },
    { headers: communityIdempotencyHeaders(idempotencyKey), retryAfterRefresh: false },
  );
}

export function updateCommunityComment(
  id: string,
  body: string,
  expectedVersion: number,
  idempotencyKey: string,
): Promise<CommunityComment> {
  return communityHttp.patch(
    `/v1/community/comments/${encodeURIComponent(id)}`,
    { body, expectedVersion },
    expectedVersionOptions(expectedVersion, idempotencyKey),
  );
}

export function deleteCommunityComment(id: string, expectedVersion: number): Promise<CommunityComment> {
  return communityHttp.delete(`/v1/community/comments/${encodeURIComponent(id)}`, expectedVersionOptions(expectedVersion));
}

export function restoreCommunityComment(id: string, expectedVersion: number): Promise<CommunityComment> {
  return communityHttp.post(
    `/v1/community/comments/${encodeURIComponent(id)}/restore`,
    { expectedVersion },
    expectedVersionOptions(expectedVersion),
  );
}

export function submitCommunityCommentReview(id: string, expectedVersion: number): Promise<CommunityComment> {
  return communityHttp.post(
    `/v1/community/comments/${encodeURIComponent(id)}/submit-review`,
    { expectedVersion },
    expectedVersionOptions(expectedVersion),
  );
}

export function withdrawCommunityCommentReview(id: string, expectedVersion: number): Promise<CommunityComment> {
  return communityHttp.post(
    `/v1/community/comments/${encodeURIComponent(id)}/withdraw-review`,
    { expectedVersion },
    expectedVersionOptions(expectedVersion),
  );
}

export function getCommunityCommentRevisions(id: string): Promise<{ items: CommunityCommentRevision[] }> {
  return communityHttp.get(`/v1/community/comments/${encodeURIComponent(id)}/revisions`);
}

export function setCommunityPostBookmark(id: string, bookmarked: boolean): Promise<void> {
  const path = `/v1/community/posts/${encodeURIComponent(id)}/bookmark`;
  return bookmarked
    ? communityHttp.put(path, undefined, { retryAfterRefresh: false })
    : communityHttp.delete(path, { retryAfterRefresh: false });
}

export function setCommunityPostFollow(id: string, followed: boolean): Promise<void> {
  const path = `/v1/community/posts/${encodeURIComponent(id)}/follow`;
  return followed
    ? communityHttp.put(path, undefined, { retryAfterRefresh: false })
    : communityHttp.delete(path, { retryAfterRefresh: false });
}

export function setCommunityPostUseful(id: string, useful: boolean): Promise<void> {
  const path = `/v1/community/posts/${encodeURIComponent(id)}/useful`;
  return useful
    ? communityHttp.put(path, undefined, { retryAfterRefresh: false })
    : communityHttp.delete(path, { retryAfterRefresh: false });
}

export function acceptCommunityAnswer(
  postId: string,
  commentId: string | null,
  expectedVersion: number,
): Promise<CommunityPostDetail> {
  const path = `/v1/community/posts/${encodeURIComponent(postId)}/accepted-comment`;
  return commentId
    ? communityHttp.put(path, { commentId, expectedVersion }, expectedVersionOptions(expectedVersion))
    : communityHttp.delete(path, expectedVersionOptions(expectedVersion));
}

export function reportCommunityContent(
  targetType: 'post' | 'comment',
  targetId: string,
  reason: CommunityReportReason,
  details: string,
  idempotencyKey: string,
): Promise<CommunityReportResult> {
  return communityHttp.post(
    `/v1/community/content/${targetType}/${encodeURIComponent(targetId)}/report`,
    { reason, details },
    { headers: communityIdempotencyHeaders(idempotencyKey), retryAfterRefresh: false },
  );
}

export const communityContentApi = {
  listPosts: getCommunityPosts,
  getPost: getCommunityPost,
  createPost: createCommunityPost,
  updatePost: updateCommunityPost,
  deletePost: deleteCommunityPost,
  restorePost: restoreCommunityPost,
  submitPostReview: submitCommunityPostReview,
  withdrawPostReview: withdrawCommunityPostReview,
  listPostRevisions: getCommunityPostRevisions,
  listComments: getCommunityPostComments,
  createComment: createCommunityComment,
  updateComment: updateCommunityComment,
  deleteComment: deleteCommunityComment,
  restoreComment: restoreCommunityComment,
  submitCommentReview: submitCommunityCommentReview,
  withdrawCommentReview: withdrawCommunityCommentReview,
  listCommentRevisions: getCommunityCommentRevisions,
  setBookmark: setCommunityPostBookmark,
  setFollow: setCommunityPostFollow,
  setUseful: setCommunityPostUseful,
  acceptAnswer: acceptCommunityAnswer,
  report: reportCommunityContent,
};
