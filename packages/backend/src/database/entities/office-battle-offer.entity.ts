import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity({ name: 'office_battle_offer_sets' })
@Index('idx_office_battle_offer_sets_active', ['userId', 'expiresAt', 'consumedAt'])
@Index('idx_office_battle_offer_sets_unconsumed', ['userId', 'createdAt'], {
  where: '"consumed_at" IS NULL',
})
export class OfficeBattleOfferSet {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'seed_hex', type: 'varchar', length: 64 })
  seedHex!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt!: Date | null;

  @Column({ name: 'consumed_battle_id', type: 'uuid', nullable: true })
  consumedBattleId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

@Entity({ name: 'office_battle_offers' })
@Unique('uq_office_battle_offers_tier', ['offerSetId', 'tier'])
@Index('idx_office_battle_offers_expiry', ['userId', 'expiresAt'])
@Check('chk_office_battle_offers_tier', `"tier" IN ('simple', 'balanced', 'challenge')`)
export class OfficeBattleOffer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'offer_set_id', type: 'uuid' })
  offerSetId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 16 })
  tier!: 'simple' | 'balanced' | 'challenge';

  @Column({ name: 'opponent_snapshot', type: 'jsonb' })
  opponentSnapshot!: Record<string, unknown>;

  @Column({ name: 'reward_multiplier_percent', type: 'smallint' })
  rewardMultiplierPercent!: 80 | 100 | 120;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
