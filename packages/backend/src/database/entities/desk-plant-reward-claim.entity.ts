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

import { DeskPlantCycle } from './desk-plant-cycle.entity';
import { User } from './user.entity';

export type DeskPlantRewardType = 'standard' | 'onboarding';

@Entity({ name: 'desk_plant_reward_claims' })
@Index('uq_desk_plant_reward_claims_key', ['userId', 'rewardKey'], {
  unique: true,
})
@Check(
  'chk_desk_plant_reward_claims_type',
  `"reward_type" IN ('standard', 'onboarding')`,
)
export class DeskPlantRewardClaim {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'cycle_id', type: 'uuid' })
  cycleId!: string;

  @ManyToOne(() => DeskPlantCycle, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cycle_id' })
  cycle!: DeskPlantCycle;

  @Column({ name: 'reward_type', type: 'varchar', length: 16 })
  rewardType!: DeskPlantRewardType;

  @Column({ name: 'reward_key', type: 'varchar', length: 64 })
  rewardKey!: string;

  @Column({ name: 'service_date', type: 'date' })
  serviceDate!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
