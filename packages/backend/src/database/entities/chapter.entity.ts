import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { Document } from './document.entity';

/**
 * chapters 表：章节索引（正文不入库，仅存对象存储定位信息）。
 * 对齐 design.md Data Models 的 chapters DDL：UNIQUE(document_id, idx)。
 */
@Entity({ name: 'chapters' })
@Unique('uq_chapters_document_idx', ['documentId', 'idx'])
@Index('idx_chapters_doc', ['documentId'])
export class Chapter {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId!: string;

  @ManyToOne(() => Document, (document) => document.chapters, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'document_id' })
  document!: Document;

  /** 章节序号，从 0 开始 */
  @Column({ type: 'int' })
  idx!: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  title!: string | null;

  /** 在全文中的起始字符偏移 */
  @Column({ name: 'char_offset', type: 'bigint' })
  charOffset!: string;

  @Column({ name: 'char_length', type: 'int' })
  charLength!: number;

  @Column({ name: 'storage_key', type: 'varchar', length: 500 })
  storageKey!: string;
}
