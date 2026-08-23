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

import { Guild } from './guild.entity';

export type GuildBossStatus = 'active' | 'defeated';

@Entity({ name: 'guild_boss_runs' })
@Index('uq_guild_boss_runs_daily', ['guildId', 'serviceDate'], { unique: true })
@Index('idx_guild_boss_runs_guild_created', ['guildId', 'createdAt'])
@Check('chk_guild_boss_runs_hp', '"max_hp" > 0 AND "remaining_hp" >= 0 AND "remaining_hp" <= "max_hp"')
@Check('chk_guild_boss_runs_status', `"status" IN ('active', 'defeated')`)
export class GuildBossRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'guild_id', type: 'uuid' })
  guildId!: string;

  @ManyToOne(() => Guild, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'guild_id' })
  guild!: Guild;

  @Column({ name: 'service_date', type: 'date' })
  serviceDate!: string;

  @Column({ name: 'boss_key', type: 'varchar', length: 40 })
  bossKey!: string;

  @Column({ name: 'boss_name', type: 'varchar', length: 40 })
  bossName!: string;

  @Column({ name: 'max_hp', type: 'bigint' })
  maxHp!: string;

  @Column({ name: 'remaining_hp', type: 'bigint' })
  remainingHp!: string;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: GuildBossStatus;

  @Column({ name: 'defeated_at', type: 'timestamptz', nullable: true })
  defeatedAt!: Date | null;

  @Column({ name: 'ends_at', type: 'timestamptz' })
  endsAt!: Date;

  @VersionColumn({ type: 'int', default: 1 })
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
