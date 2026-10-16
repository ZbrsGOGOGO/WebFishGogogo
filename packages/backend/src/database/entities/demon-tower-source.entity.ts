import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';

import { User } from './user.entity';

/** Independent opaque save for the 2fe1c88e ZIP runtime. */
@Entity({ name: 'demon_tower_source_profiles' })
export class DemonTowerSourceProfile {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' }) userId!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'user_id' }) user!: User;
  @Column({ type: 'integer', default: 1 }) version!: number;
  @Column({ name: 'schema_version', type: 'integer', default: 1 }) schemaVersion!: number;
  @Column({ name: 'save_data', type: 'jsonb', select: false }) saveData!: Record<string, unknown>;
  @Column({ name: 'display_name', type: 'varchar', length: 100 }) displayName!: string;
  @Column({ type: 'integer', default: 1 }) level!: number;
  @Column({ type: 'integer', default: 0 }) power!: number;
  @Column({ name: 'last_save_request_id', type: 'uuid', nullable: true, select: false }) lastSaveRequestId!: string | null;
  @Column({ name: 'last_save_request_hash', type: 'varchar', length: 64, nullable: true, select: false }) lastSaveRequestHash!: string | null;
  @Column({ name: 'last_save_receipt', type: 'jsonb', nullable: true, select: false }) lastSaveReceipt!: Record<string, unknown> | null;
  @Column({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @Column({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

@Entity({ name: 'demon_tower_source_world_floors' })
export class DemonTowerSourceWorldFloor {
  @PrimaryColumn({ name: 'layer_id', type: 'integer' }) layerId!: number;
  @Column({ type: 'varchar', length: 16 }) status!: 'open' | 'cleared' | 'locked';
  @Column({ name: 'boss_hp', type: 'integer' }) bossHp!: number;
  @Column({ name: 'boss_max_hp', type: 'integer' }) bossMaxHp!: number;
  @Column({ type: 'integer', default: 0 }) clues!: number;
  @Column({ type: 'integer', default: 0 }) channel!: number;
  @Column({ name: 'channel_goal', type: 'integer' }) channelGoal!: number;
  @Column({ name: 'boss_name', type: 'varchar', length: 48 }) bossName!: string;
  @Column({ type: 'varchar', length: 12 }) terrain!: 'plain' | 'mount' | 'lake' | 'ocean';
  @Column({ type: 'integer', default: 1 }) version!: number;
  @Column({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

@Entity({ name: 'demon_tower_source_contributions' })
export class DemonTowerSourceContribution {
  @PrimaryColumn({ name: 'layer_id', type: 'integer' }) layerId!: number;
  @ManyToOne(() => DemonTowerSourceWorldFloor, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'layer_id' }) layer!: DemonTowerSourceWorldFloor;
  @PrimaryColumn({ name: 'user_id', type: 'uuid' }) userId!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'user_id' }) user!: User;
  @Column({ name: 'boss_damage', type: 'bigint', default: 0 }) bossDamage!: string;
  @Column({ type: 'bigint', default: 0 }) materials!: string;
  @Column({ type: 'bigint', default: 0 }) clues!: string;
  @Column({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

@Entity({ name: 'demon_tower_source_daily_actions' })
export class DemonTowerSourceDailyAction {
  @PrimaryColumn({ name: 'service_date', type: 'date' }) serviceDate!: string;
  @PrimaryColumn({ name: 'user_id', type: 'uuid' }) userId!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'user_id' }) user!: User;
  @Column({ name: 'boss_attempts', type: 'integer', default: 0 }) bossAttempts!: number;
  @Column({ name: 'donated_materials', type: 'integer', default: 0 }) donatedMaterials!: number;
  @Column({ name: 'mutation_count', type: 'integer', default: 0 }) mutationCount!: number;
  @Column({ name: 'save_count', type: 'integer', default: 0 }) saveCount!: number;
  @Column({ name: 'save_bytes', type: 'bigint', default: 0 }) saveBytes!: string;
  @Column({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

@Entity({ name: 'demon_tower_source_commands' })
@Index('ix_demon_tower_source_commands_created', ['createdAt'])
export class DemonTowerSourceCommand {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' }) userId!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'user_id' }) user!: User;
  @PrimaryColumn({ name: 'request_id', type: 'uuid' }) requestId!: string;
  @Column({ type: 'varchar', length: 24 }) kind!: 'damage' | 'channel' | 'clue';
  @Column({ name: 'request_hash', type: 'varchar', length: 64, select: false }) requestHash!: string;
  @Column({ type: 'jsonb', select: false }) receipt!: Record<string, unknown>;
  @Column({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
