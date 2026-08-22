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

export type ReferralCodeStatus = 'active' | 'rotated' | 'revoked' | 'expired';

@Entity({ name: 'referral_codes' })
@Index('uq_referral_codes_hash', ['codeHash'], { unique: true })
@Index('uq_referral_codes_active_inviter', ['inviterId'], {
  unique: true,
  where: `"status" = 'active'`,
})
@Check('chk_referral_codes_purpose', `"purpose" = 'user_referral'`)
@Check(
  'chk_referral_codes_status',
  `"status" IN ('active', 'rotated', 'revoked', 'expired')`,
)
@Check('chk_referral_codes_version', '"version" > 0')
export class ReferralCode {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'inviter_id', type: 'uuid' })
  inviterId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'inviter_id' })
  inviter!: User;

  @Column({ name: 'code_hash', type: 'varchar', length: 64 })
  codeHash!: string;

  @Column({ type: 'varchar', length: 32, default: 'user_referral' })
  purpose!: 'user_referral';

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: ReferralCodeStatus;

  @Column({ type: 'int' })
  version!: number;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
