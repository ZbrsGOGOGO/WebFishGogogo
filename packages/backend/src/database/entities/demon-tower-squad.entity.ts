import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from './user.entity';

/** Bounded, opt-in squad encounter. Members' prepared snapshots are private engine data. */
@Entity({ name: 'demon_tower_squads' })
@Index('ix_demon_tower_squads_status_created', ['status', 'createdAt'])
export class DemonTowerSquad {
  @PrimaryColumn({ type: 'uuid' }) id!: string;
  @Column({ name: 'owner_id', type: 'uuid', nullable: true }) ownerId!: string | null;
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true }) @JoinColumn({ name: 'owner_id' }) owner!: User | null;
  @Column({ type: 'integer' }) floor!: number;
  @Column({ type: 'varchar', length: 12 }) status!: 'waiting' | 'active' | 'victory' | 'defeat' | 'closed';
  @Column({ type: 'jsonb', select: false }) state!: Record<string, unknown>;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date;
  @Column({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @Column({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
