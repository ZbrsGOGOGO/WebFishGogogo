import { Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Singleton row used to serialize global community-capacity allocations. */
@Entity({ name: 'community_capacity_guards' })
export class CommunityCapacityGuard {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  scope!: 'active-users';

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
