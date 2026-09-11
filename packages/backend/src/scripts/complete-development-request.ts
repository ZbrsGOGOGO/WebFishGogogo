import { IsNull, type DataSource } from 'typeorm';

import { AppDataSource } from '../database/data-source';
import { AdminAuditLog, DevelopmentRequest, User } from '../database/entities';
import { NotificationService } from '../modules/community/notification.service';
import { developmentWorkspaceEnabled } from '../modules/development/development-gates';
import { DEVELOPMENT_OFFLINE_COMPLETION_ACTION } from '../modules/development/development-operations';

export interface DevelopmentCompletionInput {
  requestId: string;
  expectedVersion: number;
  deployedCommit: string;
  confirmation: string;
  reason: string;
  /** Explicit owner decision to stop tracking, NOT a claim that code shipped. */
  mode?: 'owner_closed';
}

export interface DevelopmentCompletionResult {
  requestId: string;
  status: 'done';
  version: number;
  changed: boolean;
}

class CompletionError extends Error {}

function validate(input: DevelopmentCompletionInput): DevelopmentCompletionInput {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(input.requestId)) {
    throw new CompletionError('DEVELOPMENT_COMPLETE_REQUEST_ID must be an exact lowercase UUID');
  }
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1 || input.expectedVersion >= 2147483647) {
    throw new CompletionError('DEVELOPMENT_COMPLETE_EXPECTED_VERSION must be a positive database version');
  }
  if (!/^[0-9a-f]{40}$/.test(input.deployedCommit)) {
    throw new CompletionError('DEVELOPMENT_COMPLETE_DEPLOYED_COMMIT must be the verified full lowercase Git SHA');
  }
  if (input.mode !== undefined && input.mode !== 'owner_closed') throw new CompletionError('DEVELOPMENT_COMPLETE_MODE_INVALID');
  const operation = input.mode === 'owner_closed' ? 'CLOSE' : 'COMPLETE';
  if (input.confirmation !== `${operation}:${input.requestId}:${input.expectedVersion}:${input.deployedCommit}`) {
    throw new CompletionError(`DEVELOPMENT_COMPLETE_CONFIRMATION must exactly match ${operation}:<requestId>:<expectedVersion>:<deployedCommit>`);
  }
  const reason = input.reason.trim().normalize('NFC');
  if ([...reason].length < 5 || [...reason].length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(reason)) {
    throw new CompletionError('DEVELOPMENT_COMPLETE_REASON must contain 5 to 500 plain-text characters');
  }
  return { ...input, reason };
}

/**
 * Server-operations CLI only. An explicit owner instruction and independently
 * verified deployment are prerequisites; neither is inferred from proposal text.
 * No HTTP controller or application provider imports this mutation primitive.
 */
