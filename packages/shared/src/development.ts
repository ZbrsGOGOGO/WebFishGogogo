/** Private development collaboration contracts. Account IDs and storage keys never leave the API. */
export const DEVELOPMENT_CATEGORIES = ['bug', 'feature', 'ui', 'game', 'other'] as const;
export type DevelopmentCategory = typeof DEVELOPMENT_CATEGORIES[number];
export const DEVELOPMENT_STATUSES = ['submitted', 'needs_info', 'accepted', 'rejected', 'in_progress', 'done'] as const;
export type DevelopmentStatus = typeof DEVELOPMENT_STATUSES[number];
export const DEVELOPMENT_STATUS_TRANSITIONS: Readonly<Record<DevelopmentStatus, readonly DevelopmentStatus[]>> = {
  submitted: ['needs_info', 'accepted', 'rejected'],
  needs_info: ['submitted', 'accepted', 'rejected'],
  accepted: ['in_progress', 'needs_info', 'rejected'],
  in_progress: ['done', 'needs_info'],
  done: [],
  rejected: [],
};
export type DevelopmentRole = 'owner' | 'contributor';

export const DEVELOPMENT_LIMITS = Object.freeze({
  fileBytes: 5 * 1024 * 1024,
  attachmentsPerRequest: 5,
  requestFileBytes: 20 * 1024 * 1024,
  titleChars: 120,
  descriptionChars: 12000,
  commentChars: 4000,
  pageSize: 20,
});

export interface DevelopmentPerson {
  publicId: string;
  username: string | null;
  displayName: string | null;
}

export interface DevelopmentAccess {
  enabled: boolean;
  role: DevelopmentRole | null;
  reviewMode: 'manual';
  limits: typeof DEVELOPMENT_LIMITS;
}

export interface DevelopmentAttachment {
  id: string;
  filename: string;
  mediaType: string;
  bytes: number;
  sha256: string;
  createdAt: string;
  extraction: 'text' | 'metadata_only';
  excerpt: string | null;
  warnings: string[];
}

export interface DevelopmentPrecheck {
  kind: 'rules';
  summary: string;
  findings: string[];
  questions: string[];
  requiresOwnerDecision: true;
  aiReviewed: false;
}

/** Display metadata only: not a website account and never a profile target. */
export interface DevelopmentSystemActor {
  kind: 'system';
  publicId: null;
  username: null;
  displayName: '站点运维（站长授权）';
}

export interface DevelopmentEvent {
  id: string;
  kind: 'created' | 'comment' | 'decision' | 'attachment';
  /** Keep displayName readable for already-open clients; system has no user ID. */
  actor: DevelopmentPerson | DevelopmentSystemActor;
  actorSource?: 'user' | 'site_operations';
  body: string;
  status: DevelopmentStatus | null;
  createdAt: string;
}

export interface DevelopmentRequestSummary {
  id: string;
  title: string;
  category: DevelopmentCategory;
  status: DevelopmentStatus;
  author: DevelopmentPerson;
  attachmentCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  review?: DevelopmentReviewSummary;
}

export const DEVELOPMENT_CHECK_STATES = ['todo', 'in_progress', 'done', 'blocked'] as const;
export type DevelopmentCheckState = typeof DEVELOPMENT_CHECK_STATES[number];
export interface DevelopmentCheckItem { id: string; label: string; status: DevelopmentCheckState }
export interface DevelopmentProgressInput { expectedVersion: number; summary: string; items: DevelopmentCheckItem[] }
export interface DevelopmentProgress {
  reviewedVersion: number;
  reviewedAt: string;
  summary: string;
  items: DevelopmentCheckItem[];
}
export interface DevelopmentReviewSummary {
  reviewedVersion: number;
  reviewedAt: string | null;
  hasUnreviewedChanges: boolean;
  completedItems: number;
  totalItems: number;
  summary: string | null;
}

export interface DevelopmentRequestDetail extends DevelopmentRequestSummary {
  description: string;
  attachments: DevelopmentAttachment[];
  events: DevelopmentEvent[];
  precheck: DevelopmentPrecheck;
  progress?: DevelopmentProgress | null;
}

export interface DevelopmentRequestPage {
  items: DevelopmentRequestSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DevelopmentMember extends DevelopmentPerson {
  grantedAt: string;
}

export interface DevelopmentCreateInput {
  clientRequestId: string;
  title: string;
  category: DevelopmentCategory;
  description: string;
}

export interface DevelopmentReviewExport {
  schemaVersion: 1;
  generatedAt: string;
  notice: string;
  requests: DevelopmentRequestDetail[];
  /** A complete, single-transaction snapshot; oversized exports fail visibly. */
  scope?: DevelopmentStatus | 'all' | 'pending';
  total?: number;
  exportedCount?: number;
  complete?: true;
}
