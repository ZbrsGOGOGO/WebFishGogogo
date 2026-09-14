import type { QueryRunner } from 'typeorm';
import { AddWordFrontV2ArcadeGames1700000000038 } from './1700000000038-AddWordFrontV2ArcadeGames';

describe('AddWordFrontV2ArcadeGames1700000000038', () => {
  it('extends only two arcade key checks and refuses to discard a used v2 key', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const runner = { query } as unknown as QueryRunner;
    const migration = new AddWordFrontV2ArcadeGames1700000000038();
    await migration.up(runner);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain("'word_story_v2', 'word_endless_v2'");
    expect(query.mock.calls[1][0]).toContain("'word_story_v2', 'word_endless_v2'");
    query.mockReset().mockResolvedValueOnce([{ count: 1 }]);
    await expect(migration.down(runner)).rejects.toThrow('contains results');
    expect(query).toHaveBeenCalledTimes(1);
    query.mockReset().mockResolvedValue([{ count: 0 }]);
    await migration.down(runner);
    expect(query).toHaveBeenCalledTimes(4);
    expect(query.mock.calls[2][0]).toContain("'word_story', 'word_endless'" );
  });
});
