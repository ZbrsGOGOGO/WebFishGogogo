import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity({ name: 'office_battle_records' })
@Unique('uq_office_battle_records_request', ['userId', 'battleRequestId'])
@Index('idx_office_battle_records_history', ['userId', 'completedAt', 'id'])
@Index('idx_office_battle_records_defender', ['defenderUserId', 'completedAt'])
@Check('chk_office_battle_records_mode', `"mode" IN ('reward', 'practice')`)
@Check('chk_office_battle_records_opponent_kind', `"opponent_kind" IN ('npc', 'friend')`)
@Check('chk_office_battle_records_winner', `"winner" IN ('player', 'opponent')`)
export class OfficeBattleRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'defender_user_id', type: 'uuid', nullable: true })
  defenderUserId!: string | null;

  @Column({ name: 'battle_request_id', type: 'varchar', length: 100 })
  battleRequestId!: string;

  @Column({ name: 'request_hash', type: 'varchar', length: 64 })
  requestHash!: string;

  @Column({ type: 'varchar', length: 16 })
  mode!: 'reward' | 'practice';

  @Column({ name: 'opponent_kind', type: 'varchar', length: 16 })
  opponentKind!: 'npc' | 'friend';

  @Column({ name: 'offer_id', type: 'uuid', nullable: true })
  offerId!: string | null;

  @Column({ name: 'service_date', type: 'date' })
  serviceDate!: string;

  @Column({ name: 'engine_version', type: 'varchar', length: 64 })
  engineVersion!: string;

  @Column({ name: 'balance_version', type: 'varchar', length: 64 })
  balanceVersion!: string;

  @Column({ name: 'seed_hex', type: 'varchar', length: 64 })
  seedHex!: string;

  @Column({ name: 'player_snapshot', type: 'jsonb' })
  playerSnapshot!: Record<string, unknown>;

  @Column({ name: 'opponent_snapshot', type: 'jsonb' })
  opponentSnapshot!: Record<string, unknown>;

  @Column({ name: 'opponent_equipment_visible', type: 'boolean', default: true })
  opponentEquipmentVisible!: boolean;

  @Column({
    name: 'player_equipment_visible_to_defender',
    type: 'boolean',
    default: true,
  })
  playerEquipmentVisibleToDefender!: boolean;

  @Column({ type: 'jsonb' })
  events!: Array<Record<string, unknown>>;

  @Column({ type: 'varchar', length: 16 })
  winner!: 'player' | 'opponent';

  @Column({ name: 'reward_snapshot', type: 'jsonb' })
  rewardSnapshot!: Record<string, unknown>;

  @Column({ name: 'energy_snapshot', type: 'jsonb' })
  energySnapshot!: Record<string, unknown>;

  @Column({ name: 'profile_version', type: 'int' })
  profileVersion!: number;

  @Column({ name: 'loadout_version', type: 'int' })
  loadoutVersion!: number;

  @Column({ name: 'inventory_version', type: 'int' })
  inventoryVersion!: number;

  @Column({ name: 'completed_at', type: 'timestamptz' })
  completedAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
