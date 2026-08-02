import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

import { Document } from './document.entity';
import { User } from './user.entity';

export type ReadingSessionStatus = 'active' | 'paused' | 'ended' | 'expired';
export type ReadingHeartbeatState = 'active' | 'hidden' | 'idle' | 'boss';

@Entity({ name: 'reading_sessions' })
@Unique('uq_reading_session_client', ['userId', 'clientSessionId'])
@Index('idx_reading_sessions_user_status', ['userId', 'status'])
@Index('idx_reading_sessions_last_heartbeat', ['lastHeartbeatAt'])
@Check(
  'chk_reading_session_status',
  `"status" IN ('active', 'paused', 'ended', 'expired')`,
)
@Check(
  'chk_reading_session_state',
  `"last_state" IN ('active', 'hidden', 'idle', 'boss')`,
)
@Check('chk_reading_session_effective_seconds', '"effective_seconds" >= 0')
@Check('chk_reading_session_heartbeat_sequence', '"heartbeat_sequence" >= 0')
export class ReadingSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId!: string;

  @ManyToOne(() => Document, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document!: Document;

  @Column({ name: 'client_session_id', type: 'varchar', length: 64 })
  clientSessionId!: string;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: ReadingSessionStatus;

  @Column({ name: 'last_state', type: 'varchar', length: 16, default: 'active' })
  lastState!: ReadingHeartbeatState;

  @Column({ name: 'heartbeat_sequence', type: 'int', default: 0 })
  heartbeatSequence!: number;

  @Column({ name: 'effective_seconds', type: 'int', default: 0 })
  effectiveSeconds!: number;

  @Column({ name: 'last_chapter_idx', type: 'int', nullable: true })
  lastChapterIdx!: number | null;

  @Column({ name: 'last_char_offset', type: 'bigint', nullable: true })
  lastCharOffset!: string | null;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt!: Date;

  @Column({ name: 'last_heartbeat_at', type: 'timestamptz' })
  lastHeartbeatAt!: Date;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt!: Date | null;

  @VersionColumn({ type: 'int', default: 1 })
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
