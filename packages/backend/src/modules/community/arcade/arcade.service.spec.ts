import { BadRequestException } from '@nestjs/common';
import type { DataSource } from 'typeorm';

import { ArcadeService, validateArcadeResult } from './arcade.service';

describe('arcade score validation', () => {
  it('accepts a plausible tetris result and normalizes its metrics', () => {
    expect(validateArcadeResult('tetris', {
      score: 12_000,
      metrics: { lines: 8, level: 1 },
    }, 90)).toEqual({ lines: 8, level: 1, elapsedSeconds: 90 });
    expect(validateArcadeResult('tetris', {
      score: 2_800_000,
      metrics: { lines: 500, level: 51 },
    }, 7_100)).toEqual({ lines: 500, level: 51, elapsedSeconds: 7_100 });
  });

  it('rejects an impossible tetris level or score', () => {
    expect(() => validateArcadeResult('tetris', {
      score: 999_999,
      metrics: { lines: 1, level: 30 },
    }, 5)).toThrow(BadRequestException);
  });

  it('requires tank score, defeated enemies and outcome to agree', () => {
    expect(validateArcadeResult('tank', {
      score: 300,
      metrics: { outcome: 'won', enemiesDefeated: 3 },
    }, 20)).toEqual({ outcome: 'won', enemiesDefeated: 3, elapsedSeconds: 20 });
    expect(() => validateArcadeResult('tank', {
      score: 300,
      metrics: { outcome: 'lost', enemiesDefeated: 2 },
    }, 20)).toThrow(BadRequestException);
  });
});

describe('arcade leaderboard query', () => {
  it('orders by entity property paths so TypeORM can resolve selected aliases', async () => {
    const rows = [{
      bestScore: 900,
      achievedAt: new Date('2026-08-23T00:00:00.000Z'),
      user: { publicId: 'player-1', displayName: '玩家一' },
    }];
    const queryBuilder = {
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(rows),
    };
    const dataSource = {
      getRepository: jest.fn().mockReturnValue({
        createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      }),
    } as unknown as DataSource;

    const result = await new ArcadeService(dataSource).leaderboard('tetris', 10);

    expect(queryBuilder.orderBy).toHaveBeenCalledWith('score.bestScore', 'DESC');
    expect(queryBuilder.addOrderBy).toHaveBeenNthCalledWith(1, 'score.achievedAt', 'ASC');
    expect(queryBuilder.addOrderBy).toHaveBeenNthCalledWith(2, 'user.publicId', 'ASC');
    expect(result.items[0]).toMatchObject({ rank: 1, publicId: 'player-1', score: 900 });
  });
});
