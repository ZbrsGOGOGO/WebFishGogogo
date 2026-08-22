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

export type NewsArticleStatus = 'draft' | 'pending_review' | 'published' | 'withdrawn';

@Entity({ name: 'news_articles' })
@Index('uq_news_articles_public_id', ['publicId'], { unique: true })
@Index('idx_news_articles_publication', ['status', 'publishedAt', 'id'])
@Index('idx_news_articles_public_feed', ['publishedAt', 'publicId'], {
  where:
    '"published_revision_id" IS NOT NULL AND "published_at" IS NOT NULL AND "status" IN (\'published\', \'pending_review\')',
})
@Index('idx_news_articles_source', ['sourceId', 'status'])
@Check('chk_news_articles_status', `"status" IN ('draft', 'pending_review', 'published', 'withdrawn')`)
@Check('chk_news_articles_version', '"version" > 0')
export class NewsArticle {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Only this identifier may be exposed by public endpoints. */
  @Column({ name: 'public_id', type: 'uuid' })
  publicId!: string;

  @Column({ name: 'source_id', type: 'uuid' })
  sourceId!: string;

  @Column({ type: 'varchar', length: 24, default: 'draft' })
  status!: NewsArticleStatus;

  @Column({ name: 'current_revision_id', type: 'uuid', nullable: true })
  currentRevisionId!: string | null;

  @Column({ name: 'pending_revision_id', type: 'uuid', nullable: true })
  pendingRevisionId!: string | null;

  @Column({ name: 'published_revision_id', type: 'uuid', nullable: true })
  publishedRevisionId!: string | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @Column({ name: 'submitted_by', type: 'uuid', nullable: true })
  submittedBy!: string | null;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt!: Date | null;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy!: string | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @Column({ name: 'last_corrected_at', type: 'timestamptz', nullable: true })
  lastCorrectedAt!: Date | null;

  @Column({ name: 'withdrawn_at', type: 'timestamptz', nullable: true })
  withdrawnAt!: Date | null;

  @Column({ name: 'withdrawal_notice', type: 'varchar', length: 500, nullable: true })
  withdrawalNotice!: string | null;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

@Entity({ name: 'news_article_revisions' })
@Unique('uq_news_article_revisions_version', ['articleId', 'version'])
@Index('idx_news_article_revisions_article', ['articleId', 'createdAt'])
@Check('chk_news_article_revisions_version', '"version" > 0')
export class NewsArticleRevision {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'article_id', type: 'uuid' })
  articleId!: string;

  @Column({ type: 'int' })
  version!: number;

  @Column({ name: 'original_title', type: 'varchar', length: 300 })
  originalTitle!: string;

  @Column({ type: 'varchar', length: 300 })
  summary!: string;

  @Column({ name: 'original_url', type: 'varchar', length: 2048 })
  originalUrl!: string;

  @Column({ name: 'original_published_at', type: 'timestamptz' })
  originalPublishedAt!: Date;

  @Column({ name: 'profession_tags', type: 'jsonb', default: () => "'[]'" })
  professionTags!: string[];

  @Column({ name: 'topic_tags', type: 'jsonb', default: () => "'[]'" })
  topicTags!: string[];

  @Column({ name: 'correction_note', type: 'varchar', length: 500, nullable: true })
  correctionNote!: string | null;

  @Column({ name: 'content_hash', type: 'varchar', length: 64 })
  contentHash!: string;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

@Entity({ name: 'news_review_decisions' })
@Unique('uq_news_review_decisions_revision', ['revisionId'])
@Index('idx_news_review_decisions_article', ['articleId', 'createdAt'])
@Check('chk_news_review_decisions_decision', `"decision" IN ('approved', 'rejected')`)
@Check('chk_news_review_separation', '"submitted_by" <> "reviewer_id"')
export class NewsReviewDecision {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'article_id', type: 'uuid' })
  articleId!: string;

  @Column({ name: 'revision_id', type: 'uuid' })
  revisionId!: string;

  @Column({ name: 'submitted_by', type: 'uuid' })
  submittedBy!: string;

  @Column({ name: 'reviewer_id', type: 'uuid' })
  reviewerId!: string;

  @Column({ type: 'varchar', length: 16 })
  decision!: 'approved' | 'rejected';

  @Column({ type: 'varchar', length: 500 })
  reason!: string;

  /** Captures source validity at the decision point without exposing evidence. */
  @Column({ name: 'source_authorization_snapshot', type: 'jsonb' })
  sourceAuthorizationSnapshot!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
