import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Guild } from './guild.entity';
import { User } from './user.entity';

export type GuildLedgerKind = 'donation' | 'building_upgrade';

@Entity({ name: 'guild_ledger' })
@Index('idx_guild_ledger_guild_created', ['guildId', 'createdAt'])
@Index('uq_guild_ledger_idempotency', ['idempotencyKey'], { unique: true })
@Check('chk_guild_ledger_kind', `"kind" IN ('donation', 'building_upgrade')`)
@Check('chk_guild_ledger_delta', '"delta" <> 0')
@Check('chk_guild_ledger_treasury', '"treasury_after" >= 0')
export class GuildLedger {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

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

  @Column({ type: 'varchar', length: 24 })
  kind!: GuildLedgerKind;

  @Column({ type: 'bigint' })
  delta!: string;

  @Column({ name: 'treasury_after', type: 'bigint' })
  treasuryAfter!: string;

  @Column({ type: 'varchar', length: 100 })
  reason!: string;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 200 })
  idempotencyKey!: string;

  @Column({ type: 'jsonb', default: () => `'{}'` })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
