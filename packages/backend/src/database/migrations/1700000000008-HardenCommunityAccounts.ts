import type { MigrationInterface, QueryRunner } from 'typeorm';

interface ExistingEmailRow {
  id: string;
  email: string;
}

/**
 * 社区账号第一批安全底座。
 *
 * 迁移首先显式检测 lower(trim(email)) 冲突。这里不能静默挑选或合并账号；
 * 若历史数据存在冲突，部署必须中止并由人工确认归属后再重跑。
 */
export class HardenCommunityAccounts1700000000008
  implements MigrationInterface
{
  name = 'HardenCommunityAccounts1700000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 在 JS 中执行与 PostgreSQL lower(trim(email)) 相同的确定性检查。
    // 这样既不会依赖数据库排序规则，也能让 LOCAL_DEV 的 pg-mem 跑同一迁移。
    const existingEmails = (await queryRunner.query(`
      SELECT "id", "email" FROM "users" ORDER BY "email";
    `)) as ExistingEmailRow[];
    const normalizedCounts = new Map<string, number>();
    for (const row of existingEmails) {
      const normalized = row.email.trim().toLowerCase();
      normalizedCounts.set(normalized, (normalizedCounts.get(normalized) ?? 0) + 1);
    }
    const collisions = [...normalizedCounts]
      .filter(([, count]) => count > 1)
      .slice(0, 20);

    if (collisions.length > 0) {
      const summary = collisions
        .map(([, count], index) => `collision-${index + 1} (${count})`)
        .join(', ');
      throw new Error(
        `EMAIL_NORMALIZATION_COLLISION: lower(trim(email)) is not unique: ${summary}`,
      );
    }

    // 旧站没有可证明的邮箱验证、当前条款同意和成年声明记录。不能在迁移里
    // 伪造这些事实。生产结构中只要存在历史账号就中止，由专门的重验证迁移
    // 或经确认的测试数据清理流程处理后再执行本迁移。
    if (existingEmails.length > 0) {
      throw new Error(
        `LEGACY_ACCOUNT_REVIEW_REQUIRED: ${existingEmails.length} existing account(s) require explicit re-verification and consent migration`,
      );
    }

    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN "email_normalized" VARCHAR(255),
        ADD COLUMN "public_id" UUID,
        ADD COLUMN "account_status" VARCHAR(24) NOT NULL DEFAULT 'pending_email',
        ADD COLUMN "social_verification_status" VARCHAR(24) NOT NULL DEFAULT 'unverified',
        ADD COLUMN "email_verified_at" TIMESTAMPTZ,
        ADD COLUMN "password_changed_at" TIMESTAMPTZ,
        ADD COLUMN "onboarding_completed" BOOLEAN NOT NULL DEFAULT false;
    `);

    // 上方闸门保证此时没有历史账号；UPDATE 仅保留为零行的防御性语句。
    await queryRunner.query(`
      UPDATE "users"
      SET
        "public_id" = gen_random_uuid(),
        "account_status" = 'active',
        "email_verified_at" = "created_at",
        "password_changed_at" = "updated_at",
        "onboarding_completed" = true;
    `);
    // 参数化逐行回填避免拼接历史邮箱；4000 用户目标下迁移成本可控。
    for (const row of existingEmails) {
      const email = row.email.trim();
      await queryRunner.query(
        `UPDATE "users" SET "email" = $1, "email_normalized" = $2 WHERE "id" = $3;`,
        [email, email.toLowerCase(), row.id],
      );
    }

    await queryRunner.query(`
      ALTER TABLE "users"
        ALTER COLUMN "email_normalized" SET NOT NULL,
        ALTER COLUMN "public_id" SET NOT NULL,
        ALTER COLUMN "public_id" SET DEFAULT gen_random_uuid(),
        ALTER COLUMN "password_changed_at" SET NOT NULL,
        ALTER COLUMN "password_changed_at" SET DEFAULT now(),
        ADD CONSTRAINT "uq_users_email_normalized" UNIQUE ("email_normalized"),
        ADD CONSTRAINT "uq_users_public_id" UNIQUE ("public_id"),
        ADD CONSTRAINT "chk_users_account_status" CHECK (
          "account_status" IN (
            'pending_email', 'active', 'suspended', 'banned', 'deleting', 'deleted'
          )
        ),
        ADD CONSTRAINT "chk_users_social_verification_status" CHECK (
          "social_verification_status" IN (
            'unverified', 'pending', 'verified', 'rejected', 'expired'
          )
        );
    `);

    await queryRunner.query(`
      ALTER TABLE "user_profiles"
        ADD COLUMN "bio" VARCHAR(80),
        ADD COLUMN "battle_profession" VARCHAR(32),
        ADD COLUMN "privacy_settings" JSONB NOT NULL DEFAULT '{
          "equipment": "friends",
          "battleRecord": "friends",
          "plant": "friends",
          "honors": "friends",
          "friendCount": "self",
          "recentActivity": "self"
        }',
        ADD CONSTRAINT "chk_user_profiles_battle_profession" CHECK (
          "battle_profession" IS NULL OR "battle_profession" IN (
            'developer', 'product', 'qa', 'sales', 'hr'
          )
        );
    `);

    await queryRunner.query(`
      CREATE TABLE "beta_access_codes" (
        "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "code_hash"   VARCHAR(64) NOT NULL UNIQUE,
        "purpose"     VARCHAR(32) NOT NULL DEFAULT 'beta_registration',
        "max_uses"    INT NOT NULL,
        "used_count"  INT NOT NULL DEFAULT 0,
        "status"      VARCHAR(16) NOT NULL DEFAULT 'active',
        "expires_at"  TIMESTAMPTZ,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_beta_access_codes_status"
          CHECK ("status" IN ('active', 'revoked', 'exhausted')),
        CONSTRAINT "chk_beta_access_codes_max_uses" CHECK ("max_uses" > 0),
        CONSTRAINT "chk_beta_access_codes_used_count"
          CHECK ("used_count" >= 0 AND "used_count" <= "max_uses")
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "beta_access_reservations" (
        "id"                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "code_id"           UUID NOT NULL
          REFERENCES "beta_access_codes"("id") ON DELETE CASCADE,
        "user_id"           UUID NOT NULL UNIQUE
          REFERENCES "users"("id") ON DELETE CASCADE,
        "email_normalized"  VARCHAR(255) NOT NULL,
        "reserved_until"    TIMESTAMPTZ NOT NULL,
        "redeemed_at"       TIMESTAMPTZ,
        "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_beta_access_reservations_capacity"
      ON "beta_access_reservations" ("code_id", "redeemed_at", "reserved_until");
    `);

    await queryRunner.query(`
      CREATE TABLE "email_verifications" (
        "id"                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"              UUID NOT NULL
          REFERENCES "users"("id") ON DELETE CASCADE,
        "purpose"              VARCHAR(32) NOT NULL DEFAULT 'registration',
        "code_hash"            VARCHAR(64) NOT NULL,
        "attempts"             INT NOT NULL DEFAULT 0,
        "max_attempts"         INT NOT NULL DEFAULT 5,
        "expires_at"           TIMESTAMPTZ NOT NULL,
        "resend_available_at"  TIMESTAMPTZ NOT NULL,
        "used_at"              TIMESTAMPTZ,
        "created_at"           TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_email_verifications_attempts"
          CHECK ("attempts" >= 0 AND "attempts" <= "max_attempts"),
        CONSTRAINT "chk_email_verifications_max_attempts"
          CHECK ("max_attempts" > 0)
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_email_verifications_user_created"
      ON "email_verifications" ("user_id", "created_at" DESC);
    `);

    await queryRunner.query(`
      CREATE TABLE "auth_sessions" (
        "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"        UUID NOT NULL
          REFERENCES "users"("id") ON DELETE CASCADE,
        "user_agent"     VARCHAR(500),
        "ip_hash"        VARCHAR(64),
        "last_seen_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        "expires_at"     TIMESTAMPTZ NOT NULL,
        "revoked_at"     TIMESTAMPTZ,
        "revoke_reason"  VARCHAR(100),
        "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_auth_sessions_user_active"
      ON "auth_sessions" ("user_id", "revoked_at", "expires_at");
    `);

    await queryRunner.query(`
      CREATE TABLE "auth_refresh_tokens" (
        "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "session_id"      UUID NOT NULL
          REFERENCES "auth_sessions"("id") ON DELETE CASCADE,
        "token_hash"      VARCHAR(64) NOT NULL UNIQUE,
        "status"          VARCHAR(16) NOT NULL DEFAULT 'active',
        "expires_at"      TIMESTAMPTZ NOT NULL,
        "consumed_at"     TIMESTAMPTZ,
        "replaced_by_id"  UUID,
        "revoked_at"      TIMESTAMPTZ,
        "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_auth_refresh_tokens_status"
          CHECK ("status" IN ('active', 'consumed', 'revoked'))
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_auth_refresh_tokens_session"
      ON "auth_refresh_tokens" ("session_id", "created_at" DESC);
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_auth_refresh_tokens_one_active"
      ON "auth_refresh_tokens" ("session_id") WHERE "status" = 'active';
    `);

    await queryRunner.query(`
      CREATE TABLE "consent_records" (
        "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"       UUID NOT NULL
          REFERENCES "users"("id") ON DELETE CASCADE,
        "consent_type"  VARCHAR(32) NOT NULL,
        "version"       VARCHAR(64) NOT NULL,
        "source"        VARCHAR(32) NOT NULL DEFAULT 'registration',
        "ip_hash"       VARCHAR(64),
        "accepted_at"   TIMESTAMPTZ NOT NULL,
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_consent_records_user_type_version"
          UNIQUE ("user_id", "consent_type", "version"),
        CONSTRAINT "chk_consent_records_type" CHECK (
          "consent_type" IN (
            'terms', 'privacy', 'community_guidelines', 'adult_declaration'
          )
        )
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "consent_records";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "auth_refresh_tokens";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "auth_sessions";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "email_verifications";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "beta_access_reservations";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "beta_access_codes";`);
    await queryRunner.query(`
      ALTER TABLE "user_profiles"
        DROP CONSTRAINT IF EXISTS "chk_user_profiles_battle_profession",
        DROP COLUMN IF EXISTS "privacy_settings",
        DROP COLUMN IF EXISTS "battle_profession",
        DROP COLUMN IF EXISTS "bio";
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP CONSTRAINT IF EXISTS "chk_users_social_verification_status",
        DROP CONSTRAINT IF EXISTS "chk_users_account_status",
        DROP CONSTRAINT IF EXISTS "uq_users_public_id",
        DROP CONSTRAINT IF EXISTS "uq_users_email_normalized",
        DROP COLUMN IF EXISTS "onboarding_completed",
        DROP COLUMN IF EXISTS "password_changed_at",
        DROP COLUMN IF EXISTS "email_verified_at",
        DROP COLUMN IF EXISTS "social_verification_status",
        DROP COLUMN IF EXISTS "account_status",
        DROP COLUMN IF EXISTS "public_id",
        DROP COLUMN IF EXISTS "email_normalized";
    `);
  }
}
