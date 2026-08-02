import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { User } from './user.entity';

export type FarmPlotUnlockType = 'default' | 'level' | 'membership';

/** 农场固定展示槽位。种植状态由 farm_plantings 的活动周期派生。 */
@Entity({ name: 'farm_plots' })
@Unique('uq_farm_plot_user_slot', ['userId', 'slotIndex'])
@Index('idx_farm_plots_user', ['userId'])
export class FarmPlot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  /** 1–6 的稳定展示序号。 */
  @Column({ name: 'slot_index', type: 'smallint' })
  slotIndex!: number;

  @Column({
    name: 'unlock_type',
    type: 'varchar',
    length: 20,
    default: 'default',
  })
  unlockType!: FarmPlotUnlockType;

  @Column({ name: 'unlock_level', type: 'smallint', nullable: true })
  unlockLevel!: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
