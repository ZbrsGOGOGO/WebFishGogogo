import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Makes auth abuse controls and verification-email delivery safe across
 * multiple API replicas. This migration deliberately follows the concurrent
 * community-content migration at 0010.
 */
export class HardenAuthOperations1700000000011 implements MigrationInterface {
  name = 'HardenAuthOperations1700000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "email_verifications"
        ADD COLUMN "resend_count" INT NOT NULL DEFAULT 0,
        ADD COLUMN "max_resends" INT NOT NULL DEFAULT 5,
        ADD COLUMN "total_attempts" INT NOT NULL DEFAULT 0,
        ADD COLUMN "max_total_attempts" INT NOT NULL DEFAULT 15,
        ADD CONSTRAINT "chk_email_verifications_resends"
          CHECK ("resend_count" >= 0 AND "resend_count" <= "max_resends"),
        ADD CONSTRAINT "chk_email_verifications_max_resends"
          CHECK ("max_resends" > 0),
        ADD CONSTRAINT "chk_email_verifications_total_attempts"
          CHECK (
            "total_attempts" >= 0
            AND "total_attempts" <= "max_total_attempts"
          ),
        ADD CONSTRAINT "chk_email_verifications_max_total_attempts"
          CHECK ("max_total_attempts" > 0);
    `);

    await queryRunner.query(`
      CREATE TABLE "auth_rate_limit_buckets" (
        "key_hash"           VARCHAR(64) PRIMARY KEY,
        "scope"              VARCHAR(64) NOT NULL,
        "count"              INT NOT NULL DEFAULT 0,
        "window_started_at"  TIMESTAMPTZ NOT NULL,
        "window_ends_at"     TIMESTAMPTZ NOT NULL,
        "blocked_until"      TIMESTAMPTZ,
        "expires_at"         TIMESTAMPTZ NOT NULL,
        "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_auth_rate_limit_buckets_count" CHECK ("count" >= 0)
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_auth_rate_limit_buckets_expiry"
      ON "auth_rate_limit_buckets" ("expires_at");
    `);

    await queryRunner.query(`
      CREATE TABLE "community_capacity_guards" (
        "scope"       VARCHAR(32) PRIMARY KEY,
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      INSERT INTO "community_capacity_guards" ("scope")
      VALUES ('active-users') ON CONFLICT DO NOTHING;
    `);

    await queryRunner.query(`
      CREATE TABLE "auth_email_outbox" (
        "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "template"         VARCHAR(64) NOT NULL,
        "recipient_hash"   VARCHAR(64) NOT NULL,
        "correlation_hash" VARCHAR(64) NOT NULL,
        "key_id"           VARCHAR(64) NOT NULL,
        "ciphertext"       TEXT NOT NULL,
        "nonce"            VARCHAR(64) NOT NULL,
        "auth_tag"         VARCHAR(64) NOT NULL,
        "status"           VARCHAR(16) NOT NULL DEFAULT 'pending',
        "attempts"         INT NOT NULL DEFAULT 0,
        "max_attempts"     INT NOT NULL DEFAULT 5,
        "available_at"     TIMESTAMPTZ NOT NULL,
        "expires_at"       TIMESTAMPTZ NOT NULL,
        "lease_owner"      UUID,
        "lease_until"      TIMESTAMPTZ,
        "delivered_at"     TIMESTAMPTZ,
        "last_error_code"  VARCHAR(64),
        "created_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_auth_email_outbox_status" CHECK (
          "status" IN ('pending', 'processing', 'delivered', 'dead')
        ),
        CONSTRAINT "chk_auth_email_outbox_attempts" CHECK (
          "attempts" >= 0 AND "attempts" <= "max_attempts"
        ),
        CONSTRAINT "chk_auth_email_outbox_max_attempts"
          CHECK ("max_attempts" > 0)
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_auth_email_outbox_dispatch"
      ON "auth_email_outbox" ("status", "available_at");
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_auth_email_outbox_cleanup"
      ON "auth_email_outbox" ("status", "expires_at");
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_auth_email_outbox_correlation"
      ON "auth_email_outbox" ("correlation_hash", "status");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "auth_email_outbox";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "community_capacity_guards";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "auth_rate_limit_buckets";`);
    await queryRunner.query(`
      ALTER TABLE "email_verifications"
        DROP CONSTRAINT IF EXISTS "chk_email_verifications_max_total_attempts",
        DROP CONSTRAINT IF EXISTS "chk_email_verifications_total_attempts",
        DROP CONSTRAINT IF EXISTS "chk_email_verifications_max_resends",
        DROP CONSTRAINT IF EXISTS "chk_email_verifications_resends",
        DROP COLUMN IF EXISTS "max_total_attempts",
        DROP COLUMN IF EXISTS "total_attempts",
        DROP COLUMN IF EXISTS "max_resends",
        DROP COLUMN IF EXISTS "resend_count";
    `);
  }
}
