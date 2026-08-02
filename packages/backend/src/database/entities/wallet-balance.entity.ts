import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

import { User } from './user.entity';

/**
 * 钱包余额快照。任何变动都必须与 wallet_ledger 在同一事务内写入。
 */
@Entity({ name: 'wallet_balances' })
@Check('chk_wallet_balance_non_negative', '"balance" >= 0')
export class WalletBalance {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @PrimaryColumn({ type: 'varchar', length: 32 })
  currency!: string;

  /** bigint 在 TypeORM 中以 string 承载。 */
  @Column({ type: 'bigint', default: 0 })
  balance!: string;

  @VersionColumn({ type: 'int', default: 1 })
  version!: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
