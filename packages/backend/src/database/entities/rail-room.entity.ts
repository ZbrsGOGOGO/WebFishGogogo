import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
import type { RailChatChannel, RailRoomRole } from '@stealth-reader/shared';
import { User } from './user.entity';

@Entity({ name: 'rail_rooms' })
@Index('uq_rail_room_client', ['creatorId', 'clientRequestId'], { unique: true })
export class RailRoom {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'creator_id', type: 'uuid', nullable: true }) creatorId!: string | null;
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true }) @JoinColumn({ name: 'creator_id' }) creator!: User | null;
  @Column({ name: 'host_user_id', type: 'uuid', nullable: true }) hostUserId!: string | null;
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true }) @JoinColumn({ name: 'host_user_id' }) host!: User | null;
  @Column({ name: 'client_request_id', type: 'uuid' }) clientRequestId!: string;
  @Column({ name: 'request_hash', type: 'varchar', length: 64 }) requestHash!: string;
  @Column({ type: 'varchar', length: 8 }) mode!: 'practice' | 'room';
  @Column({ type: 'varchar', length: 40 }) title!: string;
  @Column({ type: 'varchar', length: 12 }) status!: 'waiting' | 'running' | 'finished' | 'closed';
  @Column({ type: 'integer', default: 1 }) version!: number;
  @Column({ name: 'password_hash', type: 'varchar', length: 255, nullable: true, select: false }) passwordHash!: string | null;
  @Column({ name: 'max_players', type: 'integer' }) maxPlayers!: number;
  @Column({ name: 'bot_count', type: 'integer', default: 0 }) botCount!: number;
  @Column({ name: 'engine_state', type: 'jsonb', nullable: true, select: false }) engineState!: Record<string, unknown> | null;
  @Column({ name: 'ranking_eligible', type: 'boolean', default: false }) rankingEligible!: boolean;
  @Column({ name: 'latest_chat_sequence', type: 'integer', default: 0 }) latestChatSequence!: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @Column({ name: 'started_at', type: 'timestamptz', nullable: true }) startedAt!: Date | null;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date;
  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true }) finishedAt!: Date | null;
  @Column({ name: 'leaderboard_date', type: 'date', nullable: true }) leaderboardDate!: string | null;
}

@Entity({ name: 'rail_room_members' })
export class RailRoomMember {
  @PrimaryColumn({ name: 'room_id', type: 'uuid' }) roomId!: string;
  @ManyToOne(() => RailRoom, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'room_id' }) room!: RailRoom;
  @PrimaryColumn({ name: 'user_id', type: 'uuid' }) userId!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'user_id' }) user!: User;
  @Column({ type: 'varchar', length: 12 }) role!: RailRoomRole;
  @Column({ type: 'boolean', default: false }) ready!: boolean;
  @Column({ type: 'boolean', default: true }) active!: boolean;
  @Column({ name: 'last_sequence', type: 'integer', default: 0 }) lastSequence!: number;
  @Column({ name: 'action_window_at', type: 'timestamptz', nullable: true }) actionWindowAt!: Date | null;
  @Column({ name: 'action_window_count', type: 'integer', default: 0 }) actionWindowCount!: number;
  @CreateDateColumn({ name: 'joined_at', type: 'timestamptz' }) joinedAt!: Date;
  @Column({ name: 'left_at', type: 'timestamptz', nullable: true }) leftAt!: Date | null;
}

@Entity({ name: 'rail_commands' })
export class RailCommand {
  @PrimaryColumn({ name: 'room_id', type: 'uuid' }) roomId!: string;
  @ManyToOne(() => RailRoom, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'room_id' }) room!: RailRoom;
  @PrimaryColumn({ name: 'user_id', type: 'uuid' }) userId!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'user_id' }) user!: User;
  @PrimaryColumn({ name: 'action_id', type: 'uuid' }) actionId!: string;
  @Column({ type: 'integer' }) sequence!: number;
  @Column({ name: 'request_hash', type: 'varchar', length: 64 }) requestHash!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}

@Entity({ name: 'rail_chat_messages' })
export class RailChatMessageRecord {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'room_id', type: 'uuid' }) roomId!: string;
  @ManyToOne(() => RailRoom, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'room_id' }) room!: RailRoom;
  @Column({ name: 'author_id', type: 'uuid' }) authorId!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'author_id' }) author!: User;
  @Column({ name: 'client_message_id', type: 'uuid' }) clientMessageId!: string;
  @Column({ name: 'request_hash', type: 'varchar', length: 64 }) requestHash!: string;
  @Column({ type: 'integer' }) sequence!: number;
  @Column({ type: 'varchar', length: 12 }) channel!: RailChatChannel;
  @Column({ type: 'varchar', length: 600 }) body!: string;
  @Column({ type: 'varchar', length: 12 }) status!: 'visible' | 'withdrawn';
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @Column({ name: 'withdrawn_at', type: 'timestamptz', nullable: true }) withdrawnAt!: Date | null;
}

@Entity({ name: 'rail_daily_scores' })
export class RailDailyScore {
  @PrimaryColumn({ name: 'service_date', type: 'date' }) serviceDate!: string;
  @PrimaryColumn({ name: 'user_id', type: 'uuid' }) userId!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'user_id' }) user!: User;
  @Column({ name: 'rate_basis_points', type: 'integer' }) rateBasisPoints!: number;
  @Column({ type: 'integer' }) survived!: number;
  @Column({ name: 'eligible_rounds', type: 'integer' }) eligibleRounds!: number;
  @Column({ name: 'demon_total', type: 'integer' }) demonTotal!: number;
  @Column({ name: 'room_id', type: 'uuid', nullable: true }) roomId!: string | null;
  @ManyToOne(() => RailRoom, { onDelete: 'SET NULL', nullable: true }) @JoinColumn({ name: 'room_id' }) room!: RailRoom | null;
  @Column({ name: 'achieved_at', type: 'timestamptz' }) achievedAt!: Date;
}

@Entity({ name: 'rail_daily_awards' })
export class RailDailyAward {
  @PrimaryColumn({ name: 'service_date', type: 'date' }) serviceDate!: string;
  @Column({ name: 'winner_user_id', type: 'uuid', nullable: true }) winnerUserId!: string | null;
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true }) @JoinColumn({ name: 'winner_user_id' }) winner!: User | null;
  @Column({ name: 'rate_basis_points', type: 'integer' }) rateBasisPoints!: number;
  @Column({ type: 'integer' }) coins!: number;
  @Column({ name: 'awarded_at', type: 'timestamptz' }) awardedAt!: Date;
}

@Entity({ name: 'rail_player_stats' })
export class RailPlayerStats {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' }) userId!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'user_id' }) user!: User;
  @Column({ name: 'completed_games', type: 'integer', default: 0 }) completedGames!: number;
  @Column({ type: 'integer', default: 0 }) survived!: number;
  @Column({ name: 'eligible_rounds', type: 'integer', default: 0 }) eligibleRounds!: number;
  @Column({ name: 'demon_total', type: 'integer', default: 0 }) demonTotal!: number;
  @Column({ name: 'demon_mvp_count', type: 'integer', default: 0 }) demonMvpCount!: number;
  @Column({ name: 'ranked_games', type: 'integer', default: 0 }) rankedGames!: number;
}
