import type { DevelopmentProgress, DevelopmentReviewSummary } from '@stealth-reader/shared';
import type { AdminAuditLog } from '../../database/entities/admin-audit-log.entity';
import { developmentProgressInput } from './development-validation';

export const DEVELOPMENT_PROGRESS_ACTION = 'development.request.progress_updated';
export const DEVELOPMENT_OFFLINE_PROGRESS_ACTION = 'development.request.offline_progress';
export const DEVELOPMENT_REVIEW_ACTIONS = [DEVELOPMENT_PROGRESS_ACTION, DEVELOPMENT_OFFLINE_PROGRESS_ACTION,
  'development.request.decided', 'development.request.offline_completed'] as const;

/** Only owner-authenticated or explicitly allowlisted operations can record a review.
 * Contributor comments and arbitrary audit JSON must never become completion data. */
function trusted(row: AdminAuditLog): boolean {
  if (row.targetType !== 'development_request') return false;
  if (row.action === 'development.request.offline_completed' &&
    (row.nextState.status !== 'done' || !['offline_operator', 'owner_closed'].includes(String(row.nextState.completionMode)))) return false;
  return ((row.action === DEVELOPMENT_PROGRESS_ACTION || row.action === 'development.request.decided') && row.actorRole === 'admin' && row.actorId !== null) ||
    ((row.action === DEVELOPMENT_OFFLINE_PROGRESS_ACTION || row.action === 'development.request.offline_completed') && row.actorRole === 'system' && row.actorId === null &&
      typeof row.nextState.deployedCommit === 'string' && /^[0-9a-f]{40}$/.test(row.nextState.deployedCommit));
}

export function developmentProgressView(version: number, rows: AdminAuditLog[]): { review: DevelopmentReviewSummary; progress: DevelopmentProgress | null } {
  let reviewedVersion = 0;
  let reviewedAt: string | null = null;
  let summary: string | null = null;
  let progress: DevelopmentProgress | null = null;
  for (const row of rows.filter(trusted).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))) {
    const rowVersion = row.nextState.version;
    if (!Number.isSafeInteger(rowVersion) || Number(rowVersion) < 1 || Number(rowVersion) > version) continue;
    if (row.action === DEVELOPMENT_PROGRESS_ACTION || row.action === DEVELOPMENT_OFFLINE_PROGRESS_ACTION) {
      try {
        const input = developmentProgressInput({ expectedVersion: rowVersion, summary: row.nextState.summary, items: row.nextState.items });
        if (!progress || Number(rowVersion) >= progress.reviewedVersion) {
          progress = { reviewedVersion: Number(rowVersion), reviewedAt: row.createdAt.toISOString(), summary: input.summary, items: input.items };
          summary = progress.summary;
        }
      } catch { continue; /* Corrupt metadata cannot acknowledge newer comments. */ }
    }
    if (Number(rowVersion) >= reviewedVersion) {
      reviewedVersion = Number(rowVersion); reviewedAt = row.createdAt.toISOString();
      if (row.action === 'development.request.offline_completed') summary = (row.reason ?? '已核验上线').slice(0, 1200);
    }
  }
  return { progress, review: { reviewedVersion, reviewedAt, hasUnreviewedChanges: version > reviewedVersion,
    completedItems: progress?.items.filter((item) => item.status === 'done').length ?? 0,
    totalItems: progress?.items.length ?? 0, summary } };
}
