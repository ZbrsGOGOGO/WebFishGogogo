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

/**
 * 不可变钱包流水，用于审计和对账。
 */
@Entity({ name: 'wallet_ledger' })
@Index('idx_wallet_ledger_user_created', ['userId', 'createdAt'])
@Index('uq_wallet_ledger_idempotency', ['idempotencyKey'], { unique: true })
@Check('chk_wallet_ledger_delta_non_zero', '"delta" <> 0')
@Check('chk_wallet_ledger_balance_non_negative', '"balance_after" >= 0')
export class WalletLedger {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', length: 32 })
  currency!: string;

  /** 有符号变动量。bigint 在 TypeORM 中以 string 承载。 */
  @Column({ type: 'bigint' })
  delta!: string;

  @Column({ name: 'balance_after', type: 'bigint' })
  balanceAfter!: string;

  @Column({ name: 'source_type', type: 'varchar', length: 50 })
  sourceType!: string;

  @Column({ name: 'source_id', type: 'varchar', length: 100 })
  sourceId!: string;

  @Column({ type: 'varchar', length: 100 })
  reason!: string;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 200 })
  idempotencyKey!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
