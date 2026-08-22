import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { User } from './user.entity';

export type CommunityNotificationCategory =
  | 'security'
  | 'system'
  | 'reply'
  | 'friend'
  | 'feed'
  | 'invite'
  | 'farm'
  | 'battle';

@Entity({ name: 'community_notifications' })
@Index('uq_community_notifications_dedupe', ['userId', 'dedupeKey'], {
  unique: true,
})
@Index('idx_community_notifications_inbox', [
  'userId',
  'availableAt',
  'createdAt',
])
@Index('idx_community_notifications_unread', [
  'userId',
  'readAt',
  'createdAt',
])
@Index('idx_community_notifications_page', ['userId', 'createdAt', 'id'])
@Index(
  'idx_community_notifications_unread_category',
  ['userId', 'category', 'createdAt', 'id'],
  { where: '"read_at" IS NULL' },
)
export class CommunityNotification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'actor_user_id' })
  actorUser!: User | null;

  @Column({ type: 'varchar', length: 24 })
  category!: CommunityNotificationCategory;

  @Column({ name: 'event_type', type: 'varchar', length: 64 })
  eventType!: string;

  @Column({ name: 'resource_type', type: 'varchar', length: 32, nullable: true })
  resourceType!: string | null;

  @Column({ name: 'resource_id', type: 'varchar', length: 100, nullable: true })
  resourceId!: string | null;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ name: 'dedupe_key', type: 'varchar', length: 160 })
  dedupeKey!: string;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  @Column({ name: 'available_at', type: 'timestamptz' })
  availableAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
