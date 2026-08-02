import {
  Check,
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from './user.entity';

/**
 * 受支持职业集合（与 requirements.md Requirement 14 一致）。
 * 与 shared 包 Profession 枚举取值一致：{开发,设计,运营,财务,销售,学生,其他}。
 */
export const SUPPORTED_PROFESSIONS = [
  '开发',
  '设计',
  '运营',
  '财务',
  '销售',
  '学生',
  '其他',
] as const;

/** CHECK 约束表达式：profession 可空，非空时须属于受支持集合 */
export const PROFESSION_CHECK_EXPR = `profession IS NULL OR profession IN (${SUPPORTED_PROFESSIONS.map(
  (p) => `'${p}'`,
).join(',')})`;

/**
 * user_preferences 表：用户偏好（皮肤、阅读设置、老板键、职业等）。
 * 对齐 design.md Data Models 的 user_preferences DDL：
 * user_id 主键（1:1 users），profession 含 CHECK 约束。
 */
@Entity({ name: 'user_preferences' })
@Check('chk_profession', PROFESSION_CHECK_EXPR)
export class UserPreference {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @OneToOne(() => User, (user) => user.preference, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'active_skin', type: 'varchar', length: 50, default: 'csdn' })
  activeSkin!: string;

  @Column({ name: 'font_size', type: 'int', default: 16 })
  fontSize!: number;

  @Column({ name: 'line_height', type: 'numeric', precision: 3, scale: 1, default: 1.8 })
  lineHeight!: string;

  @Column({ type: 'varchar', length: 20, default: 'light' })
  theme!: string;

  @Column({ name: 'boss_key', type: 'varchar', length: 20, default: 'Escape' })
  bossKey!: string;

  /** 职业偏好，可空；取值 ∈ {开发,设计,运营,财务,销售,学生,其他} */
  @Column({ type: 'varchar', length: 20, nullable: true })
  profession!: string | null;

  /** 小工具等扩展配置 */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  settings!: Record<string, unknown>;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
