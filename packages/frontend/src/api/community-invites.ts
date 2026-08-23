import { communityHttp } from './community-http';
import { communityIdempotencyHeaders } from './community-idempotency';

export type CommunityReferralStatus =
  | 'opened'
  | 'registered'
  | 'pending_qualification'
  | 'qualified'
  | 'invalid';

export interface CommunityReferralEntry {
  id: string;
  displayName?: string | null;
  status: CommunityReferralStatus;
  createdAt: string;
  qualifiedAt?: string | null;
}

export interface CommunityReferralOverview {
  enabled: boolean;
  invitationCoins: number;
  code: string | null;
  shareUrl: string | null;
  openedCount: number;
  registeredCount: number;
  pendingQualificationCount: number;
  qualifiedCount: number;
  invalidCount: number;
  dailyQualifiedCount: number;
  dailyQualifiedLimit: number;
  monthlyQualifiedCount: number;
  monthlyQualifiedLimit: number;
  monthlyRewardCount: number;
  monthlyRewardLimit: number;
  rewardDescription: string | null;
  entries: CommunityReferralEntry[];
}

export interface CommunityReferralPreview {
  bindingToken: string;
  expiresAt: string;
  inviter: {
    publicId: string;
    displayName: string;
    avatarKey: string;
  };
}

export function getCommunityReferralOverview(): Promise<CommunityReferralOverview> {
  return communityHttp.get('/v1/me/referrals');
}

export function createOrRotateCommunityReferralCode(
  idempotencyKey: string,
): Promise<CommunityReferralOverview> {
  return communityHttp.post('/v1/referrals/code', undefined, {
    headers: communityIdempotencyHeaders(idempotencyKey),
    retryAfterRefresh: false,
  });
}

export function previewCommunityReferralCode(
  code: string,
): Promise<CommunityReferralPreview> {
  return communityHttp.post(
    '/v1/referrals/preview',
    { code },
    { auth: false, retryAfterRefresh: false },
  );
}

export const communityInvitesApi = {
  getOverview: getCommunityReferralOverview,
  createOrRotateCode: createOrRotateCommunityReferralCode,
  preview: previewCommunityReferralCode,
};
