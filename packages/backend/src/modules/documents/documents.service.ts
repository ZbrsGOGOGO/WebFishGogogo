import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';

import type { DocumentMeta } from '@stealth-reader/shared';

import type { Document } from '../../database/entities/document.entity';
import {
  DocumentRepository,
  type ListDocumentsOptions,
  type PaginatedDocuments,
} from './document.repository';
import { detectEncoding, splitChapters } from './parsing/parser';
import { STORAGE_PORT, type StoragePort } from './storage';

/**
 * 文档上传输入。
 *
 * 由 Controller 层（tasks.md 6.5）从 multipart 请求解析后传入：
 * - ownerId 为经鉴权守卫解析出的当前用户 ID（Requirement 2.4）。
 * - buffer 为上传文件的原始字节（未解码）。
 * - ownedContentDeclarationConfirmed 为用户是否勾选「自有合法内容声明」（Requirement 2.2）。
 */
export interface UploadDocumentInput {
  ownerId: string;
  originalName: string;
  mimeType?: string | null;
  buffer: Buffer;
  ownedContentDeclarationConfirmed: boolean;
}

/**
 * 上传接受后返回的文档视图（对齐 shared DocumentMeta）。
 */
export type UploadedDocumentView = DocumentMeta;

/**
 * 文档库分页列表视图（对齐 Requirement 3.2 分页）。
 * items 为标准化的 DocumentMeta；total/page/pageSize 供前端渲染分页控件。
 */
export interface PaginatedDocumentView {
  items: DocumentMeta[];
  total: number;
  page: number;
  pageSize: number;
}

/** 受支持的文本 MIME 类型（宽松：多数浏览器对 .txt 上报 text/plain）。 */
const SUPPORTED_TEXT_MIME_TYPES = new Set<string>([
  'text/plain',
  'application/octet-stream', // 部分客户端对 .txt 上报此类型
  '',
]);

