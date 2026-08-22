import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

import type { OfficeBattleProfession } from './office-battle-profile.entity';

export type OfficeBattleEquipmentSlot = 'weapon' | 'head' | 'body' | 'badge' | 'shoes' | 'accessory';
export type OfficeBattleRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export interface OfficeBattleStats {
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  luck: number;
}

@Entity({ name: 'office_battle_equipment' })
@Index('idx_office_battle_equipment_inventory', ['userId', 'salvagedAt', 'createdAt'])
@Index('uq_office_battle_starter_equipment', ['userId', 'profession', 'slot'], {
  unique: true,
  where: '"starter_bound" = true',
})
@Check('chk_office_battle_equipment_level', '"equipment_level" BETWEEN 1 AND 60 AND "required_level" BETWEEN 1 AND 60')
@Check('chk_office_battle_equipment_enhancement', '"enhancement_level" BETWEEN 0 AND 6')
export class OfficeBattleEquipment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 16 })
  profession!: OfficeBattleProfession;

  @Column({ type: 'varchar', length: 16 })
  slot!: OfficeBattleEquipmentSlot;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ name: 'required_level', type: 'smallint' })
  requiredLevel!: number;

  @Column({ name: 'equipment_level', type: 'smallint' })
  equipmentLevel!: number;

  @Column({ type: 'varchar', length: 16 })
  rarity!: OfficeBattleRarity;

  @Column({ type: 'jsonb' })
  stats!: Partial<OfficeBattleStats>;

  @Column({ type: 'int' })
  score!: number;

  @Column({ type: 'boolean', default: false })
  locked!: boolean;

  @Column({ name: 'starter_bound', type: 'boolean', default: false })
  starterBound!: boolean;

  @Column({ name: 'enhancement_level', type: 'smallint', default: 0 })
  enhancementLevel!: number;

  @Column({ name: 'source_battle_id', type: 'uuid', nullable: true })
  sourceBattleId!: string | null;

  @Column({ name: 'salvaged_at', type: 'timestamptz', nullable: true })
  salvagedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
