import { communityHttp } from './community-http';
import { communityIdempotencyHeaders } from './community-idempotency';

export type CommunityRestrictedAccountStatus =
  | 'active'
  | 'suspended'
  | 'banned'
  | 'deleting';

export type CommunityAccountAppealStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export interface CommunityAccountAppeal {
  id?: string;
  status: CommunityAccountAppealStatus;
  submittedAt?: string | null;
  decidedAt?: string | null;
  decisionReason?: string | null;
}

export interface CommunityAccountStatusSnapshot {
  accountStatus: CommunityRestrictedAccountStatus;
  reasonCode?: string | null;
  reason?: string | null;
  restrictedAt?: string | null;
  restrictionEndsAt?: string | null;
  canAppeal?: boolean;
  appeal?: CommunityAccountAppeal | null;
}

export type CommunityAccountDeletionStatus =
  | 'none'
  | 'cooling_off'
  | 'scheduled'
  | 'processing'
  | 'cancelled';

export interface CommunityAccountDeletion {
  status: CommunityAccountDeletionStatus;
  requestedAt?: string | null;
  scheduledFor?: string | null;
  canCancel: boolean;
}

export function getCommunityAccountStatus(): Promise<CommunityAccountStatusSnapshot> {
  return communityHttp.get('/v1/me/account-status');
}

export function getCommunityAccountDeletion(): Promise<CommunityAccountDeletion> {
  return communityHttp.get('/v1/me/account-deletion');
}

export function requestCommunityAccountDeletion(
  idempotencyKey: string,
): Promise<CommunityAccountDeletion> {
  return communityHttp.post(
    '/v1/me/account-deletion-requests',
    { confirmation: 'DELETE' },
    {
      headers: communityIdempotencyHeaders(idempotencyKey),
      retryAfterRefresh: false,
    },
  );
}

export function cancelCommunityAccountDeletion(): Promise<CommunityAccountDeletion> {
  return communityHttp.post(
    '/v1/me/account-deletion/cancel',
    undefined,
    { retryAfterRefresh: false },
  );
}

export function submitCommunityAccountAppeal(
  reason: string,
): Promise<CommunityAccountAppeal> {
  return communityHttp.post(
    '/v1/me/account-appeals',
    { reason },
    { retryAfterRefresh: false },
  );
}

export const communityAccountApi = {
  getStatus: getCommunityAccountStatus,
  getDeletion: getCommunityAccountDeletion,
  requestDeletion: requestCommunityAccountDeletion,
  cancelDeletion: cancelCommunityAccountDeletion,
  submitAppeal: submitCommunityAccountAppeal,
};
