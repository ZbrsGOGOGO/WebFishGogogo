import type { MigrationInterface, QueryRunner } from 'typeorm';

/** 社区第二批：关系、邀请、通知、单株绿植与好友鼓励。 */
export class AddCommunityRelationshipsAndPlant1700000000009
  implements MigrationInterface
{
  name = 'AddCommunityRelationshipsAndPlant1700000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "friend_requests" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "requester_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "recipient_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "user_low_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "user_high_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
        "responded_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_friend_requests_distinct_users"
          CHECK ("requester_id" <> "recipient_id"),
        CONSTRAINT "chk_friend_requests_status"
          CHECK ("status" IN ('pending', 'accepted', 'rejected', 'cancelled'))
      );
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_friend_requests_pending_pair"
      ON "friend_requests" ("user_low_id", "user_high_id")
      WHERE "status" = 'pending';
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_friend_requests_recipient_status"
      ON "friend_requests" ("recipient_id", "status", "created_at" DESC);
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_friend_requests_requester_status"
      ON "friend_requests" ("requester_id", "status", "created_at" DESC);
    `);

    await queryRunner.query(`
      CREATE TABLE "friendships" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_low_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "user_high_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "first_became_friends_at" TIMESTAMPTZ NOT NULL,
        "current_started_at" TIMESTAMPTZ NOT NULL,
        "ended_at" TIMESTAMPTZ,
        "ended_reason" VARCHAR(32),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_friendships_distinct_users"
          CHECK ("user_low_id" <> "user_high_id")
      );
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_friendships_active_pair"
      ON "friendships" ("user_low_id", "user_high_id")
      WHERE "ended_at" IS NULL;
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_friendships_low_active"
      ON "friendships" ("user_low_id", "ended_at");
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_friendships_high_active"
      ON "friendships" ("user_high_id", "ended_at");
    `);

    await queryRunner.query(`
      CREATE TABLE "user_blocks" (
        "blocker_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "blocked_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "reason" VARCHAR(100),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY ("blocker_id", "blocked_id"),
        CONSTRAINT "chk_user_blocks_distinct_users"
          CHECK ("blocker_id" <> "blocked_id")
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_user_blocks_blocked"
      ON "user_blocks" ("blocked_id", "blocker_id");
    `);

    await queryRunner.query(`
      CREATE TABLE "referral_codes" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "inviter_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "code_hash" VARCHAR(64) NOT NULL UNIQUE,
        "purpose" VARCHAR(32) NOT NULL DEFAULT 'user_referral',
        "status" VARCHAR(16) NOT NULL DEFAULT 'active',
        "version" INT NOT NULL,
        "expires_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_referral_codes_purpose" CHECK ("purpose" = 'user_referral'),
        CONSTRAINT "chk_referral_codes_status"
          CHECK ("status" IN ('active', 'rotated', 'revoked', 'expired')),
        CONSTRAINT "chk_referral_codes_version" CHECK ("version" > 0)
      );
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_referral_codes_active_inviter"
      ON "referral_codes" ("inviter_id") WHERE "status" = 'active';
    `);

    await queryRunner.query(`
      CREATE TABLE "referral_claim_tokens" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "code_id" UUID NOT NULL REFERENCES "referral_codes"("id") ON DELETE CASCADE,
        "token_hash" VARCHAR(64) NOT NULL UNIQUE,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "consumed_at" TIMESTAMPTZ,
        "consumed_by_user_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_referral_claim_tokens_expiry"
      ON "referral_claim_tokens" ("expires_at", "consumed_at");
    `);

    await queryRunner.query(`
      CREATE TABLE "referral_redemptions" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "inviter_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "invitee_id" UUID NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
        "code_id" UUID NOT NULL REFERENCES "referral_codes"("id") ON DELETE RESTRICT,
        "status" VARCHAR(24) NOT NULL DEFAULT 'bound',
        "risk_status" VARCHAR(16) NOT NULL DEFAULT 'pending',
        "bound_at" TIMESTAMPTZ NOT NULL,
        "qualified_at" TIMESTAMPTZ,
        "reward_granted_at" TIMESTAMPTZ,
        "rejection_reason" VARCHAR(100),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_referral_redemptions_distinct_users"
          CHECK ("inviter_id" <> "invitee_id"),
        CONSTRAINT "chk_referral_redemptions_status" CHECK (
          "status" IN ('bound', 'qualified', 'qualified_unrewarded', 'rejected')
        ),
        CONSTRAINT "chk_referral_redemptions_risk_status"
          CHECK ("risk_status" IN ('pending', 'clear', 'blocked'))
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_referral_redemptions_inviter_status"
      ON "referral_redemptions" ("inviter_id", "status", "created_at" DESC);
    `);

    await queryRunner.query(`
      CREATE TABLE "community_notifications" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "actor_user_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
        "category" VARCHAR(24) NOT NULL,
        "event_type" VARCHAR(64) NOT NULL,
        "resource_type" VARCHAR(32),
        "resource_id" VARCHAR(100),
        "payload" JSONB NOT NULL DEFAULT '{}',
        "dedupe_key" VARCHAR(160) NOT NULL,
        "read_at" TIMESTAMPTZ,
        "available_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "expires_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_community_notifications_dedupe"
          UNIQUE ("user_id", "dedupe_key")
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_community_notifications_inbox"
      ON "community_notifications" ("user_id", "available_at", "created_at" DESC);
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_community_notifications_unread"
      ON "community_notifications" ("user_id", "read_at", "created_at" DESC);
    `);

    await queryRunner.query(`
      CREATE TABLE "desk_plants" (
        "user_id" UUID PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
        "state" VARCHAR(16) NOT NULL DEFAULT 'idle',
        "appearance_key" VARCHAR(32) NOT NULL DEFAULT 'desk_sprout',
        "plant_experience" INT NOT NULL DEFAULT 0,
        "level" SMALLINT NOT NULL DEFAULT 1,
        "streak_days" INT NOT NULL DEFAULT 0,
        "last_standard_reward_service_date" DATE,
        "first_harvested_at" TIMESTAMPTZ,
        "feeding_enabled" BOOLEAN NOT NULL DEFAULT true,
        "feed_animation_enabled" BOOLEAN NOT NULL DEFAULT true,
        "feed_notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_desk_plants_state" CHECK ("state" IN ('idle', 'growing')),
        CONSTRAINT "chk_desk_plants_experience" CHECK ("plant_experience" >= 0),
        CONSTRAINT "chk_desk_plants_level" CHECK ("level" BETWEEN 1 AND 100),
        CONSTRAINT "chk_desk_plants_streak" CHECK ("streak_days" >= 0)
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "desk_plant_cycles" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "sequence" INT NOT NULL,
        "duration_seconds" INT NOT NULL,
        "started_at" TIMESTAMPTZ NOT NULL,
        "matures_at" TIMESTAMPTZ NOT NULL,
        "harvested_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_desk_plant_cycles_sequence" UNIQUE ("user_id", "sequence"),
        CONSTRAINT "chk_desk_plant_cycles_sequence" CHECK ("sequence" > 0),
        CONSTRAINT "chk_desk_plant_cycles_duration" CHECK ("duration_seconds" > 0)
      );
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_desk_plant_cycles_active"
      ON "desk_plant_cycles" ("user_id") WHERE "harvested_at" IS NULL;
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_desk_plant_cycles_maturity"
      ON "desk_plant_cycles" ("matures_at", "harvested_at");
    `);

    await queryRunner.query(`
      CREATE TABLE "desk_plant_reward_claims" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "cycle_id" UUID NOT NULL REFERENCES "desk_plant_cycles"("id") ON DELETE CASCADE,
        "reward_type" VARCHAR(16) NOT NULL,
        "reward_key" VARCHAR(64) NOT NULL,
        "service_date" DATE NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_desk_plant_reward_claims_key" UNIQUE ("user_id", "reward_key"),
        CONSTRAINT "chk_desk_plant_reward_claims_type"
          CHECK ("reward_type" IN ('standard', 'onboarding'))
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "friend_encouragements" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "sender_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "recipient_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "service_date" DATE NOT NULL,
        "type" VARCHAR(16) NOT NULL,
        "idempotency_key" VARCHAR(100) NOT NULL,
        "request_hash" VARCHAR(64) NOT NULL,
        "animation_enabled" BOOLEAN NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_friend_encouragements_pair_date"
          UNIQUE ("sender_id", "recipient_id", "service_date"),
        CONSTRAINT "uq_friend_encouragements_idempotency"
          UNIQUE ("sender_id", "idempotency_key"),
        CONSTRAINT "chk_friend_encouragements_distinct_users"
          CHECK ("sender_id" <> "recipient_id"),
        CONSTRAINT "chk_friend_encouragements_type"
          CHECK ("type" IN ('coffee', 'cookie', 'cheer_note'))
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_friend_encouragements_recipient_date"
      ON "friend_encouragements" ("recipient_id", "service_date", "created_at" DESC);
    `);

    await queryRunner.query(`
      CREATE TABLE "community_command_receipts" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "command_type" VARCHAR(40) NOT NULL,
        "idempotency_key" VARCHAR(100) NOT NULL,
        "request_hash" VARCHAR(64) NOT NULL,
        "result" JSONB NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_community_command_receipts_key"
          UNIQUE ("user_id", "command_type", "idempotency_key")
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "community_command_receipts";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "friend_encouragements";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "desk_plant_reward_claims";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "desk_plant_cycles";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "desk_plants";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "community_notifications";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "referral_redemptions";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "referral_claim_tokens";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "referral_codes";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_blocks";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "friendships";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "friend_requests";`);
  }
}
