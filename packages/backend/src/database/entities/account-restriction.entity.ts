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

/** Encrypted self-visible reason for a suspension or ban. */
@Entity({ name: 'account_restrictions' })
@Index('idx_account_restrictions_user_active', ['userId', 'liftedAt', 'restrictedAt'])
@Check(
  'chk_account_restrictions_status',
  `"account_status" IN ('suspended', 'banned')`,
)
export class AccountRestriction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'account_status', type: 'varchar', length: 16 })
  accountStatus!: 'suspended' | 'banned';

  @Column({ name: 'reason_code', type: 'varchar', length: 64, nullable: true })
  reasonCode!: string | null;

  @Column({ name: 'reason_key_id', type: 'varchar', length: 64, nullable: true })
  reasonKeyId!: string | null;

  @Column({ name: 'reason_ciphertext', type: 'text', nullable: true })
  reasonCiphertext!: string | null;

  @Column({ name: 'reason_nonce', type: 'varchar', length: 64, nullable: true })
  reasonNonce!: string | null;

  @Column({ name: 'reason_auth_tag', type: 'varchar', length: 64, nullable: true })
  reasonAuthTag!: string | null;

  @Column({ name: 'restricted_at', type: 'timestamptz' })
  restrictedAt!: Date;

  @Column({ name: 'restriction_ends_at', type: 'timestamptz', nullable: true })
  restrictionEndsAt!: Date | null;

  @Column({ name: 'lifted_at', type: 'timestamptz', nullable: true })
  liftedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
