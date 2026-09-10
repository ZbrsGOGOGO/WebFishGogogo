import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from './user.entity';

@Entity({ name: 'community_fish_progress' })
export class CommunityFishProgress {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' }) userId!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'user_id' }) user!: User;
  @Column({ type: 'integer', default: 0 }) experience!: number;
  @Column({ name: 'active_seconds', type: 'integer', default: 0 }) activeSeconds!: number;
  @Column({ name: 'game_seconds', type: 'integer', default: 0 }) gameSeconds!: number;
  @Column({ name: 'service_date', type: 'varchar', length: 10 }) serviceDate!: string;
  @Column({ name: 'daily_active_seconds', type: 'integer', default: 0 }) dailyActiveSeconds!: number;
  @Column({ name: 'daily_game_seconds', type: 'integer', default: 0 }) dailyGameSeconds!: number;
  @Column({ name: 'tab_id', type: 'uuid', nullable: true }) tabId!: string | null;
  @Column({ type: 'integer', default: 0 }) sequence!: number;
  @Column({ type: 'varchar', length: 8, default: 'pause' }) mode!: 'browse' | 'game' | 'pause';
  @Column({ name: 'last_seen_at', type: 'timestamptz' }) lastSeenAt!: Date;
}

/** Verified manual receipts, not a payment gateway or a share ledger. No raw receipt files. */
@Entity({ name: 'community_support_ledger' })
@Index('idx_support_order_hash', ['orderHash'], { unique: true })
@Index('idx_support_user_expiry', ['userId', 'expiresAt'])
export class CommunitySupportEntry {
  @PrimaryColumn({ type: 'uuid' }) id!: string;
  @Column({ name: 'user_id', type: 'uuid', nullable: true }) userId!: string | null;
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true }) @JoinColumn({ name: 'user_id' }) user!: User | null;
  @Column({ name: 'actor_id', type: 'uuid', nullable: true }) actorId!: string | null;
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true }) @JoinColumn({ name: 'actor_id' }) actor!: User | null;
  @Column({ name: 'order_hash', type: 'varchar', length: 64, select: false }) orderHash!: string;
  @Column({ name: 'request_hash', type: 'varchar', length: 64, select: false }) requestHash!: string;
  @Column({ name: 'order_hint', type: 'varchar', length: 8, nullable: true }) orderHint!: string | null;
  @Column({ type: 'smallint' }) months!: number;
  @Column({ name: 'amount_fen', type: 'integer' }) amountFen!: number;
  @Column({ name: 'starts_at', type: 'timestamptz' }) startsAt!: Date;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date;
  @Column({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true }) revokedAt!: Date | null;
  @Column({ name: 'revoked_by', type: 'uuid', nullable: true }) revokedBy!: string | null;
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true }) @JoinColumn({ name: 'revoked_by' }) revoker!: User | null;
}
