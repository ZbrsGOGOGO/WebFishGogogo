import {
  Check,
  Column,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A database-backed fixed-window bucket shared by every API replica.
 *
 * keyHash is an HMAC of the endpoint and dimension. Raw IP addresses, email
 * addresses and registration ids are intentionally never persisted here.
 */
@Entity({ name: 'auth_rate_limit_buckets' })
@Index('idx_auth_rate_limit_buckets_expiry', ['expiresAt'])
@Check('chk_auth_rate_limit_buckets_count', '"count" >= 0')
export class AuthRateLimitBucket {
  @PrimaryColumn({ name: 'key_hash', type: 'varchar', length: 64 })
  keyHash!: string;

  @Column({ type: 'varchar', length: 64 })
  scope!: string;

  @Column({ type: 'int', default: 0 })
  count!: number;

  @Column({ name: 'window_started_at', type: 'timestamptz' })
  windowStartedAt!: Date;

  @Column({ name: 'window_ends_at', type: 'timestamptz' })
  windowEndsAt!: Date;

  @Column({ name: 'blocked_until', type: 'timestamptz', nullable: true })
  blockedUntil!: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
