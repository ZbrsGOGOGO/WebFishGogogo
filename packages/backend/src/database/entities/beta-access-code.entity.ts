import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type BetaAccessCodeStatus = 'active' | 'revoked' | 'exhausted';

/** 只保存 Beta 准入码摘要，明文只在创建时存在。 */
@Entity({ name: 'beta_access_codes' })
@Index('uq_beta_access_codes_hash', ['codeHash'], { unique: true })
@Check('chk_beta_access_codes_status', `"status" IN ('active', 'revoked', 'exhausted')`)
@Check('chk_beta_access_codes_max_uses', '"max_uses" > 0')
@Check(
  'chk_beta_access_codes_used_count',
  '"used_count" >= 0 AND "used_count" <= "max_uses"',
)
export class BetaAccessCode {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'code_hash', type: 'varchar', length: 64 })
  codeHash!: string;

  @Column({ type: 'varchar', length: 32, default: 'beta_registration' })
  purpose!: string;

  @Column({ name: 'max_uses', type: 'int' })
  maxUses!: number;

  @Column({ name: 'used_count', type: 'int', default: 0 })
  usedCount!: number;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: BetaAccessCodeStatus;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
