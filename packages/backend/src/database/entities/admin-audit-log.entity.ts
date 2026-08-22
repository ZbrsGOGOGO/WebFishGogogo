import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** 只追加审计轨迹；任何服务都不得更新或删除。 */
@Entity({ name: 'community_admin_audit_logs' })
@Index('idx_community_admin_audit_target', ['targetType', 'targetId', 'createdAt'])
@Index('idx_community_admin_audit_actor', ['actorId', 'createdAt'])
export class AdminAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId!: string | null;

  @Column({ name: 'actor_role', type: 'varchar', length: 16 })
  actorRole!: 'system' | 'user' | 'moderator' | 'admin';

  @Column({ type: 'varchar', length: 64 })
  action!: string;

  @Column({ name: 'target_type', type: 'varchar', length: 32 })
  targetType!: string;

  @Column({ name: 'target_id', type: 'uuid' })
  targetId!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason!: string | null;

  @Column({ name: 'request_id', type: 'varchar', length: 100, nullable: true })
  requestId!: string | null;

  @Column({ name: 'previous_state', type: 'jsonb' })
  previousState!: Record<string, unknown>;

  @Column({ name: 'next_state', type: 'jsonb' })
  nextState!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
