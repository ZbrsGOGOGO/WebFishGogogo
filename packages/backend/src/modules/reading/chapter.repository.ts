import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Chapter } from '../../database/entities';

/**
 * 章节数据访问层（Repository），供阅读引擎读取章节目录与按序号定位章节。
 *
 * 对齐 design.md 分层原则：Repository 只负责数据访问，不含业务规则
 * （目录返回、跳转编排在 ReadingService，见 tasks.md 9.5）。
 */
@Injectable()
export class ChapterRepository {
  constructor(
    @InjectRepository(Chapter)
    private readonly repo: Repository<Chapter>,
  ) {}

  /**
   * 返回某文档全部章节，按 idx 升序（章节目录）。
   * 对齐 Requirement 8.1：按 idx 升序排列的章节列表。
   */
  async listByDocument(documentId: string): Promise<Chapter[]> {
    return this.repo.find({
      where: { documentId },
      order: { idx: 'ASC' },
    });
  }

  /**
   * 按 (documentId, idx) 查询单个章节；不存在返回 null。
   */
  async findByIdx(documentId: string, idx: number): Promise<Chapter | null> {
    return this.repo.findOne({ where: { documentId, idx } });
  }
}
