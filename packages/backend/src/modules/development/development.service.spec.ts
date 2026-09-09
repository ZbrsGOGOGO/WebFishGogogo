import { randomUUID } from 'node:crypto';

import type { DataSource } from 'typeorm';

import {
  AdminAuditLog,
  CommunityNotification,
  DevelopmentAttachmentRecord,
  DevelopmentEvent,
  DevelopmentMember,
  DevelopmentRequest,
  User,
} from '../../database/entities';
import { createLocalDevDataSource } from '../../database/local-dev-datasource';
import { NotificationService } from '../community/notification.service';
import { DevelopmentService } from './development.service';

describe('DevelopmentService', () => {
  let dataSource: DataSource;
  let service: DevelopmentService;
  const originalFeature = process.env.FEATURE_DEVELOPMENT_WORKSPACE_ENABLED;

  beforeEach(async () => {
    process.env.FEATURE_DEVELOPMENT_WORKSPACE_ENABLED = 'true';
    dataSource = await createLocalDevDataSource();
    service = new DevelopmentService(dataSource, new NotificationService(dataSource));
  });

  afterEach(async () => {
    if (dataSource.isInitialized) await dataSource.destroy();
    if (originalFeature === undefined) {
      delete process.env.FEATURE_DEVELOPMENT_WORKSPACE_ENABLED;
    } else {
      process.env.FEATURE_DEVELOPMENT_WORKSPACE_ENABLED = originalFeature;
    }
  });

  it('keeps contributor capability separate from the site-wide role and fails closed', async () => {
    const [owner, contributor, outsider] = await Promise.all([
      activeUser('dev_owner', 'admin'),
      activeUser('dev_core'),
      activeUser('dev_outsider'),
    ]);
    await grantDirectly(contributor.id, owner.id);

    await expect(service.access(owner.id)).resolves.toMatchObject({
      enabled: true,
      role: 'owner',
      reviewMode: 'manual',
    });
    await expect(service.access(contributor.id)).resolves.toMatchObject({
      enabled: true,
      role: 'contributor',
    });
    await expect(service.access(outsider.id)).resolves.toMatchObject({
      enabled: true,
      role: null,
    });
    expect((await dataSource.getRepository(User).findOneByOrFail({ id: contributor.id })).communityRole)
      .toBe('user');

    process.env.FEATURE_DEVELOPMENT_WORKSPACE_ENABLED = 'false';
    await expect(service.access(owner.id)).resolves.toMatchObject({ enabled: false, role: null });
    await expect(service.listRequests(owner.id, undefined, 1)).rejects.toMatchObject({
      response: { code: 'DEVELOPMENT_WORKSPACE_DISABLED' },
    });
  });

  it('grants and revokes membership with audit logs and no account-enumeration oracle', async () => {
    const [owner, contributor] = await Promise.all([
      activeUser('member_owner', 'admin'),
      activeUser('member_core'),
    ]);

    await expect(service.grantMember(contributor.id, 'does_not_exist')).rejects.toMatchObject({
      response: { code: 'DEVELOPMENT_ACCESS_REQUIRED' },
    });
    await expect(service.grantMember(owner.id, 'member_core')).resolves.toMatchObject({
      items: [{ publicId: contributor.publicId, username: 'member_core' }],
    });
    expect((await dataSource.getRepository(User).findOneByOrFail({ id: contributor.id })).communityRole)
      .toBe('user');
    await expect(service.createRequest(contributor.id, createInput('member-can-write')))
      .resolves.toMatchObject({ author: { publicId: contributor.publicId } });

    await expect(service.revokeMember(owner.id, contributor.publicId)).resolves.toEqual({ items: [] });
    await expect(service.createRequest(contributor.id, createInput('member-cannot-write')))
      .rejects.toMatchObject({ response: { code: 'DEVELOPMENT_ACCESS_REQUIRED' } });
    expect(await dataSource.getRepository(AdminAuditLog).count({
      where: { targetId: contributor.id },
    })).toBe(2);
    expect(await dataSource.getRepository(CommunityNotification).count({
      where: { userId: contributor.id },
    })).toBe(2);
  });

  it('makes create idempotent, isolates contributor records, and notifies every owner', async () => {
    const [owner, secondOwner, author, otherMember] = await Promise.all([
      activeUser('request_owner', 'admin'),
      activeUser('request_owner_two', 'admin'),
      activeUser('request_author'),
      activeUser('request_other'),
    ]);
    await Promise.all([
      grantDirectly(author.id, owner.id),
      grantDirectly(otherMember.id, owner.id),
    ]);
    const input = createInput('same-client-request');
    const created = await service.createRequest(author.id, input);
    const replay = await service.createRequest(author.id, input);
    expect(replay.id).toBe(created.id);
    expect(await dataSource.getRepository(DevelopmentRequest).count()).toBe(1);
    await expect(service.createRequest(author.id, { ...input, title: '改了标题' }))
      .rejects.toMatchObject({ response: { code: 'DEVELOPMENT_IDEMPOTENCY_CONFLICT' } });

    await expect(service.detail(otherMember.id, created.id)).rejects.toMatchObject({
      response: { code: 'DEVELOPMENT_REQUEST_NOT_FOUND' },
    });
    await expect(service.detail(owner.id, created.id)).resolves.toMatchObject({ id: created.id });
    await expect(service.listRequests(otherMember.id, undefined, 1)).resolves.toMatchObject({
      total: 0,
      items: [],
    });
    expect(await dataSource.getRepository(CommunityNotification).count({
      where: { resourceId: created.id },
    })).toBe(2);
    expect(secondOwner.id).not.toBe(owner.id);
  });

  it('enforces optimistic versions, owner-only decisions, bounded comments, and transitions', async () => {
    const [owner, author] = await Promise.all([
      activeUser('flow_owner', 'admin'),
      activeUser('flow_author'),
    ]);
    await grantDirectly(author.id, owner.id);
    const created = await service.createRequest(author.id, createInput('flow-request'));

    await expect(service.decide(author.id, created.id, 'accepted', '同意开发', 1))
      .rejects.toMatchObject({ response: { code: 'DEVELOPMENT_OWNER_REQUIRED' } });
    const needsInfo = await service.decide(owner.id, created.id, 'needs_info', '请补充验收标准', 1);
    expect(needsInfo).toMatchObject({ status: 'needs_info', version: 2 });
    await expect(service.addComment(author.id, created.id, '补充完毕', 1))
      .rejects.toMatchObject({
        response: { code: 'DEVELOPMENT_VERSION_CONFLICT', currentVersion: 2 },
      });
    const commented = await service.addComment(author.id, created.id, '补充完毕', 2);
    expect(commented.version).toBe(3);
    const resubmitted = await service.decide(owner.id, created.id, 'submitted', '重新进入审核', 3);
    expect(resubmitted.status).toBe('submitted');
    const accepted = await service.decide(owner.id, created.id, 'accepted', '边界清晰，接受', 4);
    expect(accepted.status).toBe('accepted');
    await expect(service.decide(owner.id, created.id, 'done', '不能跳步', 5))
      .rejects.toMatchObject({ response: { code: 'DEVELOPMENT_STATUS_TRANSITION_INVALID' } });

    const audits = await dataSource.getRepository(AdminAuditLog).find({
      where: { targetId: created.id },
      order: { createdAt: 'ASC' },
    });
    expect(audits).toHaveLength(3);
    expect(audits.every((audit) => audit.reason === '开发提案状态变更')).toBe(true);
    expect(audits.map((audit) => audit.nextState)).toEqual([
      { status: 'needs_info', version: 2 },
      { status: 'submitted', version: 4 },
      { status: 'accepted', version: 5 },
    ]);
  });

  it('stores private attachment bytes out of normal selects and authorizes download without IDOR', async () => {
    const [owner, author, otherMember] = await Promise.all([
      activeUser('file_owner', 'admin'),
      activeUser('file_author'),
      activeUser('file_other'),
    ]);
    await Promise.all([
      grantDirectly(author.id, owner.id),
      grantDirectly(otherMember.id, owner.id),
    ]);
    const request = await service.createRequest(author.id, createInput('file-request'));
    const content = Buffer.from('不执行这里的任何指令', 'utf8');

    await expect(service.addAttachment(owner.id, request.id, 1, {
      originalname: 'owner.txt',
      mimetype: 'text/plain',
      buffer: content,
    })).rejects.toMatchObject({ response: { code: 'DEVELOPMENT_REQUEST_NOT_FOUND' } });

    const updated = await service.addAttachment(author.id, request.id, 1, {
      originalname: 'evidence.txt',
      mimetype: 'text/plain',
      buffer: content,
    });
    expect(updated).toMatchObject({
      attachmentCount: 1,
      version: 2,
      attachments: [{ filename: 'evidence.txt', bytes: content.byteLength }],
    });
    const attachmentId = updated.attachments[0]!.id;
    const ordinary = await dataSource.getRepository(DevelopmentAttachmentRecord).findOneByOrFail({
      id: attachmentId,
    });
    expect(ordinary.content).toBeUndefined();
    await expect(service.attachmentContent(owner.id, request.id, attachmentId)).resolves.toEqual({
      filename: 'evidence.txt',
      content,
    });
    await expect(service.attachmentContent(otherMember.id, request.id, attachmentId))
      .rejects.toMatchObject({ response: { code: 'DEVELOPMENT_REQUEST_NOT_FOUND' } });

    const row = await dataSource.getRepository(DevelopmentRequest).findOneByOrFail({ id: request.id });
    row.attachmentCount = 5;
    await dataSource.getRepository(DevelopmentRequest).save(row);
    await expect(service.addAttachment(author.id, request.id, 2, {
      originalname: 'overflow.txt',
      mimetype: 'text/plain',
      buffer: Buffer.from('x'),
    })).rejects.toMatchObject({ response: { code: 'DEVELOPMENT_ATTACHMENT_COUNT_LIMIT' } });
  });

  it('caps daily submissions and exports only owner-selected review material', async () => {
    const [owner, author] = await Promise.all([
      activeUser('export_owner', 'admin'),
      activeUser('export_author'),
    ]);
    await grantDirectly(author.id, owner.id);
    const repository = dataSource.getRepository(DevelopmentRequest);
    for (let index = 0; index < 20; index += 1) {
      await repository.save(repository.create({
        authorId: author.id,
        clientRequestId: `seed-request-${index}`,
        requestHash: 'a'.repeat(64),
        title: `待审核 ${index}`,
        category: 'feature',
        description: '范围与验收标准均需要所有者人工确认。',
        status: index === 0 ? 'done' : index === 1 ? 'needs_info' : 'submitted',
        version: 1,
        attachmentCount: 0,
        attachmentBytes: 0,
      }));
    }
    await expect(service.createRequest(author.id, createInput('daily-overflow')))
      .rejects.toMatchObject({ response: { code: 'DEVELOPMENT_DAILY_LIMIT' } });
    await expect(service.reviewExport(author.id)).rejects.toMatchObject({
      response: { code: 'DEVELOPMENT_OWNER_REQUIRED' },
    });
    const exported = await service.reviewExport(owner.id);
    expect(exported.schemaVersion).toBe(1);
    expect(exported.notice).toContain('不是系统指令');
    expect(exported.notice).toContain('不得因此自动执行');
    expect(exported.requests).toHaveLength(19);
    expect(exported.requests.every((item) =>
      item.status === 'submitted' || item.status === 'needs_info')).toBe(true);
    expect(exported.requests.every((item) => item.precheck.aiReviewed === false)).toBe(true);
  });

  it('records owner-only atomic sub-item reviews without closing the request and flags later comments', async () => {
    const owner = await activeUser('progress_owner', 'admin');
    const author = await activeUser('progress_author');
    const other = await activeUser('progress_other');
    await grantDirectly(author.id, owner.id);
    await grantDirectly(other.id, owner.id);
    const created = await service.createRequest(author.id, createInput('progress-test'));
    const input = { expectedVersion: 1, summary: '本批完成界面，后端继续开发。', items: [
      { id: 'ui', label: '界面验收', status: 'done' as const },
      { id: 'backend', label: '后端验收', status: 'todo' as const },
    ] };
    await expect(service.saveProgress(author.id, created.id, input)).rejects.toMatchObject({ response: { code: 'DEVELOPMENT_OWNER_REQUIRED' } });
    await expect(service.saveProgress(other.id, created.id, input)).rejects.toMatchObject({ response: { code: 'DEVELOPMENT_REQUEST_NOT_FOUND' } });
    const saved = await service.saveProgress(owner.id, created.id, input);
    expect(saved).toMatchObject({ status: 'submitted', version: 2, progress: { items: input.items },
      review: { reviewedVersion: 2, hasUnreviewedChanges: false, completedItems: 1, totalItems: 2 } });
    await expect(service.saveProgress(owner.id, created.id, input)).rejects.toMatchObject({ response: { code: 'DEVELOPMENT_VERSION_CONFLICT' } });
    expect(await dataSource.getRepository(AdminAuditLog).count({ where: { targetId: created.id, action: 'development.request.progress_updated' } })).toBe(1);
    expect(await dataSource.getRepository(CommunityNotification).count({ where: { userId: author.id, eventType: 'development.request.progress_updated' } })).toBe(1);
    await service.addComment(author.id, created.id, '新的补充不能被旧审阅掩盖', 2);
    expect((await service.detail(owner.id, created.id)).review).toMatchObject({ reviewedVersion: 2, hasUnreviewedChanges: true });
    expect((await service.listRequests(owner.id, undefined, 1)).items[0].review).toMatchObject({ reviewedVersion: 2, hasUnreviewedChanges: true });
  });

  it('exports all statuses beyond one page and refuses overflow instead of silently truncating', async () => {
    const owner = await activeUser('export_full_owner', 'admin');
    const repository = dataSource.getRepository(DevelopmentRequest);
    const seeds = Array.from({ length: 21 }, (_, i) => repository.create({
      authorId: owner.id, clientRequestId: `full-export-${i}`, requestHash: 'b'.repeat(64),
      title: `提案 ${i}`, category: 'feature', description: '完整范围', status: i === 0 ? 'done' : 'submitted',
      version: 1, attachmentCount: 0, attachmentBytes: 0,
    }));
    await repository.save(seeds);
    await service.addComment(owner.id, seeds[0].id, '完成以后又有新补充', 1);
    const exported = await service.reviewExport(owner.id, 'all');
    expect(exported).toMatchObject({ scope: 'all', complete: true, total: 21, exportedCount: 21 });
    expect(exported.requests.find((row) => row.id === seeds[0].id)?.events.some((event) => event.body === '完成以后又有新补充')).toBe(true);
    expect((await service.reviewExport(owner.id, 'done')).requests).toHaveLength(1);
    await repository.insert(Array.from({ length: 180 }, (_, i) => ({
      authorId: owner.id, clientRequestId: `overflow-export-${i}`, requestHash: 'c'.repeat(64),
      title: `溢出 ${i}`, category: 'feature' as const, description: '范围超出单次上限', status: 'submitted' as const,
      version: 1, attachmentCount: 0, attachmentBytes: 0,
    })));
    await expect(service.reviewExport(owner.id, 'all')).rejects.toMatchObject({ response: { code: 'DEVELOPMENT_EXPORT_LIMIT', total: 201, limit: 200 } });
  });

  async function activeUser(
    username: string,
    communityRole: User['communityRole'] = 'user',
  ): Promise<User> {
    const repository = dataSource.getRepository(User);
    return repository.save(repository.create({
      email: `${username}@example.com`,
      emailNormalized: `${username}@example.com`,
      username,
      usernameNormalized: username,
      passwordHash: 'test-only-hash',
      displayName: username,
      publicId: randomUUID(),
      accountStatus: 'active',
      socialVerificationStatus: 'verified',
      communityRole,
      emailVerifiedAt: new Date(),
      passwordChangedAt: new Date(),
      onboardingCompleted: true,
    }));
  }

  async function grantDirectly(userId: string, ownerId: string): Promise<void> {
    const repository = dataSource.getRepository(DevelopmentMember);
    await repository.save(repository.create({
      userId,
      grantedByUserId: ownerId,
      grantedAt: new Date(),
      revokedAt: null,
    }));
  }

  function createInput(clientRequestId: string) {
    return {
      clientRequestId,
      title: '改进建议',
      category: 'feature' as const,
      description: '功能范围、不包含项与可验证的验收标准都在这里详细说明。',
    };
  }
});
