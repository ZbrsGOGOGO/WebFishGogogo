import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ReadingProgress as ReadingProgressDto } from '@stealth-reader/shared';
import { Repository } from 'typeorm';

import { ReadingProgress } from '../../database/entities';

/**
 * 将 percent 收敛到 [0, 100] 闭区间（对齐 Requirement 7.4）。
 * 非法/非有限输入按 0 处理，避免落库异常值。
 */
function clampPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  if (percent < 0) return 0;
  if (percent > 100) return 100;
  return percent;
}

/**
 * Progress Repository：reading_progress 表的数据访问层。
 *
 * 对齐 design.md 关切点 6 分层原则：Repository 仅负责数据访问，不含业务规则。
 *
 * 进度模型：每 `(userId, documentId)` 仅保留一条记录（表上有
 * `UNIQUE(user_id, document_id)` 约束）。保存采用幂等 upsert：
 * - 已存在则更新为最新值；不存在则创建。
 * - `percent` 收敛到 `[0, 100]` 闭区间（Req 7.4）。
 * - `updated_at` 由 `@UpdateDateColumn` 在每次写入时刷新，因此并发写入
 *   以最后提交者为准（Last-Write-Wins，Req 7.5）。
 *
 * 该实现是 Property 5（进度幂等性）的底层保障。
 */
@Injectable()
export class ProgressRepository {
  constructor(
    @InjectRepository(ReadingProgress)
    private readonly repo: Repository<ReadingProgress>,
  ) {}

  /**
   * 读取某用户对某文档的进度；不存在时返回 null。
   */
  async find(
    userId: string,
    documentId: string,
  ): Promise<ReadingProgress | null> {
    return this.repo.findOne({ where: { userId, documentId } });
  }

  /**
   * 读取进度；若不存在则以默认值（章节 0、偏移 0、百分比 0）初始化一条记录并返回。
   *
   * 供阅读视图组装（ReadingService.getArticleView，Task 9.3）在首次阅读时获得
   * 一个可用的初始进度。
   */
  async getOrInit(
    userId: string,
    documentId: string,
  ): Promise<ReadingProgress> {
    const existing = await this.repo.findOne({
      where: { userId, documentId },
    });
    if (existing) return existing;

    const created = this.repo.create({
      userId,
      documentId,
      chapterIdx: 0,
      charOffset: '0',
      percent: '0',
    });
    return this.repo.save(created);
  }

  /**
   * 幂等保存阅读进度（upsert）。
   *
   * Postconditions（对齐 Requirements 7.3/7.4/7.5 与 Property 5）：
   * - `(userId, documentId)` 在 reading_progress 中始终仅一条记录。
   * - 连续多次以相同输入调用后，记录值等于最后一次输入。
   * - 落库的 `percent ∈ [0, 100]`。
   * - `updated_at` 每次写入刷新，并发写入以最新提交为准（LWW）。
   *
   * @returns 保存后的进度实体。
   */
  async upsert(
    userId: string,
    progress: ReadingProgressDto,
  ): Promise<ReadingProgress> {
    const chapterIdx = progress.chapterIdx;
    const charOffset = String(progress.charOffset);
    const percent = String(clampPercent(progress.percent));

    const existing = await this.repo.findOne({
      where: { userId, documentId: progress.documentId },
    });

    if (existing) {
      existing.chapterIdx = chapterIdx;
      existing.charOffset = charOffset;
      existing.percent = percent;
      return this.repo.save(existing);
    }

    const created = this.repo.create({
      userId,
      documentId: progress.documentId,
      chapterIdx,
      charOffset,
      percent,
    });
    return this.repo.save(created);
  }
}
