import { communityHttp } from './community-http';
import { communityIdempotencyHeaders } from './community-idempotency';

export interface CommunityUserSummary {
  publicId: string;
  displayName: string;
  avatarKey: string;
  battleProfession: string;
  bio?: string | null;
}

export interface CommunityFriend extends CommunityUserSummary {
  friendsSince: string;
  canFeed: boolean;
  canChallenge: boolean;
  note?: string | null;
}

export interface CommunityFriendPage {
  items: CommunityFriend[];
  nextCursor?: string | null;
  total: number;
  pageLimit?: number;
  friendLimit?: number;
  limit: number;
}

export type CommunityFriendRequestDirection = 'incoming' | 'outgoing';

export interface CommunityFriendRequest {
  id: string;
  direction: CommunityFriendRequestDirection;
  user: CommunityUserSummary;
  createdAt: string;
  status: 'pending';
}

export interface CommunityFriendRequestPage {
  items: CommunityFriendRequest[];
  nextCursor?: string | null;
  pendingIncomingCount: number;
  pendingOutgoingCount: number;
  dailySent: number;
  dailyLimit: number;
}

export interface CommunityBlock extends CommunityUserSummary {
  blockedAt: string;
}

export interface CommunityBlockPage {
  items: CommunityBlock[];
  nextCursor?: string | null;
}

export interface CommunityRelationshipMutationResult {
  status: 'pending' | 'friend' | 'none' | 'blocked_by_me';
  requestId?: string | null;
}

function mutationHeaders(idempotencyKey: string): HeadersInit {
  return communityIdempotencyHeaders(idempotencyKey);
}

export function getCommunityFriends(cursor?: string): Promise<CommunityFriendPage> {
  return communityHttp.get('/v1/friends', { query: { cursor } });
}

export function getCommunityFriendRequests(
  direction?: CommunityFriendRequestDirection,
  cursor?: string,
): Promise<CommunityFriendRequestPage> {
  return communityHttp.get('/v1/friend-requests', { query: { direction, cursor } });
}

export function sendCommunityFriendRequest(
  publicId: string,
  idempotencyKey: string,
): Promise<CommunityRelationshipMutationResult> {
  return communityHttp.post(
    '/v1/friend-requests',
    { publicId },
    { headers: mutationHeaders(idempotencyKey), retryAfterRefresh: false },
  );
}

export function acceptCommunityFriendRequest(
  requestId: string,
  idempotencyKey: string,
): Promise<CommunityRelationshipMutationResult> {
  return communityHttp.post(
    `/v1/friend-requests/${encodeURIComponent(requestId)}/accept`,
    undefined,
    { headers: mutationHeaders(idempotencyKey), retryAfterRefresh: false },
  );
}

export function rejectCommunityFriendRequest(
  requestId: string,
  idempotencyKey: string,
): Promise<CommunityRelationshipMutationResult> {
  return communityHttp.post(
    `/v1/friend-requests/${encodeURIComponent(requestId)}/reject`,
    undefined,
    { headers: mutationHeaders(idempotencyKey), retryAfterRefresh: false },
  );
}

export function cancelCommunityFriendRequest(
  requestId: string,
  idempotencyKey: string,
): Promise<void> {
  return communityHttp.delete(`/v1/friend-requests/${encodeURIComponent(requestId)}`, {
    headers: mutationHeaders(idempotencyKey),
    retryAfterRefresh: false,
  });
}

export function removeCommunityFriend(
  publicId: string,
  idempotencyKey: string,
): Promise<void> {
  return communityHttp.delete(`/v1/friends/${encodeURIComponent(publicId)}`, {
    headers: mutationHeaders(idempotencyKey),
    retryAfterRefresh: false,
  });
}

export function getCommunityBlocks(cursor?: string): Promise<CommunityBlockPage> {
  return communityHttp.get('/v1/blocks', { query: { cursor } });
}

export function blockCommunityUser(
  publicId: string,
  idempotencyKey: string,
): Promise<CommunityRelationshipMutationResult> {
  return communityHttp.post(
    '/v1/blocks',
    { publicId },
    { headers: mutationHeaders(idempotencyKey), retryAfterRefresh: false },
  );
}

export function unblockCommunityUser(
  publicId: string,
  idempotencyKey: string,
): Promise<void> {
  return communityHttp.delete(`/v1/blocks/${encodeURIComponent(publicId)}`, {
    headers: mutationHeaders(idempotencyKey),
    retryAfterRefresh: false,
  });
}

export const communityRelationshipsApi = {
  listFriends: getCommunityFriends,
  listRequests: getCommunityFriendRequests,
  sendRequest: sendCommunityFriendRequest,
  acceptRequest: acceptCommunityFriendRequest,
  rejectRequest: rejectCommunityFriendRequest,
  cancelRequest: cancelCommunityFriendRequest,
  removeFriend: removeCommunityFriend,
  listBlocks: getCommunityBlocks,
  block: blockCommunityUser,
  unblock: unblockCommunityUser,
};
