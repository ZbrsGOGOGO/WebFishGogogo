import type { QueryRunner } from 'typeorm';

import { AddZhesiArcadeGame1700000000025 } from './1700000000025-AddZhesiArcadeGame';

describe('AddZhesiArcadeGame1700000000025', () => {
  it('extends both game-key checks and restores the previous checks on rollback', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const runner = { query } as unknown as QueryRunner;
    const migration = new AddZhesiArcadeGame1700000000025();

    await migration.up(runner);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain('ALTER TABLE "arcade_game_runs"');
    expect(query.mock.calls[0][0]).toContain("CHECK (\"game_key\" IN ('tetris', 'tank', 'zhesi'))");
    expect(query.mock.calls[1][0]).toContain('ALTER TABLE "arcade_best_scores"');
    expect(query.mock.calls[1][0]).toContain("CHECK (\"game_key\" IN ('tetris', 'tank', 'zhesi'))");

    query.mockClear();
    await migration.down(runner);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain('ALTER TABLE "arcade_best_scores"');
    expect(query.mock.calls[0][0]).toContain("CHECK (\"game_key\" IN ('tetris', 'tank'))");
    expect(query.mock.calls[1][0]).toContain('ALTER TABLE "arcade_game_runs"');
    expect(query.mock.calls[1][0]).toContain("CHECK (\"game_key\" IN ('tetris', 'tank'))");
  });
});
