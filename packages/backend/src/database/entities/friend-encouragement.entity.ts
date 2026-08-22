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

import { User } from './user.entity';

export type EncouragementType = 'coffee' | 'cookie' | 'cheer_note';

@Entity({ name: 'friend_encouragements' })
@Index(
  'uq_friend_encouragements_pair_date',
  ['senderId', 'recipientId', 'serviceDate'],
  { unique: true },
)
@Index('uq_friend_encouragements_idempotency', ['senderId', 'idempotencyKey'], {
  unique: true,
})
@Index('idx_friend_encouragements_recipient_date', [
  'recipientId',
  'serviceDate',
  'createdAt',
])
@Check(
  'chk_friend_encouragements_distinct_users',
  '"sender_id" <> "recipient_id"',
)
@Check(
  'chk_friend_encouragements_type',
  `"type" IN ('coffee', 'cookie', 'cheer_note')`,
)
export class FriendEncouragement {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'sender_id', type: 'uuid' })
  senderId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sender_id' })
  sender!: User;

  @Column({ name: 'recipient_id', type: 'uuid' })
  recipientId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'recipient_id' })
  recipient!: User;

  @Column({ name: 'service_date', type: 'date' })
  serviceDate!: string;

  @Column({ type: 'varchar', length: 16 })
  type!: EncouragementType;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 100 })
  idempotencyKey!: string;

  @Column({ name: 'request_hash', type: 'varchar', length: 64 })
  requestHash!: string;

  @Column({ name: 'animation_enabled', type: 'boolean' })
  animationEnabled!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