export async function completeDevelopmentRequest(
  dataSource: DataSource,
  rawInput: DevelopmentCompletionInput,
): Promise<DevelopmentCompletionResult> {
  const input = validate(rawInput);
  if (!developmentWorkspaceEnabled()) throw new CompletionError('DEVELOPMENT_WORKSPACE_DISABLED');
  return dataSource.transaction(async (manager) => {
    const requests = manager.getRepository(DevelopmentRequest);
    const snapshot = await requests.findOneBy({ id: input.requestId });
    if (!snapshot) throw new CompletionError('DEVELOPMENT_REQUEST_NOT_FOUND');
    // Match the existing user -> request lock order and FK-compatible user lock.
    const author = await manager.getRepository(User).findOne({
      where: { id: snapshot.authorId },
      lock: { mode: 'for_no_key_update' },
    });
    if (!author || author.accountStatus !== 'active') {
      throw new CompletionError('DEVELOPMENT_REQUEST_AUTHOR_INACTIVE');
    }
    const request = await requests.findOne({
      where: { id: input.requestId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!request || request.authorId !== snapshot.authorId) {
      throw new CompletionError('DEVELOPMENT_REQUEST_NOT_FOUND');
    }
    const audits = manager.getRepository(AdminAuditLog);
    const operationId = `offline-development-complete:${request.id}:${input.expectedVersion}`;
    const previousOperation = await audits.findOneBy({
      action: DEVELOPMENT_OFFLINE_COMPLETION_ACTION,
      targetType: 'development_request',
      targetId: request.id,
      actorId: IsNull(),
      actorRole: 'system',
      requestId: operationId,
    });
    if (previousOperation) {
      if (
        request.status !== 'done' ||
        previousOperation.reason !== input.reason ||
        previousOperation.nextState.completionMode !== (input.mode ?? 'offline_operator') ||
        previousOperation.nextState.deployedCommit !== input.deployedCommit
      ) throw new CompletionError('DEVELOPMENT_COMPLETION_REPLAY_CONFLICT');
      return { requestId: request.id, status: 'done', version: request.version, changed: false };
    }
    if (request.version !== input.expectedVersion) {
      throw new CompletionError('DEVELOPMENT_VERSION_CONFLICT');
    }
    if (request.status === 'done') {
      return { requestId: request.id, status: 'done', version: request.version, changed: false };
    }
    if (!['submitted', 'needs_info', 'accepted', 'in_progress'].includes(request.status)) {
      throw new CompletionError('DEVELOPMENT_COMPLETION_STATUS_INVALID');
    }
    const previousStatus = request.status;
    const now = new Date();
    request.status = 'done';
    request.version += 1;
    request.updatedAt = now;
    await requests.save(request);
    const audit = await audits.save(audits.create({
      actorId: null,
      actorRole: 'system',
      action: DEVELOPMENT_OFFLINE_COMPLETION_ACTION,
      targetType: 'development_request',
      targetId: request.id,
      reason: input.reason,
      requestId: operationId,
      previousState: { status: previousStatus, version: input.expectedVersion },
      nextState: {
        status: 'done',
        version: request.version,
        completionMode: input.mode ?? 'offline_operator',
        authorization: 'site_owner_instruction',
        deployedCommit: input.deployedCommit,
      },
      createdAt: now,
    }));
    await new NotificationService(dataSource).create(manager, {
      userId: request.authorId,
      actorUserId: null,
      category: 'system',
      eventType: DEVELOPMENT_OFFLINE_COMPLETION_ACTION,
      title: input.mode === 'owner_closed' ? '开发反馈已按站长决定归档' : '开发反馈已完成',
      summary: input.mode === 'owner_closed'
        ? `${request.title}：${input.reason}`
        : `${request.title}：已验证上线，由站点运维（站长授权）归档为已完成。`,
      resourceType: 'development_request',
      resourceId: request.id,
      resourcePath: `/development/requests/${request.id}`,
      dedupeKey: `development-operation:${audit.id}`,
      availableAt: now,
    });
    return { requestId: request.id, status: 'done', version: request.version, changed: true };
  });
}

export function completionInputFromEnvironment(env: NodeJS.ProcessEnv): DevelopmentCompletionInput {
  return {
    requestId: env.DEVELOPMENT_COMPLETE_REQUEST_ID ?? '',
    expectedVersion: Number(env.DEVELOPMENT_COMPLETE_EXPECTED_VERSION),
    deployedCommit: env.DEVELOPMENT_COMPLETE_DEPLOYED_COMMIT ?? '',
    confirmation: env.DEVELOPMENT_COMPLETE_CONFIRMATION ?? '',
    reason: env.DEVELOPMENT_COMPLETE_REASON ?? '',
    ...(env.DEVELOPMENT_COMPLETE_MODE !== undefined ? { mode: env.DEVELOPMENT_COMPLETE_MODE as 'owner_closed' } : {}),
  };
}

async function main(): Promise<void> {
  const input = validate(completionInputFromEnvironment(process.env));
  await AppDataSource.initialize();
  try {
    process.stdout.write(`${JSON.stringify(await completeDevelopmentRequest(AppDataSource, input))}\n`);
  } finally {
    await AppDataSource.destroy();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    // Database exceptions can contain SQL parameters/private proposal text.
    process.stderr.write(`${error instanceof CompletionError ? error.message : 'DEVELOPMENT_COMPLETION_FAILED'}\n`);
    process.exitCode = 1;
  });
}
