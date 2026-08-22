import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity({ name: 'community_moderation_actions' })
@Unique('uq_community_moderation_actions_idempotency', ['actorId', 'idempotencyKey'])
@Index('idx_community_moderation_actions_case', ['caseId', 'createdAt'])
export class ModerationAction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'case_id', type: 'uuid' })
  caseId!: string;

  @Column({ name: 'actor_id', type: 'uuid' })
  actorId!: string;

  @Column({ name: 'actor_role', type: 'varchar', length: 16 })
  actorRole!: 'moderator' | 'admin';

  @Column({ type: 'varchar', length: 24 })
  action!: 'approve' | 'limit' | 'hide' | 'restore';

  @Column({ type: 'varchar', length: 500 })
  reason!: string;

  @Column({ name: 'previous_state', type: 'jsonb' })
  previousState!: Record<string, unknown>;

  @Column({ name: 'next_state', type: 'jsonb' })
  nextState!: Record<string, unknown>;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 100 })
  idempotencyKey!: string;

  @Column({ name: 'request_hash', type: 'varchar', length: 64 })
  requestHash!: string;

  @Column({ type: 'jsonb' })
  result!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
