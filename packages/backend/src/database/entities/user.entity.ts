import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { randomUUID } from 'node:crypto';

import { Bookmark } from './bookmark.entity';
import { Document } from './document.entity';
import { Memo } from './memo.entity';
import { ReadingProgress } from './reading-progress.entity';
import { UserPreference } from './user-preference.entity';

/**
 * users 表：用户账户。
 * 对齐 design.md Data Models 的 users DDL。
 */
@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  /**
   * 登录与唯一性判断使用的规范化邮箱。原始 email 仅作为展示值保留。
   */
  @Column({ name: 'email_normalized', type: 'varchar', length: 255, unique: true })
  emailNormalized!: string;

  /**
   * 用户名密码账号的公开登录名。旧邮箱账号保持 null，二者可以并存。
   */
  @Column({ type: 'varchar', length: 20, nullable: true })
  username!: string | null;

  @Column({
    name: 'username_normalized',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  usernameNormalized!: string | null;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({ name: 'display_name', type: 'varchar', length: 100, nullable: true })
  displayName!: string | null;

  /** 对外稳定标识；任何 API 都不应返回内部主键 id。 */
  @Column({ name: 'public_id', type: 'uuid', unique: true })
  publicId!: string;

  @Column({
    name: 'account_status',
    type: 'varchar',
    length: 24,
    default: 'pending_email',
  })
  accountStatus!:
    | 'pending_email'
    | 'active'
    | 'suspended'
    | 'banned'
    | 'deleting'
    | 'deleted';

  @Column({
    name: 'social_verification_status',
    type: 'varchar',
    length: 24,
    default: 'unverified',
  })
  socialVerificationStatus!:
    | 'unverified'
    | 'pending'
    | 'verified'
    | 'rejected'
    | 'expired';

  /** 服务端社区权限真源；公开主页永不返回该字段。 */
  @Column({
    name: 'community_role',
    type: 'varchar',
    length: 16,
    default: 'user',
  })
  communityRole!: 'user' | 'moderator' | 'admin';

  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt!: Date | null;

  @Column({ name: 'password_changed_at', type: 'timestamptz' })
  passwordChangedAt!: Date;

  @Column({ name: 'onboarding_completed', type: 'boolean', default: false })
  onboardingCompleted!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => Document, (document) => document.owner)
  documents!: Document[];

  @OneToMany(() => ReadingProgress, (progress) => progress.user)
  readingProgress!: ReadingProgress[];

  @OneToMany(() => Bookmark, (bookmark) => bookmark.user)
  bookmarks!: Bookmark[];

  @OneToMany(() => Memo, (memo) => memo.user)
  memos!: Memo[];

  @OneToOne(() => UserPreference, (preference) => preference.user)
  preference!: UserPreference;

  /** 兼容所有通过 TypeORM 仓储创建用户的既有测试与内部工具。 */
  @BeforeInsert()
  initializeSecurityFields(): void {
    this.email = this.email.trim();
    this.emailNormalized ??= this.email.normalize('NFC').toLowerCase();
    if (this.username) {
      this.username = this.username.trim().normalize('NFC');
      this.usernameNormalized ??= this.username.toLowerCase();
    } else {
      this.username = null;
      this.usernameNormalized = null;
    }
    this.publicId ??= randomUUID();
    this.passwordChangedAt ??= new Date();
  }
}
