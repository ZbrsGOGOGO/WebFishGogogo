import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

export type ContentReportReason =
  | 'illegal'
  | 'harassment'
  | 'spam'
  | 'misinformation'
  | 'privacy'
  | 'other';

@Entity({ name: 'community_content_reports' })
@Unique('uq_community_content_reports_idempotency', ['reporterId', 'idempotencyKey'])
@Index('idx_community_content_reports_target', ['targetType', 'targetId', 'createdAt'])
@Check('chk_community_content_reports_target', `"target_type" IN ('post', 'comment')`)
export class ContentReport {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'reporter_id', type: 'uuid' })
  reporterId!: string;

  @Column({ name: 'target_type', type: 'varchar', length: 16 })
  targetType!: 'post' | 'comment';

  @Column({ name: 'target_id', type: 'uuid' })
  targetId!: string;

  @Column({ type: 'varchar', length: 24 })
  reason!: ContentReportReason;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  details!: string | null;

  @Column({ name: 'evidence_snapshot', type: 'jsonb' })
  evidenceSnapshot!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 16, default: 'open' })
  status!: 'open' | 'resolved';

  @Column({ name: 'idempotency_key', type: 'varchar', length: 100 })
  idempotencyKey!: string;

  @Column({ name: 'request_hash', type: 'varchar', length: 64 })
  requestHash!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
