import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import type {
  ContentModerationStatus,
  ContentPublicationStatus,
  ContentReviewDecision,
} from './community-post.entity';

@Entity({ name: 'community_comments' })
@Index('idx_community_comments_post_created', ['postId', 'createdAt', 'id'])
@Index('idx_community_comments_author_updated', ['authorId', 'updatedAt'])
@Check('chk_community_comments_depth', '"depth" IN (0, 1)')
@Check('chk_community_comments_version', '"version" > 0')
export class CommunityComment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'post_id', type: 'uuid' })
  postId!: string;

  @Column({ name: 'author_id', type: 'uuid' })
  authorId!: string;

  @Column({ name: 'parent_comment_id', type: 'uuid', nullable: true })
  parentCommentId!: string | null;

  @Column({ type: 'smallint' })
  depth!: 0 | 1;

  @Column({ name: 'active_revision_id', type: 'uuid', nullable: true })
  activeRevisionId!: string | null;

  @Column({ name: 'pending_revision_id', type: 'uuid', nullable: true })
  pendingRevisionId!: string | null;

  @Column({ name: 'publication_status', type: 'varchar', length: 24 })
  publicationStatus!: ContentPublicationStatus;

  @Column({ name: 'moderation_status', type: 'varchar', length: 16 })
  moderationStatus!: ContentModerationStatus;

  @Column({ name: 'last_review_decision', type: 'varchar', length: 16, nullable: true })
  lastReviewDecision!: ContentReviewDecision | null;

  @Column({ name: 'last_review_reason', type: 'varchar', length: 500, nullable: true })
  lastReviewReason!: string | null;

  @Column({ name: 'moderation_reason', type: 'varchar', length: 500, nullable: true })
  moderationReason!: string | null;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
