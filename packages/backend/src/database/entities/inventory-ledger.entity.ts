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

import { ItemDefinition } from './item-definition.entity';
import { User } from './user.entity';

/**
 * 不可变背包流水，用于审计每一笔道具增减。
 */
@Entity({ name: 'inventory_ledger' })
@Index('idx_inventory_ledger_user_created', ['userId', 'createdAt'])
@Index('uq_inventory_ledger_idempotency', ['idempotencyKey'], {
  unique: true,
})
@Check('chk_inventory_ledger_delta_non_zero', '"delta" <> 0')
@Check('chk_inventory_ledger_quantity_non_negative', '"quantity_after" >= 0')
export class InventoryLedger {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId!: string;

  @ManyToOne(() => ItemDefinition, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'item_id' })
  item!: ItemDefinition;

  /** 有符号变动量。bigint 在 TypeORM 中以 string 承载。 */
  @Column({ type: 'bigint' })
  delta!: string;

  @Column({ name: 'quantity_after', type: 'bigint' })
  quantityAfter!: string;

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
