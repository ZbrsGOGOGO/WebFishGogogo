import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ArticleViewModel, ReadingProgress } from '@stealth-reader/shared';

import type { DocumentRepository } from '../documents/document.repository';
import type { StoragePort } from '../documents/storage';
import type { SkinService } from '../skin/skin.service';
import type { BookmarkRepository } from './bookmark.repository';
import type { ChapterRepository } from './chapter.repository';
import type { ProgressRepository } from './progress.repository';
import { ReadingService } from './reading.service';

function makeService(overrides: {
  progressRepo?: Partial<ProgressRepository>;
  documentRepo?: Partial<DocumentRepository>;
  chapterRepo?: Partial<ChapterRepository>;
  bookmarkRepo?: Partial<BookmarkRepository>;
  storage?: Partial<StoragePort>;
  skinService?: Partial<SkinService>;
} = {}) {
  const progressRepo = {
    getOrInit: jest.fn(),
    upsert: jest.fn(),
    find: jest.fn(),
    ...overrides.progressRepo,
  } as unknown as ProgressRepository;
  const documentRepo = {
    findById: jest.fn(),
    findChapterByIdx: jest.fn(),
    ...overrides.documentRepo,
  } as unknown as DocumentRepository;
  const chapterRepo = {
    listByDocument: jest.fn(),
    findByIdx: jest.fn(),
    ...overrides.chapterRepo,
  } as unknown as ChapterRepository;
  const bookmarkRepo = {
    create: jest.fn(),
    findById: jest.fn(),
    listByUserAndDocument: jest.fn(),
    deleteById: jest.fn(),
    ...overrides.bookmarkRepo,
  } as unknown as BookmarkRepository;
  const storage = {
    getChapter: jest.fn(),
    putChapter: jest.fn(),
    deleteDocument: jest.fn(),
    ...overrides.storage,
  } as unknown as StoragePort;
  const skinService = {
    render: jest.fn(),
    ...overrides.skinService,
  } as unknown as SkinService;

  const service = new ReadingService(
    progressRepo,
    documentRepo,
    chapterRepo,
    bookmarkRepo,
    storage,
    skinService,
  );
  return {
    service,
    progressRepo,
    documentRepo,
    chapterRepo,
    bookmarkRepo,
    storage,
    skinService,
  };
}

const ownedDoc = { id: 'd1', ownerId: 'u1' };

