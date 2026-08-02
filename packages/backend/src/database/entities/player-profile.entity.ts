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
