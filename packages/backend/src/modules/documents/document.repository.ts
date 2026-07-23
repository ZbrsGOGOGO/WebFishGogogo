import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from '@stealth-reader/shared';

import { Chapter } from '../../database/entities/chapter.entity';
import {
  Document,
  DocumentStatusColumn,
} from '../../database/entities/document.entity';

/**
 * 创建文档所需的输入。
 * 正文不入库（存对象存储）；此处仅持久化元数据。
 * ownerId 由上传用户 ID 决定（对齐 requirements.md Requirement 2.4）。
 */
export interface CreateDocumentInput {
  ownerId: string;
  title: string;
  storageKey: string;
  originalName?: string | null;
  encoding?: string;
  charCount?: number;
  chapterCount?: number;
  status?: DocumentStatusColumn;
}

/**
 * 章节持久化输入（单个章节；正文在对象存储，此处仅存定位信息）。
 * 对齐 ChapterIndex：idx 从 0 起连续、charOffset 累加连续。
 */
export interface PersistChapterInput {
  idx: number;
  title: string | null;
  charOffset: number;
  charLength: number;
  storageKey: string;
}

/** 文档库分页查询选项。 */
export interface ListDocumentsOptions {
  page?: number;
  pageSize?: number;
}

/** 分页结果。 */
export interface PaginatedDocuments {
  items: Document[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 文档存储领域数据访问层（Repository）。
 *
 * 封装 documents / chapters 两表的持久化与查询，返回领域实体。对齐
 * design.md 分层原则：Repository 只负责数据访问，不含业务规则（上传编排、
 * 归属鉴权、搜索等在 DocumentsService，见 tasks.md 6.2/6.3/6.5）。
 *
 * 说明：
 * - documents 使用 TypeORM 软删除列（@DeleteDateColumn deleted_at）。默认
 *   find/count 查询会自动排除软删除记录（对齐 Requirement 3.1/3.4）。
 * - bigint 列（char_count / char_offset）在 TypeORM 中映射为 string，此处
 *   在写入时由 number 转换，读取由上层按需解析。
 */
@Injectable()
export class DocumentRepository {
  constructor(
    @InjectRepository(Document)
    private readonly documents: Repository<Document>,
    @InjectRepository(Chapter)
    private readonly chapters: Repository<Chapter>,
  ) {}

  /**
   * 创建并持久化文档元数据。
   * Postconditions:
   *   - 返回已入库的 Document（含生成 id、时间戳）
   *   - ownerId 设为传入上传用户 ID（Requirement 2.4）
   *   - status 默认 'processing'（Requirement 2.5）
   */
  async createDocument(input: CreateDocumentInput): Promise<Document> {
    const document = this.documents.create({
      ownerId: input.ownerId,
      title: input.title,
      storageKey: input.storageKey,
      originalName: input.originalName ?? null,
      encoding: input.encoding ?? 'utf-8',
      charCount: String(input.charCount ?? 0),
      chapterCount: input.chapterCount ?? 0,
      status: input.status ?? 'processing',
    });
    return this.documents.save(document);
  }

  /**
   * 批量持久化某文档的章节索引。
   * Preconditions:
   *   - documentId 对应文档存在
   * Postconditions:
   *   - 每个章节的 documentId 被设为传入 documentId
   *   - 返回已入库的 Chapter 列表；空输入返回空数组
   */
  async persistChapters(
    documentId: string,
    chapters: PersistChapterInput[],
  ): Promise<Chapter[]> {
    if (chapters.length === 0) {
      return [];
    }
    const entities = chapters.map((c) =>
      this.chapters.create({
        documentId,
        idx: c.idx,
        title: c.title,
        charOffset: String(c.charOffset),
        charLength: c.charLength,
        storageKey: c.storageKey,
      }),
    );
    return this.chapters.save(entities);
  }

  /**
   * 按 id 查询文档（排除软删除）。
   * Postconditions:
   *   - 命中且未软删除返回 Document，否则返回 null
   *   - 无副作用
   */
  async findById(id: string): Promise<Document | null> {
    return this.documents.findOne({ where: { id } });
  }

  /**
   * 按 (documentId, idx) 查询单个章节索引。
   *
   * 供阅读视图组装（ReadingService.getArticleView，tasks.md 9.3）按当前进度的
   * 章节序号定位章节，进而据 storageKey 从对象存储拉取正文。
   * Postconditions:
   *   - 命中返回 Chapter，否则返回 null
   *   - 无副作用
   */
  async findChapterByIdx(
    documentId: string,
    idx: number,
  ): Promise<Chapter | null> {
    return this.chapters.findOne({ where: { documentId, idx } });
  }

  /**
   * 返回某用户拥有且未软删除的文档，按创建时间降序分页。
   * 对齐 Requirement 3.1（仅归属且未软删除）与 3.2（分页）。
   * Postconditions:
   *   - items 中每个文档 ownerId === ownerId 且未软删除
   *   - total 为该用户未软删除文档总数（不受分页影响）
   *   - page/pageSize 为规整后的有效值
   */
  async listByOwner(
    ownerId: string,
    options: ListDocumentsOptions = {},
  ): Promise<PaginatedDocuments> {
    const page = this.normalizePage(options.page);
    const pageSize = this.normalizePageSize(options.pageSize);

    const [items, total] = await this.documents.findAndCount({
      where: { ownerId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return { items, total, page, pageSize };
  }

  /**
   * 按标题关键字搜索某用户拥有且未软删除的文档（分页）。
   * 对齐 Requirement 3.3：仅返回标题包含关键字且归属该用户的文档。
   * 使用 ILIKE 大小写不敏感匹配；关键字中的 % 与 _ 通配符被转义。
   */
  async searchByOwnerAndTitle(
    ownerId: string,
    keyword: string,
    options: ListDocumentsOptions = {},
  ): Promise<PaginatedDocuments> {
    const page = this.normalizePage(options.page);
    const pageSize = this.normalizePageSize(options.pageSize);
    const escaped = this.escapeLike(keyword);

    const qb = this.documents
      .createQueryBuilder('document')
      .where('document.owner_id = :ownerId', { ownerId })
      .andWhere('document.deleted_at IS NULL')
      .andWhere("document.title ILIKE :kw ESCAPE '\\'", {
        kw: `%${escaped}%`,
      })
      .orderBy('document.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, pageSize };
  }

  /**
   * 对某用户拥有的文档执行软删除。
   * 归属由 ownerId 约束：仅当文档存在、归属该用户且未软删除时才生效。
   * 对齐 Requirement 3.4（软删除后不再出现在库列表）。归属鉴权的错误语义
   * （非本人删除返回禁止访问）由 Service 层处理（tasks.md 6.3）。
   * Postconditions:
   *   - 命中并软删除返回 true；未命中（不存在/非本人/已删除）返回 false
   */
  async softDeleteByOwner(id: string, ownerId: string): Promise<boolean> {
    const result = await this.documents.softDelete({ id, ownerId });
    return (result.affected ?? 0) > 0;
  }

  /**
   * 更新文档状态（processing → ready / failed）。
   * 供上传解析编排（tasks.md 6.2）在状态流转时调用。
   * Postconditions:
   *   - 命中并更新返回 true，否则 false
   */
  async updateStatus(
    id: string,
    status: DocumentStatusColumn,
  ): Promise<boolean> {
    const result = await this.documents.update({ id }, { status });
    return (result.affected ?? 0) > 0;
  }

  /**
   * 更新文档解析完成后的统计信息（编码 / 字符数 / 章节数）。
   * 供上传解析编排在解析完成写入元数据时调用。
   */
  async updateParsedMeta(
    id: string,
    meta: { encoding?: string; charCount?: number; chapterCount?: number },
  ): Promise<boolean> {
    const patch: {
      encoding?: string;
      charCount?: string;
      chapterCount?: number;
    } = {};
    if (meta.encoding !== undefined) patch.encoding = meta.encoding;
    if (meta.charCount !== undefined) patch.charCount = String(meta.charCount);
    if (meta.chapterCount !== undefined) patch.chapterCount = meta.chapterCount;
    const result = await this.documents.update({ id }, patch);
    return (result.affected ?? 0) > 0;
  }

  private normalizePage(page?: number): number {
    if (page === undefined || !Number.isFinite(page) || page < 1) {
      return DEFAULT_PAGE;
    }
    return Math.floor(page);
  }

  private normalizePageSize(pageSize?: number): number {
    if (
      pageSize === undefined ||
      !Number.isFinite(pageSize) ||
      pageSize < 1
    ) {
      return DEFAULT_PAGE_SIZE;
    }
    return Math.min(Math.floor(pageSize), MAX_PAGE_SIZE);
  }

  /** 转义 LIKE/ILIKE 通配符，配合 ESCAPE '\\' 使关键字按字面匹配。 */
  private escapeLike(input: string): string {
    return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  }
}
