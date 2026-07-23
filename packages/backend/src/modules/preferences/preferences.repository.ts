import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Profession } from '@stealth-reader/shared';
import { Repository } from 'typeorm';

import { UserPreference } from '../../database/entities/user-preference.entity';

/**
 * 可持久化的用户偏好字段子集（不含主键 user_id 与只读时间戳）。
 * 对齐 design.md user_preferences DDL 与 requirements 6.4 / 9.4 / 14.6。
 */
export interface PreferencePatch {
  activeSkin?: string;
  fontSize?: number;
  lineHeight?: string;
  theme?: string;
  bossKey?: string;
  profession?: Profession | null;
  settings?: Record<string, unknown>;
}

/**
 * Preferences Repository：user_preferences 表的数据访问层。
 *
 * 采用 upsert 语义：偏好行以 user_id 为主键与 users 表 1:1；
 * 首次写入若无记录则创建，之后仅更新提供的字段。
 */
@Injectable()
export class PreferencesRepository {
  constructor(
    @InjectRepository(UserPreference)
    private readonly repo: Repository<UserPreference>,
  ) {}

  /** 读取用户偏好；不存在时返回 null。 */
  async findByUserId(userId: string): Promise<UserPreference | null> {
    return this.repo.findOne({ where: { userId } });
  }

  /**
   * 确保用户偏好行存在；不存在则以数据库默认值创建并返回。
   */
  async ensure(userId: string): Promise<UserPreference> {
    const existing = await this.repo.findOne({ where: { userId } });
    if (existing) return existing;
    const created = this.repo.create({ userId });
    return this.repo.save(created);
  }

  /**
   * 更新（或创建）用户偏好中提供的字段，返回最新完整偏好。
   * 仅覆盖 patch 中出现的字段，其余保持不变。
   */
  async upsert(userId: string, patch: PreferencePatch): Promise<UserPreference> {
    const current = await this.ensure(userId);
    this.repo.merge(current, patch);
    return this.repo.save(current);
  }

  /**
   * 读取用户已持久化的职业偏好。
   * 未设置（或无偏好行）时返回 null。
   */
  async getProfession(userId: string): Promise<Profession | null> {
    const pref = await this.repo.findOne({ where: { userId } });
    return (pref?.profession as Profession | null) ?? null;
  }

  /**
   * 持久化用户职业偏好（Req 14.6）。
   * Postcondition: getProfession(userId) === profession（往返一致 —— 对齐 Property 9）。
   */
  async setProfession(userId: string, profession: Profession): Promise<void> {
    await this.upsert(userId, { profession });
  }
}
