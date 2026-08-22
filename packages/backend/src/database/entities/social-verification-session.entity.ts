import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from './user.entity';

export type SocialVerificationSessionStatus =
  | 'pending'
  | 'verified'
  | 'failed'
  | 'expired';

/**
 * Minimal provider state. Provider references are HMACed and the small audit
 * result is encrypted; legal names, document numbers and images never enter it.
 */
@Entity({ name: 'social_verification_sessions' })
@Index('idx_social_verification_sessions_user_created', ['userId', 'createdAt'])
@Index('uq_social_verification_sessions_one_pending', ['userId'], {
  unique: true,
  where: `"status" = 'pending'`,
})
@Check(
  'chk_social_verification_sessions_status',
  `"status" IN ('pending', 'verified', 'failed', 'expired')`,
)
export class SocialVerificationSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', length: 64 })
  provider!: string;

  @Column({ name: 'provider_reference_hash', type: 'varchar', length: 64 })
  providerReferenceHash!: string;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: SocialVerificationSessionStatus;

  @Column({ name: 'submitted_at', type: 'timestamptz' })
  submittedAt!: Date;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt!: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'failure_code', type: 'varchar', length: 64, nullable: true })
  failureCode!: string | null;

  @Column({ name: 'audit_key_id', type: 'varchar', length: 64, nullable: true })
  auditKeyId!: string | null;

  @Column({ name: 'audit_ciphertext', type: 'text', nullable: true })
  auditCiphertext!: string | null;

  @Column({ name: 'audit_nonce', type: 'varchar', length: 64, nullable: true })
  auditNonce!: string | null;

  @Column({ name: 'audit_auth_tag', type: 'varchar', length: 64, nullable: true })
  auditAuthTag!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
