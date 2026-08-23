import type { DataSource } from 'typeorm';

import { createLocalDevDataSource } from '../local-dev-datasource';
import { AddGuildBoss1700000000021 } from './1700000000021-AddGuildBoss';

describe('AddGuildBoss1700000000021', () => {
  let dataSource: DataSource;

  beforeEach(async () => { dataSource = await createLocalDevDataSource(); });
  afterEach(async () => { if (dataSource.isInitialized) await dataSource.destroy(); });

  it('round-trips the daily run and contribution tables', async () => {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    const migration = new AddGuildBoss1700000000021();
    try {
      await expect(runner.hasTable('guild_boss_runs')).resolves.toBe(true);
      await expect(runner.hasTable('guild_boss_contributions')).resolves.toBe(true);
      await expect(migration.up(runner)).rejects.toThrow(/already exists/i);
      await migration.down(runner);
      await expect(runner.hasTable('guild_boss_runs')).resolves.toBe(false);
      await expect(runner.hasTable('guild_boss_contributions')).resolves.toBe(false);
    } finally {
      await runner.release();
    }
  });
});
