import type { AdminAuditLog } from '../../database/entities/admin-audit-log.entity';
import { developmentProgressInput } from './development-validation';
import { DEVELOPMENT_OFFLINE_PROGRESS_ACTION, developmentProgressView } from './development-progress';

const items = [{ id: 'one', label: '实际验收项', status: 'done' }, { id: 'two', label: '剩余项', status: 'todo' }];
function audit(overrides: Partial<AdminAuditLog> = {}): AdminAuditLog {
  return { id: 'audit', targetType: 'development_request', action: DEVELOPMENT_OFFLINE_PROGRESS_ACTION,
    actorRole: 'system', actorId: null, createdAt: new Date('2026-09-09T00:00:00Z'),
    nextState: { version: 3, deployedCommit: 'a'.repeat(40), summary: '如实逐项核验', items }, ...overrides } as AdminAuditLog;
}
describe('development progress projection', () => {
  it('projects only audited progress and flags newer versions', () => {
    expect(developmentProgressView(4, [audit()])).toMatchObject({
      progress: { reviewedVersion: 3, items }, review: { reviewedVersion: 3, hasUnreviewedChanges: true, completedItems: 1, totalItems: 2 },
    });
  });
  it.each([
    { actorRole: 'user' }, { actorId: 'impersonated' }, { action: 'arbitrary.action' },
    { targetType: 'user' }, { nextState: { version: 5, deployedCommit: 'a'.repeat(40), summary: 'future', items } },
    { nextState: { version: 3, deployedCommit: 'invalid', summary: 'bad SHA', items } },
    { nextState: { version: 3, deployedCommit: 'a'.repeat(40), summary: 'corrupt', items: [] } },
    { action: 'development.request.offline_completed', nextState: { version: 3, deployedCommit: 'a'.repeat(40), status: 'done' } },
  ])('does not acknowledge a corrupt/untrusted audit %#', (overrides) => {
    expect(developmentProgressView(4, [audit(overrides as Partial<AdminAuditLog>)])).toMatchObject({ progress: null, review: { reviewedVersion: 0, hasUnreviewedChanges: true } });
  });
  it('rejects duplicate keys, extra directives, unknown states, blank labels and oversized lists', () => {
    const base = { expectedVersion: 1, summary: '完成范围', items };
    for (const invalid of [
      { ...base, execute: 'deploy' }, { ...base, items: [...items, items[0]] },
      { ...base, items: [{ id: 'one', label: '', status: 'done' }] },
      { ...base, items: [{ id: 'one', label: 'valid', status: 'approved' }] },
      { ...base, items: Array.from({ length: 41 }, (_, i) => ({ id: String(i), label: 'valid', status: 'todo' })) },
    ]) expect(() => developmentProgressInput(invalid)).toThrow();
    expect(developmentProgressInput(base).items).toEqual(items);
  });
});
