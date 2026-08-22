import type { QueryRunner } from 'typeorm';

import { AddAccountSecurityLifecycle1700000000013 } from './1700000000013-AddAccountSecurityLifecycle';

describe('AddAccountSecurityLifecycle migration', () => {
  it('creates only hashed/encrypted security state and durable deletion work', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await new AddAccountSecurityLifecycle1700000000013().up({
      query,
    } as unknown as QueryRunner);
    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('"password_reset_tokens"');
    expect(sql).toContain('"uq_password_reset_tokens_one_unused"');
    expect(sql).toContain('"social_verification_callback_receipts"');
    expect(sql).toContain('"account_deletion_requests"');
    expect(sql).toContain('"reason_ciphertext"');
    expect(sql).not.toMatch(/legal_name|document_number|identity_photo/i);
  });

  it('drops dependent security tables in reverse order', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await new AddAccountSecurityLifecycle1700000000013().down({
      query,
    } as unknown as QueryRunner);
    expect(query.mock.calls[0][0]).toContain('account_deletion_requests');
    expect(query.mock.calls.at(-1)?.[0]).toContain('password_reset_tokens');
  });
});
