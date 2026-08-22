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

export type AccountDeletionRequestStatus =
  | 'cooling_off'
  | 'scheduled'
  | 'processing'
  | 'cancelled'
  | 'completed';

@Entity({ name: 'account_deletion_requests' })
@Index('uq_account_deletion_idempotency', ['idempotencyKeyHash'], {
  unique: true,
})
@Index('idx_account_deletion_due', ['status', 'availableAt'])
@Index('idx_account_deletion_user_created', ['userId', 'createdAt'])
@Index('uq_account_deletion_one_live', ['userId'], {
  unique: true,
  where: `"status" IN ('cooling_off', 'scheduled', 'processing')`,
})
@Check(
  'chk_account_deletion_status',
  `"status" IN ('cooling_off', 'scheduled', 'processing', 'cancelled', 'completed')`,
)
@Check('chk_account_deletion_attempts', '"attempts" >= 0')
export class AccountDeletionRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'previous_account_status', type: 'varchar', length: 16 })
  previousAccountStatus!: 'active' | 'suspended' | 'banned';

  @Column({ type: 'varchar', length: 16, default: 'cooling_off' })
  status!: AccountDeletionRequestStatus;

  @Column({ name: 'idempotency_key_hash', type: 'varchar', length: 64 })
  idempotencyKeyHash!: string;

  @Column({ name: 'request_hash', type: 'varchar', length: 64 })
  requestHash!: string;

  @Column({ name: 'requested_at', type: 'timestamptz' })
  requestedAt!: Date;

  @Column({ name: 'scheduled_for', type: 'timestamptz' })
  scheduledFor!: Date;

  @Column({ name: 'available_at', type: 'timestamptz' })
  availableAt!: Date;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ name: 'lease_owner', type: 'uuid', nullable: true })
  leaseOwner!: string | null;

  @Column({ name: 'lease_until', type: 'timestamptz', nullable: true })
  leaseUntil!: Date | null;

  @Column({ name: 'last_error_code', type: 'varchar', length: 64, nullable: true })
  lastErrorCode!: string | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
