import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from './user.entity';

export type ArcadeGameKey = 'tetris' | 'tank';
export type ArcadeRunStatus = 'active' | 'completed' | 'expired';

@Entity({ name: 'arcade_game_runs' })
@Index('idx_arcade_game_runs_user_game_status', ['userId', 'gameKey', 'status'])
@Index('idx_arcade_game_runs_expiry', ['status', 'expiresAt'])
@Check('chk_arcade_game_runs_game', `"game_key" IN ('tetris', 'tank')`)
@Check('chk_arcade_game_runs_status', `"status" IN ('active', 'completed', 'expired')`)
@Check('chk_arcade_game_runs_score', '"score" IS NULL OR "score" >= 0')
export class ArcadeGameRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'game_key', type: 'varchar', length: 16 })
  gameKey!: ArcadeGameKey;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: ArcadeRunStatus;

  @Column({ type: 'int', nullable: true })
  score!: number | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metrics!: Record<string, unknown>;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

@Entity({ name: 'arcade_best_scores' })
@Index('idx_arcade_best_scores_ranking', ['gameKey', 'bestScore', 'achievedAt'])
@Check('chk_arcade_best_scores_game', `"game_key" IN ('tetris', 'tank')`)
@Check('chk_arcade_best_scores_score', '"best_score" >= 0')
export class ArcadeBestScore {
  @PrimaryColumn({ name: 'game_key', type: 'varchar', length: 16 })
  gameKey!: ArcadeGameKey;

  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'best_score', type: 'int' })
  bestScore!: number;

  @Column({ name: 'run_id', type: 'uuid', unique: true })
  runId!: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metrics!: Record<string, unknown>;

  @Column({ name: 'achieved_at', type: 'timestamptz' })
  achievedAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
