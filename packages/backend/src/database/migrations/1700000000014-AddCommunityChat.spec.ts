import type { DataSource, QueryRunner } from 'typeorm';

import { createLocalDevDataSource } from '../local-dev-datasource';
import { AddCommunityChat1700000000014 } from './1700000000014-AddCommunityChat';

describe('AddCommunityChat1700000000014', () => {
  let dataSource: DataSource;

  beforeEach(async () => {
    dataSource = await createLocalDevDataSource();
  });

  afterEach(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('seeds the fixed rooms and round-trips all chat tables in pg-mem', async () => {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    try {
      const rows = (await runner.query(
        'SELECT slug FROM chat_rooms ORDER BY slug',
      )) as Array<{ slug: string }>;
      expect(rows.map((row) => row.slug)).toEqual([
        'developer',
        'general',
        'hr',
        'product',
        'qa',
        'sales',
      ]);

      await new AddCommunityChat1700000000014().down(runner);
      for (const table of [
        'chat_message_reports',
        'chat_message_mentions',
        'chat_messages',
        'chat_socket_tickets',
        'chat_rooms',
      ]) {
        expect(await tableExists(runner, table)).toBe(false);
      }
    } finally {
      await runner.release();
    }
  });
});

async function tableExists(runner: QueryRunner, table: string): Promise<boolean> {
  const rows = (await runner.query(
    'SELECT table_name FROM information_schema.tables WHERE table_name = $1',
    [table],
  )) as unknown[];
  return rows.length > 0;
}
