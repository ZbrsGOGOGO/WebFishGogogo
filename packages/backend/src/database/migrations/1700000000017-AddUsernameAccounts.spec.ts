import type { DataSource } from 'typeorm';

import { createLocalDevDataSource } from '../local-dev-datasource';
import { AddUsernameAccounts1700000000017 } from './1700000000017-AddUsernameAccounts';

describe('AddUsernameAccounts1700000000017', () => {
  let dataSource: DataSource;

  beforeEach(async () => {
    dataSource = await createLocalDevDataSource();
  });

  afterEach(async () => {
    if (dataSource.isInitialized) await dataSource.destroy();
  });

  it('round-trips the username columns and unique login index', async () => {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    const migration = new AddUsernameAccounts1700000000017();
    try {
      await expect(migration.up(runner)).rejects.toThrow(/already exists/i);
      await migration.down(runner);
      await migration.up(runner);
      await expect(migration.up(runner)).rejects.toThrow(/already exists/i);
    } finally {
      await runner.release();
    }
  });
});
