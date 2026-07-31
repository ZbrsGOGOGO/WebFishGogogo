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

export type OutboxEventStatus = 'pending' | 'processed' | 'failed';

/**
 * 与业务写入同事务落库的待投递事件，供活动流和每日任务消费者可靠处理。
 */
@Entity({ name: 'outbox_events' })
@Index('idx_outbox_events_dispatch', ['status', 'availableAt', 'createdAt'])
@Index('idx_outbox_events_user_created', ['userId', 'createdAt'])
@Index('uq_outbox_events_idempotency', ['idempotencyKey'], { unique: true })
@Check(
  'chk_outbox_event_status',
  `"status" IN ('pending', 'processed', 'failed')`,
)
@Check('chk_outbox_event_attempts', '"attempts" >= 0')
export class OutboxEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'event_type', type: 'varchar', length: 100 })
  eventType!: string;

  @Column({ name: 'aggregate_type', type: 'varchar', length: 50 })
  aggregateType!: string;

  @Column({ name: 'aggregate_id', type: 'varchar', length: 100 })
  aggregateId!: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: OutboxEventStatus;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ name: 'available_at', type: 'timestamptz', default: () => 'now()' })
  availableAt!: Date;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt!: Date | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 200 })
  idempotencyKey!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
