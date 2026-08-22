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
} from 'typeorm';

import { User } from './user.entity';

@Entity({ name: 'friendships' })
@Index('uq_friendships_active_pair', ['userLowId', 'userHighId'], {
  unique: true,
  where: '"ended_at" IS NULL',
})
@Index('idx_friendships_low_active', ['userLowId', 'currentStartedAt', 'id'], {
  where: '"ended_at" IS NULL',
})
@Index('idx_friendships_high_active', ['userHighId', 'currentStartedAt', 'id'], {
  where: '"ended_at" IS NULL',
})
@Check('chk_friendships_distinct_users', '"user_low_id" <> "user_high_id"')
export class Friendship {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_low_id', type: 'uuid' })
  userLowId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_low_id' })
  userLow!: User;

  @Column({ name: 'user_high_id', type: 'uuid' })
  userHighId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_high_id' })
  userHigh!: User;

  @Column({ name: 'first_became_friends_at', type: 'timestamptz' })
  firstBecameFriendsAt!: Date;

  @Column({ name: 'current_started_at', type: 'timestamptz' })
  currentStartedAt!: Date;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt!: Date | null;

  @Column({ name: 'ended_reason', type: 'varchar', length: 32, nullable: true })
  endedReason!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
