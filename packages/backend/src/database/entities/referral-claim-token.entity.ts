import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { ReferralCode } from './referral-code.entity';
import { User } from './user.entity';

@Entity({ name: 'referral_claim_tokens' })
@Index('uq_referral_claim_tokens_hash', ['tokenHash'], { unique: true })
@Index('idx_referral_claim_tokens_expiry', ['expiresAt', 'consumedAt'])
export class ReferralClaimToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'code_id', type: 'uuid' })
  codeId!: string;

  @ManyToOne(() => ReferralCode, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'code_id' })
  code!: ReferralCode;

  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt!: Date | null;

  @Column({ name: 'consumed_by_user_id', type: 'uuid', nullable: true })
  consumedByUserId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'consumed_by_user_id' })
  consumedByUser!: User | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
