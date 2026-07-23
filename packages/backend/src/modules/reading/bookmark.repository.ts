import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Bookmark } from '../../database/entities';

/**
 * 创建书签所需输入（正文/位置定位信息）。
 * 对齐 design.md bookmarks DDL：记录 chapter_idx 与 char_offset。
 */
export interface CreateBookmarkInput {
  userId: string;
  documentId: string;
  chapterIdx: number;
  charOffset: number;
  note?: string | null;
}

/**
 * 书签数据访问层（Repository）。
 *
 * 封装 bookmarks 表的持久化与查询，返回领域实体。对齐 design.md 分层原则：
 * Repository 只负责数据访问，不含业务规则（归属鉴权在 ReadingService，
 * 见 tasks.md 9.5）。
 *
 * bigint 列（char_offset）在 TypeORM 中映射为 string：写入时由 number 转换，
 * 读取由上层按需解析。
 */
@Injectable()
export class BookmarkRepository {
  constructor(
    @InjectRepository(Bookmark)
    private readonly repo: Repository<Bookmark>,
  ) {}

  /**
   * 创建并持久化一条书签。
   * Postconditions:
   *   - 返回已入库的 Bookmark（含生成 id、created_at）
   *   - 记录包含 chapter_idx 与 char_offset（Requirement 8.3）
   */
  async create(input: CreateBookmarkInput): Promise<Bookmark> {
    const bookmark = this.repo.create({
      userId: input.userId,
      documentId: input.documentId,
      chapterIdx: input.chapterIdx,
      charOffset: String(input.charOffset),
      note: input.note ?? null,
    });
    return this.repo.save(bookmark);
  }

  /**
   * 按 id 查询书签；不存在返回 null。
   */
  async findById(id: string): Promise<Bookmark | null> {
    return this.repo.findOne({ where: { id } });
  }

  /**
   * 返回某用户在某文档下的书签，按创建时间升序。
   * 归属由 userId + documentId 约束（仅返回该用户自己的书签）。
   */
  async listByUserAndDocument(
    userId: string,
    documentId: string,
  ): Promise<Bookmark[]> {
    return this.repo.find({
      where: { userId, documentId },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * 按 id 删除书签。
   * Postconditions:
   *   - 命中并删除返回 true，否则 false
   */
  async deleteById(id: string): Promise<boolean> {
    const result = await this.repo.delete({ id });
    return (result.affected ?? 0) > 0;
  }
}
