import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import type { ArenaFighterSnapshot } from '../../modules/games/arena/engine';
import { User } from './user.entity';

export type ArenaOpponentTier = 'easy' | 'even' | 'risky';

/**
 * 给某用户生成的短期 NPC 对手报价。战斗只消费保存的快照，不重新读取动态数值。
 */
@Entity({ name: 'arena_opponent_offers' })
@Index('idx_arena_offers_user_expires', ['userId', 'expiresAt'])
@Check(
  'chk_arena_offer_tier',
  `"tier" IN ('easy','even','risky')`,
)
@Check(
  'chk_arena_offer_level',
  '"opponent_level" BETWEEN 1 AND 100',
)
export class ArenaOpponentOffer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', length: 16 })
  tier!: ArenaOpponentTier;

  @Column({ name: 'opponent_name', type: 'varchar', length: 100 })
  opponentName!: string;

  @Column({ name: 'opponent_level', type: 'smallint' })
  opponentLevel!: number;

  @Column({ name: 'opponent_snapshot', type: 'jsonb' })
  opponentSnapshot!: ArenaFighterSnapshot;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({
    name: 'consumed_at',
    type: 'timestamptz',
    nullable: true,
  })
  consumedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
