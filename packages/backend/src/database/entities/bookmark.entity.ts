import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Document } from './document.entity';
import { User } from './user.entity';

/**
 * bookmarks 表：手动书签。
 * 对齐 design.md Data Models 的 bookmarks DDL：idx_bookmarks_user_doc(user_id, document_id)。
 */
@Entity({ name: 'bookmarks' })
@Index('idx_bookmarks_user_doc', ['userId', 'documentId'])
export class Bookmark {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, (user) => user.bookmarks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId!: string;

  @ManyToOne(() => Document, (document) => document.bookmarks, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'document_id' })
  document!: Document;

  @Column({ name: 'chapter_idx', type: 'int' })
  chapterIdx!: number;

  @Column({ name: 'char_offset', type: 'bigint' })
  charOffset!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
