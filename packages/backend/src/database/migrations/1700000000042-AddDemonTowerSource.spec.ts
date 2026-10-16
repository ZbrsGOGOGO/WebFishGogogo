import type { QueryRunner } from 'typeorm';

import { AddDemonTowerSource1700000000042 } from './1700000000042-AddDemonTowerSource';

describe('AddDemonTowerSource1700000000042', () => {
  it('creates an independent bounded source schema without touching the historical tables or wallet', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await new AddDemonTowerSource1700000000042().up({ query } as unknown as QueryRunner);
    const sql = query.mock.calls.map((call) => String(call[0])).join('\n');
    const calls = JSON.stringify(query.mock.calls);
    expect(sql).toContain('demon_tower_source_profiles');
    expect(sql).toContain('demon_tower_source_world_floors');
    expect(sql).toContain('demon_tower_source_commands');
    expect(sql).toContain('ON DELETE CASCADE');
    expect(sql).toContain('jsonb_typeof');
    expect(sql).toContain("CHECK (\"kind\" IN ('damage', 'channel', 'clue'))");
    expect(sql).toContain('"save_count" integer NOT NULL DEFAULT 0 CHECK ("save_count" BETWEEN 0 AND 720)');
    expect(sql).toContain('"save_bytes" bigint NOT NULL DEFAULT 0 CHECK ("save_bytes" BETWEEN 0 AND 67108864)');
    expect(calls).toContain('百战羚王·犼野');
    expect(sql).not.toMatch(/wallet|office_coin/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+"?demon_tower_(?!source_)/i);
  });

  it('drops only an unused seed schema in dependency order', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ userCount: 0, changedWorld: 0, worldCount: 9 }])
      .mockResolvedValue([]);
    await new AddDemonTowerSource1700000000042().down({ query } as unknown as QueryRunner);
    const drops = query.mock.calls.slice(1).map((call) => String(call[0]));
    expect(drops).toHaveLength(5);
    expect(drops[0]).toContain('source_commands');
    expect(drops.at(-1)).toContain('source_profiles');
    expect(drops.every((sql) => /demon_tower_source_/.test(sql))).toBe(true);
  });

  it('refuses rollback once a player or the shared world has changed', async () => {
    const migration = new AddDemonTowerSource1700000000042();
    for (const state of [
      { userCount: 1, changedWorld: 0, worldCount: 9 },
      { userCount: 0, changedWorld: 1, worldCount: 9 },
      { userCount: 0, changedWorld: 0, worldCount: 8 },
    ]) {
      const query = jest.fn().mockResolvedValueOnce([state]);
      await expect(migration.down({ query } as unknown as QueryRunner)).rejects.toThrow('after player or shared-world data exists');
      expect(query).toHaveBeenCalledTimes(1);
    }
  });
});
