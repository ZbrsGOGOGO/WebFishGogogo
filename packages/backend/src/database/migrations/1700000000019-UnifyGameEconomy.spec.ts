import type { DataSource } from 'typeorm';

import { createLocalDevDataSource } from '../local-dev-datasource';
import { UnifyGameEconomy1700000000019 } from './1700000000019-UnifyGameEconomy';

describe('UnifyGameEconomy1700000000019', () => {
  let dataSource: DataSource;

  beforeEach(async () => { dataSource = await createLocalDevDataSource(); });
  afterEach(async () => { if (dataSource.isInitialized) await dataSource.destroy(); });

  it('round-trips the level and shared energy constraints in pg-mem', async () => {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    const migration = new UnifyGameEconomy1700000000019();
    try {
      await migration.down(runner);
      await migration.up(runner);
      await expect(migration.up(runner)).resolves.toBeUndefined();
    } finally {
      await runner.release();
    }
  });
});
