import type { QueryRunner } from 'typeorm';
import { AddWordFrontV3ArcadeGames1700000000039 } from './1700000000039-AddWordFrontV3ArcadeGames';

describe('AddWordFrontV3ArcadeGames1700000000039', () => {
  it('extends only two arcade checks and refuses to remove used v3 results', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const runner = { query } as unknown as QueryRunner;
    const migration = new AddWordFrontV3ArcadeGames1700000000039();
    await migration.up(runner);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain("'word_story_v3', 'word_endless_v3'");
    expect(query.mock.calls[1][0]).toContain("'word_story_v3', 'word_endless_v3'");
    query.mockReset().mockResolvedValueOnce([{ count: 1 }]);
    await expect(migration.down(runner)).rejects.toThrow('contains results');
    expect(query).toHaveBeenCalledTimes(1);
    query.mockReset().mockResolvedValue([{ count: 0 }]);
    await migration.down(runner);
    expect(query).toHaveBeenCalledTimes(4);
    expect(query.mock.calls[2][0]).toContain("'word_story_v2', 'word_endless_v2'");
  });
});
