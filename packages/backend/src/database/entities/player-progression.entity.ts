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
 * 跨阅读、农场与小游戏共享的玩家等级和累计经验。
 */
@Entity({ name: 'player_progression' })
@Check('chk_player_progression_level', '"level" BETWEEN 1 AND 100')
@Check('chk_player_progression_experience', '"experience" >= 0')
export class PlayerProgression {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'smallint', default: 1 })
  level!: number;

  /** 累计 EXP。bigint 在 TypeORM 中以 string 承载。 */
  @Column({ type: 'bigint', default: 0 })
  experience!: string;

  @VersionColumn({ type: 'int', default: 1 })
  version!: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
