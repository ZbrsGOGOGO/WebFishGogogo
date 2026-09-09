import type { DevelopmentEvent } from '@stealth-reader/shared';

import type { AdminAuditLog } from '../../database/entities/admin-audit-log.entity';
import { DEVELOPMENT_OFFLINE_PROGRESS_ACTION, developmentProgressView } from './development-progress';

export const DEVELOPMENT_OFFLINE_COMPLETION_ACTION = 'development.request.offline_completed';

/** Project only the allowlisted system audit; never invent a website user. */
export function offlineCompletionEvent(record: AdminAuditLog): DevelopmentEvent | null {
  if (
    record.action !== DEVELOPMENT_OFFLINE_COMPLETION_ACTION ||
    record.targetType !== 'development_request' ||
    record.actorRole !== 'system' ||
    record.actorId !== null ||
    record.nextState.status !== 'done' ||
    record.nextState.completionMode !== 'offline_operator' ||
    typeof record.nextState.deployedCommit !== 'string' ||
    !/^[0-9a-f]{40}$/.test(record.nextState.deployedCommit)
  ) return null;
  return {
    id: `operation:${record.id}`,
    kind: 'decision',
    actor: {
      kind: 'system',
      publicId: null,
      username: null,
      displayName: '站点运维（站长授权）',
    },
    actorSource: 'site_operations',
    body: `${record.reason ?? '已核验上线，归档为已完成'}\n发布版本：${record.nextState.deployedCommit}`,
    status: 'done',
    createdAt: record.createdAt.toISOString(),
  };
}

export function offlineProgressEvent(record: AdminAuditLog): DevelopmentEvent | null {
  if (record.action !== DEVELOPMENT_OFFLINE_PROGRESS_ACTION) return null;
  const { progress } = developmentProgressView(Number(record.nextState.version), [record]);
  if (!progress) return null;
  return {
    id: `operation:${record.id}`, kind: 'decision',
    actor: { kind: 'system', publicId: null, username: null, displayName: '站点运维（站长授权）' },
    actorSource: 'site_operations', status: null,
    body: `分项核验：${progress.items.filter((item) => item.status === 'done').length}/${progress.items.length} 项完成。\n${progress.summary}\n核验应用：${record.nextState.deployedCommit}`,
    createdAt: record.createdAt.toISOString(),
  };
}
