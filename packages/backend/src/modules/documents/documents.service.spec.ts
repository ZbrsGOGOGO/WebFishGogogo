import {
  BadRequestException,
  ForbiddenException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';

import type { Document } from '../../database/entities/document.entity';
import { DocumentRepository } from './document.repository';
import {
  DocumentsService,
  type UploadDocumentInput,
} from './documents.service';
import type { StoragePort } from './storage';

/**
 * 内存版 DocumentRepository，忠实实现创建 / 状态流转 / 章节持久化语义，
 * 以便在无数据库环境下真实验证 DocumentsService 的编排逻辑。
 */
class InMemoryDocumentRepository {
  documents = new Map<string, Document>();
  chapters = new Map<string, unknown[]>();
  private seq = 0;

  async createDocument(input: {
    ownerId: string;
    title: string;
    storageKey: string;
    originalName?: string | null;
    status?: string;
  }): Promise<Document> {
    const id = `doc-${++this.seq}`;
    const doc = {
      id,
      ownerId: input.ownerId,
      title: input.title,
      originalName: input.originalName ?? null,
      encoding: 'utf-8',
      charCount: '0',
      chapterCount: 0,
      storageKey: input.storageKey,
      status: input.status ?? 'processing',
      deletedAt: null,
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
    } as unknown as Document;
    this.documents.set(id, doc);
    return doc;
  }

  async persistChapters(documentId: string, chapters: unknown[]) {
    this.chapters.set(documentId, chapters);
    return [];
  }

  async updateStatus(id: string, status: string): Promise<boolean> {
    const doc = this.documents.get(id);
    if (!doc) return false;
    doc.status = status as Document['status'];
    return true;
  }

  async updateParsedMeta(
    id: string,
    meta: { encoding?: string; charCount?: number; chapterCount?: number },
  ): Promise<boolean> {
    const doc = this.documents.get(id);
    if (!doc) return false;
    if (meta.encoding !== undefined) doc.encoding = meta.encoding;
    if (meta.charCount !== undefined) doc.charCount = String(meta.charCount);
    if (meta.chapterCount !== undefined) doc.chapterCount = meta.chapterCount;
    return true;
  }

  /** 测试辅助：直接插入一条文档记录（绕过上传编排）。 */
  seedDocument(overrides: Partial<Document> & { ownerId: string }): Document {
    const id = overrides.id ?? `doc-${++this.seq}`;
    const doc = {
      id,
      ownerId: overrides.ownerId,
      title: overrides.title ?? 'Seeded Doc',
      originalName: null,
      encoding: 'utf-8',
      charCount: overrides.charCount ?? '0',
      chapterCount: overrides.chapterCount ?? 0,
      storageKey: overrides.storageKey ?? `${id}-key`,
      status: overrides.status ?? 'ready',
      deletedAt: null,
      createdAt: overrides.createdAt ?? new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
    } as unknown as Document;
    this.documents.set(id, doc);
    return doc;
  }

  private activeByOwner(ownerId: string): Document[] {
    return [...this.documents.values()].filter(
      (d) => d.ownerId === ownerId && d.deletedAt === null,
    );
  }

  async listByOwner(
    ownerId: string,
    options: { page?: number; pageSize?: number } = {},
  ) {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const all = this.activeByOwner(ownerId);
    const items = all.slice((page - 1) * pageSize, page * pageSize);
    return { items, total: all.length, page, pageSize };
  }

  async searchByOwnerAndTitle(
    ownerId: string,
    keyword: string,
    options: { page?: number; pageSize?: number } = {},
  ) {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const kw = keyword.toLowerCase();
    const all = this.activeByOwner(ownerId).filter((d) =>
      d.title.toLowerCase().includes(kw),
    );
    const items = all.slice((page - 1) * pageSize, page * pageSize);
    return { items, total: all.length, page, pageSize };
  }

  async softDeleteByOwner(id: string, ownerId: string): Promise<boolean> {
    const doc = this.documents.get(id);
    if (!doc || doc.ownerId !== ownerId || doc.deletedAt !== null) {
      return false;
    }
    doc.deletedAt = new Date('2024-02-01T00:00:00Z');
    return true;
  }

  async findById(id: string): Promise<Document | null> {
    const doc = this.documents.get(id);
    return doc && doc.deletedAt === null ? doc : null;
  }
}

/** 内存版 StoragePort，记录写入的每章正文。 */
class InMemoryStorage implements StoragePort {
  puts: Array<{ docId: string; idx: number; content: string }> = [];
  failOnPut = false;

  async putChapter(docId: string, idx: number, content: string) {
    if (this.failOnPut) {
      throw new Error('对象存储不可达');
    }
    this.puts.push({ docId, idx, content });
    return `${docId}/chapter-${idx}.txt`;
  }

  async getChapter(): Promise<string> {
    return '';
  }

  async deleteDocument(): Promise<void> {}
}

function makeInput(
  overrides: Partial<UploadDocumentInput> = {},
): UploadDocumentInput {
  return {
    ownerId: 'user-1',
    originalName: 'my-novel.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('第一章 开始\n正文内容\n第二章 结束\n更多内容', 'utf-8'),
    ownedContentDeclarationConfirmed: true,
    ...overrides,
  };
}

function createService(storage = new InMemoryStorage()) {
  const repo = new InMemoryDocumentRepository();
  const service = new DocumentsService(
    repo as unknown as DocumentRepository,
    storage,
  );
  return { service, repo, storage };
}

describe('DocumentsService.upload', () => {
  it('rejects upload when owned-content declaration is not confirmed (Req 2.2)', async () => {
    const { service, repo } = createService();

    await expect(
      service.upload(makeInput({ ownedContentDeclarationConfirmed: false })),
    ).rejects.toBeInstanceOf(BadRequestException);
    // 不应创建任何文档
    expect(repo.documents.size).toBe(0);
  });

  it('rejects non-.txt file types (Req 2.3)', async () => {
    const { service, repo } = createService();

    await expect(
      service.upload(makeInput({ originalName: 'book.pdf', mimeType: 'application/pdf' })),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
    expect(repo.documents.size).toBe(0);
  });

  it('sets owner_id and marks document ready after successful parse (Req 2.4, 2.5, 2.6)', async () => {
    const { service, repo, storage } = createService();

    const result = await service.upload(makeInput());

    expect(result.ownerId).toBe('user-1');
    expect(result.status).toBe('ready');
    expect(result.chapterCount).toBeGreaterThanOrEqual(1);

    const stored = repo.documents.get(result.id)!;
    expect(stored.status).toBe('ready');
    // 每章正文均写入对象存储
    expect(storage.puts.length).toBe(result.chapterCount);
  });

  it('marks document failed and surfaces reason when parsing fails (Req 2.7)', async () => {
    const storage = new InMemoryStorage();
    storage.failOnPut = true;
    const { service, repo } = createService(storage);

    await expect(service.upload(makeInput())).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );

    // 文档已创建但被标记为 failed
    const doc = [...repo.documents.values()][0];
    expect(doc.status).toBe('failed');
  });
});

describe('DocumentsService.listDocuments', () => {
  it('仅返回归属该用户且未软删除的文档，并以分页形式返回 (Req 3.1, 3.2)', async () => {
    const { service, repo } = createService();
    repo.seedDocument({ ownerId: 'user-1', title: 'A' });
    repo.seedDocument({ ownerId: 'user-1', title: 'B' });
    repo.seedDocument({ ownerId: 'user-2', title: 'Other user doc' });

    const result = await service.listDocuments('user-1', { page: 1, pageSize: 20 });

    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(result.items.every((d) => d.ownerId === 'user-1')).toBe(true);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
  });

  it('软删除的文档不再出现在列表中 (Req 3.4)', async () => {
    const { service, repo } = createService();
    const doc = repo.seedDocument({ ownerId: 'user-1', title: 'To delete' });
    repo.seedDocument({ ownerId: 'user-1', title: 'Keep' });

    await service.deleteDocument('user-1', doc.id);
    const result = await service.listDocuments('user-1');

    expect(result.total).toBe(1);
    expect(result.items.map((d) => d.title)).toEqual(['Keep']);
  });

  it('分页切片正确 (Req 3.2)', async () => {
    const { service, repo } = createService();
    for (let i = 0; i < 5; i++) {
      repo.seedDocument({ ownerId: 'user-1', title: `Doc ${i}` });
    }

    const page1 = await service.listDocuments('user-1', { page: 1, pageSize: 2 });
    const page2 = await service.listDocuments('user-1', { page: 2, pageSize: 2 });

    expect(page1.total).toBe(5);
    expect(page1.items).toHaveLength(2);
    expect(page2.items).toHaveLength(2);
  });
});

describe('DocumentsService.searchDocuments', () => {
  it('仅返回标题包含关键字且归属该用户的文档 (Req 3.3)', async () => {
    const { service, repo } = createService();
    repo.seedDocument({ ownerId: 'user-1', title: 'TypeScript 指南' });
    repo.seedDocument({ ownerId: 'user-1', title: 'JavaScript 基础' });
    repo.seedDocument({ ownerId: 'user-2', title: 'TypeScript 进阶' });

    const result = await service.searchDocuments('user-1', 'TypeScript');

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe('TypeScript 指南');
    expect(result.items[0].ownerId).toBe('user-1');
  });

  it('空关键字退化为普通列表 (Req 3.1)', async () => {
    const { service, repo } = createService();
    repo.seedDocument({ ownerId: 'user-1', title: 'A' });
    repo.seedDocument({ ownerId: 'user-1', title: 'B' });

    const result = await service.searchDocuments('user-1', '   ');

    expect(result.total).toBe(2);
  });
});

describe('DocumentsService.deleteDocument', () => {
  it('软删除自有文档 (Req 3.4)', async () => {
    const { service, repo } = createService();
    const doc = repo.seedDocument({ ownerId: 'user-1', title: 'Mine' });

    await expect(service.deleteDocument('user-1', doc.id)).resolves.toBeUndefined();
    expect(repo.documents.get(doc.id)!.deletedAt).not.toBeNull();
  });

  it('删除非本人拥有的文档抛出 ForbiddenException 且不改动数据 (Req 3.5)', async () => {
    const { service, repo } = createService();
    const doc = repo.seedDocument({ ownerId: 'user-2', title: "Someone else's" });

    await expect(service.deleteDocument('user-1', doc.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    // 未被软删除
    expect(repo.documents.get(doc.id)!.deletedAt).toBeNull();
  });

  it('删除不存在的文档抛出 ForbiddenException（不泄露存在性，Req 3.5 / 12.2）', async () => {
    const { service } = createService();

    await expect(
      service.deleteDocument('user-1', 'nonexistent-id'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('删除已软删除的文档抛出 ForbiddenException（不泄露存在性）', async () => {
    const { service, repo } = createService();
    const doc = repo.seedDocument({ ownerId: 'user-1', title: 'Already gone' });
    await service.deleteDocument('user-1', doc.id);

    // 第二次删除同一文档应被拒绝
    await expect(service.deleteDocument('user-1', doc.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
