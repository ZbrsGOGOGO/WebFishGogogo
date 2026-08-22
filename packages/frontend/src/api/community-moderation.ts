import { communityHttp } from './community-http';
import { communityIdempotencyHeaders } from './community-idempotency';
import type {
  CommunityContentAuthor,
  CommunityContentState,
} from './community-content';

export type CommunityModerationCaseStatus = 'open' | 'in_review' | 'resolved';
export type CommunityModerationRiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type CommunityModerationAction = 'approve' | 'limit' | 'hide' | 'restore';

export interface CommunityModeratorAccess {
  allowed: true;
  role: 'moderator' | 'admin';
  permissions: CommunityModerationAction[];
}

export interface CommunityModerationAuditEntry {
  id: string;
  action: string;
  actorDisplayName: string;
  actorRole: 'moderator' | 'admin';
  reason: string | null;
  createdAt: string;
  previousState?: Partial<CommunityContentState>;
  nextState?: Partial<CommunityContentState>;
}

export interface CommunityModerationCaseSummary {
  id: string;
  status: CommunityModerationCaseStatus;
  riskLevel: CommunityModerationRiskLevel;
  contentType: 'post' | 'comment';
  contentId: string;
  title?: string | null;
  excerpt: string;
  reportCount: number;
  createdAt: string;
  updatedAt: string;
  assignedTo?: string | null;
  contentState: CommunityContentState;
}

export interface CommunityModerationCaseDetail extends CommunityModerationCaseSummary {
  bodySnapshot: string;
  author: CommunityContentAuthor;
  reports: Array<{
    id: string;
    reason: string;
    details?: string | null;
    createdAt: string;
  }>;
  auditTrail: CommunityModerationAuditEntry[];
  version: number;
  allowedActions: CommunityModerationAction[];
}

export interface CommunityModerationCasePage {
  items: CommunityModerationCaseSummary[];
  nextCursor?: string | null;
}

export interface CommunityModerationFilters {
  status?: CommunityModerationCaseStatus | 'all';
  riskLevel?: CommunityModerationRiskLevel | 'all';
  contentType?: 'post' | 'comment' | 'all';
  cursor?: string;
}

export function getCommunityModeratorAccess(): Promise<CommunityModeratorAccess> {
  return communityHttp.get('/v1/admin/moderation/access');
}

export function getCommunityModerationCases(
  filters: CommunityModerationFilters = {},
): Promise<CommunityModerationCasePage> {
  return communityHttp.get('/v1/admin/moderation/cases', {
    query: {
      status: filters.status === 'all' ? undefined : filters.status,
      riskLevel: filters.riskLevel === 'all' ? undefined : filters.riskLevel,
      contentType: filters.contentType === 'all' ? undefined : filters.contentType,
      cursor: filters.cursor,
    },
  });
}

export function getCommunityModerationCase(id: string): Promise<CommunityModerationCaseDetail> {
  return communityHttp.get(`/v1/admin/moderation/cases/${encodeURIComponent(id)}`);
}

export function applyCommunityModerationAction(
  id: string,
  action: CommunityModerationAction,
  reason: string,
  expectedVersion: number,
  idempotencyKey: string,
): Promise<CommunityModerationCaseDetail> {
  return communityHttp.post(
    `/v1/admin/moderation/cases/${encodeURIComponent(id)}/actions`,
    { action, reason, expectedVersion },
    {
      headers: {
        ...communityIdempotencyHeaders(idempotencyKey),
        'If-Match': `\"${expectedVersion}\"`,
      },
      retryAfterRefresh: false,
    },
  );
}

export const communityModerationApi = {
  getAccess: getCommunityModeratorAccess,
  listCases: getCommunityModerationCases,
  getCase: getCommunityModerationCase,
  applyAction: applyCommunityModerationAction,
};
