import type { QueryRunner } from 'typeorm';

import { HardenCommunityAccounts1700000000008 } from './1700000000008-HardenCommunityAccounts';

describe('HardenCommunityAccounts migration', () => {
  it('fails explicitly before schema mutation on lower(trim(email)) collisions', async () => {
    const query = jest.fn().mockResolvedValueOnce([
      { email: ' Same@Example.com ' },
      { email: 'same@example.com' },
    ]);
    const migration = new HardenCommunityAccounts1700000000008();

    let failure: unknown;
    try {
      await migration.up({ query } as unknown as QueryRunner);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toMatch(
      /EMAIL_NORMALIZATION_COLLISION.*collision-1/,
    );
    expect((failure as Error).message).not.toContain('same@example.com');
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('SELECT "id", "email"');
  });

  it('requires an explicit re-verification migration for any historical account', async () => {
    const query = jest.fn().mockResolvedValueOnce([
      { id: '00000000-0000-4000-8000-000000000001', email: 'legacy@example.com' },
    ]);
    const migration = new HardenCommunityAccounts1700000000008();

    await expect(
      migration.up({ query } as unknown as QueryRunner),
    ).rejects.toThrow(/LEGACY_ACCOUNT_REVIEW_REQUIRED: 1 existing account/);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
