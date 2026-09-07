import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import type {
  DevelopmentCategory,
  DevelopmentStatus,
} from '@stealth-reader/shared';

import { User } from './user.entity';

@Entity({ name: 'development_members' })
@Index('idx_development_members_active', ['revokedAt', 'grantedAt'])
export class DevelopmentMember {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'granted_by_user_id', type: 'uuid', nullable: true })
  grantedByUserId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'granted_by_user_id' })
  grantedByUser!: User | null;

  @Column({ name: 'granted_at', type: 'timestamptz' })
  grantedAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;
}

@Entity({ name: 'development_requests' })
@Index(
  'uq_development_requests_author_client',
  ['authorId', 'clientRequestId'],
  { unique: true },
)
@Index('idx_development_requests_author_updated', ['authorId', 'updatedAt', 'id'])
@Index('idx_development_requests_status_updated', ['status', 'updatedAt', 'id'])
export class DevelopmentRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'author_id', type: 'uuid' })
  authorId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'author_id' })
  author!: User;

  @Column({ name: 'client_request_id', type: 'varchar', length: 100 })
  clientRequestId!: string;

  @Column({ name: 'request_hash', type: 'varchar', length: 64 })
  requestHash!: string;

  @Column({ type: 'varchar', length: 120 })
  title!: string;

  @Column({ type: 'varchar', length: 24 })
  category!: DevelopmentCategory;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'varchar', length: 24, default: 'submitted' })
  status!: DevelopmentStatus;

  @Column({ type: 'integer', default: 1 })
  version!: number;

  @Column({ name: 'attachment_count', type: 'integer', default: 0 })
  attachmentCount!: number;

  @Column({ name: 'attachment_bytes', type: 'integer', default: 0 })
  attachmentBytes!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

export type DevelopmentEventKind =
  | 'created'
  | 'comment'
  | 'decision'
  | 'attachment';

@Entity({ name: 'development_events' })
@Index('idx_development_events_request_created', ['requestId', 'createdAt', 'id'])
export class DevelopmentEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'request_id', type: 'uuid' })
  requestId!: string;

  @ManyToOne(() => DevelopmentRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_id' })
  request!: DevelopmentRequest;

  @Column({ name: 'actor_id', type: 'uuid' })
  actorId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'actor_id' })
  actor!: User;

  @Column({ type: 'varchar', length: 16 })
  kind!: DevelopmentEventKind;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'varchar', length: 24, nullable: true })
  status!: DevelopmentStatus | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

export type DevelopmentAttachmentExtraction = 'text' | 'metadata_only';

@Entity({ name: 'development_attachments' })
@Index('idx_development_attachments_request_created', ['requestId', 'createdAt', 'id'])
@Index('idx_development_attachments_sha256', ['sha256'])
export class DevelopmentAttachmentRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'request_id', type: 'uuid' })
  requestId!: string;

  @ManyToOne(() => DevelopmentRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_id' })
  request!: DevelopmentRequest;

  @Column({ type: 'varchar', length: 255 })
  filename!: string;

  @Column({ name: 'media_type', type: 'varchar', length: 100 })
  mediaType!: string;

  @Column({ type: 'integer' })
  bytes!: number;

  @Column({ type: 'varchar', length: 64 })
  sha256!: string;

  @Column({ type: 'varchar', length: 24 })
  extraction!: DevelopmentAttachmentExtraction;

  @Column({ type: 'text', nullable: true })
  excerpt!: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  warnings!: string[];

  /** Binary data is fetched only by the separately authorized download path. */
  @Column({ type: 'bytea', select: false })
  content!: Buffer;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
