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

export type AccountAppealStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled';

@Entity({ name: 'account_appeals' })
@Index('idx_account_appeals_user_created', ['userId', 'createdAt'])
@Index('uq_account_appeals_one_pending', ['userId'], {
  unique: true,
  where: `"status" = 'pending'`,
})
@Check(
  'chk_account_appeals_status',
  `"status" IN ('pending', 'approved', 'rejected', 'cancelled')`,
)
export class AccountAppeal {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: AccountAppealStatus;

  @Column({ name: 'reason_key_id', type: 'varchar', length: 64 })
  reasonKeyId!: string;

  @Column({ name: 'reason_ciphertext', type: 'text' })
  reasonCiphertext!: string;

  @Column({ name: 'reason_nonce', type: 'varchar', length: 64 })
  reasonNonce!: string;

  @Column({ name: 'reason_auth_tag', type: 'varchar', length: 64 })
  reasonAuthTag!: string;

  @Column({ name: 'decision_key_id', type: 'varchar', length: 64, nullable: true })
  decisionKeyId!: string | null;

  @Column({ name: 'decision_ciphertext', type: 'text', nullable: true })
  decisionCiphertext!: string | null;

  @Column({ name: 'decision_nonce', type: 'varchar', length: 64, nullable: true })
  decisionNonce!: string | null;

  @Column({ name: 'decision_auth_tag', type: 'varchar', length: 64, nullable: true })
  decisionAuthTag!: string | null;

  @Column({ name: 'decided_by_user_id', type: 'uuid', nullable: true })
  decidedByUserId!: string | null;

  @Column({ name: 'submitted_at', type: 'timestamptz' })
  submittedAt!: Date;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
