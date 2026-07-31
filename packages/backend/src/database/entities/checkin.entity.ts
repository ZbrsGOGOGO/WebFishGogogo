import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { RewardGrant } from './reward-grant.entity';
import { User } from './user.entity';

/**
 * 按业务时区记录的每日签到。数据库唯一约束是最终幂等屏障。
 */
@Entity({ name: 'checkins' })
@Unique('uq_checkins_user_local_date', ['userId', 'localDate'])
export class Checkin {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  /** PostgreSQL date 由 TypeORM 以 YYYY-MM-DD 字符串承载。 */
  @Column({ name: 'local_date', type: 'date' })
  localDate!: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: 'Asia/Shanghai',
  })
  timezone!: string;

  @Column({ name: 'reward_grant_id', type: 'uuid', unique: true })
  rewardGrantId!: string;

  @OneToOne(() => RewardGrant, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reward_grant_id' })
  rewardGrant!: RewardGrant;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
