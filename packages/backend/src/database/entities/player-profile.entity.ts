import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from './user.entity';

export type CommunityPrivacyLevel = 'everyone' | 'friends' | 'self';

export interface CommunityPrivacySettings {
  equipment: CommunityPrivacyLevel;
  battleRecord: CommunityPrivacyLevel;
  plant: CommunityPrivacyLevel;
  honors: CommunityPrivacyLevel;
  friendCount: CommunityPrivacyLevel;
  recentActivity: CommunityPrivacyLevel;
}

export const DEFAULT_COMMUNITY_PRIVACY: CommunityPrivacySettings = {
  equipment: 'friends',
  battleRecord: 'friends',
  plant: 'friends',
  honors: 'friends',
  friendCount: 'self',
  recentActivity: 'self',
};

/**
 * 用户公开档案。账户凭据仍归 users；这里仅承载跨玩法共享的展示身份。
 */
@Entity({ name: 'user_profiles' })
export class PlayerProfile {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', length: 100, nullable: true })
  nickname!: string | null;

  @Column({ name: 'avatar_key', type: 'varchar', length: 500, nullable: true })
  avatarKey!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  bio!: string | null;

  @Column({
    name: 'battle_profession',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  battleProfession!: string | null;

  @Column({ name: 'privacy_settings', type: 'jsonb' })
  privacySettings!: CommunityPrivacySettings;

  @Column({
    type: 'varchar',
    length: 100,
    default: '初入工位',
  })
  title!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
