import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

import { User } from './user.entity';

export type GuildBuildingKey =
  | 'project_room'
  | 'training_room'
  | 'pantry'
  | 'showcase_wall';

export type GuildBuildings = Record<GuildBuildingKey, number>;

@Entity({ name: 'guilds' })
@Index('uq_guilds_name_key', ['nameKey'], { unique: true })
@Check('chk_guilds_level', '"level" BETWEEN 1 AND 5')
@Check('chk_guilds_treasury', '"treasury" >= 0')
@Check('chk_guilds_capacity', '"member_capacity" BETWEEN 30 AND 50')
export class Guild {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 24 })
  name!: string;

  @Column({ name: 'name_key', type: 'varchar', length: 24 })
  nameKey!: string;

  @Column({ name: 'owner_user_id', type: 'uuid' })
  ownerUserId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'owner_user_id' })
  owner!: User;

  @Column({ type: 'smallint', default: 1 })
  level!: number;

  @Column({ type: 'bigint', default: 0 })
  treasury!: string;

  @Column({ name: 'member_capacity', type: 'smallint', default: 30 })
  memberCapacity!: number;

  @Column({ type: 'jsonb', default: () => `'{}'` })
  buildings!: GuildBuildings;

  @VersionColumn({ type: 'int', default: 1 })
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
