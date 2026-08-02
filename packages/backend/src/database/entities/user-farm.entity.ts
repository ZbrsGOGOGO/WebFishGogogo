import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

import { User } from './user.entity';

/** 每个用户唯一的农场成长状态。 */
@Entity({ name: 'user_farms' })
@Check('chk_user_farm_level', '"level" BETWEEN 1 AND 100')
@Check('chk_user_farm_experience', '"experience" >= 0')
@Check('chk_user_farm_plot_count', '"plot_count" BETWEEN 1 AND 6')
export class UserFarm {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'smallint', default: 1 })
  level!: number;

  /** 累计农场经验；bigint 由 TypeORM 以 string 承载。 */
  @Column({ type: 'bigint', default: 0 })
  experience!: string;

  /** 当前已解锁土地数。数据库始终保留 6 个展示槽位。 */
  @Column({ name: 'plot_count', type: 'smallint', default: 4 })
  plotCount!: number;

  @VersionColumn({ type: 'int', default: 1 })
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
