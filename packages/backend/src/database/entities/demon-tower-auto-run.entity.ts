import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import type { DemonTowerAutoStopReason } from '@stealth-reader/shared';
import { User } from './user.entity';
import { AuthSession } from './auth-session.entity';

@Entity({ name: 'demon_tower_auto_runs' })
@Index('uq_demon_tower_auto_active_user', ['userId'], { unique: true, where: '"status" = \'running\'' })
@Index('uq_demon_tower_auto_start_request', ['userId', 'startRequestId'], { unique: true })
@Index('ix_demon_tower_auto_due', ['status', 'nextStepAt'])
@Index('ix_demon_tower_auto_user_created', ['userId', 'createdAt'])
export class DemonTowerAutoRun {
  @PrimaryColumn({ type: 'uuid' }) id!: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'user_id' }) user!: User;
  @Column({ name: 'origin_auth_session_id', type: 'uuid', nullable: true, select: false }) originAuthSessionId!: string | null;
  @ManyToOne(() => AuthSession, { onDelete: 'SET NULL', nullable: true }) @JoinColumn({ name: 'origin_auth_session_id' }) originAuthSession!: AuthSession | null;
  @Column({ name: 'start_request_id', type: 'uuid', select: false }) startRequestId!: string;
  @Column({ name: 'request_hash', type: 'varchar', length: 64, select: false }) requestHash!: string;
  @Column({ type: 'integer', default: 1 }) version!: number;
  @Column({ type: 'varchar', length: 12 }) status!: 'running' | 'completed' | 'stopped';
  @Column({ name: 'stop_reason', type: 'varchar', length: 32, nullable: true }) stopReason!: DemonTowerAutoStopReason | null;
  @Column({ name: 'service_date', type: 'date' }) serviceDate!: string;
  @Column({ type: 'integer' }) floor!: number;
  @Column({ name: 'max_explorations', type: 'integer' }) maxExplorations!: number;
  @Column({ name: 'started_explorations', type: 'integer', default: 0 }) startedExplorations!: number;
  @Column({ name: 'completed_explorations', type: 'integer', default: 0 }) completedExplorations!: number;
  @Column({ type: 'integer', default: 0 }) steps!: number;
  @Column({ name: 'expected_profile_version', type: 'integer' }) expectedProfileVersion!: number;
  @Column({ name: 'office_coins_granted', type: 'integer', default: 0 }) officeCoinsGranted!: number;
  @Column({ name: 'failure_count', type: 'integer', default: 0, select: false }) failureCount!: number;
  @Column({ name: 'next_step_at', type: 'timestamptz' }) nextStepAt!: Date;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date;
  @Column({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @Column({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
  @Column({ name: 'stopped_at', type: 'timestamptz', nullable: true }) stoppedAt!: Date | null;
}
