import { BadRequestException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import {
  createWordFrontState,
  createWordFrontV2State,
  createWordFrontV3State,
  deployWordFrontUnit,
  applyWordFrontV2Action,
  applyWordFrontV3Action,
  recruitWordFrontCards,
  replayWordFrontV2,
  replayWordFrontV3,
  startWordFront,
  stepWordFront,
  stepWordFrontV2,
  stepWordFrontV3,
  wordFrontHeroForLetters,
  type WordFrontAction,
  type WordFrontV2Action,
  type WordFrontV3Action,
} from '@stealth-reader/shared';

import {
  ArcadeBestScore,
  ArcadeGameRun,
  User,
} from '../../../database/entities';
import { ArcadeService, validateArcadeResult } from './arcade.service';

describe('arcade score validation', () => {
  it('replays the server-seeded word-front battle instead of trusting client metrics', () => {
    const seed = 20260914;
    let state = createWordFrontState('story', 1, seed);
    const actions: WordFrontAction[] = [{ type: 'recruit', tick: 0 }];
    state = recruitWordFrontCards(state);
    let first = -1, second = -1;
    for (let a = 0; a < state.hand.length; a += 1) {
      for (let b = a + 1; b < state.hand.length; b += 1) {
        if (wordFrontHeroForLetters(state.hand[a]!, state.hand[b]!)) { first = a; second = b; break; }
      }
      if (first >= 0) break;
    }
    expect(first).toBeGreaterThanOrEqual(0);
    actions.push({ type: 'deploy', tick: 0, first, second, slot: 0 }, { type: 'start', tick: 0 });
    state = deployWordFrontUnit(state, first, second, 0);
    state = startWordFront(state);
    while (state.status === 'running' && state.tick < 3000) state = stepWordFront(state);
    expect(['won', 'lost']).toContain(state.status);
    const elapsedSeconds = Math.ceil(state.tick * 0.85) + 5;
    const story = {
      score: state.score,
      metrics: {
        mode: 'story', chapter: 1, wave: state.completedWaves, kills: state.kills,
        coreHp: state.coreHp, drawCount: state.drawCount, outcome: state.status,
        finishTick: state.tick, actions, ignored: 'not persisted',
      },
    };
    expect(validateArcadeResult('word_story', story, elapsedSeconds, seed)).toEqual({
      mode: 'story', chapter: 1, wave: state.completedWaves, kills: state.kills,
      coreHp: state.coreHp, drawCount: state.drawCount, outcome: state.status,
      finishTick: state.tick, elapsedSeconds, rulesVersion: 1,
    });
    expect(() => validateArcadeResult('word_endless', story, elapsedSeconds, seed)).toThrow(BadRequestException);
    expect(() => validateArcadeResult('word_story', { ...story, score: 999_999 }, elapsedSeconds, seed)).toThrow(BadRequestException);
    expect(() => validateArcadeResult('word_story', story, elapsedSeconds, seed + 1)).toThrow(BadRequestException);
    expect(() => validateArcadeResult('word_story', story, 0, seed)).toThrow(BadRequestException);
    expect(() => validateArcadeResult('word_story', {
      ...story, metrics: { ...story.metrics, outcome: state.status === 'won' ? 'lost' : 'won' },
    }, elapsedSeconds, seed)).toThrow(BadRequestException);
  });

  it('replays v2 only on its separate score key and preserves v1 validation', () => {
    const seed = 7301;
    let state = createWordFrontV2State('story', 1, seed);
    const actions: WordFrontV2Action[] = [{ type: 'recruit', tick: 0 }];
    state = applyWordFrontV2Action(state, actions[0]!)!;
    actions.push({ type: 'deploy_hero', tick: 0, first: 0, second: 1, slot: 0 }, { type: 'start', tick: 0 });
    state = applyWordFrontV2Action(state, actions[1]!)!;
    state = applyWordFrontV2Action(state, actions[2]!)!;
    while (state.status === 'running' && state.tick < 3000) state = stepWordFrontV2(state);
    expect(['won', 'lost']).toContain(state.status);
    const elapsedSeconds = Math.ceil(state.tick * 0.85) + 5;
    const input = { score: state.score, metrics: { mode: 'story', chapter: 1, wave: state.completedWaves, kills: state.kills,
      coreHp: state.coreHp, drawCount: state.drawCount, outcome: state.status, finishTick: state.tick, actions } };
    expect(validateArcadeResult('word_story_v2', input, elapsedSeconds, seed, 2, 1)).toMatchObject({ rulesVersion: 2, chapter: 1 });
    expect(() => validateArcadeResult('word_story', input, elapsedSeconds, seed, 1)).toThrow(BadRequestException);
    expect(() => validateArcadeResult('word_story_v2', input, elapsedSeconds, seed, 1, 1)).toThrow(BadRequestException);
    expect(() => validateArcadeResult('word_story_v2', { ...input, metrics: { ...input.metrics, chapter: 2 } }, elapsedSeconds, seed, 2, 1)).toThrow(BadRequestException);
    expect(replayWordFrontV2('story', 1, seed, actions, state.tick)?.score).toBe(state.score);
    expect(() => validateArcadeResult('word_story_v2', { ...input, score: state.score + 1000 }, elapsedSeconds, seed, 2, 1)).toThrow(BadRequestException);
    expect(() => validateArcadeResult('future_key' as never, input, elapsedSeconds, seed, 2)).toThrow(BadRequestException);
  });

  it('replays v3 on its own leaderboard without changing v2 settlement', () => {
    const seed = 8103;
    let state = createWordFrontV3State('story', 1, seed);
    const actions: WordFrontV3Action[] = [
      { type: 'recruit', tick: 0 },
      { type: 'deploy_hero', tick: 0, first: 0, second: 1, slot: 0 },
      { type: 'start', tick: 0 },
    ];
    for (const action of actions) state = applyWordFrontV3Action(state, action)!;
    while (state.status === 'running' && state.tick < 3000) state = stepWordFrontV3(state);
    expect(['won', 'lost']).toContain(state.status);
    const elapsedSeconds = Math.ceil(state.tick * 0.85) + 5;
    const input = { score: state.score, metrics: { mode: 'story', chapter: 1,
      wave: state.completedWaves, kills: state.kills, coreHp: state.coreHp,
      drawCount: state.drawCount, outcome: state.status, finishTick: state.tick, actions } };
    expect(validateArcadeResult('word_story_v3', input, elapsedSeconds, seed, 3, 1))
      .toMatchObject({ rulesVersion: 3, chapter: 1, finishTick: state.tick });
    expect(replayWordFrontV3('story', 1, seed, actions, state.tick)?.score).toBe(state.score);
    expect(() => validateArcadeResult('word_story_v3', input, elapsedSeconds, seed, 2, 1)).toThrow(BadRequestException);
    expect(() => validateArcadeResult('word_story_v2', input, elapsedSeconds, seed, 3, 1)).toThrow(BadRequestException);
    expect(() => validateArcadeResult('word_story_v3', { ...input, score: state.score + 1 }, elapsedSeconds, seed, 3, 1)).toThrow(BadRequestException);
    expect(() => validateArcadeResult('word_story_v3', { ...input, metrics: { ...input.metrics, chapter: 2 } }, elapsedSeconds, seed, 3, 1)).toThrow(BadRequestException);
  });

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
  it('issues and persists a server seed before a word-front draw', async () => {
    const queryBuilder = {
      update: jest.fn().mockReturnThis(), set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(), execute: jest.fn().mockResolvedValue(undefined),
    };
    const runRepository = {
      create: jest.fn((value) => value), save: jest.fn(async (value) => value), findOne: jest.fn().mockResolvedValue(null),
    };
    const manager = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      getRepository: jest.fn((entity) => entity === User
        ? { findOne: jest.fn().mockResolvedValue({ id: 'user-1', accountStatus: 'active' }) }
        : runRepository),
    };
    const dataSource = { transaction: jest.fn(async (work) => work(manager)) } as unknown as DataSource;
    const run = await new ArcadeService(dataSource).startRun('user-1', 'word_story');
    expect(run.runId).toMatch(/^[0-9a-f-]{36}$/);
    expect(run.seed).toEqual(expect.any(Number));
    expect(runRepository.save).toHaveBeenCalledTimes(1);
    expect(runRepository.save.mock.calls[0]![0].metrics).toEqual({ seed: run.seed, rulesVersion: 1 });
  });

  it('preserves the already-deployed v1 start semantics', async () => {
    const existing = { id: 'existing-v1', gameKey: 'word_endless', userId: 'user-1', status: 'active',
      startedAt: new Date(Date.now() - 60_000), expiresAt: new Date(Date.now() + 60_000), metrics: { seed: 17 } };
    const execute = jest.fn();
    const repo = { findOne: jest.fn().mockResolvedValue(existing), create: jest.fn((value) => value), save: jest.fn(async (value) => value) };
    const manager = { getRepository: jest.fn((entity) => entity === User
      ? { findOne: jest.fn().mockResolvedValue({ id: 'user-1', accountStatus: 'active' }) } : repo),
    createQueryBuilder: jest.fn(() => ({ update: jest.fn().mockReturnThis(), set: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), execute })) };
    const dataSource = { transaction: jest.fn(async (work) => work(manager)) } as unknown as DataSource;
    const run = await new ArcadeService(dataSource).startRun('user-1', 'word_endless');
    expect(run.runId).not.toBe('existing-v1');
    expect(run.rulesVersion).toBe(1);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(repo.findOne).not.toHaveBeenCalled();
    expect(repo.create).toHaveBeenCalledTimes(1);
  });

  it('reuses an unexpired v2 run and rejects a v2 key with v1 rules', async () => {
    const existing = { id: 'existing-v2', gameKey: 'word_story_v2', userId: 'user-1', status: 'active',
      startedAt: new Date(Date.now() - 60_000), expiresAt: new Date(Date.now() + 100 * 60_000), metrics: { seed: 42, rulesVersion: 2, chapter: 1 } };
    const repo = { findOne: jest.fn().mockResolvedValue(existing), create: jest.fn(), save: jest.fn() };
    const manager = { getRepository: jest.fn((entity) => entity === User
      ? { findOne: jest.fn().mockResolvedValue({ id: 'user-1', accountStatus: 'active' }) } : repo) };
    const dataSource = { transaction: jest.fn(async (work) => work(manager)) } as unknown as DataSource;
    const service = new ArcadeService(dataSource);
    expect(await service.startRun('user-1', 'word_story_v2', 2, 2)).toMatchObject({ runId: 'existing-v2', seed: 42, rulesVersion: 2, chapter: 1 });
    await expect(service.startRun('user-1', 'word_story_v2')).rejects.toThrow(BadRequestException);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('rotates a v2 seed only when the old online window is too short for a fresh battle', async () => {
    const active = { id: 'near-expiry', gameKey: 'word_story_v2', userId: 'user-1', status: 'active',
      startedAt: new Date(Date.now() - 115 * 60_000), expiresAt: new Date(Date.now() + 5 * 60_000),
      metrics: { seed: 7, rulesVersion: 2, chapter: 1 } };
    const execute = jest.fn().mockResolvedValue(undefined);
    const queryBuilder = { update: jest.fn().mockReturnThis(), set: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), execute };
    const repo = { findOne: jest.fn().mockResolvedValue(active), create: jest.fn((value) => value), save: jest.fn(async (value) => value) };
    const manager = { getRepository: jest.fn((entity) => entity === User
      ? { findOne: jest.fn().mockResolvedValue({ id: 'user-1', accountStatus: 'active' }) } : repo),
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder) };
    const dataSource = { transaction: jest.fn(async (work) => work(manager)) } as unknown as DataSource;
    const fresh = await new ArcadeService(dataSource).startRun('user-1', 'word_story_v2', 2, 2);
    expect(fresh.runId).not.toBe('near-expiry');
    expect(fresh.rulesVersion).toBe(2);
    expect(fresh.chapter).toBe(2);
    expect(new Date(fresh.expiresAt).getTime() - Date.now()).toBeGreaterThan(119 * 60_000);
    expect(execute).toHaveBeenCalledTimes(1);
  });

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
    const userRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'user-1',
        accountStatus: 'active',
      }),
    };
    const manager = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      getRepository: jest.fn((entity) =>
        entity === User ? userRepository : runRepository),
    };
    const dataSource = {
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
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(userRepository.findOne.mock.invocationCallOrder[0]).toBeLessThan(
        execute.mock.invocationCallOrder[0],
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('locks the account before a first best-score row is created', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-04T08:00:10.000Z'));
    const userRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'user-1',
        publicId: '11111111-1111-4111-8111-111111111111',
        accountStatus: 'active',
      }),
    };
    const runRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'run-1',
        userId: 'user-1',
        gameKey: 'tetris',
        status: 'active',
        score: null,
        metrics: {},
        startedAt: new Date('2026-09-04T08:00:00.000Z'),
        expiresAt: new Date('2026-09-04T10:00:00.000Z'),
        completedAt: null,
      }),
      save: jest.fn(async (value) => value),
    };
    const rankQuery = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
    };
    const bestRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
      createQueryBuilder: jest.fn().mockReturnValue(rankQuery),
    };
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === User) return userRepository;
        if (entity === ArcadeGameRun) return runRepository;
        if (entity === ArcadeBestScore) return bestRepository;
        throw new Error('unexpected repository');
      }),
    };
    const dataSource = {
      transaction: jest.fn(async (work) => work(manager)),
    } as unknown as DataSource;

    try {
      await expect(
        new ArcadeService(dataSource).finishRun('user-1', 'run-1', {
          score: 0,
          metrics: { lines: 0, level: 1 },
        }),
      ).resolves.toMatchObject({
        bestScore: 0,
        isPersonalBest: true,
        rank: 1,
      });
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(userRepository.findOne.mock.invocationCallOrder[0]).toBeLessThan(
        runRepository.findOne.mock.invocationCallOrder[0],
      );
      expect(userRepository.findOne.mock.invocationCallOrder[0]).toBeLessThan(
        bestRepository.findOne.mock.invocationCallOrder[0],
      );
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
