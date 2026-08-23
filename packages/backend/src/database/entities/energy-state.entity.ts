import {
  Check,
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

import { User } from './user.entity';

/**
 * 玩家精力状态。恢复规则由服务读取时计算，不为每个用户创建常驻定时器。
 */
@Entity({ name: 'energy_states' })
@Check('chk_energy_state_capacity', '"capacity" = 120')
@Check(
  'chk_energy_state_balance',
  '"balance" >= 0 AND "balance" <= "capacity"',
)
export class EnergyState {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'int', default: 120 })
  balance!: number;

  @Column({ type: 'int', default: 120 })
  capacity!: number;

  @Column({
    name: 'last_recovered_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  lastRecoveredAt!: Date;

  @VersionColumn({ type: 'int', default: 1 })
  version!: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
