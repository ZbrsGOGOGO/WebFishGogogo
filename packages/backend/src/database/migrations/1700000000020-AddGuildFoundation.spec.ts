import type { DataSource } from 'typeorm';

import { createLocalDevDataSource } from '../local-dev-datasource';
import { AddGuildFoundation1700000000020 } from './1700000000020-AddGuildFoundation';
import { AddGuildBoss1700000000021 } from './1700000000021-AddGuildBoss';
import { AddOfficeHub1700000000035 } from './1700000000035-AddOfficeHub';

describe('AddGuildFoundation1700000000020', () => {
  let dataSource: DataSource;

  beforeEach(async () => { dataSource = await createLocalDevDataSource(); });
  afterEach(async () => { if (dataSource.isInitialized) await dataSource.destroy(); });

  it('round-trips guild treasury, membership and immutable ledger tables', async () => {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    const migration = new AddGuildFoundation1700000000020();
    try {
      await expect(migration.up(runner)).rejects.toThrow(/already exists/i);
      await new AddOfficeHub1700000000035().down(runner);
      await new AddGuildBoss1700000000021().down(runner);
      await migration.down(runner);
      await expect(runner.hasTable('guilds')).resolves.toBe(false);
      await expect(runner.hasTable('guild_members')).resolves.toBe(false);
      await expect(runner.hasTable('guild_ledger')).resolves.toBe(false);
    } finally {
      await runner.release();
    }
  });
});
