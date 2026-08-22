import type { DataSource } from 'typeorm';

import { createLocalDevDataSource } from '../local-dev-datasource';
import { AddCommunityOperationalIndexes1700000000016 } from './1700000000016-AddCommunityOperationalIndexes';

describe('AddCommunityOperationalIndexes1700000000016', () => {
  let dataSource: DataSource;

  beforeEach(async () => {
    dataSource = await createLocalDevDataSource();
  });

  afterEach(async () => {
    if (dataSource.isInitialized) await dataSource.destroy();
  });

  it('round-trips the query-backed operational indexes in pg-mem', async () => {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    const migration = new AddCommunityOperationalIndexes1700000000016();
    try {
      // pg-mem does not expose pg_indexes and its TypeORM table-introspection
      // catalog is incomplete. A duplicate up proves the registered migration
      // already created its first operational index.
      await expect(migration.up(runner)).rejects.toThrow(/already exists/i);
      await migration.down(runner);
      await migration.up(runner);
      await expect(migration.up(runner)).rejects.toThrow(/already exists/i);
    } finally {
      await runner.release();
    }
  });
});
