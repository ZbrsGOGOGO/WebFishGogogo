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
  CommunityPostChannel,
  CommunityPostType,
  ContentModerationStatus,
  ContentPublicationStatus,
  ContentReviewDecision,
} from './community-post.entity';

@Entity({ name: 'community_post_revisions' })
@Unique('uq_community_post_revisions_version', ['postId', 'version'])
@Index('idx_community_post_revisions_post_created', ['postId', 'createdAt'])
@Check('chk_community_post_revisions_version', '"version" > 0')
export class PostRevision {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'post_id', type: 'uuid' })
  postId!: string;

  @Column({ type: 'int' })
  version!: number;

  @Column({ type: 'varchar', length: 24 })
  type!: CommunityPostType;

  @Column({ type: 'varchar', length: 32 })
  channel!: CommunityPostChannel;

  @Column({ type: 'varchar', length: 80 })
  title!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ name: 'body_format', type: 'varchar', length: 24 })
  bodyFormat!: 'plain_text' | 'restricted_markdown';

  @Column({ type: 'jsonb', default: () => "'[]'" })
  tags!: string[];

  @Column({ name: 'search_document', type: 'text' })
  searchDocument!: string;

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