/**
 * 文档存储领域应用层（DocumentsService）。
 *
 * 承载 Requirement 2 的上传与解析编排（对齐 design.md 分层原则：业务规则集中在
 * Service 层，Repository 只做数据访问，纯函数域负责解析）。
 *
 * 编排流程：
 *   1. 校验自有内容声明（未确认 → 拒绝，Req 2.2）。
 *   2. 校验文件类型为 .txt（非法类型 → 拒绝，Req 2.3）。
 *   3. 以 owner_id = 上传用户、status = processing 创建文档（Req 2.4, 2.5）。
 *   4. 解析：detectEncoding → 解码 → splitChapters → 逐章 putChapter →
 *      persistChapters + updateParsedMeta。
 *   5. 解析成功标记 ready（Req 2.6）；失败标记 failed 并返回失败原因（Req 2.7）。
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly documentRepo: DocumentRepository,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  /**
   * 上传并解析文档。
   *
   * Preconditions:
   *   - input.ownerId 为合法的当前用户 ID
   * Postconditions:
   *   - 声明未确认时抛出 BadRequestException（Req 2.2），不创建文档
   *   - 类型非 .txt 时抛出 UnsupportedMediaTypeException（Req 2.3），不创建文档
   *   - 接受后文档 ownerId === input.ownerId（Req 2.4）
   *   - 解析成功时文档 status === 'ready' 且章节索引已持久化（Req 2.6）
   *   - 解析失败时文档 status === 'failed'，抛出携带失败原因的异常（Req 2.7）
   *
   * _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_
   */
  async upload(input: UploadDocumentInput): Promise<UploadedDocumentView> {
    // 1) 自有内容声明校验（Req 2.2）：未确认则拒绝，且不创建任何文档。
    if (!input.ownedContentDeclarationConfirmed) {
      throw new BadRequestException('请先确认自有合法内容声明后再上传');
    }

    // 2) 文件类型校验（Req 2.3）：仅支持 .txt 文本类型。
    this.assertSupportedTextType(input.originalName, input.mimeType);

    // 3) 创建文档：owner_id = 上传用户（Req 2.4），初始 status = processing（Req 2.5）。
    // storageKey 为该文档在对象存储中的根标识，作为逐章写入/删除的 docId 使用，
    // 保证 document.storageKey 与实际对象 key 前缀一致。
    const storageKey = randomUUID();
    const title = this.deriveTitle(input.originalName);
    const document = await this.documentRepo.createDocument({
      ownerId: input.ownerId,
      title,
      storageKey,
      originalName: input.originalName,
      status: 'processing',
    });

    // 4) 解析编排；任一步失败 → 标记 failed 并返回失败原因（Req 2.7）。
    try {
      const encoding = detectEncoding(input.buffer);
      const text = this.decode(input.buffer, encoding);
      const chapters = splitChapters(text);

      // 逐章写入对象存储（正文不入库），拿回每章的 storageKey 后持久化章节索引。
      const persisted = [] as Array<{
        idx: number;
        title: string | null;
        charOffset: number;
        charLength: number;
        storageKey: string;
      }>;
      for (const chapter of chapters) {
        const chapterText = text.slice(
          chapter.charOffset,
          chapter.charOffset + chapter.charLength,
        );
        const chapterStorageKey = await this.storage.putChapter(
          storageKey,
          chapter.idx,
          chapterText,
        );
        persisted.push({
          idx: chapter.idx,
          title: chapter.title,
          charOffset: chapter.charOffset,
          charLength: chapter.charLength,
          storageKey: chapterStorageKey,
        });
      }

      await this.documentRepo.persistChapters(document.id, persisted);
      await this.documentRepo.updateParsedMeta(document.id, {
        encoding,
        charCount: text.length,
        chapterCount: chapters.length,
      });

      // 5) 解析完成 → ready（Req 2.6）。
      await this.documentRepo.updateStatus(document.id, 'ready');

      return this.toView({
        id: document.id,
        ownerId: document.ownerId,
        title: document.title,
        encoding,
        charCount: text.length,
        chapterCount: chapters.length,
        status: 'ready',
        createdAt: document.createdAt,
      });
    } catch (error) {
      // 解析失败 → 标记 failed 并返回失败原因（Req 2.7）。
      const reason = error instanceof Error ? error.message : '文档解析失败';
      await this.documentRepo.updateStatus(document.id, 'failed');
      throw new UnprocessableEntityException({
        message: `文档解析失败：${reason}`,
        documentId: document.id,
        status: 'failed',
        reason,
      });
    }
  }

  /**
   * 文档库浏览：返回某用户拥有且未软删除的文档，分页。
   *
   * 对齐 Requirement 3.1（仅返回归属该用户且未被软删除的文档）与 3.2（分页）。
   * 归属由 ownerId 约束下沉到 Repository（listByOwner 以 ownerId 过滤），
   * Service 层不额外做鉴权，因为列表本身只查询该用户的数据，不存在越权风险。
   *
   * Preconditions:
   *   - userId 为经鉴权守卫解析出的当前用户 ID
   * Postconditions:
   *   - 返回 items 中每个文档 ownerId === userId 且未软删除（Req 3.1）
   *   - 结果以分页形式返回，total 为该用户未软删除文档总数（Req 3.2）
   *
   * _Requirements: 3.1, 3.2_
   */
  async listDocuments(
    userId: string,
    options: ListDocumentsOptions = {},
  ): Promise<PaginatedDocumentView> {
    const result = await this.documentRepo.listByOwner(userId, options);
    return this.toPaginatedView(result);
  }

  /**
   * 文档库搜索：按标题关键字返回归属该用户且未软删除的文档，分页。
   *
   * 对齐 Requirement 3.3：仅返回标题包含该关键字且归属该用户的文档。
   * 关键字为空/仅空白时退化为普通列表（返回该用户全部未软删除文档），
   * 避免以空关键字进行无意义的全匹配搜索。
   *
   * Preconditions:
   *   - userId 为经鉴权守卫解析出的当前用户 ID
   * Postconditions:
   *   - 返回 items 中每个文档 ownerId === userId 且标题包含 keyword（Req 3.3）
   *   - 结果以分页形式返回（Req 3.2）
   *
   * _Requirements: 3.1, 3.2, 3.3_
   */
  async searchDocuments(
    userId: string,
    keyword: string,
    options: ListDocumentsOptions = {},
  ): Promise<PaginatedDocumentView> {
    const trimmed = (keyword ?? '').trim();
    if (trimmed.length === 0) {
      return this.listDocuments(userId, options);
    }
    const result = await this.documentRepo.searchByOwnerAndTitle(
      userId,
      trimmed,
      options,
    );
    return this.toPaginatedView(result);
  }

  /**
   * 文档删除：仅当文档归属该用户时执行软删除；否则拒绝并返回禁止访问错误。
   *
   * 对齐 Requirement 3.4（软删除自有文档使其不再出现在库列表）与
   * 3.5（删除非本人拥有的文档返回禁止访问错误）。
   *
   * 实现要点（不泄露存在性，对齐 Requirement 12.2 的一致处理）：
   *   - softDeleteByOwner 仅当 (id, ownerId) 命中且未软删除时返回 true。
   *   - 返回 false 表示：文档不存在、已软删除，或归属他人。为不泄露"文档是否
   *     存在"，统一以 ForbiddenException 拒绝，而非区分 404 与 403。
   *
   * Preconditions:
   *   - userId 为经鉴权守卫解析出的当前用户 ID
   * Postconditions:
   *   - 文档归属该用户时被软删除，之后不再出现在 listDocuments/searchDocuments（Req 3.4）
   *   - 文档非本人拥有（或不存在/已删除）时抛出 ForbiddenException（Req 3.5），不改动任何数据
   *
   * _Requirements: 3.4, 3.5_
   */
  async deleteDocument(userId: string, docId: string): Promise<void> {
    const deleted = await this.documentRepo.softDeleteByOwner(docId, userId);
    if (!deleted) {
      // 未命中：不存在 / 已删除 / 非本人。统一以禁止访问拒绝，不泄露存在性。
      throw new ForbiddenException('无权删除该文档');
    }
  }

  /** 将 Repository 分页结果映射为标准化的 DocumentMeta 分页视图。 */
  private toPaginatedView(result: PaginatedDocuments): PaginatedDocumentView {
    return {
      items: result.items.map((doc) => this.documentToView(doc)),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  }

  /** 将 Document 实体映射为 DocumentMeta（bigint charCount 由 string 解析为 number）。 */
  private documentToView(doc: Document): DocumentMeta {
    return {
      id: doc.id,
      ownerId: doc.ownerId,
      title: doc.title,
      encoding: doc.encoding,
      charCount: Number(doc.charCount),
      chapterCount: doc.chapterCount,
      status: doc.status,
      createdAt: doc.createdAt.toISOString(),
    };
  }

  /**
   * 校验上传文件是否为受支持的 .txt 文本类型（Req 2.3）。
   * 以扩展名为准（.txt，大小写不敏感），并对 MIME 类型做宽松校验。
   */
  private assertSupportedTextType(
    originalName: string,
    mimeType?: string | null,
  ): void {
    const name = (originalName ?? '').trim().toLowerCase();
    const hasTxtExtension = name.endsWith('.txt');
    const normalizedMime = (mimeType ?? '').trim().toLowerCase();
    const mimeAllowed = SUPPORTED_TEXT_MIME_TYPES.has(normalizedMime);

    if (!hasTxtExtension || !mimeAllowed) {
      throw new UnsupportedMediaTypeException(
        '仅支持上传 .txt 纯文本文档',
      );
    }
  }

  /** 由原始文件名派生标题（去除 .txt 扩展名；为空时回退默认名）。 */
  private deriveTitle(originalName: string): string {
    const base = (originalName ?? '').trim().replace(/\.txt$/i, '').trim();
    return base.length > 0 ? base : '未命名文档';
  }

  /**
   * 依据探测到的编码解码字节缓冲区为字符串，并去除可能残留的 BOM。
   * Node 运行时的 TextDecoder（完整 ICU）支持 utf-8 / gbk / gb2312 / utf-16le。
   */
  private decode(buffer: Buffer, encoding: string): string {
    const decoder = new TextDecoder(encoding);
    const text = decoder.decode(buffer);
    // 去除解码后可能残留的 UTF-8 BOM（U+FEFF）。
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  }

  private toView(input: {
    id: string;
    ownerId: string;
    title: string;
    encoding: string;
    charCount: number;
    chapterCount: number;
    status: DocumentMeta['status'];
    createdAt: Date;
  }): UploadedDocumentView {
    return {
      id: input.id,
      ownerId: input.ownerId,
      title: input.title,
      encoding: input.encoding,
      charCount: input.charCount,
      chapterCount: input.chapterCount,
      status: input.status,
      createdAt: input.createdAt.toISOString(),
    };
  }
}
