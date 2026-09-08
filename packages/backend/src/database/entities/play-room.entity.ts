import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
import type { ArcadeGameKey, ArcadeGameMode, PlayRoomStatus } from '@stealth-reader/shared';
import { User } from './user.entity';

@Entity({ name: 'play_rooms' })
@Index('uq_play_room_client', ['creatorId', 'clientRequestId'], { unique: true })
export class PlayRoom {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'creator_id', type: 'uuid', nullable: true }) creatorId!: string | null;
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true }) @JoinColumn({ name: 'creator_id' }) creator!: User | null;
  @Column({ name: 'host_user_id', type: 'uuid', nullable: true }) hostUserId!: string | null;
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true }) @JoinColumn({ name: 'host_user_id' }) host!: User | null;
  @Column({ name: 'client_request_id', type: 'uuid' }) clientRequestId!: string;
  @Column({ name: 'request_hash', type: 'varchar', length: 64 }) requestHash!: string;
  @Column({ name: 'game_key', type: 'varchar', length: 16 }) gameKey!: ArcadeGameKey;
  @Column({ type: 'varchar', length: 8 }) mode!: ArcadeGameMode;
  @Column({ type: 'varchar', length: 8 }) visibility!: 'public' | 'invite';
  @Column({ type: 'varchar', length: 40 }) title!: string;
  @Column({ type: 'varchar', length: 12 }) status!: PlayRoomStatus;
  @Column({ type: 'integer', default: 1 }) version!: number;
  @Column({ name: 'join_code', type: 'varchar', length: 12, select: false }) joinCode!: string;
  @Column({ name: 'max_players', type: 'integer' }) maxPlayers!: number;
  @Column({ name: 'engine_state', type: 'jsonb', nullable: true, select: false }) engineState!: Record<string, unknown> | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @Column({ name: 'started_at', type: 'timestamptz', nullable: true }) startedAt!: Date | null;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date;
  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true }) finishedAt!: Date | null;
  @Column({ name: 'leaderboard_date', type: 'date', nullable: true }) leaderboardDate!: string | null;
}

@Entity({ name: 'play_room_members' })
export class PlayRoomMember {
  @PrimaryColumn({ name: 'room_id', type: 'uuid' }) roomId!: string;
  @ManyToOne(() => PlayRoom, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'room_id' }) room!: PlayRoom;
  @PrimaryColumn({ name: 'user_id', type: 'uuid' }) userId!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'user_id' }) user!: User;
  @Column({ type: 'boolean', default: false }) ready!: boolean;
  @Column({ type: 'boolean', default: true }) active!: boolean;
  @Column({ name: 'last_sequence', type: 'integer', default: 0 }) lastSequence!: number;
  @Column({ name: 'action_window_at', type: 'timestamptz', nullable: true }) actionWindowAt!: Date | null;
  @Column({ name: 'action_window_count', type: 'integer', default: 0 }) actionWindowCount!: number;
  @Column({ type: 'integer', nullable: true }) score!: number | null;
  @CreateDateColumn({ name: 'joined_at', type: 'timestamptz' }) joinedAt!: Date;
  @Column({ name: 'left_at', type: 'timestamptz', nullable: true }) leftAt!: Date | null;
}

@Entity({ name: 'play_commands' })
export class PlayCommand {
  @PrimaryColumn({ name: 'room_id', type: 'uuid' }) roomId!: string;
  @ManyToOne(() => PlayRoom, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'room_id' }) room!: PlayRoom;
  @PrimaryColumn({ name: 'user_id', type: 'uuid' }) userId!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'user_id' }) user!: User;
  @PrimaryColumn({ name: 'action_id', type: 'uuid' }) actionId!: string;
  @Column({ type: 'integer' }) sequence!: number;
  @Column({ name: 'request_hash', type: 'varchar', length: 64 }) requestHash!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}

@Entity({ name: 'play_daily_scores' })
export class PlayDailyScore {
  @PrimaryColumn({ name: 'service_date', type: 'date' }) serviceDate!: string;
  @PrimaryColumn({ name: 'game_key', type: 'varchar', length: 16 }) gameKey!: ArcadeGameKey;
  @PrimaryColumn({ name: 'user_id', type: 'uuid' }) userId!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'user_id' }) user!: User;
  @Column({ type: 'integer' }) score!: number;
  @Column({ type: 'varchar', length: 8 }) mode!: ArcadeGameMode;
  @Column({ name: 'room_id', type: 'uuid', nullable: true }) roomId!: string | null;
  @ManyToOne(() => PlayRoom, { onDelete: 'SET NULL', nullable: true }) @JoinColumn({ name: 'room_id' }) room!: PlayRoom | null;
  @Column({ name: 'achieved_at', type: 'timestamptz' }) achievedAt!: Date;
}

@Entity({ name: 'play_daily_awards' })
export class PlayDailyAward {
  @PrimaryColumn({ name: 'service_date', type: 'date' }) serviceDate!: string;
  @PrimaryColumn({ name: 'game_key', type: 'varchar', length: 16 }) gameKey!: ArcadeGameKey;
  @Column({ name: 'winner_user_id', type: 'uuid', nullable: true }) winnerUserId!: string | null;
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true }) @JoinColumn({ name: 'winner_user_id' }) winner!: User | null;
  @Column({ type: 'integer' }) score!: number;
  @Column({ type: 'integer' }) coins!: number;
  @Column({ name: 'awarded_at', type: 'timestamptz' }) awardedAt!: Date;
}
