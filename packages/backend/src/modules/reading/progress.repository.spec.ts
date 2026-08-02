import type { Repository } from 'typeorm';

import { ReadingProgress } from '../../database/entities';
import { ProgressRepository } from './progress.repository';

/** 构造一个受控的 Repository<ReadingProgress> mock。 */
function makeRepoMock(overrides: Record<string, unknown> = {}) {
  return {
    create: jest.fn((v) => v),
    save: jest.fn((v) => Promise.resolve(v)),
    findOne: jest.fn(),
    ...overrides,
  } as unknown as Repository<ReadingProgress>;
}

describe('ProgressRepository', () => {
  describe('find', () => {
    it('按 (userId, documentId) 查询，命中返回记录', async () => {
      const findOne = jest.fn().mockResolvedValue({ id: 'p1' });
      const repo = new ProgressRepository(makeRepoMock({ findOne }));

      await expect(repo.find('u1', 'd1')).resolves.toEqual({ id: 'p1' });
      expect(findOne).toHaveBeenCalledWith({
        where: { userId: 'u1', documentId: 'd1' },
      });
    });

    it('未命中返回 null', async () => {
      const findOne = jest.fn().mockResolvedValue(null);
      const repo = new ProgressRepository(makeRepoMock({ findOne }));

      await expect(repo.find('u1', 'd1')).resolves.toBeNull();
    });
  });

  describe('getOrInit', () => {
    it('已存在则直接返回，不创建新记录', async () => {
      const existing = { id: 'p1', userId: 'u1', documentId: 'd1' };
      const create = jest.fn();
      const findOne = jest.fn().mockResolvedValue(existing);
      const repo = new ProgressRepository(makeRepoMock({ findOne, create }));

      await expect(repo.getOrInit('u1', 'd1')).resolves.toBe(existing);
      expect(create).not.toHaveBeenCalled();
    });

    it('不存在则以默认值（章节 0、偏移 0、百分比 0）初始化并保存', async () => {
      const findOne = jest.fn().mockResolvedValue(null);
      const create = jest.fn((v) => v);
      const save = jest.fn((v) => Promise.resolve(v));
      const repo = new ProgressRepository(makeRepoMock({ findOne, create, save }));

      const result = await repo.getOrInit('u1', 'd1');

      expect(create).toHaveBeenCalledWith({
        userId: 'u1',
        documentId: 'd1',
        chapterIdx: 0,
        charOffset: '0',
        percent: '0',
      });
      expect(save).toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({ userId: 'u1', documentId: 'd1', percent: '0' }),
      );
    });
  });

  describe('upsert', () => {
    it('不存在时创建新记录，charOffset/percent 转为 string', async () => {
      const findOne = jest.fn().mockResolvedValue(null);
      const create = jest.fn((v) => v);
      const save = jest.fn((v) => Promise.resolve(v));
      const repo = new ProgressRepository(makeRepoMock({ findOne, create, save }));

      await repo.upsert('u1', {
        documentId: 'd1',
        chapterIdx: 3,
        charOffset: 120,
        percent: 42.5,
      });

      expect(create).toHaveBeenCalledWith({
        userId: 'u1',
        documentId: 'd1',
        chapterIdx: 3,
        charOffset: '120',
        percent: '42.5',
      });
      expect(save).toHaveBeenCalled();
    });

    it('已存在时更新同一条记录为最新值（保持单条，幂等）', async () => {
      const existing = {
        id: 'p1',
        userId: 'u1',
        documentId: 'd1',
        chapterIdx: 0,
        charOffset: '0',
        percent: '0',
      } as unknown as ReadingProgress;
      const findOne = jest.fn().mockResolvedValue(existing);
      const create = jest.fn();
      const save = jest.fn((v) => Promise.resolve(v));
      const repo = new ProgressRepository(makeRepoMock({ findOne, create, save }));

      const result = await repo.upsert('u1', {
        documentId: 'd1',
        chapterIdx: 5,
        charOffset: 200,
        percent: 88,
      });

      // 未创建新记录，而是更新既有实体
      expect(create).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        id: 'p1',
        chapterIdx: 5,
        charOffset: '200',
        percent: '88',
      });
      expect(save).toHaveBeenCalledWith(existing);
    });

    it('percent 超过上界收敛到 100', async () => {
      const findOne = jest.fn().mockResolvedValue(null);
      const create = jest.fn((v) => v);
      const repo = new ProgressRepository(makeRepoMock({ findOne, create }));

      await repo.upsert('u1', {
        documentId: 'd1',
        chapterIdx: 0,
        charOffset: 0,
        percent: 150,
      });

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ percent: '100' }),
      );
    });

    it('percent 低于下界收敛到 0', async () => {
      const findOne = jest.fn().mockResolvedValue(null);
      const create = jest.fn((v) => v);
      const repo = new ProgressRepository(makeRepoMock({ findOne, create }));

      await repo.upsert('u1', {
        documentId: 'd1',
        chapterIdx: 0,
        charOffset: 0,
        percent: -20,
      });

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ percent: '0' }),
      );
    });

    it('percent 非有限值按 0 处理', async () => {
      const findOne = jest.fn().mockResolvedValue(null);
      const create = jest.fn((v) => v);
      const repo = new ProgressRepository(makeRepoMock({ findOne, create }));

      await repo.upsert('u1', {
        documentId: 'd1',
        chapterIdx: 0,
        charOffset: 0,
        percent: Number.NaN,
      });

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ percent: '0' }),
      );
    });
  });
});
