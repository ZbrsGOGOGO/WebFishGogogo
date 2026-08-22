import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { User } from './user.entity';

/** One-time, short-lived password reset capability. Only an HMAC is stored. */
@Entity({ name: 'password_reset_tokens' })
@Index('uq_password_reset_tokens_hash', ['tokenHash'], { unique: true })
@Index('uq_password_reset_tokens_one_unused', ['userId'], {
  unique: true,
  where: '"used_at" IS NULL',
})
@Index('idx_password_reset_tokens_user_expiry', [
  'userId',
  'usedAt',
  'expiresAt',
])
export class PasswordResetToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
