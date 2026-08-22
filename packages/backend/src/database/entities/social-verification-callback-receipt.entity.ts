import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { SocialVerificationSession } from './social-verification-session.entity';

/** HMAC-only callback replay ledger; no provider payload is retained. */
@Entity({ name: 'social_verification_callback_receipts' })
@Index('uq_social_verification_callback_event', ['eventKeyHash'], {
  unique: true,
})
@Index('uq_social_verification_callback_nonce', ['nonceHash'], { unique: true })
@Index('idx_social_verification_callback_session', ['sessionId', 'receivedAt'])
export class SocialVerificationCallbackReceipt {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId!: string;

  @ManyToOne(() => SocialVerificationSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session!: SocialVerificationSession;

  @Column({ name: 'event_key_hash', type: 'varchar', length: 64 })
  eventKeyHash!: string;

  @Column({ name: 'nonce_hash', type: 'varchar', length: 64 })
  nonceHash!: string;

  @Column({ name: 'body_hash', type: 'varchar', length: 64 })
  bodyHash!: string;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;

  @CreateDateColumn({ name: 'received_at', type: 'timestamptz' })
  receivedAt!: Date;
}
