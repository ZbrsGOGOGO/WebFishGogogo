import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from './user.entity';

export type OfficeBattleProfession = 'developer' | 'product' | 'qa' | 'sales' | 'hr';

@Entity({ name: 'office_battle_profiles' })
@Check('chk_office_battle_profiles_profession', `"profession" IN ('developer', 'product', 'qa', 'sales', 'hr')`)
@Check('chk_office_battle_profiles_energy', '"energy" BETWEEN 0 AND 12')
@Check('chk_office_battle_profiles_experience', '"total_battle_experience" BETWEEN 0 AND 40120')
@Check('chk_office_battle_profiles_non_negative', '"wins" >= 0 AND "losses" >= 0 AND "parts" >= 0')
@Check('chk_office_battle_profiles_versions', '"profile_version" > 0 AND "loadout_version" > 0 AND "inventory_version" > 0 AND "defense_version" > 0')
export class OfficeBattleProfile {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', length: 16 })
  profession!: OfficeBattleProfession;

  @Column({ name: 'total_battle_experience', type: 'int', default: 0 })
  totalBattleExperience!: number;

  @Column({ type: 'int', default: 0 })
  wins!: number;

  @Column({ type: 'int', default: 0 })
  losses!: number;

  @Column({ type: 'smallint', default: 12 })
  energy!: number;

  @Column({ name: 'service_date', type: 'date' })
  serviceDate!: string;

  @Column({ type: 'int', default: 0 })
  parts!: number;

  @Column({ name: 'rewarded_battles_used', type: 'smallint', default: 0 })
  rewardedBattlesUsed!: number;

  @Column({ name: 'rewarded_friend_battles_used', type: 'smallint', default: 0 })
  rewardedFriendBattlesUsed!: number;

  @Column({ name: 'upgrade_protection_used', type: 'boolean', default: false })
  upgradeProtectionUsed!: boolean;

  @Column({ name: 'profile_version', type: 'int', default: 1 })
  profileVersion!: number;

  @Column({ name: 'loadout_version', type: 'int', default: 1 })
  loadoutVersion!: number;

  @Column({ name: 'inventory_version', type: 'int', default: 1 })
  inventoryVersion!: number;

  @Column({ name: 'defense_version', type: 'int', default: 1 })
  defenseVersion!: number;

  @Column({ name: 'profession_changed_at', type: 'timestamptz', nullable: true })
  professionChangedAt!: Date | null;

  @Column({ name: 'starter_professions', type: 'jsonb', default: () => "'[]'" })
  starterProfessions!: OfficeBattleProfession[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
