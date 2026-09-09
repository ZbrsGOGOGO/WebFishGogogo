import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from './user.entity';

/** Dedicated game save. The engine owns this JSON; it is never returned by a repository serializer. */
@Entity({ name: 'demon_tower_profiles' })
export class DemonTowerProfile {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' }) userId!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'user_id' }) user!: User;
  @Column({ type: 'integer', default: 1 }) version!: number;
  @Column({ type: 'jsonb', select: false }) state!: Record<string, unknown>;
  @Column({ name: 'action_window_at', type: 'timestamptz', nullable: true }) actionWindowAt!: Date | null;
  @Column({ name: 'action_window_count', type: 'integer', default: 0 }) actionWindowCount!: number;
  @Column({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @Column({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

/** Nine bounded shared rows, always locked in ascending floor order after the acting user. */
@Entity({ name: 'demon_tower_world_floors' })
export class DemonTowerWorldFloor {
  @PrimaryColumn({ type: 'integer' }) floor!: number;
  @Column({ name: 'boss_hp', type: 'integer' }) bossHp!: number;
  @Column({ name: 'boss_max_hp', type: 'integer' }) bossMaxHp!: number;
  @Column({ name: 'passage_progress', type: 'integer', default: 0 }) passageProgress!: number;
  @Column({ name: 'passage_required', type: 'integer' }) passageRequired!: number;
  @Column({ type: 'integer', default: 1 }) version!: number;
  @Column({ name: 'unlocked_at', type: 'timestamptz', nullable: true }) unlockedAt!: Date | null;
  @Column({ name: 'defeated_at', type: 'timestamptz', nullable: true }) defeatedAt!: Date | null;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt!: Date | null;
  @Column({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

@Entity({ name: 'demon_tower_commands' })
@Index('ix_demon_tower_commands_user_created', ['userId', 'createdAt'])
export class DemonTowerCommand {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' }) userId!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'user_id' }) user!: User;
  @PrimaryColumn({ name: 'request_id', type: 'uuid' }) requestId!: string;
  @Column({ type: 'varchar', length: 24 }) kind!: string;
  @Column({ name: 'request_hash', type: 'varchar', length: 64, select: false }) requestHash!: string;
  @Column({ name: 'expected_version', type: 'integer' }) expectedVersion!: number;
  @Column({ name: 'applied_version', type: 'integer' }) appliedVersion!: number;
  /** Only immutable, safe receipt fields; overview and wallet are projected from current state. */
  @Column({ type: 'jsonb', select: false }) receipt!: { events: string[]; officeCoinsGranted: number; effectiveBossDamage: number; passageContribution: number };
  @Column({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}

@Entity({ name: 'demon_tower_contributions' })
export class DemonTowerContribution {
  @PrimaryColumn({ type: 'integer' }) floor!: number;
  @ManyToOne(() => DemonTowerWorldFloor, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'floor' }) world!: DemonTowerWorldFloor;
  @PrimaryColumn({ name: 'user_id', type: 'uuid' }) userId!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'user_id' }) user!: User;
  @Column({ name: 'boss_damage', type: 'integer', default: 0 }) bossDamage!: number;
  @Column({ name: 'passage_contribution', type: 'integer', default: 0 }) passageContribution!: number;
  @Column({ type: 'integer', default: 1 }) level!: number;
  @Column({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

@Entity({ name: 'demon_tower_daily_progress' })
export class DemonTowerDailyProgress {
  @PrimaryColumn({ name: 'service_date', type: 'date' }) serviceDate!: string;
  @PrimaryColumn({ name: 'user_id', type: 'uuid' }) userId!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'user_id' }) user!: User;
  @Column({ name: 'office_coins', type: 'integer', default: 0 }) officeCoins!: number;
  @Column({ name: 'boss_damage', type: 'integer', default: 0 }) bossDamage!: number;
  @Column({ name: 'passage_contribution', type: 'integer', default: 0 }) passageContribution!: number;
  @Column({ name: 'boss_attempts', type: 'integer', default: 0 }) bossAttempts!: number;
  @Column({ name: 'action_count', type: 'integer', default: 0 }) actionCount!: number;
  @Column({ type: 'integer', default: 1 }) level!: number;
  @Column({ name: 'achieved_at', type: 'timestamptz' }) achievedAt!: Date;
  @Column({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

@Entity({ name: 'demon_tower_daily_awards' })
export class DemonTowerDailyAward {
  @PrimaryColumn({ name: 'service_date', type: 'date' }) serviceDate!: string;
  @Column({ name: 'winner_user_id', type: 'uuid', nullable: true }) winnerUserId!: string | null;
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true }) @JoinColumn({ name: 'winner_user_id' }) winner!: User | null;
  @Column({ name: 'boss_damage', type: 'integer', default: 0 }) bossDamage!: number;
  @Column({ type: 'integer', default: 0 }) coins!: number;
  @Column({ name: 'awarded_at', type: 'timestamptz' }) awardedAt!: Date;
}
