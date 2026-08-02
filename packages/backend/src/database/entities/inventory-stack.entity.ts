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

import { ItemDefinition } from './item-definition.entity';
import { User } from './user.entity';

/**
 * 用户背包余额快照。所有增减必须与 inventory_ledger 同事务写入。
 */
@Entity({ name: 'inventory_stacks' })
@Check('chk_inventory_stack_non_negative', '"quantity" >= 0')
export class InventoryStack {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @PrimaryColumn({ name: 'item_id', type: 'uuid' })
  itemId!: string;

  @ManyToOne(() => ItemDefinition, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'item_id' })
  item!: ItemDefinition;

  /** bigint 在 TypeORM 中以 string 承载。 */
  @Column({ type: 'bigint', default: 0 })
  quantity!: string;

  @VersionColumn({ type: 'int', default: 1 })
  version!: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
