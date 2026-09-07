import { randomUUID } from 'node:crypto';

import type { DataSource } from 'typeorm';

import {
  AdminAuditLog,
  CommunityNotification,
  DevelopmentEvent,
  DevelopmentMember,
  DevelopmentRequest,
  User,
} from '../database/entities';
import { createLocalDevDataSource } from '../database/local-dev-datasource';
import { NotificationService } from '../modules/community/notification.service';
import { DEVELOPMENT_OFFLINE_COMPLETION_ACTION } from '../modules/development/development-operations';
import { DevelopmentService } from '../modules/development/development.service';
import {
  completeDevelopmentRequest,
  completionInputFromEnvironment,
  type DevelopmentCompletionInput,
} from './complete-development-request';

const RELEASE = 'd8e814e0e681af43a8e584846c6bdba7d12fbce6';

function input(requestId: string, expectedVersion = 1): DevelopmentCompletionInput {
  return {
    requestId,
    expectedVersion,
    deployedCommit: RELEASE,
    confirmation: `COMPLETE:${requestId}:${expectedVersion}:${RELEASE}`,
    reason: '站长明确授权归档；农场余额提示与续种修复已经部署并通过验收。',
  };
}

describe('offline development completion validation', () => {
  it.each([
    { requestId: 'someone@example.com' },
    { expectedVersion: 0 },
    { expectedVersion: 1.2 },
    { expectedVersion: 2147483647 },
    { deployedCommit: 'd8e814e' },
    { confirmation: 'yes' },
    { reason: 'ok' },
    { reason: 'x'.repeat(501) },
    { reason: 'bad\u0000reason' },
  ])('rejects unsafe input before touching the database: %j', async (override) => {
    const transaction = jest.fn();
    await expect(completeDevelopmentRequest(
      { transaction } as unknown as DataSource,
      { ...input(randomUUID()), ...override },
    )).rejects.toThrow();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('parses only explicit environment fields and has no default target', () => {
    const values = input(randomUUID(), 3);
    expect(completionInputFromEnvironment({
      DEVELOPMENT_COMPLETE_REQUEST_ID: values.requestId,
      DEVELOPMENT_COMPLETE_EXPECTED_VERSION: '3',
      DEVELOPMENT_COMPLETE_DEPLOYED_COMMIT: RELEASE,
      DEVELOPMENT_COMPLETE_CONFIRMATION: values.confirmation,
      DEVELOPMENT_COMPLETE_REASON: values.reason,
    })).toEqual(values);
    expect(completionInputFromEnvironment({}).requestId).toBe('');
    expect(completionInputFromEnvironment({}).expectedVersion).toBeNaN();
  });
});

describe('offline development completion integration', () => {
  let dataSource: DataSource;
  let service: DevelopmentService;
  const previousFeature = process.env.FEATURE_DEVELOPMENT_WORKSPACE_ENABLED;

  beforeEach(async () => {
    process.env.FEATURE_DEVELOPMENT_WORKSPACE_ENABLED = 'true';
    dataSource = await createLocalDevDataSource();
    service = new DevelopmentService(dataSource, new NotificationService(dataSource));
  });

  afterEach(async () => {
    await dataSource.destroy();
    if (previousFeature === undefined) delete process.env.FEATURE_DEVELOPMENT_WORKSPACE_ENABLED;
    else process.env.FEATURE_DEVELOPMENT_WORKSPACE_ENABLED = previousFeature;
  });

  it('archives as system without granting privileges and projects an honest private timeline', async () => {
    const { author, request } = await proposal();
    await service.addComment(author.id, request.id, '原作者补充：按钮提示不准确。', 1);
    const result = await completeDevelopmentRequest(dataSource, input(request.id, 2));
    expect(result).toEqual({ requestId: request.id, status: 'done', version: 3, changed: true });
    expect(await dataSource.getRepository(User).countBy({ communityRole: 'admin' })).toBe(0);
    expect((await dataSource.getRepository(User).findOneByOrFail({ id: author.id })).communityRole).toBe('user');
    const audit = await dataSource.getRepository(AdminAuditLog).findOneByOrFail({ targetId: request.id });
    expect(audit).toMatchObject({
      actorId: null,
      actorRole: 'system',
      action: DEVELOPMENT_OFFLINE_COMPLETION_ACTION,
      previousState: { status: 'submitted', version: 2 },
      nextState: { status: 'done', version: 3, completionMode: 'offline_operator', deployedCommit: RELEASE },
    });
    expect(await dataSource.getRepository(DevelopmentEvent).countBy({ requestId: request.id })).toBe(2);
    const detail = await service.detail(author.id, request.id);
    expect(detail.events).toEqual([
      expect.objectContaining({ kind: 'created', actorSource: 'user', actor: { publicId: author.publicId, username: author.username, displayName: author.displayName } }),
      expect.objectContaining({ kind: 'comment', actorSource: 'user', body: '原作者补充：按钮提示不准确。' }),
      expect.objectContaining({
        kind: 'decision',
        actorSource: 'site_operations',
        actor: { kind: 'system', publicId: null, username: null, displayName: '站点运维（站长授权）' },
        status: 'done',
        body: expect.stringContaining(RELEASE),
      }),
    ]);
    // Exact formatter expression shipped before system operations existed.
    // Already-open pages must remain safe without pretending this is a user.
    const legacyActor = detail.events[2].actor;
    expect(legacyActor.displayName || (legacyActor.username ? `@${legacyActor.username}` : legacyActor.publicId))
      .toBe('站点运维（站长授权）');
    expect(detail.events[0].actor).not.toHaveProperty('kind');
    const notification = await dataSource.getRepository(CommunityNotification).findOneByOrFail({ resourceId: request.id });
    expect(notification).toMatchObject({
      userId: author.id,
      actorUserId: null,
      category: 'system',
      eventType: DEVELOPMENT_OFFLINE_COMPLETION_ACTION,
      payload: { title: '开发反馈已完成', resourcePath: `/development/requests/${request.id}` },
    });
    await expect(service.decide(author.id, request.id, 'accepted', '普通成员不能审核', 3))
      .rejects.toMatchObject({ response: { code: 'DEVELOPMENT_OWNER_REQUIRED' } });
    const { author: other } = await proposal();
    await expect(service.detail(other.id, request.id))
      .rejects.toMatchObject({ response: { code: 'DEVELOPMENT_REQUEST_NOT_FOUND' } });
  });

  it('replays without duplicate audit/notification and does not rewrite a completed proposal', async () => {
    const { request } = await proposal();
    const command = input(request.id);
    await completeDevelopmentRequest(dataSource, command);
    const before = await dataSource.getRepository(DevelopmentRequest).findOneByOrFail({ id: request.id });
    expect(await completeDevelopmentRequest(dataSource, command)).toMatchObject({ changed: false, version: 2 });
    expect(await completeDevelopmentRequest(dataSource, input(request.id, 2))).toMatchObject({ changed: false, version: 2 });
    await expect(completeDevelopmentRequest(dataSource, { ...command, reason: '不同的理由不能覆盖原有归档' }))
      .rejects.toThrow('DEVELOPMENT_COMPLETION_REPLAY_CONFLICT');
    expect(await dataSource.getRepository(AdminAuditLog).count()).toBe(1);
    expect(await dataSource.getRepository(CommunityNotification).count()).toBe(1);
    expect(await dataSource.getRepository(DevelopmentRequest).findOneByOrFail({ id: request.id })).toEqual(before);
  });

  it('rejects stale versions, rejected proposals, missing IDs and disabled workspace without side effects', async () => {
    const { request } = await proposal();
    await expect(completeDevelopmentRequest(dataSource, input(request.id, 2)))
      .rejects.toThrow('DEVELOPMENT_VERSION_CONFLICT');
    await expect(completeDevelopmentRequest(dataSource, input(randomUUID())))
      .rejects.toThrow('DEVELOPMENT_REQUEST_NOT_FOUND');
    await dataSource.getRepository(DevelopmentRequest).update({ id: request.id }, { status: 'rejected' });
    await expect(completeDevelopmentRequest(dataSource, input(request.id)))
      .rejects.toThrow('DEVELOPMENT_COMPLETION_STATUS_INVALID');
    process.env.FEATURE_DEVELOPMENT_WORKSPACE_ENABLED = 'false';
    await expect(completeDevelopmentRequest(dataSource, input(request.id)))
      .rejects.toThrow('DEVELOPMENT_WORKSPACE_DISABLED');
    expect(await dataSource.getRepository(AdminAuditLog).count()).toBe(0);
    expect(await dataSource.getRepository(CommunityNotification).count()).toBe(0);
    expect(await dataSource.getRepository(DevelopmentRequest).findOneByOrFail({ id: request.id }))
      .toMatchObject({ status: 'rejected', version: 1 });
  });

  it('never exposes unrelated audit rows or relabels user-authored records as system operations', async () => {
    const { author, request } = await proposal();
    await completeDevelopmentRequest(dataSource, input(request.id));
    const repository = dataSource.getRepository(AdminAuditLog);
    for (const overrides of [
      { action: 'community_role.offline_assignment' },
      { targetType: 'user' },
      { targetId: randomUUID() },
      { actorRole: 'user' as const, actorId: author.id },
      { actorId: author.id },
      { nextState: { status: 'done', deployedCommit: RELEASE } },
    ]) {
      await repository.save(repository.create({
        actorId: null,
        actorRole: 'system',
        action: DEVELOPMENT_OFFLINE_COMPLETION_ACTION,
        targetType: 'development_request',
        targetId: request.id,
        reason: '内部审计不得误暴露给作者',
        previousState: {},
        nextState: { status: 'done', completionMode: 'offline_operator', deployedCommit: RELEASE },
        ...overrides,
      }));
    }
    const detail = await service.detail(author.id, request.id);
    expect(detail.events).toHaveLength(2);
    expect(detail.events.filter((event) => event.actorSource === 'site_operations')).toHaveLength(1);
    expect(JSON.stringify(detail)).not.toContain('内部审计不得误暴露给作者');
  });

  async function proposal() {
    const username = `complete_${randomUUID().slice(0, 8)}`;
    const author = await dataSource.getRepository(User).save(dataSource.getRepository(User).create({
      email: `${username}@example.com`,
      emailNormalized: `${username}@example.com`,
      username,
      passwordHash: 'unused-test-hash',
      displayName: '反馈作者',
      publicId: randomUUID(),
      accountStatus: 'active',
      communityRole: 'user',
      onboardingCompleted: true,
    }));
    await dataSource.getRepository(DevelopmentMember).save({
      userId: author.id,
      grantedByUserId: null,
      grantedAt: new Date(),
      revokedAt: null,
    });
    const request = await service.createRequest(author.id, {
      clientRequestId: randomUUID(),
      title: '农场按钮无法继续浇水',
      category: 'bug',
      description: '当前余额低于选中作物的整批种子费用，但是没有准确提示。',
    });
    return { author, request };
  }
});
