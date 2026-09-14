import type { QueryRunner } from 'typeorm';

import { AddWordFrontArcadeGames1700000000037 } from './1700000000037-AddWordFrontArcadeGames';

describe('AddWordFrontArcadeGames1700000000037', () => {
  it('extends both checks and refuses a data-losing rollback', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const runner = { query } as unknown as QueryRunner;
    const migration = new AddWordFrontArcadeGames1700000000037();

    await migration.up(runner);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain("'word_story', 'word_endless'");
    expect(query.mock.calls[1][0]).toContain("'word_story', 'word_endless'");

    query.mockReset().mockResolvedValueOnce([{ count: 1 }]);
    await expect(migration.down(runner)).rejects.toThrow('contains results');
    expect(query).toHaveBeenCalledTimes(1);

    query.mockReset().mockResolvedValue([{ count: 0 }]);
    await migration.down(runner);
    expect(query).toHaveBeenCalledTimes(4);
    expect(query.mock.calls[2][0]).toContain("CHECK (\"game_key\" IN ('tetris', 'tank', 'zhesi'))");
  });
});
