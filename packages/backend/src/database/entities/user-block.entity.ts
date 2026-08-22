import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';

import { User } from './user.entity';

@Entity({ name: 'user_blocks' })
@Index('idx_user_blocks_blocked', ['blockedId', 'blockerId'])
@Index('idx_user_blocks_blocker_created', ['blockerId', 'createdAt', 'blockedId'])
@Check('chk_user_blocks_distinct_users', '"blocker_id" <> "blocked_id"')
export class UserBlock {
  @PrimaryColumn({ name: 'blocker_id', type: 'uuid' })
  blockerId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'blocker_id' })
  blocker!: User;

  @PrimaryColumn({ name: 'blocked_id', type: 'uuid' })
  blockedId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'blocked_id' })
  blocked!: User;

  @Column({ type: 'varchar', length: 100, nullable: true })
  reason!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
