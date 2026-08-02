import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

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

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({ name: 'display_name', type: 'varchar', length: 100, nullable: true })
  displayName!: string | null;

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
}
