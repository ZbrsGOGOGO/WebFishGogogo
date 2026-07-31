import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

import type { RewardSnapshot } from './reward-grant.entity';

/**
 * 可配置作物目录。
 *
 * 种下时会把成本和收益复制到 farm_plantings，之后修改目录不会改变在田作物。
 */
@Entity({ name: 'crop_definitions' })
@Check('chk_crop_grow_seconds', '"grow_seconds" > 0')
@Check('chk_crop_seed_quantity', '"seed_quantity" > 0')
@Check('chk_crop_water_cost', '"water_cost" >= 0')
@Check('chk_crop_required_level', '"required_farm_level" BETWEEN 1 AND 100')
export class CropDefinition {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  slug!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 16 })
  emoji!: string;

  @Column({ name: 'grow_seconds', type: 'int' })
  growSeconds!: number;

  @Column({ name: 'seed_item_slug', type: 'varchar', length: 64 })
  seedItemSlug!: string;

  @Column({ name: 'seed_quantity', type: 'int', default: 1 })
  seedQuantity!: number;

  @Column({ name: 'water_cost', type: 'int', default: 1 })
  waterCost!: number;

  @Column({ name: 'harvest_rewards', type: 'jsonb' })
  harvestRewards!: RewardSnapshot;

  @Column({ name: 'farm_exp_reward', type: 'int' })
  farmExpReward!: number;

  @Column({ name: 'required_farm_level', type: 'smallint', default: 1 })
  requiredFarmLevel!: number;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
