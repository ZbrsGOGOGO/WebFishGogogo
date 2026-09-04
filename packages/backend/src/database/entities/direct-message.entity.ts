import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type ValueTransformer,
} from 'typeorm';

import { User } from './user.entity';

const numberTransformer: ValueTransformer = {
  from: (value: string | number): number => Number(value),
  to: (value: number): number => value,
};

export type DirectMessageStatus = 'visible' | 'withdrawn' | 'moderated';

@Entity({ name: 'chat_direct_conversations' })
@Index('uq_chat_direct_conversations_pair', ['userLowId', 'userHighId'], {
  unique: true,
})
@Index('idx_chat_direct_conversations_recent', ['lastMessageAt', 'updatedAt'])
@Check(
  'chk_chat_direct_conversations_distinct_users',
  '"user_low_id" <> "user_high_id"',
)
@Check('chk_chat_direct_conversations_sequence', '"latest_sequence" >= 0')
export class DirectConversation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_low_id', type: 'uuid' })
  userLowId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_low_id' })
  userLow!: User;

  @Column({ name: 'user_high_id', type: 'uuid' })
  userHighId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_high_id' })
  userHigh!: User;

  @Column({
    name: 'latest_sequence',
    type: 'bigint',
    default: 0,
    transformer: numberTransformer,
  })
  latestSequence!: number;

  @Column({ name: 'last_message_at', type: 'timestamptz', nullable: true })
  lastMessageAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

@Entity({ name: 'chat_direct_conversation_members' })
@Index('idx_chat_direct_members_user_recent', ['userId', 'updatedAt'])
@Check('chk_chat_direct_members_read_sequence', '"last_read_sequence" >= 0')
@Check('chk_chat_direct_members_unread_count', '"unread_count" >= 0')
export class DirectConversationMember {
  @PrimaryColumn({ name: 'conversation_id', type: 'uuid' })
  conversationId!: string;

  @ManyToOne(() => DirectConversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation!: DirectConversation;

  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({
    name: 'last_read_sequence',
    type: 'bigint',
    default: 0,
    transformer: numberTransformer,
  })
  lastReadSequence!: number;

  @Column({ name: 'unread_count', type: 'integer', default: 0 })
  unreadCount!: number;

  @Column({ name: 'muted_at', type: 'timestamptz', nullable: true })
  mutedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

@Entity({ name: 'chat_direct_messages' })
@Index('uq_chat_direct_messages_sequence', ['conversationId', 'sequence'], {
  unique: true,
})
@Index('uq_chat_direct_messages_author_client', ['authorId', 'clientMessageId'], {
  unique: true,
})
@Index('idx_chat_direct_messages_conversation_created', [
  'conversationId',
  'createdAt',
])
export class DirectMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId!: string;

  @ManyToOne(() => DirectConversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation!: DirectConversation;

  @Column({ name: 'author_id', type: 'uuid' })
  authorId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'author_id' })
  author!: User;

  @Column({ name: 'client_message_id', type: 'varchar', length: 100 })
  clientMessageId!: string;

  @Column({ name: 'request_hash', type: 'varchar', length: 64 })
  requestHash!: string;

  @Column({ type: 'bigint', transformer: numberTransformer })
  sequence!: number;

  @Column({ type: 'text' })
  body!: string;

  @Column({ name: 'reply_to_message_id', type: 'uuid', nullable: true })
  replyToMessageId!: string | null;

  @ManyToOne(() => DirectMessage, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'reply_to_message_id' })
  replyToMessage!: DirectMessage | null;

  @Column({ type: 'varchar', length: 16, default: 'visible' })
  status!: DirectMessageStatus;

  @Column({ type: 'integer', default: 1 })
  version!: number;

  @Column({ name: 'moderation_provider', type: 'varchar', length: 64 })
  moderationProvider!: string;

  @Column({ name: 'moderation_decision', type: 'varchar', length: 16 })
  moderationDecision!: 'allow';

  @Column({ name: 'moderation_reference', type: 'varchar', length: 160, nullable: true })
  moderationReference!: string | null;

  @Column({ name: 'withdrawn_at', type: 'timestamptz', nullable: true })
  withdrawnAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

export type DirectMessageReportReason =
  | 'harassment'
  | 'spam'
  | 'privacy'
  | 'illegal'
  | 'other';

@Entity({ name: 'chat_direct_message_reports' })
@Index(
  'uq_chat_direct_message_reports_idempotency',
  ['reporterId', 'idempotencyKeyHash'],
  { unique: true },
)
@Index('idx_chat_direct_message_reports_message', ['messageId', 'createdAt'])
export class DirectMessageReport {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'message_id', type: 'uuid' })
  messageId!: string;

  @ManyToOne(() => DirectMessage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'message_id' })
  message!: DirectMessage;

  @Column({ name: 'reporter_id', type: 'uuid' })
  reporterId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reporter_id' })
  reporter!: User;

  @Column({ type: 'varchar', length: 24 })
  reason!: DirectMessageReportReason;

  @Column({ type: 'varchar', length: 500, nullable: true })
  detail!: string | null;

  @Column({ name: 'body_hash', type: 'varchar', length: 64 })
  bodyHash!: string;

  @Column({ name: 'idempotency_key_hash', type: 'varchar', length: 64 })
  idempotencyKeyHash!: string;

  @Column({ name: 'request_hash', type: 'varchar', length: 64 })
  requestHash!: string;

  @Column({ type: 'varchar', length: 16, default: 'received' })
  status!: 'received';

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
