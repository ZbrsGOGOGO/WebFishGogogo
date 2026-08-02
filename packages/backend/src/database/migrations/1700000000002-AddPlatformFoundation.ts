import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 共享资产底座。
 *
 * 为阅读、农场与小游戏提供统一的档案、成长、精力、钱包、奖励和签到真源。
 * 所有既有用户都会被幂等回填；资产历史通过 ledger / reward_grants 审计。
 */
export class AddPlatformFoundation1700000000002
  implements MigrationInterface
{
  name = 'AddPlatformFoundation1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "user_profiles" (
        "user_id"     UUID PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
        "nickname"    VARCHAR(100),
        "avatar_key"  VARCHAR(500),
        "title"       VARCHAR(100) NOT NULL DEFAULT '初入工位',
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "player_progression" (
        "user_id"      UUID PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
        "level"        SMALLINT NOT NULL DEFAULT 1,
        "experience"   BIGINT NOT NULL DEFAULT 0,
        "version"      INT NOT NULL DEFAULT 1,
        "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_player_progression_level"
          CHECK ("level" BETWEEN 1 AND 100),
        CONSTRAINT "chk_player_progression_experience"
          CHECK ("experience" >= 0)
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "energy_states" (
        "user_id"             UUID PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
        "balance"             INT NOT NULL DEFAULT 10,
        "capacity"            INT NOT NULL DEFAULT 15,
        "last_recovered_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        "version"             INT NOT NULL DEFAULT 1,
        "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_energy_state_balance"
          CHECK ("balance" >= 0 AND "balance" <= "capacity"),
        CONSTRAINT "chk_energy_state_capacity"
          CHECK ("capacity" > 0)
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "wallet_balances" (
        "user_id"     UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "currency"    VARCHAR(32) NOT NULL,
        "balance"     BIGINT NOT NULL DEFAULT 0,
        "version"     INT NOT NULL DEFAULT 1,
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY ("user_id", "currency"),
        CONSTRAINT "chk_wallet_currency" CHECK (
          "currency" IN (
            'office_coin',
            'decor_coin',
            'inspiration',
            'water',
            'sunlight',
            'fertilizer'
          )
        ),
        CONSTRAINT "chk_wallet_balance" CHECK ("balance" >= 0)
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "wallet_ledger" (
        "id"                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"           UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "currency"          VARCHAR(32) NOT NULL,
        "delta"             BIGINT NOT NULL,
        "balance_after"     BIGINT NOT NULL,
        "source_type"       VARCHAR(50) NOT NULL,
        "source_id"         VARCHAR(100) NOT NULL,
        "reason"            VARCHAR(100) NOT NULL,
        "idempotency_key"   VARCHAR(200) NOT NULL UNIQUE,
        "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_wallet_ledger_currency" CHECK (
          "currency" IN (
            'office_coin',
            'decor_coin',
            'inspiration',
            'water',
            'sunlight',
            'fertilizer'
          )
        ),
        CONSTRAINT "chk_wallet_ledger_delta" CHECK ("delta" <> 0),
        CONSTRAINT "chk_wallet_ledger_balance_after"
          CHECK ("balance_after" >= 0)
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_wallet_ledger_user_created"
      ON "wallet_ledger" ("user_id", "created_at" DESC);
    `);

    await queryRunner.query(`
      CREATE TABLE "reward_grants" (
        "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"          UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "source_type"      VARCHAR(50) NOT NULL,
        "source_id"        VARCHAR(100) NOT NULL,
        "rule_key"         VARCHAR(100) NOT NULL,
        "reward_snapshot"  JSONB NOT NULL,
        "created_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_reward_grant_source"
          UNIQUE ("user_id", "source_type", "source_id", "rule_key")
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_reward_grants_user_created"
      ON "reward_grants" ("user_id", "created_at" DESC);
    `);

    await queryRunner.query(`
      CREATE TABLE "checkins" (
        "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"          UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "local_date"       DATE NOT NULL,
        "timezone"         VARCHAR(50) NOT NULL DEFAULT 'Asia/Shanghai',
        "reward_grant_id"  UUID NOT NULL UNIQUE
          REFERENCES "reward_grants"("id") ON DELETE RESTRICT,
        "created_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_checkins_user_local_date"
          UNIQUE ("user_id", "local_date")
      );
    `);

    // 为仓库中已经存在的用户回填底座状态。后续新用户由应用服务懒初始化，
    // 因此部署迁移和并发首次访问都不会改变原 users.id。
    await queryRunner.query(`
      INSERT INTO "user_profiles" ("user_id", "nickname")
      SELECT "id", "display_name" FROM "users"
      ON CONFLICT ("user_id") DO NOTHING;
    `);
    await queryRunner.query(`
      INSERT INTO "player_progression" ("user_id")
      SELECT "id" FROM "users"
      ON CONFLICT ("user_id") DO NOTHING;
    `);
    await queryRunner.query(`
      INSERT INTO "energy_states" ("user_id")
      SELECT "id" FROM "users"
      ON CONFLICT ("user_id") DO NOTHING;
    `);
    // 使用逐币种 INSERT，兼容本地 pg-mem（其不支持 CROSS JOIN VALUES），
    // 在真实 PostgreSQL 中仍保持相同的幂等回填语义。
    for (const currency of [
      'office_coin',
      'decor_coin',
      'inspiration',
      'water',
      'sunlight',
      'fertilizer',
    ]) {
      await queryRunner.query(`
        INSERT INTO "wallet_balances" ("user_id", "currency", "balance")
        SELECT "id", '${currency}', 0 FROM "users"
        ON CONFLICT ("user_id", "currency") DO NOTHING;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "checkins";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reward_grants";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "wallet_ledger";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "wallet_balances";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "energy_states";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "player_progression";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_profiles";`);
  }
}
