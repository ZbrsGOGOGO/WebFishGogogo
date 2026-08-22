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
  ValueTransformer,
} from 'typeorm';

import { AuthSession } from './auth-session.entity';
import { User } from './user.entity';

export type ChatRoomSlug =
  | 'general'
  | 'developer'
  | 'product'
  | 'qa'
  | 'sales'
  | 'hr';

export type ChatMessageStatus = 'visible' | 'withdrawn' | 'moderated';

const numberTransformer: ValueTransformer = {
  from: (value: string | number): number => Number(value),
  to: (value: number): number => value,
};

@Entity({ name: 'chat_rooms' })
@Check(
  'chk_chat_rooms_slug',
  `"slug" IN ('general', 'developer', 'product', 'qa', 'sales', 'hr')`,
)
@Check('chk_chat_rooms_slow_mode', '"slow_mode_seconds" >= 0')
@Check('chk_chat_rooms_latest_sequence', '"latest_sequence" >= 0')
export class ChatRoom {
  @PrimaryColumn({ type: 'varchar', length: 24 })
  slug!: ChatRoomSlug;

  @Column({ type: 'varchar', length: 80 })
  name!: string;

  @Column({ type: 'varchar', length: 240 })
  description!: string;

  @Column({ name: 'read_only', type: 'boolean', default: false })
  readOnly!: boolean;

  @Column({ type: 'boolean', default: false })
  closed!: boolean;

  @Column({ name: 'slow_mode_seconds', type: 'integer', default: 0 })
  slowModeSeconds!: number;

  @Column({
    name: 'latest_sequence',
    type: 'bigint',
    default: 0,
    transformer: numberTransformer,
  })
  latestSequence!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

@Entity({ name: 'chat_socket_tickets' })
@Index('uq_chat_socket_tickets_hash', ['ticketHash'], { unique: true })
@Index('idx_chat_socket_tickets_expiry', ['expiresAt', 'consumedAt'])
export class ChatSocketTicket {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'ticket_hash', type: 'varchar', length: 64 })
  ticketHash!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId!: string;

  @ManyToOne(() => AuthSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session!: AuthSession;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

@Entity({ name: 'chat_messages' })
@Index('uq_chat_messages_room_sequence', ['roomSlug', 'sequence'], {
  unique: true,
})
@Index('uq_chat_messages_author_client_id', ['authorId', 'clientMessageId'], {
  unique: true,
})
@Index('idx_chat_messages_room_created', ['roomSlug', 'createdAt'])
@Index('idx_chat_messages_author_room_created', [
  'authorId',
  'roomSlug',
  'createdAt',
])
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'room_slug', type: 'varchar', length: 24 })
  roomSlug!: ChatRoomSlug;

  @ManyToOne(() => ChatRoom, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'room_slug' })
  room!: ChatRoom;

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

  @ManyToOne(() => ChatMessage, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'reply_to_message_id' })
  replyToMessage!: ChatMessage | null;

  @Column({ type: 'varchar', length: 16, default: 'visible' })
  status!: ChatMessageStatus;

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

@Entity({ name: 'chat_message_mentions' })
@Index('idx_chat_message_mentions_user', ['mentionedUserId', 'messageId'])
export class ChatMessageMention {
  @PrimaryColumn({ name: 'message_id', type: 'uuid' })
  messageId!: string;

  @ManyToOne(() => ChatMessage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'message_id' })
  message!: ChatMessage;

  @PrimaryColumn({ name: 'mentioned_user_id', type: 'uuid' })
  mentionedUserId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'mentioned_user_id' })
  mentionedUser!: User;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

export type ChatReportReason =
  | 'harassment'
  | 'spam'
  | 'privacy'
  | 'illegal'
  | 'other';

@Entity({ name: 'chat_message_reports' })
@Index('uq_chat_message_reports_idempotency', ['reporterId', 'idempotencyKeyHash'], {
  unique: true,
})
@Index('idx_chat_message_reports_message', ['messageId', 'createdAt'])
export class ChatMessageReport {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'message_id', type: 'uuid' })
  messageId!: string;

  @ManyToOne(() => ChatMessage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'message_id' })
  message!: ChatMessage;

  @Column({ name: 'reporter_id', type: 'uuid' })
  reporterId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reporter_id' })
  reporter!: User;

  @Column({ type: 'varchar', length: 24 })
  reason!: ChatReportReason;

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
