import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { User } from './user.entity';

@Entity({ name: 'email_verifications' })
@Index('idx_email_verifications_user_created', ['userId', 'createdAt'])
@Check('chk_email_verifications_attempts', '"attempts" >= 0 AND "attempts" <= "max_attempts"')
@Check('chk_email_verifications_max_attempts', '"max_attempts" > 0')
@Check(
  'chk_email_verifications_resends',
  '"resend_count" >= 0 AND "resend_count" <= "max_resends"',
)
@Check('chk_email_verifications_max_resends', '"max_resends" > 0')
@Check(
  'chk_email_verifications_total_attempts',
  '"total_attempts" >= 0 AND "total_attempts" <= "max_total_attempts"',
)
@Check(
  'chk_email_verifications_max_total_attempts',
  '"max_total_attempts" > 0',
)
export class EmailVerification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', length: 32, default: 'registration' })
  purpose!: string;

  @Column({ name: 'code_hash', type: 'varchar', length: 64 })
  codeHash!: string;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ name: 'max_attempts', type: 'int', default: 5 })
  maxAttempts!: number;

  @Column({ name: 'resend_count', type: 'int', default: 0 })
  resendCount!: number;

  @Column({ name: 'max_resends', type: 'int', default: 5 })
  maxResends!: number;

  @Column({ name: 'total_attempts', type: 'int', default: 0 })
  totalAttempts!: number;

  @Column({ name: 'max_total_attempts', type: 'int', default: 15 })
  maxTotalAttempts!: number;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'resend_available_at', type: 'timestamptz' })
  resendAvailableAt!: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
