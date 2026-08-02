import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
} from 'typeorm';

import { Document } from './document.entity';

/**
 * fake_meta 表：伪装层假元数据（同一文档稳定一致）。
 * 对齐 design.md Data Models 的 fake_meta DDL：document_id 为主键（1:1 documents）。
 */
@Entity({ name: 'fake_meta' })
export class FakeMeta {
  @PrimaryColumn({ name: 'document_id', type: 'uuid' })
  documentId!: string;

  @OneToOne(() => Document, (document) => document.fakeMeta, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'document_id' })
  document!: Document;

  @Column({ type: 'int' })
  views!: number;

  @Column({ type: 'int' })
  likes!: number;

  @Column({ type: 'int' })
  favorites!: number;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  tags!: string[];

  /** 假"专栏"名 */
  @Column({ name: 'column_name', type: 'varchar', length: 200, nullable: true })
  columnName!: string | null;

  @Column({ name: 'published_at', type: 'timestamptz', default: () => 'now()' })
  publishedAt!: Date;

  /** 由 docId 派生，保证可重现 */
  @Column({ type: 'bigint' })
  seed!: string;
}
