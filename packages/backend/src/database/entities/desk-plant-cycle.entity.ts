import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { User } from './user.entity';

@Entity({ name: 'desk_plant_cycles' })
@Unique('uq_desk_plant_cycles_sequence', ['userId', 'sequence'])
@Index('uq_desk_plant_cycles_active', ['userId'], {
  unique: true,
  where: '"harvested_at" IS NULL',
})
@Index('idx_desk_plant_cycles_maturity', ['maturesAt', 'harvestedAt'])
@Check('chk_desk_plant_cycles_sequence', '"sequence" > 0')
@Check('chk_desk_plant_cycles_duration', '"duration_seconds" > 0')
export class DeskPlantCycle {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'int' })
  sequence!: number;

  @Column({ name: 'duration_seconds', type: 'int' })
  durationSeconds!: number;

  @Column({ name: 'crop_key', type: 'varchar', length: 32, default: 'desk_mint' })
  cropKey!: string;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt!: Date;

  @Column({ name: 'matures_at', type: 'timestamptz' })
  maturesAt!: Date;

  @Column({ name: 'harvested_at', type: 'timestamptz', nullable: true })
  harvestedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
