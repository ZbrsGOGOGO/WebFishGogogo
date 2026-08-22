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

import { User } from './user.entity';

export type ConsentType =
  | 'terms'
  | 'privacy'
  | 'community_guidelines'
  | 'adult_declaration';

/** 条款同意记录只追加，不以用户资料字段覆盖历史版本。 */
@Entity({ name: 'consent_records' })
@Index('uq_consent_records_user_type_version', ['userId', 'consentType', 'version'], {
  unique: true,
})
@Check(
  'chk_consent_records_type',
  `"consent_type" IN ('terms', 'privacy', 'community_guidelines', 'adult_declaration')`,
)
export class ConsentRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'consent_type', type: 'varchar', length: 32 })
  consentType!: ConsentType;

  @Column({ type: 'varchar', length: 64 })
  version!: string;

  @Column({ type: 'varchar', length: 32, default: 'registration' })
  source!: string;

  @Column({ name: 'ip_hash', type: 'varchar', length: 64, nullable: true })
  ipHash!: string | null;

  @Column({ name: 'accepted_at', type: 'timestamptz' })
  acceptedAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
