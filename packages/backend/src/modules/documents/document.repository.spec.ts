import type { Repository } from 'typeorm';

import { Chapter } from '../../database/entities/chapter.entity';
import { Document } from '../../database/entities/document.entity';
import { DocumentRepository } from './document.repository';

/** 构造一个受控的 Repository<Document> mock。 */
function makeDocRepoMock(overrides: Partial<Repository<Document>> = {}) {
  return {
    create: jest.fn((v) => v),
    save: jest.fn((v) => Promise.resolve(v)),
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    softDelete: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
    ...overrides,
  } as unknown as Repository<Document>;
}

function makeChapterRepoMock(overrides: Partial<Repository<Chapter>> = {}) {
  return {
    create: jest.fn((v) => v),
    save: jest.fn((v) => Promise.resolve(v)),
    ...overrides,
  } as unknown as Repository<Chapter>;
}

describe('DocumentRepository', () => {
  describe('createDocument', () => {
    it('设置 ownerId 并默认 status=processing、charCount 转为 string', async () => {
      const docs = makeDocRepoMock();
      const repo = new DocumentRepository(docs, makeChapterRepoMock());

      await repo.createDocument({
        ownerId: 'owner-1',
        title: 'My Doc',
        storageKey: 'docs/1',
      });

      expect(docs.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerId: 'owner-1',
          title: 'My Doc',
          storageKey: 'docs/1',
          status: 'processing',
          charCount: '0',
          chapterCount: 0,
          encoding: 'utf-8',
        }),
      );
      expect(docs.save).toHaveBeenCalled();
    });
  });

  describe('persistChapters', () => {
    it('空输入返回空数组且不写库', async () => {
      const chapters = makeChapterRepoMock();
      const repo = new DocumentRepository(makeDocRepoMock(), chapters);

      const result = await repo.persistChapters('doc-1', []);

      expect(result).toEqual([]);
      expect(chapters.save).not.toHaveBeenCalled();
    });

    it('为每个章节注入 documentId 并将 charOffset 转为 string', async () => {
      const chapters = makeChapterRepoMock();
      const repo = new DocumentRepository(makeDocRepoMock(), chapters);

      await repo.persistChapters('doc-1', [
        { idx: 0, title: '第一章', charOffset: 0, charLength: 10, storageKey: 'c0' },
        { idx: 1, title: null, charOffset: 10, charLength: 5, storageKey: 'c1' },
      ]);

      expect(chapters.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ documentId: 'doc-1', idx: 0, charOffset: '0' }),
      );
      expect(chapters.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ documentId: 'doc-1', idx: 1, charOffset: '10' }),
      );
      expect(chapters.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('listByOwner', () => {
    it('按 owner 过滤、分页并返回 total（软删除由 TypeORM 自动排除）', async () => {
      const findAndCount = jest.fn().mockResolvedValue([[{ id: 'd1' }], 1]);
      const docs = makeDocRepoMock({ findAndCount });
      const repo = new DocumentRepository(docs, makeChapterRepoMock());

      const result = await repo.listByOwner('owner-1', { page: 2, pageSize: 10 });

      expect(findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ownerId: 'owner-1' },
          skip: 10,
          take: 10,
        }),
      );
      expect(result).toEqual({
        items: [{ id: 'd1' }],
        total: 1,
        page: 2,
        pageSize: 10,
      });
    });

    it('非法分页参数回退到默认值', async () => {
      const findAndCount = jest.fn().mockResolvedValue([[], 0]);
      const docs = makeDocRepoMock({ findAndCount });
      const repo = new DocumentRepository(docs, makeChapterRepoMock());

      await repo.listByOwner('owner-1', { page: 0, pageSize: -5 });

      expect(findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
    });

    it('pageSize 超过上限被截断到 MAX_PAGE_SIZE', async () => {
      const findAndCount = jest.fn().mockResolvedValue([[], 0]);
      const docs = makeDocRepoMock({ findAndCount });
      const repo = new DocumentRepository(docs, makeChapterRepoMock());

      await repo.listByOwner('owner-1', { pageSize: 9999 });

      expect(findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });
  });

  describe('searchByOwnerAndTitle', () => {
    it('构造 owner + 未软删除 + 标题 ILIKE 查询，并转义通配符', async () => {
      const getManyAndCount = jest.fn().mockResolvedValue([[{ id: 'd1' }], 1]);
      const where = jest.fn().mockReturnThis();
      const andWhere = jest.fn().mockReturnThis();
      const orderBy = jest.fn().mockReturnThis();
      const skip = jest.fn().mockReturnThis();
      const take = jest.fn().mockReturnThis();
      const qb = { where, andWhere, orderBy, skip, take, getManyAndCount };
      const docs = makeDocRepoMock({
        createQueryBuilder: jest.fn().mockReturnValue(qb),
      });
      const repo = new DocumentRepository(docs, makeChapterRepoMock());

      const result = await repo.searchByOwnerAndTitle('owner-1', '50%_off');

      expect(where).toHaveBeenCalledWith('document.owner_id = :ownerId', {
        ownerId: 'owner-1',
      });
      // % 与 _ 应被转义为字面匹配
      expect(andWhere).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        { kw: '%50\\%\\_off%' },
      );
      expect(result.items).toEqual([{ id: 'd1' }]);
      expect(result.total).toBe(1);
    });
  });

  describe('softDeleteByOwner', () => {
    it('命中返回 true', async () => {
      const softDelete = jest.fn().mockResolvedValue({ affected: 1 });
      const docs = makeDocRepoMock({ softDelete });
      const repo = new DocumentRepository(docs, makeChapterRepoMock());

      await expect(repo.softDeleteByOwner('d1', 'owner-1')).resolves.toBe(true);
      expect(softDelete).toHaveBeenCalledWith({ id: 'd1', ownerId: 'owner-1' });
    });

    it('未命中（不存在/非本人/已删除）返回 false', async () => {
      const softDelete = jest.fn().mockResolvedValue({ affected: 0 });
      const docs = makeDocRepoMock({ softDelete });
      const repo = new DocumentRepository(docs, makeChapterRepoMock());

      await expect(repo.softDeleteByOwner('d1', 'other')).resolves.toBe(false);
    });
  });

  describe('findById', () => {
    it('命中返回文档', async () => {
      const findOne = jest.fn().mockResolvedValue({ id: 'd1' });
      const docs = makeDocRepoMock({ findOne });
      const repo = new DocumentRepository(docs, makeChapterRepoMock());

      await expect(repo.findById('d1')).resolves.toEqual({ id: 'd1' });
      expect(findOne).toHaveBeenCalledWith({ where: { id: 'd1' } });
    });
  });
});
