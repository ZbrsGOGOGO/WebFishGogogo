import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

import { User } from './user.entity';

@Entity({ name: 'reading_daily_usage' })
@Check('chk_reading_daily_usage_effective_seconds', '"effective_seconds" >= 0')
export class ReadingDailyUsage {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @PrimaryColumn({ name: 'local_date', type: 'date' })
  localDate!: string;

  @Column({ type: 'varchar', length: 50, default: 'Asia/Shanghai' })
  timezone!: string;

  @Column({ name: 'effective_seconds', type: 'int', default: 0 })
  effectiveSeconds!: number;

  @Column({ name: 'goal_completed_at', type: 'timestamptz', nullable: true })
  goalCompletedAt!: Date | null;

  @VersionColumn({ type: 'int', default: 1 })
  version!: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
