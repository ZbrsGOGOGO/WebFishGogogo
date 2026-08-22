import type { QueryRunner } from 'typeorm';

import { HardenAuthOperations1700000000011 } from './1700000000011-HardenAuthOperations';

describe('HardenAuthOperations migration', () => {
  it('creates cumulative verification guards, distributed limits, capacity and encrypted email queue', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await new HardenAuthOperations1700000000011().up({
      query,
    } as unknown as QueryRunner);

    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('"resend_count"');
    expect(sql).toContain('"total_attempts"');
    expect(sql).toContain('CREATE TABLE "auth_rate_limit_buckets"');
    expect(sql).toContain('CREATE TABLE "community_capacity_guards"');
    expect(sql).toContain('CREATE TABLE "auth_email_outbox"');
    expect(sql).toContain('"ciphertext"');
    expect(sql).not.toContain('verification_code');
  });

  it('drops the new auth structures before removing verification columns', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await new HardenAuthOperations1700000000011().down({
      query,
    } as unknown as QueryRunner);

    expect(query.mock.calls[0][0]).toContain('auth_email_outbox');
    expect(query.mock.calls[1][0]).toContain('community_capacity_guards');
    expect(query.mock.calls[2][0]).toContain('auth_rate_limit_buckets');
    expect(query.mock.calls.at(-1)?.[0]).toContain('resend_count');
  });
});
