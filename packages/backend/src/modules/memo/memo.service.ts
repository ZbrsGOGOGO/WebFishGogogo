import { Injectable } from '@nestjs/common';

import { MemoRepository } from './memo.repository';

/**
 * 便签内容视图（Service 层返回的领域结果）。
 */
export interface MemoContent {
  content: string;
  updatedAt: string | null;
}

/**
 * 便签服务（Memo_Service）。
 *
 * 承载 Requirement 10 的业务规则：
 * - 保存便签时将内容与发起请求的用户 ID 关联（Req 10.3）。
 * - 保存最新便签内容（Req 10.1；防抖由前端负责，后端仅持久化最新值）。
 * - 新会话中恢复该用户上次保存的便签内容（Req 10.2）。
 */
@Injectable()
export class MemoService {
  constructor(private readonly memoRepo: MemoRepository) {}

  /**
   * 保存便签最新内容，关联到发起请求的用户 ID。
   * 对同一用户为 upsert：始终以最新一次保存为准。
   *
   * _Requirements: 10.1, 10.3_
   */
  async saveMemo(userId: string, content: string): Promise<MemoContent> {
    const memo = await this.memoRepo.saveForUser(userId, content);
    return {
      content: memo.content,
      updatedAt: memo.updatedAt ? memo.updatedAt.toISOString() : null,
    };
  }

  /**
   * 恢复该用户上次保存的便签内容（新会话打开便签时调用）。
   * 若该用户从未保存过便签，返回空内容。
   *
   * _Requirements: 10.2_
   */
  async getMemo(userId: string): Promise<MemoContent> {
    const memo = await this.memoRepo.findLatestByUserId(userId);
    if (!memo) {
      return { content: '', updatedAt: null };
    }
    return {
      content: memo.content,
      updatedAt: memo.updatedAt ? memo.updatedAt.toISOString() : null,
    };
  }
}
