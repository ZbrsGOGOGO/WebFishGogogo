import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type HotNewsRefreshStatus = 'running' | 'completed' | 'failed';

/**
 * Daily public-source headline. We intentionally persist no article body or
 * generated summary: the page is an index that always sends readers back to
 * the publisher.
 */
@Entity({ name: 'hot_news_headlines' })
@Index('idx_hot_news_headlines_date_rank', ['serviceDate', 'rank'])
@Index('uq_hot_news_headlines_fingerprint', ['fingerprint'], { unique: true })
@Check('chk_hot_news_headline_rank', '"rank" BETWEEN 1 AND 100')
export class HotNewsHeadline {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'service_date', type: 'date' })
  serviceDate!: string;

  @Column({ name: 'source_key', type: 'varchar', length: 40 })
  sourceKey!: string;

  @Column({ name: 'source_name', type: 'varchar', length: 80 })
  sourceName!: string;

  @Column({ type: 'varchar', length: 300 })
  headline!: string;

  @Column({ name: 'original_url', type: 'varchar', length: 2048 })
  originalUrl!: string;

  @Column({ name: 'original_published_at', type: 'timestamptz', nullable: true })
  originalPublishedAt!: Date | null;

  @Column({ type: 'smallint' })
  rank!: number;

  @Column({ type: 'char', length: 64 })
  fingerprint!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

@Entity({ name: 'hot_news_refresh_runs' })
@Check('chk_hot_news_refresh_status', `"status" IN ('running', 'completed', 'failed')`)
@Check('chk_hot_news_refresh_item_count', '"item_count" >= 0')
export class HotNewsRefreshRun {
  @PrimaryColumn({ name: 'service_date', type: 'date' })
  serviceDate!: string;

  @Column({ type: 'varchar', length: 16 })
  status!: HotNewsRefreshStatus;

  @Column({ name: 'item_count', type: 'int', default: 0 })
  itemCount!: number;

  @Column({ name: 'last_error', type: 'varchar', length: 200, nullable: true })
  lastError!: string | null;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'lease_expires_at', type: 'timestamptz' })
  leaseExpiresAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
