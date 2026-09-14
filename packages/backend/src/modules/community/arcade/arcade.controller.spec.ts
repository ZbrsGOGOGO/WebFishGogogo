import { BadRequestException } from '@nestjs/common';

import { ArcadeController } from './arcade.controller';
import type { ArcadeService } from './arcade.service';

describe('ArcadeController game keys', () => {
  it('accepts zhesi for starting runs and reading its leaderboard', async () => {
    const arcade = {
      startRun: jest.fn().mockResolvedValue({ runId: 'run-1' }),
      leaderboard: jest.fn().mockResolvedValue({ gameKey: 'zhesi', items: [] }),
    } as unknown as ArcadeService;
    const controller = new ArcadeController(arcade);

    await expect(controller.start('user-1', { gameKey: 'zhesi' })).resolves.toEqual({
      runId: 'run-1',
    });
    await expect(controller.leaderboard('zhesi')).resolves.toEqual({
      gameKey: 'zhesi',
      items: [],
    });
    expect(arcade.startRun).toHaveBeenCalledWith('user-1', 'zhesi', 1, undefined);
    expect(arcade.leaderboard).toHaveBeenCalledWith('zhesi', 20);
  });

  it('continues to reject unknown game keys', () => {
    const controller = new ArcadeController({} as ArcadeService);
    expect(() => controller.leaderboard('unknown')).toThrow(BadRequestException);
  });

  it('negotiates v1 for old clients and requires explicit v2 on separate keys', async () => {
    const arcade = { startRun: jest.fn().mockResolvedValue({ runId: 'run-a' }) } as unknown as ArcadeService;
    const controller = new ArcadeController(arcade);
    await controller.start('old-user', { gameKey: 'word_story' });
    expect(arcade.startRun).toHaveBeenLastCalledWith('old-user', 'word_story', 1, undefined);
    await controller.start('new-user', { gameKey: 'word_story_v2', rulesVersion: 2, chapter: 1 });
    expect(arcade.startRun).toHaveBeenLastCalledWith('new-user', 'word_story_v2', 2, 1);
    expect(() => controller.start('new-user', { gameKey: 'word_story_v2' })).toThrow(BadRequestException);
    expect(() => controller.start('new-user', { gameKey: 'word_story_v2', rulesVersion: 2, chapter: 7 })).toThrow(BadRequestException);
    expect(() => controller.start('new-user', { gameKey: 'word_endless_v2', rulesVersion: 2, chapter: 2 })).toThrow(BadRequestException);
    expect(() => controller.start('old-user', { gameKey: 'word_story', rulesVersion: 2 })).toThrow(BadRequestException);
  });
});
