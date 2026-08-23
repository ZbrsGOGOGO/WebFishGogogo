import type { DataSource } from 'typeorm';

import { createLocalDevDataSource } from '../local-dev-datasource';
import { AddDailyHotNewsAndInviteCoin1700000000022 } from './1700000000022-AddDailyHotNewsAndInviteCoin';

describe('AddDailyHotNewsAndInviteCoin1700000000022', () => {
  let dataSource: DataSource;

  beforeEach(async () => { dataSource = await createLocalDevDataSource(); });
  afterEach(async () => { if (dataSource.isInitialized) await dataSource.destroy(); });

  it('round-trips daily headline tables and the invite currency constraint', async () => {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    const migration = new AddDailyHotNewsAndInviteCoin1700000000022();
    try {
      await expect(runner.hasTable('hot_news_headlines')).resolves.toBe(true);
      await expect(runner.hasTable('hot_news_refresh_runs')).resolves.toBe(true);
      await expect(migration.up(runner)).rejects.toThrow(/already exists|constraint/i);
      await migration.down(runner);
      await expect(runner.hasTable('hot_news_headlines')).resolves.toBe(false);
      await expect(runner.hasTable('hot_news_refresh_runs')).resolves.toBe(false);
    } finally {
      await runner.release();
    }
  });
});
