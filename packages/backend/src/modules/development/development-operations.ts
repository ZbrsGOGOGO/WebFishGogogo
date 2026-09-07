import type { DevelopmentEvent } from '@stealth-reader/shared';

import type { AdminAuditLog } from '../../database/entities/admin-audit-log.entity';

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
