import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import type {
  ContentModerationStatus,
  ContentPublicationStatus,
  ContentReviewDecision,
} from './community-post.entity';

@Entity({ name: 'community_comment_revisions' })
@Unique('uq_community_comment_revisions_version', ['commentId', 'version'])
@Index('idx_community_comment_revisions_comment_created', ['commentId', 'createdAt'])
@Check('chk_community_comment_revisions_version', '"version" > 0')
export class CommentRevision {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'comment_id', type: 'uuid' })
  commentId!: string;

  @Column({ type: 'int' })
  version!: number;

  @Column({ type: 'text' })
  body!: string;

  @Column({ name: 'content_hash', type: 'varchar', length: 64 })
  contentHash!: string;

  @Column({ name: 'publication_status', type: 'varchar', length: 24 })
  publicationStatus!: ContentPublicationStatus;

  @Column({ name: 'moderation_status', type: 'varchar', length: 16 })
  moderationStatus!: ContentModerationStatus;

  @Column({ name: 'review_decision', type: 'varchar', length: 16, nullable: true })
  reviewDecision!: ContentReviewDecision | null;

  @Column({ name: 'review_reason', type: 'varchar', length: 500, nullable: true })
  reviewReason!: string | null;

  @Column({ name: 'risk_level', type: 'varchar', length: 16, default: 'low' })
  riskLevel!: 'low' | 'medium' | 'high' | 'critical';

  @Column({ name: 'effective_at', type: 'timestamptz', nullable: true })
  effectiveAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
