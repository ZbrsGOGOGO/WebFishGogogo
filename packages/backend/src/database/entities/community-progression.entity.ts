import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from './user.entity';

@Entity({ name: 'membership_grants' })
@Index('idx_membership_grants_user_expiry', ['userId', 'expiresAt'])
@Check('chk_membership_grants_period', '"expires_at" > "starts_at"')
export class CommunityMembershipGrant {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' }) userId!: string;
  @PrimaryColumn({ name: 'campaign_key', type: 'varchar', length: 64 }) campaignKey!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'user_id' }) user!: User;
  @Column({ name: 'starts_at', type: 'timestamptz' }) startsAt!: Date;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date;
  @Column({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}

@Entity({ name: 'achievement_unlocks' })
export class CommunityAchievementUnlock {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' }) userId!: string;
  @PrimaryColumn({ name: 'achievement_key', type: 'varchar', length: 64 }) achievementKey!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'user_id' }) user!: User;
  /** Confirmation time, not an invented historical completion time. */
  @Column({ name: 'unlocked_at', type: 'timestamptz' }) unlockedAt!: Date;
  @Column({ name: 'source_version', type: 'smallint', default: 1 }) sourceVersion!: number;
}

@Entity({ name: 'user_presentation' })
@Check('chk_user_presentation_version', '"version" > 0')
export class CommunityUserPresentation {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' }) userId!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'user_id' }) user!: User;
  @Column({ name: 'equipped_title_key', type: 'varchar', length: 64, nullable: true }) equippedTitleKey!: string | null;
  @Column({ type: 'integer', default: 1 }) version!: number;
  /** Only the latest title request is replayable; older CAS versions fail closed. */
  @Column({ name: 'last_request_id', type: 'uuid', nullable: true, select: false }) lastRequestId!: string | null;
  @Column({ name: 'last_request_hash', type: 'varchar', length: 64, nullable: true, select: false }) lastRequestHash!: string | null;
  @Column({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
