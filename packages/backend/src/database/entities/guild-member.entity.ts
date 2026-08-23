import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Guild } from './guild.entity';
import { User } from './user.entity';

export type GuildMemberRole = 'owner' | 'member';

@Entity({ name: 'guild_members' })
@Index('idx_guild_members_guild_joined', ['guildId', 'joinedAt'])
@Check('chk_guild_members_role', `"role" IN ('owner', 'member')`)
@Check('chk_guild_members_activity', '"activity" >= 0')
@Check('chk_guild_members_donation', '"donated_today" >= 0')
export class GuildMember {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'guild_id', type: 'uuid' })
  guildId!: string;

  @ManyToOne(() => Guild, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'guild_id' })
  guild!: Guild;

  @Column({ type: 'varchar', length: 16, default: 'member' })
  role!: GuildMemberRole;

  @Column({ type: 'int', default: 0 })
  activity!: number;

  @Column({ name: 'donated_today', type: 'int', default: 0 })
  donatedToday!: number;

  @Column({ name: 'donation_service_date', type: 'date', nullable: true })
  donationServiceDate!: string | null;

  @CreateDateColumn({ name: 'joined_at', type: 'timestamptz' })
  joinedAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
