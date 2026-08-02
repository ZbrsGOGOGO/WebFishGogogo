import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

import { RewardGrant } from './reward-grant.entity';
import { TaskDefinition } from './task-definition.entity';
import { User } from './user.entity';

/**
 * 用户在某个业务自然日内的任务进度。
 *
 * 完成与领奖分别记录时间；状态由这些字段派生，避免冗余状态发生漂移。
 */
@Entity({ name: 'user_task_progress' })
@Unique('uq_user_task_progress_daily', ['userId', 'taskKey', 'localDate'])
@Index('idx_user_task_progress_user_date', ['userId', 'localDate'])
@Index('idx_user_task_progress_task_date', ['taskKey', 'localDate'])
@Check('chk_user_task_progress_non_negative', '"progress" >= 0')
@Check(
  'chk_user_task_progress_claimed_after_completed',
  '"claimed_at" IS NULL OR "completed_at" IS NOT NULL',
)
export class UserTaskProgress {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'task_key', type: 'varchar', length: 64 })
  taskKey!: string;

  @ManyToOne(() => TaskDefinition, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'task_key' })
  task!: TaskDefinition;

  @Column({ name: 'local_date', type: 'date' })
  localDate!: string;

  @Column({ type: 'varchar', length: 50, default: 'Asia/Shanghai' })
  timezone!: string;

  @Column({ type: 'int', default: 0 })
  progress!: number;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'claimed_at', type: 'timestamptz', nullable: true })
  claimedAt!: Date | null;

  @Column({
    name: 'reward_grant_id',
    type: 'uuid',
    nullable: true,
    unique: true,
  })
  rewardGrantId!: string | null;

  @OneToOne(() => RewardGrant, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'reward_grant_id' })
  rewardGrant!: RewardGrant | null;

  @VersionColumn({ type: 'int', default: 1 })
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
