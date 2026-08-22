import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

import type { OfficeBattleEquipmentSlot } from './office-battle-equipment.entity';
import type { OfficeBattleProfession } from './office-battle-profile.entity';

@Entity({ name: 'office_battle_loadout_items' })
@Index('uq_office_battle_loadout_equipment', ['userId', 'equipmentId'], { unique: true })
export class OfficeBattleLoadoutItem {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @PrimaryColumn({ type: 'varchar', length: 16 })
  slot!: OfficeBattleEquipmentSlot;

  @Column({ name: 'equipment_id', type: 'uuid' })
  equipmentId!: string;
}

@Entity({ name: 'office_battle_defense_configs' })
@Check('chk_office_battle_defense_challenge_visibility', `"challenge_visibility" IN ('friends', 'none')`)
@Check('chk_office_battle_defense_equipment_visibility', `"equipment_visibility" IN ('public', 'friends', 'private')`)
@Check('chk_office_battle_defense_version', '"version" > 0')
export class OfficeBattleDefenseConfig {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 16 })
  profession!: OfficeBattleProfession;

  @Column({ name: 'equipment_ids', type: 'jsonb' })
  equipmentIds!: string[];

  @Column({ name: 'challenge_visibility', type: 'varchar', length: 16, default: 'friends' })
  challengeVisibility!: 'friends' | 'none';

  @Column({ name: 'equipment_visibility', type: 'varchar', length: 16, default: 'friends' })
  equipmentVisibility!: 'public' | 'friends' | 'private';

  @Column({ type: 'int', default: 1 })
  version!: number;
}
