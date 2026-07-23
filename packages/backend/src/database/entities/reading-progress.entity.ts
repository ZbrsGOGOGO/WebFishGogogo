import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { Document } from './document.entity';
import { User } from './user.entity';

/**
 * reading_progress 表：每用户每文档一条阅读进度。
 * 对齐 design.md Data Models 的 reading_progress DDL：UNIQUE(user_id, document_id)。
 */
@Entity({ name: 'reading_progress' })
@Unique('uq_reading_progress_user_document', ['userId', 'documentId'])
export class ReadingProgress {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, (user) => user.readingProgress, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId!: string;

  @ManyToOne(() => Document, (document) => document.readingProgress, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'document_id' })
  document!: Document;

  @Column({ name: 'chapter_idx', type: 'int', default: 0 })
  chapterIdx!: number;

  /** 章节内偏移 */
  @Column({ name: 'char_offset', type: 'bigint', default: 0 })
  charOffset!: string;

  /** 全书百分比 */
  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  percent!: string;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
