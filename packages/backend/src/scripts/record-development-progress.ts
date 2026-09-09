import { createHash } from 'node:crypto';
import { IsNull, type DataSource } from 'typeorm';
import type { DevelopmentProgressInput, DevelopmentStatus } from '@stealth-reader/shared';
import { AppDataSource } from '../database/data-source';
import { AdminAuditLog, DevelopmentRequest, User } from '../database/entities';
import { NotificationService } from '../modules/community/notification.service';
import { developmentWorkspaceEnabled } from '../modules/development/development-gates';
import { DEVELOPMENT_OFFLINE_PROGRESS_ACTION } from '../modules/development/development-progress';
import { developmentId, developmentProgressInput } from '../modules/development/development-validation';

export interface OfflineDevelopmentProgressInput extends DevelopmentProgressInput {
  requestId: string; deployedCommit: string; confirmation: string; status: 'keep' | 'in_progress';
}
class ProgressError extends Error {}
export function validateOfflineProgress(value: unknown): OfflineDevelopmentProgressInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ProgressError('DEVELOPMENT_PROGRESS_INPUT_INVALID');
  const raw = value as Record<string, unknown>;
  const allowed = ['requestId', 'expectedVersion', 'deployedCommit', 'confirmation', 'status', 'summary', 'items'];
  if (Object.keys(raw).length !== allowed.length || Object.keys(raw).some((key) => !allowed.includes(key))) throw new ProgressError('DEVELOPMENT_PROGRESS_INPUT_INVALID');
  let requestId: string; let progress: DevelopmentProgressInput;
  try {
    requestId = developmentId(raw.requestId);
    progress = developmentProgressInput({ expectedVersion: raw.expectedVersion, summary: raw.summary, items: raw.items });
  } catch { throw new ProgressError('DEVELOPMENT_PROGRESS_INPUT_INVALID'); }
  if (requestId !== raw.requestId || progress.expectedVersion >= 2147483647 ||
    typeof raw.deployedCommit !== 'string' || !/^[a-f0-9]{40}$/.test(raw.deployedCommit) ||
    raw.confirmation !== `REVIEW:${requestId}:${progress.expectedVersion}:${raw.deployedCommit}` ||
    (raw.status !== 'keep' && raw.status !== 'in_progress')) throw new ProgressError('DEVELOPMENT_PROGRESS_CONFIRMATION_INVALID');
  return { ...progress, requestId, deployedCommit: raw.deployedCommit, confirmation: raw.confirmation as string, status: raw.status };
}

/** Operations-only entry point, never imported by an HTTP controller/provider.
 * Explicit owner authorization and a separately verified deployment are required.
 * It records scope, not an autonomous review, grant, deployment or completion. */
export async function recordDevelopmentProgress(dataSource: DataSource, raw: unknown): Promise<{
  requestId: string; version: number; status: DevelopmentStatus; changed: boolean;
}> {
  const input = validateOfflineProgress(raw);
  if (!developmentWorkspaceEnabled()) throw new ProgressError('DEVELOPMENT_WORKSPACE_DISABLED');
  const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  return dataSource.transaction(async (manager) => {
    const requests = manager.getRepository(DevelopmentRequest);
    const snapshot = await requests.findOneBy({ id: input.requestId });
    if (!snapshot) throw new ProgressError('DEVELOPMENT_REQUEST_NOT_FOUND');
    const author = await manager.getRepository(User).findOne({ where: { id: snapshot.authorId }, lock: { mode: 'for_no_key_update' } });
    if (!author || author.accountStatus !== 'active') throw new ProgressError('DEVELOPMENT_REQUEST_AUTHOR_INACTIVE');
    const request = await requests.findOne({ where: { id: input.requestId }, lock: { mode: 'pessimistic_write' } });
    if (!request || request.authorId !== snapshot.authorId) throw new ProgressError('DEVELOPMENT_REQUEST_NOT_FOUND');
    const audits = manager.getRepository(AdminAuditLog);
    const operationId = `offline-development-progress:${request.id}:${input.expectedVersion}`;
    const previous = await audits.findOneBy({ action: DEVELOPMENT_OFFLINE_PROGRESS_ACTION, targetType: 'development_request',
      targetId: request.id, actorId: IsNull(), actorRole: 'system', requestId: operationId });
    if (previous) {
      if (previous.nextState.fingerprint !== fingerprint) throw new ProgressError('DEVELOPMENT_PROGRESS_REPLAY_CONFLICT');
      return { requestId: request.id, version: request.version, status: request.status, changed: false };
    }
    if (request.version !== input.expectedVersion) throw new ProgressError('DEVELOPMENT_VERSION_CONFLICT');
    if (input.status === 'in_progress' && !['submitted', 'needs_info', 'accepted', 'in_progress'].includes(request.status)) {
      throw new ProgressError('DEVELOPMENT_PROGRESS_STATUS_INVALID');
    }
    const before = { version: request.version, status: request.status };
    const now = new Date();
    request.version += 1; request.updatedAt = now;
    if (input.status === 'in_progress') request.status = 'in_progress';
    await requests.save(request);
    const audit = await audits.save(audits.create({ actorId: null, actorRole: 'system', action: DEVELOPMENT_OFFLINE_PROGRESS_ACTION,
      targetType: 'development_request', targetId: request.id, requestId: operationId, reason: '站长授权：已部署范围逐项核验，未完成项继续跟进',
      previousState: before, nextState: { version: request.version, status: request.status, deployedCommit: input.deployedCommit,
        summary: input.summary, items: input.items, fingerprint, authorization: 'site_owner_instruction' }, createdAt: now }));
    const done = input.items.filter((item) => item.status === 'done').length;
    await new NotificationService(dataSource).create(manager, { userId: request.authorId, actorUserId: null, category: 'system',
      eventType: DEVELOPMENT_OFFLINE_PROGRESS_ACTION, title: '开发反馈分项进度已更新',
      summary: `${request.title}：${done}/${input.items.length} 项已验收，交付范围与未完成项已回填。`,
      resourceType: 'development_request', resourceId: request.id, resourcePath: `/development/requests/${request.id}`,
      dedupeKey: `development-operation:${audit.id}`, availableAt: now });
    return { requestId: request.id, version: request.version, status: request.status, changed: true };
  });
}
async function main(): Promise<void> {
  // A private stdin payload avoids putting proposal text or credentials in argv.
  const chunks: Buffer[] = []; let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.from(chunk); bytes += buffer.length;
    if (bytes > 32_000) throw new ProgressError('DEVELOPMENT_PROGRESS_INPUT_TOO_LARGE');
    chunks.push(buffer);
  }
  let raw: unknown;
  try { raw = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ProgressError('DEVELOPMENT_PROGRESS_JSON_INVALID'); }
  const input = validateOfflineProgress(raw);
  await AppDataSource.initialize();
  try { process.stdout.write(`${JSON.stringify(await recordDevelopmentProgress(AppDataSource, input))}\n`); }
  finally { await AppDataSource.destroy(); }
}
if (require.main === module) void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof ProgressError ? error.message : 'DEVELOPMENT_PROGRESS_FAILED'}\n`);
  process.exitCode = 1;
});
