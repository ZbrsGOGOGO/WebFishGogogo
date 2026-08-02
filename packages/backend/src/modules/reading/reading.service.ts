import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ArticleViewModel,
  DEFAULT_CHARS_PER_PAGE,
  ReadingProgress as ReadingProgressDto,
} from '@stealth-reader/shared';

import { DocumentRepository } from '../documents/document.repository';
import {
  STORAGE_PORT,
  StoragePort,
} from '../documents/storage';
import { SkinService } from '../skin/skin.service';
import { BookmarkRepository } from './bookmark.repository';
import { ChapterRepository } from './chapter.repository';
import { getPage } from './paginator';
import { ProgressRepository } from './progress.repository';

/**
 * 章节目录项（对外视图）。charOffset 为全文起始偏移（bigint 解析为 number）。
 */
export interface ChapterTocItem {
  idx: number;
  title: string | null;
  charOffset: number;
  charLength: number;
}

/**
 * 阅读位置（章节序号 + 章节内偏移），用于目录/书签跳转结果。
 */
export interface ReadingPosition {
  chapterIdx: number;
  charOffset: number;
}

/**
 * 书签视图（对外结果）。charOffset 为章节内偏移（bigint 解析为 number）。
 */
export interface BookmarkView {
  id: string;
  documentId: string;
  chapterIdx: number;
  charOffset: number;
  note: string | null;
  createdAt: string;
}

/**
 * 创建书签输入（Service 层）。
 */
export interface CreateBookmarkParams {
  chapterIdx: number;
  charOffset: number;
  note?: string | null;
}

/**
 * 阅读引擎服务（Reading_Engine）。
 *
 * 承载两组业务能力：
 *
 * A. 阅读视图组装与进度（tasks.md 9.3）：
 * - getArticleView：按用户当前进度组装伪装文章视图（Req 5.1/6.1）。
 * - saveProgress：幂等保存阅读进度（Req 7.2），支撑 Property 6。
 *
 * B. 章节目录与书签（tasks.md 9.5 / Requirement 8）：
 * - 目录按 idx 升序返回（Req 8.1）；从目录跳转到章节起始处（Req 8.2）；
 *   在当前位置创建书签（Req 8.3）；跳转到已保存书签（Req 8.4）；
 *   删除本人书签（Req 8.5）。
 *
 * 归属鉴权（对齐 Requirement 12.1/12.2/12.3）：所有文档内容相关操作先校验
 * 文档归属；非本人或不存在一律抛 ForbiddenException，不泄露文档是否存在。
 */
@Injectable()
export class ReadingService {
  constructor(
    private readonly progressRepo: ProgressRepository,
    private readonly documentRepo: DocumentRepository,
    private readonly chapterRepo: ChapterRepository,
    private readonly bookmarkRepo: BookmarkRepository,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly skinService: SkinService,
  ) {}

  /**
   * 组装某用户某文档的阅读视图模型（伪装文章）。
   *
   * 流程：校验归属 → getOrInit 进度 → 按 progress.chapterIdx 定位章节 →
   * 从对象存储拉取章节正文 → getPage 切片 → SkinService.render 渲染。
   *
   * Preconditions:
   *   - userId 拥有 documentId（否则抛 ForbiddenException，且不泄露存在性）
   * Postconditions:
   *   - 返回 ArticleViewModel，其 progress 反映用户当前进度
   *   - fakeMeta 对同一 documentId 稳定一致
   *
   * _Requirements: 5.1, 6.1, 12.1, 12.2, 12.3_
   */
  async getArticleView(
    userId: string,
    documentId: string,
    skinId: string,
  ): Promise<ArticleViewModel> {
    await this.assertDocumentOwnership(userId, documentId);

    const progressEntity = await this.progressRepo.getOrInit(
      userId,
      documentId,
    );
    const progress = this.toProgressDto(progressEntity);

    const chapter = await this.documentRepo.findChapterByIdx(
      documentId,
      progress.chapterIdx,
    );
    if (!chapter) {
      throw new NotFoundException('章节不存在');
    }

    const rawText = await this.storage.getChapter(chapter.storageKey);
    const page = getPage({
      chapterText: rawText,
      charOffset: progress.charOffset,
      charsPerPage: DEFAULT_CHARS_PER_PAGE,
    });

    return this.skinService.render(skinId, {
      title: chapter.title ?? '未命名章节',
      body: page.content,
      documentId,
      progress,
    });
  }

  /**
   * 保存阅读进度（幂等 upsert）。先校验文档归属再落库。
   *
   * Postconditions:
   *   - reading_progress 中 (userId, documentId) 唯一一条被更新
   *   - percent ∈ [0, 100]（由 ProgressRepository 收敛）
   *
   * _Requirements: 7.2, 12.1, 12.2, 12.3_
   */
  async saveProgress(
    userId: string,
    progress: ReadingProgressDto,
  ): Promise<void> {
    await this.assertDocumentOwnership(userId, progress.documentId);
    await this.progressRepo.upsert(userId, progress);
  }

