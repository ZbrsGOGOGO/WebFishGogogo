import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from '../../database/entities';

/**
 * 创建用户所需的输入。
 * 注意：仅接收已经加盐哈希后的 passwordHash，绝不接收/存储明文密码
 * （对齐 requirements.md Requirement 1.7）。
 */
export interface CreateUserInput {
  email: string;
  passwordHash: string;
  displayName?: string | null;
}

/**
 * Auth/User 仓储层：封装 users 表的数据访问，返回领域实体。
 * 仅负责持久化与查询；注册/登录等业务规则在 AuthService（Task 3.2）中实现。
 */
@Injectable()
export class UserRepository {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) {}

  /**
   * 创建并持久化新用户。
   * Preconditions:
   *   - input.passwordHash 为已加盐哈希的密码串（非明文）
   * Postconditions:
   *   - 返回已入库的 User 实体（含生成的 id 与时间戳）
   */
  async createUser(input: CreateUserInput): Promise<User> {
    const user = this.repo.create({
      email: input.email,
      passwordHash: input.passwordHash,
      displayName: input.displayName ?? null,
    });
    return this.repo.save(user);
  }

  /**
   * 按邮箱查询用户。
   * Postconditions:
   *   - 命中返回对应 User，否则返回 null
   *   - 无副作用
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.repo.findOne({ where: { email } });
  }

  /**
   * 按 id 查询用户。
   * Postconditions:
   *   - 命中返回对应 User，否则返回 null
   *   - 无副作用
   */
  async findById(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }
}
