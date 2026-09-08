import type { DataSource } from 'typeorm';

import { createLocalDevDataSource } from '../local-dev-datasource';
import { AddTrendingBoardSnapshots1700000000028 } from './1700000000028-AddTrendingBoardSnapshots';

describe('AddTrendingBoardSnapshots1700000000028', () => {
  let dataSource: DataSource;

  beforeEach(async () => { dataSource = await createLocalDevDataSource(); });
  afterEach(async () => { if (dataSource.isInitialized) await dataSource.destroy(); });

  it('round-trips the isolated per-board snapshot tables', async () => {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    const migration = new AddTrendingBoardSnapshots1700000000028();
    try {
      await expect(runner.hasTable('trending_news_board_runs')).resolves.toBe(true);
      await expect(runner.hasTable('trending_news_items')).resolves.toBe(true);
      await expect(migration.up(runner)).rejects.toThrow(/already exists/i);
      await migration.down(runner);
      await expect(runner.hasTable('trending_news_board_runs')).resolves.toBe(false);
      await expect(runner.hasTable('trending_news_items')).resolves.toBe(false);
    } finally {
      await runner.release();
    }
  });
});
