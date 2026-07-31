import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { OutboxEvent } from './outbox-event.entity';

/**
 * 消费者处理回执。同一消费者对同一事件最多成功一次。
 */
@Entity({ name: 'outbox_receipts' })
@Unique('uq_outbox_receipt_consumer_event', ['consumerName', 'eventId'])
@Index('idx_outbox_receipts_event', ['eventId'])
export class OutboxReceipt {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'consumer_name', type: 'varchar', length: 100 })
  consumerName!: string;

  @Column({ name: 'event_id', type: 'uuid' })
  eventId!: string;

  @ManyToOne(() => OutboxEvent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event!: OutboxEvent;

  @CreateDateColumn({ name: 'processed_at', type: 'timestamptz' })
  processedAt!: Date;
}
