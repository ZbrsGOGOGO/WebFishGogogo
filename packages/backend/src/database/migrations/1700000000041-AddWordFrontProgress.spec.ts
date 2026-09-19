import type { QueryRunner } from 'typeorm';
import { AddWordFrontProgress1700000000041 } from './1700000000041-AddWordFrontProgress';

describe('AddWordFrontProgress1700000000041', () => {
  it('creates bounded, account-owned progression without touching the wallet', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const migration = new AddWordFrontProgress1700000000041();
    await migration.up({ query } as unknown as QueryRunner);
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('word_front_progress');
    expect(sql).toContain('ON DELETE CASCADE');
    expect(sql).toContain('daily_earned" BETWEEN 0 AND 100');
    expect(sql).toContain('jsonb_typeof');
    expect(sql).not.toContain('jsonb_array_length');
    expect(sql).not.toMatch(/wallet|office_coin/i);
  });

  it('has an explicit reversible schema-only down step', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await new AddWordFrontProgress1700000000041().down({ query } as unknown as QueryRunner);
    expect(query).toHaveBeenCalledWith('DROP TABLE "word_front_progress"');
  });
});
