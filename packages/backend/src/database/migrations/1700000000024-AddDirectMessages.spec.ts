import type { DataSource } from 'typeorm';

import { createLocalDevDataSource } from '../local-dev-datasource';
import { AddDirectMessages1700000000024 } from './1700000000024-AddDirectMessages';

describe('AddDirectMessages1700000000024', () => {
  let dataSource: DataSource;

  beforeEach(async () => { dataSource = await createLocalDevDataSource(); });
  afterEach(async () => { if (dataSource.isInitialized) await dataSource.destroy(); });

  it('creates and cleanly removes private conversation data', async () => {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    const migration = new AddDirectMessages1700000000024();
    try {
      await expect(runner.hasTable('chat_direct_conversations')).resolves.toBe(true);
      await expect(runner.hasTable('chat_direct_conversation_members')).resolves.toBe(true);
      await expect(runner.hasTable('chat_direct_messages')).resolves.toBe(true);
      await expect(runner.hasTable('chat_direct_message_reports')).resolves.toBe(true);
      await expect(migration.up(runner)).rejects.toThrow(/already exists|relation/i);
      await migration.down(runner);
      await expect(runner.hasTable('chat_direct_conversations')).resolves.toBe(false);
      await expect(runner.hasTable('chat_direct_conversation_members')).resolves.toBe(false);
      await expect(runner.hasTable('chat_direct_messages')).resolves.toBe(false);
      await expect(runner.hasTable('chat_direct_message_reports')).resolves.toBe(false);
    } finally {
      await runner.release();
    }
  });
});
