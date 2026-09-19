import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from './user.entity';

/** Server-owned room state. Password hashes and RNG state never leave the service projection. */
@Entity({ name: 'word_front_room_snapshots' })
@Index('ix_word_front_room_snapshots_expiry', ['expiresAt'])
export class WordFrontRoomSnapshot {
  @PrimaryColumn({ type: 'uuid' }) id!: string;
  @Column({ type: 'jsonb', select: false }) state!: Record<string, unknown>;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date;
  @Column({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

/** Map-studio drafts are deliberately separate from immutable ranked map releases. */
@Entity({ name: 'word_front_map_drafts' })
export class WordFrontMapDraft {
  @PrimaryColumn({ type: 'varchar', length: 32 }) key!: string;
  @Column({ type: 'varchar', length: 64 }) name!: string;
  @Column({ type: 'jsonb' }) cells!: string[];
  @Column({ type: 'integer', default: 1 }) version!: number;
  @Column({ name: 'author_id', type: 'uuid', nullable: true }) authorId!: string | null;
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true }) @JoinColumn({ name: 'author_id' }) author!: User | null;
  @Column({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

/** Bound progression for the rebuilt tower-defense rules. It never touches the site wallet. */
@Entity({ name: 'word_front_progress' })
export class WordFrontProgress {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' }) userId!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'user_id' }) user!: User;
  @Column({ type: 'integer', default: 0 }) merit!: number;
  @Column({ type: 'integer', default: 0 }) wins!: number;
  @Column({ type: 'integer', default: 0 }) losses!: number;
  @Column({ name: 'daily_date', type: 'date' }) dailyDate!: string;
  @Column({ name: 'daily_earned', type: 'integer', default: 0 }) dailyEarned!: number;
  @Column({ type: 'jsonb', default: () => "'[]'" }) unlocks!: string[];
  @Column({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
