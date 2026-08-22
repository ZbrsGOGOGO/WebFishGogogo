import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ContentPublicationStatus = 'draft' | 'pending_review' | 'published';
export type ContentModerationStatus = 'normal' | 'limited' | 'hidden';
export type ContentReviewDecision = 'approved' | 'rejected' | 'withdrawn';
export type CommunityPostType = 'experience' | 'question' | 'retrospective';
export type CommunityPostChannel =
  | 'general'
  | 'developer'
  | 'product-manager'
  | 'qa'
  | 'sales'
  | 'human-resources'
  | 'questions'
  | 'retrospectives'
  | 'tools';

@Entity({ name: 'community_posts' })
@Index('idx_community_posts_author_updated', ['authorId', 'updatedAt'])
@Index('idx_community_posts_publication', ['updatedAt', 'id'], {
  where: '"publication_status" = \'published\' AND "deleted_at" IS NULL',
})
@Check(
  'chk_community_posts_publication',
  `"publication_status" IN ('draft', 'pending_review', 'published')`,
)
@Check(
  'chk_community_posts_moderation',
  `"moderation_status" IN ('normal', 'limited', 'hidden')`,
)
@Check('chk_community_posts_version', '"version" > 0')
export class CommunityPost {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'author_id', type: 'uuid' })
  authorId!: string;

  @Column({ name: 'active_revision_id', type: 'uuid', nullable: true })
  activeRevisionId!: string | null;

  @Column({ name: 'pending_revision_id', type: 'uuid', nullable: true })
  pendingRevisionId!: string | null;

  @Column({ name: 'accepted_comment_id', type: 'uuid', nullable: true })
  acceptedCommentId!: string | null;

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
