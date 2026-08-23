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
} from 'typeorm';

import type { RewardSnapshot } from './reward-grant.entity';
import { GuildBossRun } from './guild-boss-run.entity';
import { Guild } from './guild.entity';
import { User } from './user.entity';

@Entity({ name: 'guild_boss_contributions' })
@Index('uq_guild_boss_contributions_member', ['runId', 'userId'], { unique: true })
@Index('idx_guild_boss_contributions_rank', ['runId', 'damage', 'createdAt'])
@Check('chk_guild_boss_contributions_damage', '"damage" > 0')
export class GuildBossContribution {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'run_id', type: 'uuid' })
  runId!: string;

  @ManyToOne(() => GuildBossRun, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'run_id' })
  run!: GuildBossRun;

  @Column({ name: 'guild_id', type: 'uuid' })
  guildId!: string;

  @ManyToOne(() => Guild, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'guild_id' })
  guild!: Guild;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'bigint' })
  damage!: string;

  @Column({ name: 'critical_hit', type: 'boolean', default: false })
  criticalHit!: boolean;

  @Column({ name: 'reward_snapshot', type: 'jsonb', default: () => `'{}'` })
  rewardSnapshot!: RewardSnapshot;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
