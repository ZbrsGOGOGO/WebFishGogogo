import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Memo } from '../../database/entities';

/**
 * 便签数据访问层（Repository）。
 *
 * 封装 memos 表的持久化与查询，返回领域实体。对齐 design.md 分层原则：
 * Repository 只负责数据访问，不含业务规则。
 *
 * 便签模型：每个用户仅保留一条"最新便签内容"记录，保存时对该用户 upsert；
 * 读取时取该用户最近更新的一条（新会话恢复上次内容）。
 */
@Injectable()
export class MemoRepository {
  constructor(
    @InjectRepository(Memo)
    private readonly repo: Repository<Memo>,
  ) {}

  /**
   * 读取某用户最近保存的便签内容。
   * @returns 该用户的便签实体；若从未保存过则返回 null。
   */
  async findLatestByUserId(userId: string): Promise<Memo | null> {
    return this.repo.findOne({
      where: { userId },
      order: { updatedAt: 'DESC' },
    });
  }

  /**
   * 保存便签内容并与用户 ID 关联（upsert 语义）。
   *
   * 若该用户已有便签记录则更新其 content，否则创建新记录。
   * 保证同一用户仅保留一条便签记录，恢复时取到的即最新内容。
   *
   * @returns 保存后的便签实体。
   */
  async saveForUser(userId: string, content: string): Promise<Memo> {
    const existing = await this.repo.findOne({ where: { userId } });
    if (existing) {
      existing.content = content;
      return this.repo.save(existing);
    }
    const memo = this.repo.create({ userId, content });
    return this.repo.save(memo);
  }
}
