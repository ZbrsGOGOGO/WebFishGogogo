import { randomUUID } from 'node:crypto';

import type { DataSource, QueryRunner } from 'typeorm';

import { User } from '../entities/user.entity';
import { createLocalDevDataSource } from '../local-dev-datasource';
import { AddOfficeBattle1700000000012 } from './1700000000012-AddOfficeBattle';

describe('AddOfficeBattle1700000000012', () => {
  let dataSource: DataSource;

  beforeEach(async () => {
    dataSource = await createLocalDevDataSource();
  });

  afterEach(async () => {
    if (dataSource.isInitialized) await dataSource.destroy();
  });

  it('round-trips in pg-mem and preserves battle asset referential constraints', async () => {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    try {
      const user = await dataSource.getRepository(User).save(
        dataSource.getRepository(User).create({
          email: 'battle-migration@example.com',
          emailNormalized: 'battle-migration@example.com',
          passwordHash: 'unused',
          displayName: 'Battle Migration',
          publicId: randomUUID(),
          accountStatus: 'active',
          socialVerificationStatus: 'verified',
          communityRole: 'user',
          emailVerifiedAt: new Date(),
          passwordChangedAt: new Date(),
          onboardingCompleted: true,
        }),
      );
      await runner.query(
        `INSERT INTO "office_battle_profiles"
          ("user_id", "profession", "service_date") VALUES ($1, 'developer', '2026-08-22')`,
        [user.id],
      );
      await expect(
        runner.query(
          `INSERT INTO "office_battle_asset_ledger"
            ("user_id", "battle_id", "asset_type", "delta", "balance_after", "reason", "idempotency_key")
           VALUES ($1, $2, 'energy', -1, 11, 'test', 'battle-migration-test')`,
          [user.id, randomUUID()],
        ),
      ).rejects.toThrow();

      await new AddOfficeBattle1700000000012().down(runner);
      expect(await tableExists(runner, 'office_battle_records')).toBe(false);
      expect(await tableExists(runner, 'office_battle_profiles')).toBe(false);
    } finally {
      await runner.release();
    }
  });
});

async function tableExists(runner: QueryRunner, table: string): Promise<boolean> {
  const rows = (await runner.query(
    `SELECT table_name FROM information_schema.tables WHERE table_name = $1`,
    [table],
  )) as unknown[];
  return rows.length > 0;
}
