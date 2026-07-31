import type { MigrationInterface, QueryRunner } from 'typeorm';

/** 午休斗技场 MVP：角色战斗属性、三选一对手报价与可重放战报。 */
export class AddArenaMvp1700000000005 implements MigrationInterface {
  name = 'AddArenaMvp1700000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "arena_profiles" (
        "user_id"       UUID PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
        "battle_class"  VARCHAR(32),
        "focus"         INT NOT NULL DEFAULT 10,
        "inspiration"   INT NOT NULL DEFAULT 10,
        "mindset"       INT NOT NULL DEFAULT 10,
        "slacking"      INT NOT NULL DEFAULT 10,
        "execution"     INT NOT NULL DEFAULT 10,
        "wins"          INT NOT NULL DEFAULT 0,
        "losses"        INT NOT NULL DEFAULT 0,
        "version"       INT NOT NULL DEFAULT 1,
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_arena_profile_attributes" CHECK (
          "focus" >= 0 AND "inspiration" >= 0 AND "mindset" >= 0
          AND "slacking" >= 0 AND "execution" >= 0
        ),
        CONSTRAINT "chk_arena_profile_record"
          CHECK ("wins" >= 0 AND "losses" >= 0)
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "arena_opponent_offers" (
        "id"                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"            UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "tier"               VARCHAR(16) NOT NULL,
        "opponent_name"      VARCHAR(100) NOT NULL,
        "opponent_level"     SMALLINT NOT NULL,
        "opponent_snapshot"  JSONB NOT NULL,
        "expires_at"         TIMESTAMPTZ NOT NULL,
        "consumed_at"        TIMESTAMPTZ,
        "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_arena_offer_tier"
          CHECK ("tier" IN ('easy', 'even', 'risky')),
        CONSTRAINT "chk_arena_offer_level"
          CHECK ("opponent_level" BETWEEN 1 AND 100)
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_arena_offers_user_expires"
      ON "arena_opponent_offers" ("user_id", "expires_at" DESC);
    `);

    await queryRunner.query(`
      CREATE TABLE "arena_battles" (
        "id"                  UUID PRIMARY KEY,
        "user_id"             UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "offer_id"            UUID NOT NULL UNIQUE
          REFERENCES "arena_opponent_offers"("id") ON DELETE RESTRICT,
        "result"              VARCHAR(16) NOT NULL,
        "seed"                VARCHAR(100) NOT NULL,
        "engine_version"      VARCHAR(32) NOT NULL,
        "attacker_snapshot"   JSONB NOT NULL,
        "opponent_snapshot"   JSONB NOT NULL,
        "battle_log"          JSONB NOT NULL,
        "reward_snapshot"     JSONB NOT NULL,
        "idempotency_key"     VARCHAR(200) NOT NULL UNIQUE,
        "created_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_arena_battle_result"
          CHECK ("result" IN ('win', 'loss'))
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_arena_battles_user_created"
      ON "arena_battles" ("user_id", "created_at" DESC);
    `);

    await queryRunner.query(`
      INSERT INTO "arena_profiles" ("user_id")
      SELECT "id" FROM "users"
      ON CONFLICT ("user_id") DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "arena_battles";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "arena_opponent_offers";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "arena_profiles";`);
  }
}
