import type { DataSource } from 'typeorm';

import { createLocalDevDataSource } from '../local-dev-datasource';
import { AddDevelopmentWorkspace1700000000026 } from './1700000000026-AddDevelopmentWorkspace';

describe('AddDevelopmentWorkspace1700000000026', () => {
  let dataSource: DataSource | undefined;

  beforeEach(async () => {
    dataSource = await createLocalDevDataSource();
  });

  afterEach(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('creates and cleanly removes the private collaboration tables', async () => {
    const runner = dataSource!.createQueryRunner();
    await runner.connect();
    const migration = new AddDevelopmentWorkspace1700000000026();
    try {
      await expect(runner.hasTable('development_members')).resolves.toBe(true);
      await expect(runner.hasTable('development_requests')).resolves.toBe(true);
      await expect(runner.hasTable('development_events')).resolves.toBe(true);
      await expect(runner.hasTable('development_attachments')).resolves.toBe(true);
      await expect(migration.up(runner)).rejects.toThrow(/already exists|relation/i);
      await migration.down(runner);
      await expect(runner.hasTable('development_members')).resolves.toBe(false);
      await expect(runner.hasTable('development_requests')).resolves.toBe(false);
      await expect(runner.hasTable('development_events')).resolves.toBe(false);
      await expect(runner.hasTable('development_attachments')).resolves.toBe(false);
    } finally {
      await runner.release();
    }
  });
});