  /**
   * 返回某文档按 idx 升序的章节目录。
   * 先校验文档归属该用户（越权抛 ForbiddenException，不泄露存在性）。
   *
   * _Requirements: 8.1, 12.1, 12.3_
   */
  async getChapters(
    userId: string,
    documentId: string,
  ): Promise<ChapterTocItem[]> {
    await this.assertDocumentOwnership(userId, documentId);
    const chapters = await this.chapterRepo.listByDocument(documentId);
    return chapters.map((c) => ({
      idx: c.idx,
      title: c.title,
      charOffset: Number(c.charOffset),
      charLength: c.charLength,
    }));
  }

  /**
   * 从目录跳转到某章节：返回该章节起始处的阅读位置（章节内偏移为 0）。
   * 校验文档归属与目标章节存在性。
   *
   * _Requirements: 8.2, 12.1, 12.3_
   */
  async jumpToChapter(
    userId: string,
    documentId: string,
    chapterIdx: number,
  ): Promise<ReadingPosition> {
    await this.assertDocumentOwnership(userId, documentId);
    const chapter = await this.chapterRepo.findByIdx(documentId, chapterIdx);
    if (!chapter) {
      throw new NotFoundException('章节不存在');
    }
    return { chapterIdx: chapter.idx, charOffset: 0 };
  }

  /**
   * 在当前位置创建书签，记录 chapter_idx 与 char_offset。
   * 校验文档归属；书签与发起请求的用户 ID 关联。
   *
   * _Requirements: 8.3, 12.1, 12.3_
   */
  async createBookmark(
    userId: string,
    documentId: string,
    params: CreateBookmarkParams,
  ): Promise<BookmarkView> {
    await this.assertDocumentOwnership(userId, documentId);
    const bookmark = await this.bookmarkRepo.create({
      userId,
      documentId,
      chapterIdx: params.chapterIdx,
      charOffset: params.charOffset,
      note: params.note ?? null,
    });
    return this.toBookmarkView(bookmark);
  }

  /**
   * 列出某用户在某文档下的书签（按创建时间升序）。
   * 仅返回该用户自己的书签（归属隔离）。
   *
   * _Requirements: 8.4_
   */
  async listBookmarks(
    userId: string,
    documentId: string,
  ): Promise<BookmarkView[]> {
    await this.assertDocumentOwnership(userId, documentId);
    const bookmarks = await this.bookmarkRepo.listByUserAndDocument(
      userId,
      documentId,
    );
    return bookmarks.map((b) => this.toBookmarkView(b));
  }

  /**
   * 选择某个已保存书签，返回其记录的章节序号与偏移处的阅读位置。
   * 仅允许跳转到本人拥有的书签（非本人抛 ForbiddenException）。
   *
   * _Requirements: 8.4_
   */
  async jumpToBookmark(
    userId: string,
    bookmarkId: string,
  ): Promise<ReadingPosition> {
    const bookmark = await this.bookmarkRepo.findById(bookmarkId);
    if (!bookmark || bookmark.userId !== userId) {
      // 不区分「不存在」与「非本人」，避免泄露存在性。
      throw new ForbiddenException('无权访问该书签');
    }
    return {
      chapterIdx: bookmark.chapterIdx,
      charOffset: Number(bookmark.charOffset),
    };
  }

  /**
   * 删除某个自己拥有的书签；删除非本人书签受限。
   *
   * _Requirements: 8.5_
   */
  async deleteBookmark(userId: string, bookmarkId: string): Promise<void> {
    const bookmark = await this.bookmarkRepo.findById(bookmarkId);
    if (!bookmark || bookmark.userId !== userId) {
      // 非本人（或不存在）一律拒绝，且不泄露存在性。
      throw new ForbiddenException('无权删除该书签');
    }
    await this.bookmarkRepo.deleteById(bookmarkId);
  }

  /**
   * 校验文档归属该用户。文档不存在或非本人拥有时抛 ForbiddenException，
   * 不区分两种情况以避免泄露文档是否存在（Req 12.2）。
   */
  private async assertDocumentOwnership(
    userId: string,
    documentId: string,
  ): Promise<void> {
    const document = await this.documentRepo.findById(documentId);
    if (!document || document.ownerId !== userId) {
      throw new ForbiddenException('无权访问该文档');
    }
  }

  /**
   * 将 reading_progress 实体（bigint/numeric 映射为 string）转换为对外
   * ReadingProgress DTO（charOffset/percent 为 number）。
   */
  private toProgressDto(entity: {
    documentId: string;
    chapterIdx: number;
    charOffset: string;
    percent: string;
  }): ReadingProgressDto {
    return {
      documentId: entity.documentId,
      chapterIdx: entity.chapterIdx,
      charOffset: Number(entity.charOffset),
      percent: Number(entity.percent),
    };
  }

  private toBookmarkView(bookmark: {
    id: string;
    documentId: string;
    chapterIdx: number;
    charOffset: string;
    note: string | null;
    createdAt: Date;
  }): BookmarkView {
    return {
      id: bookmark.id,
      documentId: bookmark.documentId,
      chapterIdx: bookmark.chapterIdx,
      charOffset: Number(bookmark.charOffset),
      note: bookmark.note,
      createdAt: bookmark.createdAt
        ? bookmark.createdAt.toISOString()
        : new Date().toISOString(),
    };
  }
}
