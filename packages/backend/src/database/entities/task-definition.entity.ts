import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

import type { RewardSnapshot } from './reward-grant.entity';

/**
 * 每日任务目录。key 和 eventType 均为稳定业务标识，不承载用户进度。
 */
@Entity({ name: 'task_definitions' })
@Index('idx_task_definitions_event_type', ['eventType'])
@Check('chk_task_definition_target_count', '"target_count" > 0')
@Check('chk_task_definition_display_order', '"display_order" >= 0')
export class TaskDefinition {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  key!: string;

  @Column({ type: 'varchar', length: 100 })
  title!: string;

  @Column({ type: 'varchar', length: 500 })
  description!: string;

  @Column({ name: 'event_type', type: 'varchar', length: 50 })
  eventType!: string;

  @Column({ name: 'target_count', type: 'int' })
  targetCount!: number;

  @Column({ name: 'reward_snapshot', type: 'jsonb' })
  rewardSnapshot!: RewardSnapshot;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ name: 'display_order', type: 'smallint', default: 0 })
  displayOrder!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
