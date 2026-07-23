import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Bookmark } from './bookmark.entity';
import { Chapter } from './chapter.entity';
import { FakeMeta } from './fake-meta.entity';
import { ReadingProgress } from './reading-progress.entity';
import { User } from './user.entity';

export type DocumentStatusColumn = 'processing' | 'ready' | 'failed';

/**
 * documents 表：文档元数据（正文存对象存储）。
 * 对齐 design.md Data Models 的 documents DDL：含 owner_id、status、软删除 deleted_at。
 * 索引 idx_documents_owner 为部分索引（WHERE deleted_at IS NULL），在迁移脚本中定义。
 */
@Entity({ name: 'documents' })
export class Document {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId!: string;

  @ManyToOne(() => User, (user) => user.documents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner!: User;

  @Column({ type: 'varchar', length: 500 })
  title!: string;

  @Column({ name: 'original_name', type: 'varchar', length: 500, nullable: true })
  originalName!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'utf-8' })
  encoding!: string;

  @Column({ name: 'char_count', type: 'bigint', default: 0 })
  charCount!: string;

  @Column({ name: 'chapter_count', type: 'int', default: 0 })
  chapterCount!: number;

  @Column({ name: 'storage_key', type: 'varchar', length: 500 })
  storageKey!: string;

  @Column({ type: 'varchar', length: 20, default: 'processing' })
  status!: DocumentStatusColumn;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => Chapter, (chapter) => chapter.document)
  chapters!: Chapter[];

  @OneToOne(() => FakeMeta, (fakeMeta) => fakeMeta.document)
  fakeMeta!: FakeMeta;

  @OneToMany(() => ReadingProgress, (progress) => progress.document)
  readingProgress!: ReadingProgress[];

  @OneToMany(() => Bookmark, (bookmark) => bookmark.document)
  bookmarks!: Bookmark[];
}
