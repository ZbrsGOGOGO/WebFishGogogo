import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AuthEmailOutboxStatus =
  | 'pending'
  | 'processing'
  | 'delivered'
  | 'dead';

/**
 * A dedicated reliable queue for security email. The complete delivery
 * command (including recipient and one-time code) is AES-GCM encrypted.
 */
@Entity({ name: 'auth_email_outbox' })
@Index('idx_auth_email_outbox_dispatch', ['status', 'availableAt'])
@Index('idx_auth_email_outbox_cleanup', ['status', 'expiresAt'])
@Index('idx_auth_email_outbox_correlation', ['correlationHash', 'status'])
@Check(
  'chk_auth_email_outbox_status',
  `"status" IN ('pending', 'processing', 'delivered', 'dead')`,
)
@Check(
  'chk_auth_email_outbox_attempts',
  '"attempts" >= 0 AND "attempts" <= "max_attempts"',
)
@Check('chk_auth_email_outbox_max_attempts', '"max_attempts" > 0')
export class AuthEmailOutbox {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  template!: 'registration-verification' | 'password-reset';

  @Column({ name: 'recipient_hash', type: 'varchar', length: 64 })
  recipientHash!: string;

  @Column({ name: 'correlation_hash', type: 'varchar', length: 64 })
  correlationHash!: string;

  @Column({ name: 'key_id', type: 'varchar', length: 64 })
  keyId!: string;

  @Column({ type: 'text' })
  ciphertext!: string;

  @Column({ type: 'varchar', length: 64 })
  nonce!: string;

  @Column({ name: 'auth_tag', type: 'varchar', length: 64 })
  authTag!: string;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: AuthEmailOutboxStatus;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ name: 'max_attempts', type: 'int', default: 5 })
  maxAttempts!: number;

  @Column({ name: 'available_at', type: 'timestamptz' })
  availableAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'lease_owner', type: 'uuid', nullable: true })
  leaseOwner!: string | null;

  @Column({ name: 'lease_until', type: 'timestamptz', nullable: true })
  leaseUntil!: Date | null;

  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true })
  deliveredAt!: Date | null;

  @Column({ name: 'last_error_code', type: 'varchar', length: 64, nullable: true })
  lastErrorCode!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
