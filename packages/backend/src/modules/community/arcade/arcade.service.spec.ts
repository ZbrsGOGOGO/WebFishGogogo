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

  it('recomputes zhesi combat power and saves only normalized metrics', () => {
    expect(validateArcadeResult('zhesi', {
      score: 42_860,
      metrics: {
        realm: 38,
        aptitude: 100,
        physiqueTier: 'T0',
        hasWeapon: true,
        selfBodyWeapon: true,
        zizhan: false,
        renyuKilled: false,
        renyuBoai: false,
        renyuTongzheng: true,
        tianDi: true,
        secondLife: true,
        immortalGate: true,
        age: 45_000,
        grade: '帝',
        mode: 'yang',
        ignoredLifeStory: 'must not be persisted',
      },
    }, 0)).toEqual({
      realm: 38,
      aptitude: 100,
      physiqueTier: 'T0',
      hasWeapon: true,
      selfBodyWeapon: true,
      zizhan: false,
      renyuKilled: false,
      renyuBoai: false,
      renyuTongzheng: true,
      tianDi: true,
      secondLife: true,
      immortalGate: true,
      age: 45_000,
      grade: '帝',
      mode: 'yang',
      elapsedSeconds: 0,
    });
  });

  it('accepts a self-cut emperor at realm 37 without counting emperor-only bonuses', () => {
    expect(validateArcadeResult('zhesi', {
      score: 38_080,
      metrics: {
        realm: 37,
        aptitude: 60,
        physiqueTier: 'T3',
        hasWeapon: false,
        selfBodyWeapon: false,
        zizhan: true,
        renyuKilled: true,
        renyuBoai: false,
        renyuTongzheng: false,
        tianDi: false,
        secondLife: true,
        immortalGate: false,
        age: 120_000,
        grade: '地',
        mode: 'hard',
      },
    }, 7_200)).toMatchObject({ realm: 37, zizhan: true, age: 120_000, grade: '地' });
  });

  it.each([
    ['client score differs from combatPower', { score: 141 }],
    ['grade disagrees with realm', { grade: '神' }],
    ['age exceeds the simulation ceiling', { age: 120_001 }],
    ['boolean metrics are coerced strings', { hasWeapon: 'false' }],
    ['multiple human-desire outcomes are set', { renyuKilled: true, renyuBoai: true }],
    ['self-body weapon has no completed weapon', { selfBodyWeapon: true }],
    ['heavenly emperor is below emperor realm', { tianDi: true, grade: '凡' }],
    ['self-cut and immortal-gate outcomes conflict', {
      realm: 37,
      zizhan: true,
      immortalGate: true,
      grade: '地',
      score: 37_520,
    }],
  ])('rejects zhesi result when %s', (_label, override) => {
    const base = {
      score: 140,
      metrics: {
        realm: 0,
        aptitude: 28,
        physiqueTier: 'T3',
        hasWeapon: false,
        selfBodyWeapon: false,
        zizhan: false,
        renyuKilled: false,
        renyuBoai: false,
        renyuTongzheng: false,
        tianDi: false,
        secondLife: false,
        immortalGate: false,
        age: 18,
        grade: '凡',
        mode: 'shuang',
      },
    };
    const { score = base.score, ...metricOverride } = override as Record<string, unknown>;
    expect(() => validateArcadeResult('zhesi', {
      score: Number(score),
      metrics: { ...base.metrics, ...metricOverride },
    }, 30)).toThrow(BadRequestException);
  });
});

describe('arcade run lifetime', () => {
  it('gives zhesi runs a two-hour expiry', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-04T08:00:00.000Z'));
    const execute = jest.fn().mockResolvedValue(undefined);
    const queryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute,
    };
    const runRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ ...value, id: 'run-zhesi' })),
    };
    const manager = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      getRepository: jest.fn().mockReturnValue(runRepository),
    };
    const dataSource = {
      getRepository: jest.fn().mockReturnValue({
        findOne: jest.fn().mockResolvedValue({ id: 'user-1', accountStatus: 'active' }),
      }),
      transaction: jest.fn(async (work) => work(manager)),
    } as unknown as DataSource;

    try {
      const result = await new ArcadeService(dataSource).startRun('user-1', 'zhesi');
      expect(result).toMatchObject({
        runId: 'run-zhesi',
        gameKey: 'zhesi',
        startedAt: '2026-09-04T08:00:00.000Z',
        expiresAt: '2026-09-04T10:00:00.000Z',
      });
    } finally {
      jest.useRealTimers();
    }
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
