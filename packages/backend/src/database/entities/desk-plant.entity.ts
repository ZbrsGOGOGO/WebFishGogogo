import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from './user.entity';

export type DeskPlantState = 'idle' | 'growing';
export type DeskPlantToolId = 'watering_can' | 'planter_box' | 'harvest_basket';
export type DeskPlantSkillId = 'quick_care' | 'green_thumb' | 'abundant_harvest';

export type DeskPlantToolLevels = Record<DeskPlantToolId, number>;
export type DeskPlantSkillLevels = Record<DeskPlantSkillId, number>;

@Entity({ name: 'desk_plants' })
@Check('chk_desk_plants_state', `"state" IN ('idle', 'growing')`)
@Check('chk_desk_plants_experience', '"plant_experience" >= 0')
@Check('chk_desk_plants_level', '"level" BETWEEN 1 AND 100')
@Check('chk_desk_plants_streak', '"streak_days" >= 0')
export class DeskPlant {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', length: 16, default: 'idle' })
  state!: DeskPlantState;

  @Column({ name: 'appearance_key', type: 'varchar', length: 32, default: 'desk_sprout' })
  appearanceKey!: string;

  @Column({ name: 'plant_experience', type: 'int', default: 0 })
  plantExperience!: number;

  @Column({ type: 'smallint', default: 1 })
  level!: number;

  @Column({ name: 'farm_coins', type: 'int', default: 0 })
  farmCoins!: number;

  @Column({ name: 'total_harvests', type: 'int', default: 0 })
  totalHarvests!: number;

  @Column({ name: 'selected_crop_key', type: 'varchar', length: 32, default: 'desk_mint' })
  selectedCropKey!: string;

  @Column({ name: 'tool_levels', type: 'jsonb', default: () => `'{}'` })
  toolLevels!: DeskPlantToolLevels;

  @Column({ name: 'skill_levels', type: 'jsonb', default: () => `'{}'` })
  skillLevels!: DeskPlantSkillLevels;

  @Column({ name: 'farm_version', type: 'int', default: 1 })
  farmVersion!: number;

  @Column({ name: 'streak_days', type: 'int', default: 0 })
  streakDays!: number;

  @Column({
    name: 'last_standard_reward_service_date',
    type: 'date',
    nullable: true,
  })
  lastStandardRewardServiceDate!: string | null;

  @Column({ name: 'first_harvested_at', type: 'timestamptz', nullable: true })
  firstHarvestedAt!: Date | null;

  @Column({ name: 'feeding_enabled', type: 'boolean', default: true })
  feedingEnabled!: boolean;

  @Column({ name: 'feed_animation_enabled', type: 'boolean', default: true })
  feedAnimationEnabled!: boolean;

  @Column({ name: 'feed_notifications_enabled', type: 'boolean', default: true })
  feedNotificationsEnabled!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
