import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'office_battle_pending_rewards' })
@Unique('uq_office_battle_pending_rewards_battle', ['userId', 'battleId'])
@Index('idx_office_battle_pending_rewards_user', ['userId', 'status', 'createdAt'])
@Check('chk_office_battle_pending_rewards_status', `"status" IN ('pending', 'claimed', 'salvaged')`)
export class OfficeBattlePendingReward {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'battle_id', type: 'uuid' })
  battleId!: string;

  /** Complete immutable equipment data; it is not regenerated during claim. */
  @Column({ name: 'equipment_snapshot', type: 'jsonb' })
  equipmentSnapshot!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: 'pending' | 'claimed' | 'salvaged';

  /** Persisted mutation result makes concurrent/replayed resolution deterministic. */
  @Column({ name: 'resolution_result', type: 'jsonb', nullable: true })
  resolutionResult!: Record<string, unknown> | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

@Entity({ name: 'office_battle_friend_reward_claims' })
@Unique('uq_office_battle_friend_reward_claim', [
  'attackerUserId',
  'defenderUserId',
  'serviceDate',
])
export class OfficeBattleFriendRewardClaim {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'attacker_user_id', type: 'uuid' })
  attackerUserId!: string;

  @Column({ name: 'defender_user_id', type: 'uuid' })
  defenderUserId!: string;

  @Column({ name: 'service_date', type: 'date' })
  serviceDate!: string;

  @Column({ name: 'battle_id', type: 'uuid' })
  battleId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
