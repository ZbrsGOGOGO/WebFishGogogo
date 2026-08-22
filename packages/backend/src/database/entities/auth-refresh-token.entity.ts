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

import { AuthSession } from './auth-session.entity';

export type AuthRefreshTokenStatus = 'active' | 'consumed' | 'revoked';

/**
 * 刷新凭据历史。保留已消费摘要才能识别旧令牌重放，而不是只判断“无效”。
 */
@Entity({ name: 'auth_refresh_tokens' })
@Index('uq_auth_refresh_tokens_hash', ['tokenHash'], { unique: true })
@Index('idx_auth_refresh_tokens_session', ['sessionId', 'createdAt'])
@Index('uq_auth_refresh_tokens_one_active', ['sessionId'], {
  unique: true,
  where: `"status" = 'active'`,
})
@Check('chk_auth_refresh_tokens_status', `"status" IN ('active', 'consumed', 'revoked')`)
export class AuthRefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId!: string;

  @ManyToOne(() => AuthSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session!: AuthSession;

  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash!: string;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: AuthRefreshTokenStatus;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt!: Date | null;

  @Column({ name: 'replaced_by_id', type: 'uuid', nullable: true })
  replacedById!: string | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
