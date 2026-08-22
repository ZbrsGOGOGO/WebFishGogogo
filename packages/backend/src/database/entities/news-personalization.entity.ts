import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'news_user_preferences' })
@Check('chk_news_user_preferences_version', '"version" > 0')
export class NewsUserPreference {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'personalization_enabled', type: 'boolean', default: false })
  personalizationEnabled!: boolean;

  /** Explicit user choices only; inferred tracking attributes are prohibited. */
  @Column({ name: 'topic_preferences', type: 'jsonb', default: () => "'[]'" })
  topicPreferences!: string[];

  @Column({ type: 'int', default: 1 })
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

export type NewsNegativeFeedbackReason =
  | 'not_interested'
  | 'not_relevant'
  | 'seen_too_often'
  | 'source_not_preferred';

@Entity({ name: 'news_negative_feedback' })
@Unique('uq_news_negative_feedback_user_article', ['userId', 'articleId'])
@Index('idx_news_negative_feedback_user', ['userId', 'createdAt'])
@Check(
  'chk_news_negative_feedback_reason',
  `"reason" IN ('not_interested', 'not_relevant', 'seen_too_often', 'source_not_preferred')`,
)
export class NewsNegativeFeedback {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'article_id', type: 'uuid' })
  articleId!: string;

  @Column({ type: 'varchar', length: 32 })
  reason!: NewsNegativeFeedbackReason;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
