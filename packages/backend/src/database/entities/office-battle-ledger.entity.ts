import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

/** Append-only audit ledger for battle XP, energy and parts. */
@Entity({ name: 'office_battle_asset_ledger' })
@Unique('uq_office_battle_asset_ledger_key', ['idempotencyKey'])
@Index('idx_office_battle_asset_ledger_user', ['userId', 'createdAt'])
export class OfficeBattleAssetLedger {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'battle_id', type: 'uuid', nullable: true })
  battleId!: string | null;

  @Column({ name: 'asset_type', type: 'varchar', length: 32 })
  assetType!: 'energy' | 'battle_experience' | 'parts';

  @Column({ type: 'int' })
  delta!: number;

  @Column({ name: 'balance_after', type: 'int' })
  balanceAfter!: number;

  @Column({ name: 'reason', type: 'varchar', length: 64 })
  reason!: string;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 200 })
  idempotencyKey!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

/** Append-only audit ledger for every equipment create/change/salvage. */
@Entity({ name: 'office_battle_inventory_ledger' })
@Unique('uq_office_battle_inventory_ledger_key', ['idempotencyKey'])
@Index('idx_office_battle_inventory_ledger_user', ['userId', 'createdAt'])
export class OfficeBattleInventoryLedger {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'equipment_id', type: 'uuid', nullable: true })
  equipmentId!: string | null;

  @Column({ name: 'battle_id', type: 'uuid', nullable: true })
  battleId!: string | null;

  @Column({ type: 'varchar', length: 32 })
  action!: 'create' | 'lock' | 'equip' | 'defense_equip' | 'salvage' | 'pending' | 'claim' | 'enhance';

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 200 })
  idempotencyKey!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
