import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Security verification, password recovery and reversible account deletion. */
export class AddAccountSecurityLifecycle1700000000013
  implements MigrationInterface
{
  name = 'AddAccountSecurityLifecycle1700000000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "password_reset_tokens" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "token_hash" VARCHAR(64) NOT NULL,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "used_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX "uq_password_reset_tokens_hash"
        ON "password_reset_tokens" ("token_hash");
      CREATE UNIQUE INDEX "uq_password_reset_tokens_one_unused"
        ON "password_reset_tokens" ("user_id") WHERE "used_at" IS NULL;
      CREATE INDEX "idx_password_reset_tokens_user_expiry"
        ON "password_reset_tokens" ("user_id", "used_at", "expires_at");
    `);

    await queryRunner.query(`
      CREATE TABLE "social_verification_sessions" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "provider" VARCHAR(64) NOT NULL,
        "provider_reference_hash" VARCHAR(64) NOT NULL,
        "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
        "submitted_at" TIMESTAMPTZ NOT NULL,
        "verified_at" TIMESTAMPTZ,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "failure_code" VARCHAR(64),
        "audit_key_id" VARCHAR(64),
        "audit_ciphertext" TEXT,
        "audit_nonce" VARCHAR(64),
        "audit_auth_tag" VARCHAR(64),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_social_verification_sessions_status" CHECK (
          "status" IN ('pending', 'verified', 'failed', 'expired')
        ),
        CONSTRAINT "chk_social_verification_sessions_audit" CHECK (
          ("audit_key_id" IS NULL AND "audit_ciphertext" IS NULL
            AND "audit_nonce" IS NULL AND "audit_auth_tag" IS NULL)
          OR
          ("audit_key_id" IS NOT NULL AND "audit_ciphertext" IS NOT NULL
            AND "audit_nonce" IS NOT NULL AND "audit_auth_tag" IS NOT NULL)
        )
      );
      CREATE INDEX "idx_social_verification_sessions_user_created"
        ON "social_verification_sessions" ("user_id", "created_at");
      CREATE UNIQUE INDEX "uq_social_verification_sessions_one_pending"
        ON "social_verification_sessions" ("user_id")
        WHERE "status" = 'pending';
    `);

    await queryRunner.query(`
      CREATE TABLE "social_verification_callback_receipts" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "session_id" UUID NOT NULL
          REFERENCES "social_verification_sessions"("id") ON DELETE CASCADE,
        "event_key_hash" VARCHAR(64) NOT NULL,
        "nonce_hash" VARCHAR(64) NOT NULL,
        "body_hash" VARCHAR(64) NOT NULL,
        "occurred_at" TIMESTAMPTZ NOT NULL,
        "received_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX "uq_social_verification_callback_event"
        ON "social_verification_callback_receipts" ("event_key_hash");
      CREATE UNIQUE INDEX "uq_social_verification_callback_nonce"
        ON "social_verification_callback_receipts" ("nonce_hash");
      CREATE INDEX "idx_social_verification_callback_session"
        ON "social_verification_callback_receipts" ("session_id", "received_at");
    `);

    await queryRunner.query(`
      CREATE TABLE "account_restrictions" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "account_status" VARCHAR(16) NOT NULL,
        "reason_code" VARCHAR(64),
        "reason_key_id" VARCHAR(64),
        "reason_ciphertext" TEXT,
        "reason_nonce" VARCHAR(64),
        "reason_auth_tag" VARCHAR(64),
        "restricted_at" TIMESTAMPTZ NOT NULL,
        "restriction_ends_at" TIMESTAMPTZ,
        "lifted_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_account_restrictions_status" CHECK (
          "account_status" IN ('suspended', 'banned')
        ),
        CONSTRAINT "chk_account_restrictions_reason" CHECK (
          ("reason_key_id" IS NULL AND "reason_ciphertext" IS NULL
            AND "reason_nonce" IS NULL AND "reason_auth_tag" IS NULL)
          OR
          ("reason_key_id" IS NOT NULL AND "reason_ciphertext" IS NOT NULL
            AND "reason_nonce" IS NOT NULL AND "reason_auth_tag" IS NOT NULL)
        )
      );
      CREATE INDEX "idx_account_restrictions_user_active"
        ON "account_restrictions" ("user_id", "lifted_at", "restricted_at");
    `);

    await queryRunner.query(`
      CREATE TABLE "account_appeals" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
        "reason_key_id" VARCHAR(64) NOT NULL,
        "reason_ciphertext" TEXT NOT NULL,
        "reason_nonce" VARCHAR(64) NOT NULL,
        "reason_auth_tag" VARCHAR(64) NOT NULL,
        "decision_key_id" VARCHAR(64),
        "decision_ciphertext" TEXT,
        "decision_nonce" VARCHAR(64),
        "decision_auth_tag" VARCHAR(64),
        "decided_by_user_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
        "submitted_at" TIMESTAMPTZ NOT NULL,
        "decided_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_account_appeals_status" CHECK (
          "status" IN ('pending', 'approved', 'rejected', 'cancelled')
        ),
        CONSTRAINT "chk_account_appeals_decision" CHECK (
          ("decision_key_id" IS NULL AND "decision_ciphertext" IS NULL
            AND "decision_nonce" IS NULL AND "decision_auth_tag" IS NULL
            AND "decided_at" IS NULL AND "decided_by_user_id" IS NULL)
          OR
          ("decision_key_id" IS NOT NULL AND "decision_ciphertext" IS NOT NULL
            AND "decision_nonce" IS NOT NULL AND "decision_auth_tag" IS NOT NULL
            AND "decided_at" IS NOT NULL AND "decided_by_user_id" IS NOT NULL)
        )
      );
      CREATE INDEX "idx_account_appeals_user_created"
        ON "account_appeals" ("user_id", "created_at");
      CREATE UNIQUE INDEX "uq_account_appeals_one_pending"
        ON "account_appeals" ("user_id") WHERE "status" = 'pending';
    `);

    await queryRunner.query(`
      CREATE TABLE "account_deletion_requests" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "previous_account_status" VARCHAR(16) NOT NULL,
        "status" VARCHAR(16) NOT NULL DEFAULT 'cooling_off',
        "idempotency_key_hash" VARCHAR(64) NOT NULL,
        "request_hash" VARCHAR(64) NOT NULL,
        "requested_at" TIMESTAMPTZ NOT NULL,
        "scheduled_for" TIMESTAMPTZ NOT NULL,
        "available_at" TIMESTAMPTZ NOT NULL,
        "attempts" INT NOT NULL DEFAULT 0,
        "lease_owner" UUID,
        "lease_until" TIMESTAMPTZ,
        "last_error_code" VARCHAR(64),
        "cancelled_at" TIMESTAMPTZ,
        "completed_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_account_deletion_previous_status" CHECK (
          "previous_account_status" IN ('active', 'suspended', 'banned')
        ),
        CONSTRAINT "chk_account_deletion_status" CHECK (
          "status" IN ('cooling_off', 'scheduled', 'processing', 'cancelled', 'completed')
        ),
        CONSTRAINT "chk_account_deletion_attempts" CHECK ("attempts" >= 0)
      );
      CREATE UNIQUE INDEX "uq_account_deletion_idempotency"
        ON "account_deletion_requests" ("idempotency_key_hash");
      CREATE INDEX "idx_account_deletion_due"
        ON "account_deletion_requests" ("status", "available_at");
      CREATE INDEX "idx_account_deletion_user_created"
        ON "account_deletion_requests" ("user_id", "created_at");
      CREATE UNIQUE INDEX "uq_account_deletion_one_live"
        ON "account_deletion_requests" ("user_id")
        WHERE "status" IN ('cooling_off', 'scheduled', 'processing');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "account_deletion_requests";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "account_appeals";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "account_restrictions";`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "social_verification_callback_receipts";`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "social_verification_sessions";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "password_reset_tokens";`);
  }
}
