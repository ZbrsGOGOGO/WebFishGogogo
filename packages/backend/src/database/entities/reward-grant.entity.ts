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

export interface RewardSnapshot {
  experience?: number;
  currencies?: Record<string, number>;
  items?: Record<string, number>;
  energy?: number;
}

/**
 * 幂等奖励凭证。同一业务来源和规则最多发放一次。
 */
@Entity({ name: 'reward_grants' })
@Unique('uq_reward_grant_source', [
  'userId',
  'sourceType',
  'sourceId',
  'ruleKey',
])
@Index('idx_reward_grants_user_created', ['userId', 'createdAt'])
export class RewardGrant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'source_type', type: 'varchar', length: 50 })
  sourceType!: string;

  @Column({ name: 'source_id', type: 'varchar', length: 100 })
  sourceId!: string;

  @Column({ name: 'rule_key', type: 'varchar', length: 100 })
  ruleKey!: string;

  @Column({ name: 'reward_snapshot', type: 'jsonb' })
  rewardSnapshot!: RewardSnapshot;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
