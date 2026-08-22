import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'community_moderation_cases' })
@Unique('uq_community_moderation_cases_revision', [
  'contentType',
  'contentId',
  'revisionId',
])
@Index('idx_community_moderation_cases_queue', [
  'status',
  'riskLevel',
  'updatedAt',
])
@Check('chk_community_moderation_cases_content', `"content_type" IN ('post', 'comment')`)
@Check(
  'chk_community_moderation_cases_status',
  `"status" IN ('open', 'in_review', 'resolved')`,
)
export class ModerationCase {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'content_type', type: 'varchar', length: 16 })
  contentType!: 'post' | 'comment';

  @Column({ name: 'content_id', type: 'uuid' })
  contentId!: string;

  @Column({ name: 'revision_id', type: 'uuid' })
  revisionId!: string;

  @Column({ name: 'author_id', type: 'uuid' })
  authorId!: string;

  @Column({ type: 'varchar', length: 16, default: 'open' })
  status!: 'open' | 'in_review' | 'resolved';

  @Column({ name: 'risk_level', type: 'varchar', length: 16 })
  riskLevel!: 'low' | 'medium' | 'high' | 'critical';

  @Column({ name: 'source_type', type: 'varchar', length: 24 })
  sourceType!: 'submission' | 'report' | 'automated';

  @Column({ name: 'title_snapshot', type: 'varchar', length: 80, nullable: true })
  titleSnapshot!: string | null;

  @Column({ name: 'body_snapshot', type: 'text' })
  bodySnapshot!: string;

  @Column({ name: 'content_state_snapshot', type: 'jsonb' })
  contentStateSnapshot!: Record<string, unknown>;

  @Column({ name: 'report_count', type: 'int', default: 0 })
  reportCount!: number;

  @Column({ name: 'assigned_to', type: 'uuid', nullable: true })
  assignedTo!: string | null;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
