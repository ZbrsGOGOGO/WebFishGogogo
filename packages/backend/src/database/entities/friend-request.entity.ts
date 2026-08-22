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

export type FriendRequestStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'cancelled';

@Entity({ name: 'friend_requests' })
@Index('idx_friend_requests_recipient_status', [
  'recipientId',
  'status',
  'createdAt',
  'id',
])
@Index('idx_friend_requests_requester_status', [
  'requesterId',
  'status',
  'createdAt',
  'id',
])
@Index('idx_friend_requests_requester_created', ['requesterId', 'createdAt'])
@Index('uq_friend_requests_pending_pair', ['userLowId', 'userHighId'], {
  unique: true,
  where: `"status" = 'pending'`,
})
@Check('chk_friend_requests_distinct_users', '"requester_id" <> "recipient_id"')
@Check(
  'chk_friend_requests_status',
  `"status" IN ('pending', 'accepted', 'rejected', 'cancelled')`,
)
export class FriendRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'requester_id', type: 'uuid' })
  requesterId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requester_id' })
  requester!: User;

  @Column({ name: 'recipient_id', type: 'uuid' })
  recipientId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'recipient_id' })
  recipient!: User;

  @Column({ name: 'user_low_id', type: 'uuid' })
  userLowId!: string;

  @Column({ name: 'user_high_id', type: 'uuid' })
  userHighId!: string;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: FriendRequestStatus;

  @Column({ name: 'responded_at', type: 'timestamptz', nullable: true })
  respondedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
