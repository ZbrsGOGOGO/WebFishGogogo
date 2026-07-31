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
  VersionColumn,
} from 'typeorm';

import type { RewardSnapshot } from './reward-grant.entity';
import { CropDefinition } from './crop-definition.entity';
import { FarmPlot } from './farm-plot.entity';
import { User } from './user.entity';

export type FarmPlantingStatus = 'growing' | 'harvested';

export interface FarmPlantingCostSnapshot {
  water: number;
  seedItemSlug: string;
  seedQuantity: number;
}

/**
 * 一次完整种植周期。历史永久保留，当前活动周期由部分唯一索引保证每块地最多一条。
 */
@Entity({ name: 'farm_plantings' })
@Index('idx_farm_plantings_user_created', ['userId', 'createdAt'])
@Index('uq_farm_planting_plant_idempotency', ['plantIdempotencyKey'], {
  unique: true,
})
@Index('uq_farm_planting_harvest_idempotency', ['harvestIdempotencyKey'], {
  unique: true,
  where: '"harvest_idempotency_key" IS NOT NULL',
})
@Check(
  'chk_farm_planting_status',
  `"status" IN ('growing', 'harvested')`,
)
export class FarmPlanting {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'plot_id', type: 'uuid' })
  plotId!: string;

  @ManyToOne(() => FarmPlot, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plot_id' })
  plot!: FarmPlot;

  @Column({ name: 'crop_slug', type: 'varchar', length: 64 })
  cropSlug!: string;

  @ManyToOne(() => CropDefinition, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'crop_slug' })
  crop!: CropDefinition;

  @Column({ type: 'varchar', length: 20, default: 'growing' })
  status!: FarmPlantingStatus;

  @Column({ name: 'planted_at', type: 'timestamptz' })
  plantedAt!: Date;

  @Column({ name: 'matures_at', type: 'timestamptz' })
  maturesAt!: Date;

  @Column({ name: 'harvested_at', type: 'timestamptz', nullable: true })
  harvestedAt!: Date | null;

  @Column({ name: 'cost_snapshot', type: 'jsonb' })
  costSnapshot!: FarmPlantingCostSnapshot;

  @Column({ name: 'reward_snapshot', type: 'jsonb' })
  rewardSnapshot!: RewardSnapshot;

  @Column({ name: 'farm_exp_reward', type: 'int' })
  farmExpReward!: number;

  @Column({
    name: 'plant_idempotency_key',
    type: 'varchar',
    length: 200,
  })
  plantIdempotencyKey!: string;

  @Column({
    name: 'harvest_idempotency_key',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  harvestIdempotencyKey!: string | null;

  /** 收获响应快照，重复请求可直接重放。 */
  @Column({ name: 'harvest_result', type: 'jsonb', nullable: true })
  harvestResult!: Record<string, unknown> | null;

  @VersionColumn({ type: 'int', default: 1 })
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
