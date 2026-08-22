import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { BetaAccessCode } from './beta-access-code.entity';
import { User } from './user.entity';

/** 注册创建时预留名额，邮箱验证成功后才正式核销。 */
@Entity({ name: 'beta_access_reservations' })
@Index('uq_beta_access_reservations_user', ['userId'], { unique: true })
@Index('idx_beta_access_reservations_capacity', [
  'codeId',
  'redeemedAt',
  'reservedUntil',
])
export class BetaAccessReservation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'code_id', type: 'uuid' })
  codeId!: string;

  @ManyToOne(() => BetaAccessCode, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'code_id' })
  code!: BetaAccessCode;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'email_normalized', type: 'varchar', length: 255 })
  emailNormalized!: string;

  @Column({ name: 'reserved_until', type: 'timestamptz' })
  reservedUntil!: Date;

  @Column({ name: 'redeemed_at', type: 'timestamptz', nullable: true })
  redeemedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
