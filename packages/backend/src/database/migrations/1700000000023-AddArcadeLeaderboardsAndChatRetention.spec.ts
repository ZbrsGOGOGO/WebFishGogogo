import type { DataSource } from 'typeorm';

import { createLocalDevDataSource } from '../local-dev-datasource';
import { AddArcadeLeaderboardsAndChatRetention1700000000023 } from './1700000000023-AddArcadeLeaderboardsAndChatRetention';

describe('AddArcadeLeaderboardsAndChatRetention1700000000023', () => {
  let dataSource: DataSource;

  beforeEach(async () => { dataSource = await createLocalDevDataSource(); });
  afterEach(async () => { if (dataSource.isInitialized) await dataSource.destroy(); });

  it('creates and cleanly removes server-backed arcade tables', async () => {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    const migration = new AddArcadeLeaderboardsAndChatRetention1700000000023();
    try {
      await expect(runner.hasTable('arcade_game_runs')).resolves.toBe(true);
      await expect(runner.hasTable('arcade_best_scores')).resolves.toBe(true);
      await expect(migration.up(runner)).rejects.toThrow(/already exists|relation/i);
      await migration.down(runner);
      await expect(runner.hasTable('arcade_game_runs')).resolves.toBe(false);
      await expect(runner.hasTable('arcade_best_scores')).resolves.toBe(false);
    } finally {
      await runner.release();
    }
  });
});
