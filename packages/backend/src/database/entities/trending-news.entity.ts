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

export type TrendingNewsRefreshStatus = 'running' | 'completed' | 'failed';

@Entity({ name: 'trending_news_board_runs' })
@Index('idx_trending_news_board_runs_board_date', ['boardId', 'serviceDate'])
@Check('chk_trending_news_board_run_status', `"status" IN ('running', 'completed', 'failed')`)
@Check('chk_trending_news_board_run_count', '"item_count" >= 0')
export class TrendingNewsBoardRun {
  @PrimaryColumn({ name: 'service_date', type: 'date' })
  serviceDate!: string;

  @PrimaryColumn({ name: 'board_id', type: 'varchar', length: 40 })
  boardId!: string;

  @Column({ type: 'varchar', length: 16 })
  status!: TrendingNewsRefreshStatus;

  @Column({ name: 'item_count', type: 'smallint', default: 0 })
  itemCount!: number;

  @Column({ name: 'last_error', type: 'varchar', length: 200, nullable: true })
  lastError!: string | null;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'lease_expires_at', type: 'timestamptz' })
  leaseExpiresAt!: Date;

  @Column({ name: 'retry_not_before', type: 'timestamptz', nullable: true })
  retryNotBefore!: Date | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

@Entity({ name: 'trending_news_items' })
@Index('idx_trending_news_items_board_date_rank', ['boardId', 'serviceDate', 'rank'])
@Index('uq_trending_news_items_source_item', ['serviceDate', 'boardId', 'sourceItemId'], { unique: true })
@Check('chk_trending_news_item_rank', '"rank" BETWEEN 1 AND 20')
export class TrendingNewsItemRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'service_date', type: 'date' })
  serviceDate!: string;

  @Column({ name: 'board_id', type: 'varchar', length: 40 })
  boardId!: string;

  @Column({ name: 'source_item_id', type: 'varchar', length: 200 })
  sourceItemId!: string;

  @Column({ type: 'smallint' })
  rank!: number;

  @Column({ type: 'varchar', length: 300 })
  title!: string;

  @Column({ name: 'original_url', type: 'varchar', length: 2048, nullable: true })
  originalUrl!: string | null;

  @Column({ name: 'heat_text', type: 'varchar', length: 80, nullable: true })
  heatText!: string | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
