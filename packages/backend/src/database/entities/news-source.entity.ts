import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type NewsSourceType = 'owned' | 'official' | 'licensed';
export type NewsAuthorizationStatus = 'verified' | 'revoked' | 'expired';

/** Editorially managed source. Evidence references never leave admin APIs. */
@Entity({ name: 'news_sources' })
@Index('uq_news_sources_name', ['name'], { unique: true })
@Check('chk_news_sources_type', `"source_type" IN ('owned', 'official', 'licensed')`)
@Check('chk_news_sources_authorization', `"authorization_status" IN ('verified', 'revoked', 'expired')`)
@Check('chk_news_sources_trust_rank', '"trust_rank" BETWEEN 1 AND 100')
@Check('chk_news_sources_version', '"version" > 0')
export class NewsSource {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ name: 'source_type', type: 'varchar', length: 16 })
  sourceType!: NewsSourceType;

  @Column({ name: 'homepage_url', type: 'varchar', length: 2048 })
  homepageUrl!: string;

  @Column({ name: 'trust_rank', type: 'smallint', default: 50 })
  trustRank!: number;

  @Column({ name: 'authorization_status', type: 'varchar', length: 16 })
  authorizationStatus!: NewsAuthorizationStatus;

  /** Opaque DMS/vault index, never the actual credential or contract body. */
  @Column({ name: 'authorization_evidence_ref', type: 'varchar', length: 200 })
  authorizationEvidenceRef!: string;

  @Column({ name: 'authorization_valid_from', type: 'timestamptz', nullable: true })
  authorizationValidFrom!: Date | null;

  @Column({ name: 'authorization_valid_until', type: 'timestamptz', nullable: true })
  authorizationValidUntil!: Date | null;

  @Column({ name: 'authorization_revoked_at', type: 'timestamptz', nullable: true })
  authorizationRevokedAt!: Date | null;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @Column({ name: 'updated_by', type: 'uuid' })
  updatedBy!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
