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
    expect(arcade.startRun).toHaveBeenCalledWith('user-1', 'zhesi');
    expect(arcade.leaderboard).toHaveBeenCalledWith('zhesi', 20);
  });

  it('continues to reject unknown game keys', () => {
    const controller = new ArcadeController({} as ArcadeService);
    expect(() => controller.leaderboard('unknown')).toThrow(BadRequestException);
  });
});
