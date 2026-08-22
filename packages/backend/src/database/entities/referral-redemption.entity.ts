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

import { ReferralCode } from './referral-code.entity';
import { User } from './user.entity';

export type ReferralRedemptionStatus =
  | 'bound'
  | 'qualified'
  | 'qualified_unrewarded'
  | 'rejected';
export type ReferralRiskStatus = 'pending' | 'clear' | 'blocked';

@Entity({ name: 'referral_redemptions' })
@Index('uq_referral_redemptions_invitee', ['inviteeId'], { unique: true })
@Index('idx_referral_redemptions_inviter_status', [
  'inviterId',
  'status',
  'createdAt',
])
@Check(
  'chk_referral_redemptions_distinct_users',
  '"inviter_id" <> "invitee_id"',
)
@Check(
  'chk_referral_redemptions_status',
  `"status" IN ('bound', 'qualified', 'qualified_unrewarded', 'rejected')`,
)
@Check(
  'chk_referral_redemptions_risk_status',
  `"risk_status" IN ('pending', 'clear', 'blocked')`,
)
export class ReferralRedemption {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'inviter_id', type: 'uuid' })
  inviterId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'inviter_id' })
  inviter!: User;

  @Column({ name: 'invitee_id', type: 'uuid' })
  inviteeId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invitee_id' })
  invitee!: User;

  @Column({ name: 'code_id', type: 'uuid' })
  codeId!: string;

  @ManyToOne(() => ReferralCode, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'code_id' })
  code!: ReferralCode;

  @Column({ type: 'varchar', length: 24, default: 'bound' })
  status!: ReferralRedemptionStatus;

  @Column({ name: 'risk_status', type: 'varchar', length: 16, default: 'pending' })
  riskStatus!: ReferralRiskStatus;

  @Column({ name: 'bound_at', type: 'timestamptz' })
  boundAt!: Date;

  @Column({ name: 'qualified_at', type: 'timestamptz', nullable: true })
  qualifiedAt!: Date | null;

  @Column({ name: 'reward_granted_at', type: 'timestamptz', nullable: true })
  rewardGrantedAt!: Date | null;

  @Column({ name: 'rejection_reason', type: 'varchar', length: 100, nullable: true })
  rejectionReason!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
