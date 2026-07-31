import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryColumn,
} from 'typeorm';

import type {
  ArenaBattleResult,
  ArenaFighterSnapshot,
} from '../../modules/games/arena/engine';
import type { RewardSnapshot } from './reward-grant.entity';
import { ArenaOpponentOffer } from './arena-opponent-offer.entity';
import { User } from './user.entity';

export type ArenaStoredBattleResult = 'win' | 'loss';

/**
 * 不可变斗技场战报。保存输入快照、seed、引擎版本和完整结构化日志，可确定性重放。
 */
@Entity({ name: 'arena_battles' })
@Index('idx_arena_battles_user_created', ['userId', 'createdAt'])
@Index('uq_arena_battle_idempotency', ['idempotencyKey'], { unique: true })
@Check('chk_arena_battle_result', `"result" IN ('win','loss')`)
export class ArenaBattle {
  /** 由应用服务在结算前生成，并参与奖励来源标识。 */
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'offer_id', type: 'uuid', unique: true })
  offerId!: string;

  @OneToOne(() => ArenaOpponentOffer, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'offer_id' })
  offer!: ArenaOpponentOffer;

  @Column({ type: 'varchar', length: 16 })
  result!: ArenaStoredBattleResult;

  @Column({ type: 'varchar', length: 100 })
  seed!: string;

  @Column({ name: 'engine_version', type: 'varchar', length: 32 })
  engineVersion!: string;

  @Column({ name: 'attacker_snapshot', type: 'jsonb' })
  attackerSnapshot!: ArenaFighterSnapshot;

  @Column({ name: 'opponent_snapshot', type: 'jsonb' })
  opponentSnapshot!: ArenaFighterSnapshot;

  /** 保存完整 ArenaBattleResult，而不仅是展示文案。 */
  @Column({ name: 'battle_log', type: 'jsonb' })
  battleLog!: ArenaBattleResult;

  @Column({ name: 'reward_snapshot', type: 'jsonb' })
  rewardSnapshot!: RewardSnapshot;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 200 })
  idempotencyKey!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
