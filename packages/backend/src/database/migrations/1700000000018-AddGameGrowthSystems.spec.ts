import type { DataSource } from 'typeorm';

import { createLocalDevDataSource } from '../local-dev-datasource';
import { AddGameGrowthSystems1700000000018 } from './1700000000018-AddGameGrowthSystems';

describe('AddGameGrowthSystems1700000000018', () => {
  let dataSource: DataSource;

  beforeEach(async () => {
    dataSource = await createLocalDevDataSource();
  });

  afterEach(async () => {
    if (dataSource.isInitialized) await dataSource.destroy();
  });

  it('round-trips farm growth and battle skill persistence columns', async () => {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    const migration = new AddGameGrowthSystems1700000000018();
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
