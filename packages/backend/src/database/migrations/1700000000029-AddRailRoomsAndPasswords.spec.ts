import type { DataSource } from 'typeorm';
import { createLocalDevDataSource } from '../local-dev-datasource';
import { AddRailRoomsAndPasswords1700000000029 } from './1700000000029-AddRailRoomsAndPasswords';

describe('AddRailRoomsAndPasswords1700000000029', () => {
  let db: DataSource;
  afterEach(async () => { if (db?.isInitialized) await db.destroy(); });
  it('adds only isolated rail tables and a nullable password without rewriting old rooms', async () => {
    db = await createLocalDevDataSource();
    const runner = db.createQueryRunner();
    await runner.connect();
    try {
      expect(await runner.hasColumn('play_rooms', 'password_hash')).toBe(true);
      for (const name of ['rail_rooms', 'rail_room_members', 'rail_commands', 'rail_chat_messages', 'rail_daily_scores', 'rail_daily_awards', 'rail_player_stats']) expect(await runner.hasTable(name)).toBe(true);
      await new AddRailRoomsAndPasswords1700000000029().down(runner);
      expect(await runner.hasTable('rail_rooms')).toBe(false);
      expect(await runner.hasTable('play_rooms')).toBe(true);
      expect(await runner.hasColumn('play_rooms', 'password_hash')).toBe(false);
      // pg-mem retains dropped index names; full down/up is verified on real PostgreSQL separately.
    } finally { await runner.release(); }
  });
});