describe('ReadingService', () => {
  describe('getArticleView', () => {
    it('按当前进度组装伪装文章视图（Req 5.1/6.1）', async () => {
      const findById = jest.fn().mockResolvedValue(ownedDoc);
      const getOrInit = jest.fn().mockResolvedValue({
        documentId: 'd1',
        chapterIdx: 2,
        charOffset: '0',
        percent: '10',
      });
      const findChapterByIdx = jest.fn().mockResolvedValue({
        idx: 2,
        title: '第三章',
        storageKey: 'd1/2.txt',
      });
      const getChapter = jest.fn().mockResolvedValue('章节正文内容');
      const rendered = { skinId: 'csdn' } as unknown as ArticleViewModel;
      const render = jest.fn().mockReturnValue(rendered);
      const { service } = makeService({
        documentRepo: { findById, findChapterByIdx },
        progressRepo: { getOrInit },
        storage: { getChapter },
        skinService: { render },
      });

      const view = await service.getArticleView('u1', 'd1', 'csdn');

      expect(getOrInit).toHaveBeenCalledWith('u1', 'd1');
      expect(findChapterByIdx).toHaveBeenCalledWith('d1', 2);
      expect(getChapter).toHaveBeenCalledWith('d1/2.txt');
      expect(render).toHaveBeenCalledWith('csdn', {
        title: '第三章',
        body: '章节正文内容',
        documentId: 'd1',
        progress: {
          documentId: 'd1',
          chapterIdx: 2,
          charOffset: 0,
          percent: 10,
        },
      });
      expect(view).toBe(rendered);
    });

    it('非本人文档抛 ForbiddenException（不泄露存在性，Req 12.1/12.2）', async () => {
      const findById = jest
        .fn()
        .mockResolvedValue({ id: 'd1', ownerId: 'other' });
      const getOrInit = jest.fn();
      const { service } = makeService({
        documentRepo: { findById },
        progressRepo: { getOrInit },
      });

      await expect(
        service.getArticleView('u1', 'd1', 'csdn'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      // 越权时不应触碰进度/存储/渲染。
      expect(getOrInit).not.toHaveBeenCalled();
    });

    it('文档不存在也抛 ForbiddenException（不泄露存在性，Req 12.2）', async () => {
      const findById = jest.fn().mockResolvedValue(null);
      const { service } = makeService({ documentRepo: { findById } });

      await expect(
        service.getArticleView('u1', 'd1', 'csdn'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('进度指向的章节不存在时抛 NotFoundException', async () => {
      const findById = jest.fn().mockResolvedValue(ownedDoc);
      const getOrInit = jest.fn().mockResolvedValue({
        documentId: 'd1',
        chapterIdx: 99,
        charOffset: '0',
        percent: '0',
      });
      const findChapterByIdx = jest.fn().mockResolvedValue(null);
      const { service } = makeService({
        documentRepo: { findById, findChapterByIdx },
        progressRepo: { getOrInit },
      });

      await expect(
        service.getArticleView('u1', 'd1', 'csdn'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('saveProgress', () => {
    const progress: ReadingProgress = {
      documentId: 'd1',
      chapterIdx: 1,
      charOffset: 120,
      percent: 42,
    };

    it('校验归属后 upsert 进度（Req 7.2）', async () => {
      const findById = jest.fn().mockResolvedValue(ownedDoc);
      const upsert = jest.fn().mockResolvedValue(undefined);
      const { service } = makeService({
        documentRepo: { findById },
        progressRepo: { upsert },
      });

      await service.saveProgress('u1', progress);

      expect(upsert).toHaveBeenCalledWith('u1', progress);
    });

    it('非本人文档抛 ForbiddenException 且不落库（Req 12.1）', async () => {
      const findById = jest
        .fn()
        .mockResolvedValue({ id: 'd1', ownerId: 'other' });
      const upsert = jest.fn();
      const { service } = makeService({
        documentRepo: { findById },
        progressRepo: { upsert },
      });

      await expect(service.saveProgress('u1', progress)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(upsert).not.toHaveBeenCalled();
    });
  });

  describe('getChapters', () => {
    it('按 idx 升序返回目录，charOffset 解析为 number（Req 8.1）', async () => {
      const findById = jest.fn().mockResolvedValue(ownedDoc);
      const listByDocument = jest.fn().mockResolvedValue([
        { idx: 0, title: '第一章', charOffset: '0', charLength: 100 },
        { idx: 1, title: '第二章', charOffset: '100', charLength: 50 },
      ]);
      const { service } = makeService({
        documentRepo: { findById },
        chapterRepo: { listByDocument },
      });

      const toc = await service.getChapters('u1', 'd1');

      expect(toc).toEqual([
        { idx: 0, title: '第一章', charOffset: 0, charLength: 100 },
        { idx: 1, title: '第二章', charOffset: 100, charLength: 50 },
      ]);
    });

    it('非本人文档抛 ForbiddenException（Req 12.1）', async () => {
      const findById = jest
        .fn()
        .mockResolvedValue({ id: 'd1', ownerId: 'other' });
      const { service } = makeService({ documentRepo: { findById } });

      await expect(service.getChapters('u1', 'd1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('文档不存在也抛 ForbiddenException（不泄露存在性，Req 12.2）', async () => {
      const findById = jest.fn().mockResolvedValue(null);
      const { service } = makeService({ documentRepo: { findById } });

      await expect(service.getChapters('u1', 'd1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('jumpToChapter', () => {
    it('跳转到章节起始处（章节内偏移为 0，Req 8.2）', async () => {
      const findById = jest.fn().mockResolvedValue(ownedDoc);
      const findByIdx = jest.fn().mockResolvedValue({ idx: 2 });
      const { service } = makeService({
        documentRepo: { findById },
        chapterRepo: { findByIdx },
      });

      await expect(service.jumpToChapter('u1', 'd1', 2)).resolves.toEqual({
        chapterIdx: 2,
        charOffset: 0,
      });
    });

    it('目标章节不存在抛 NotFoundException', async () => {
      const findById = jest.fn().mockResolvedValue(ownedDoc);
      const findByIdx = jest.fn().mockResolvedValue(null);
      const { service } = makeService({
        documentRepo: { findById },
        chapterRepo: { findByIdx },
      });

      await expect(
        service.jumpToChapter('u1', 'd1', 99),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createBookmark', () => {
    it('创建书签并记录 chapterIdx 与 charOffset（Req 8.3）', async () => {
      const findById = jest.fn().mockResolvedValue(ownedDoc);
      const create = jest.fn().mockResolvedValue({
        id: 'b1',
        documentId: 'd1',
        chapterIdx: 1,
        charOffset: '250',
        note: '标记',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
      });
      const { service } = makeService({
        documentRepo: { findById },
        bookmarkRepo: { create },
      });

      const view = await service.createBookmark('u1', 'd1', {
        chapterIdx: 1,
        charOffset: 250,
        note: '标记',
      });

      expect(create).toHaveBeenCalledWith({
        userId: 'u1',
        documentId: 'd1',
        chapterIdx: 1,
        charOffset: 250,
        note: '标记',
      });
      expect(view).toMatchObject({
        id: 'b1',
        chapterIdx: 1,
        charOffset: 250,
        note: '标记',
      });
    });
  });

  describe('jumpToBookmark', () => {
    it('跳转到书签记录的章节序号与偏移（Req 8.4）', async () => {
      const findById = jest.fn().mockResolvedValue({
        id: 'b1',
        userId: 'u1',
        chapterIdx: 3,
        charOffset: '400',
      });
      const { service } = makeService({ bookmarkRepo: { findById } });

      await expect(service.jumpToBookmark('u1', 'b1')).resolves.toEqual({
        chapterIdx: 3,
        charOffset: 400,
      });
    });

    it('非本人书签抛 ForbiddenException', async () => {
      const findById = jest
        .fn()
        .mockResolvedValue({ id: 'b1', userId: 'other', chapterIdx: 0, charOffset: '0' });
      const { service } = makeService({ bookmarkRepo: { findById } });

      await expect(service.jumpToBookmark('u1', 'b1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('deleteBookmark', () => {
    it('删除本人书签（Req 8.5）', async () => {
      const findById = jest
        .fn()
        .mockResolvedValue({ id: 'b1', userId: 'u1' });
      const deleteById = jest.fn().mockResolvedValue(true);
      const { service } = makeService({
        bookmarkRepo: { findById, deleteById },
      });

      await service.deleteBookmark('u1', 'b1');
      expect(deleteById).toHaveBeenCalledWith('b1');
    });

    it('删除非本人书签受限，抛 ForbiddenException 且不执行删除（Req 8.5）', async () => {
      const findById = jest
        .fn()
        .mockResolvedValue({ id: 'b1', userId: 'other' });
      const deleteById = jest.fn();
      const { service } = makeService({
        bookmarkRepo: { findById, deleteById },
      });

      await expect(service.deleteBookmark('u1', 'b1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(deleteById).not.toHaveBeenCalled();
    });
  });
});
