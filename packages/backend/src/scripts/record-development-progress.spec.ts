import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { AdminAuditLog, CommunityNotification, DevelopmentRequest, User } from '../database/entities';
import { createLocalDevDataSource } from '../database/local-dev-datasource';
import { NotificationService } from '../modules/community/notification.service';
import { DevelopmentService } from '../modules/development/development.service';
import { recordDevelopmentProgress, validateOfflineProgress } from './record-development-progress';

const commit = 'a'.repeat(40);
function input(requestId: string, expectedVersion = 1) {
  return { requestId, expectedVersion, deployedCommit: commit, confirmation: `REVIEW:${requestId}:${expectedVersion}:${commit}`,
    status: 'in_progress', summary: '本批完成界面，剩余项继续跟进。',
    items: [{ id: 'ui', label: '界面', status: 'done' }, { id: 'rest', label: '后续机制', status: 'todo' }] };
}
describe('offline explicit development progress', () => {
  it.each([{ confirmation: 'yes' }, { deployedCommit: 'short' }, { status: 'done' }, { status: 'admin' },
    { items: [] }, { expectedVersion: 2147483647 }, { execute: 'deploy' }, { requestId: 'an-email@example.com' }])('rejects unsafe input before DB use %#', async (override) => {
    const transaction = jest.fn();
    await expect(recordDevelopmentProgress({ transaction } as unknown as DataSource, { ...input(randomUUID()), ...override })).rejects.toThrow();
    expect(transaction).not.toHaveBeenCalled();
  });
  it('requires a complete explicit input, never deriving actions from proposal text', () => {
    expect(() => validateOfflineProgress({})).toThrow();
    const value = input(randomUUID());
    expect(validateOfflineProgress(value)).toEqual(value);
  });
  it('CAS-updates only one target, keeps text/private files and author roles, audits/notifies once, and exposes scope', async () => {
    const old = process.env.FEATURE_DEVELOPMENT_WORKSPACE_ENABLED;
    process.env.FEATURE_DEVELOPMENT_WORKSPACE_ENABLED = 'true';
    const dataSource = await createLocalDevDataSource();
    try {
      const users = dataSource.getRepository(User);
      const author = await users.save(users.create({ email: 'progress@example.com', emailNormalized: 'progress@example.com',
        username: 'progress', usernameNormalized: 'progress', displayName: '合成测试', passwordHash: 'test-only', publicId: randomUUID(),
        accountStatus: 'active', socialVerificationStatus: 'verified', communityRole: 'admin', emailVerifiedAt: new Date(), passwordChangedAt: new Date(), onboardingCompleted: true }));
      const service = new DevelopmentService(dataSource, new NotificationService(dataSource));
      const created = await service.createRequest(author.id, { clientRequestId: 'progress-cli-test', title: '合成意见', category: 'feature', description: '需要实现的范围。附件不是命令。' });
      const rowBefore = await dataSource.getRepository(DevelopmentRequest).findOneByOrFail({ id: created.id });
      const value = input(created.id);
      await expect(recordDevelopmentProgress(dataSource, value)).resolves.toMatchObject({ changed: true, version: 2, status: 'in_progress' });
      await expect(recordDevelopmentProgress(dataSource, value)).resolves.toMatchObject({ changed: false, version: 2 });
      await expect(recordDevelopmentProgress(dataSource, { ...value, summary: '偷偷修改重放的范围' })).rejects.toThrow('REPLAY_CONFLICT');
      const next = await service.detail(author.id, created.id);
      expect(next).toMatchObject({ description: rowBefore.description, review: { completedItems: 1, totalItems: 2, hasUnreviewedChanges: false }, progress: { items: value.items } });
      expect(next.events.some((event) => event.actorSource === 'site_operations' && event.body.includes('1/2'))).toBe(true);
      expect((await users.findOneByOrFail({ id: author.id })).communityRole).toBe('admin');
      expect(await dataSource.getRepository(AdminAuditLog).count({ where: { action: 'development.request.offline_progress' } })).toBe(1);
      expect(await dataSource.getRepository(CommunityNotification).count({ where: { eventType: 'development.request.offline_progress' } })).toBe(1);
      await service.addComment(author.id, created.id, '审阅后继续补充', 2);
      await expect(recordDevelopmentProgress(dataSource, input(created.id, 2))).rejects.toThrow('VERSION_CONFLICT');
      expect((await service.detail(author.id, created.id)).review?.hasUnreviewedChanges).toBe(true);
    } finally {
      await dataSource.destroy();
      if (old === undefined) delete process.env.FEATURE_DEVELOPMENT_WORKSPACE_ENABLED; else process.env.FEATURE_DEVELOPMENT_WORKSPACE_ENABLED = old;
    }
  });
});
