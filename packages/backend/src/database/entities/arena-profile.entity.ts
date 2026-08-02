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

/**
 * 斗技场角色的可变战斗档案。五维属性与纯引擎 ArenaAttributes 一一对应。
 */
@Entity({ name: 'arena_profiles' })
@Check(
  'chk_arena_profile_attributes',
  '"focus" >= 0 AND "inspiration" >= 0 AND "mindset" >= 0 AND "slacking" >= 0 AND "execution" >= 0',
)
@Check(
  'chk_arena_profile_record',
  '"wins" >= 0 AND "losses" >= 0',
)
export class ArenaProfile {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({
    name: 'battle_class',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  battleClass!: string | null;

  @Column({ type: 'int', default: 10 })
  focus!: number;

  @Column({ type: 'int', default: 10 })
  inspiration!: number;

  @Column({ type: 'int', default: 10 })
  mindset!: number;

  @Column({ type: 'int', default: 10 })
  slacking!: number;

  @Column({ type: 'int', default: 10 })
  execution!: number;

  @Column({ type: 'int', default: 0 })
  wins!: number;

  @Column({ type: 'int', default: 0 })
  losses!: number;

  @VersionColumn({ type: 'int', default: 1 })
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
