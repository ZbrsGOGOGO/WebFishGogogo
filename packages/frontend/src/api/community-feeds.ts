import { communityHttp } from './community-http';
import { communityIdempotencyHeaders } from './community-idempotency';
import type { CommunityUserSummary } from './community-relationships';

export type CommunityFeedType = 'coffee' | 'cookie' | 'cheer_note';

export interface CommunityFeedEvent {
  id: string;
  direction: 'sent' | 'received';
  type: CommunityFeedType;
  user: CommunityUserSummary;
  createdAt: string;
}

export interface CommunityFeedOverview {
  sentToday: number;
  sendDailyLimit: number;
  receivedToday: number;
  receiveDailyLimit: number;
  eligibleFriends: Array<CommunityUserSummary & { fedToday: boolean }>;
  items: CommunityFeedEvent[];
  nextCursor?: string | null;
}

export interface SendCommunityFeedPayload {
  recipientPublicId: string;
  type: CommunityFeedType;
}

export interface SendCommunityFeedResult {
  event: CommunityFeedEvent;
  sentToday: number;
  sendDailyLimit: number;
}

export function getCommunityFeeds(cursor?: string): Promise<CommunityFeedOverview> {
  return communityHttp.get('/v1/feeds', { query: { cursor } });
}

export function sendCommunityFeed(
  payload: SendCommunityFeedPayload,
  idempotencyKey: string,
): Promise<SendCommunityFeedResult> {
  return communityHttp.post('/v1/feeds', payload, {
    headers: communityIdempotencyHeaders(idempotencyKey),
    retryAfterRefresh: false,
  });
}

export const communityFeedsApi = {
  getOverview: getCommunityFeeds,
  send: sendCommunityFeed,
};
