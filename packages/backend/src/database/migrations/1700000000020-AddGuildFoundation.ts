import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Guild treasury and building foundation for the unified office-coin economy. */
export class AddGuildFoundation1700000000020 implements MigrationInterface {
  name = 'AddGuildFoundation1700000000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "guilds" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" VARCHAR(24) NOT NULL,
        "name_key" VARCHAR(24) NOT NULL,
        "owner_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "level" SMALLINT NOT NULL DEFAULT 1,
        "treasury" BIGINT NOT NULL DEFAULT 0,
        "member_capacity" SMALLINT NOT NULL DEFAULT 30,
        "buildings" JSONB NOT NULL DEFAULT '{}',
        "version" INT NOT NULL DEFAULT 1,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_guilds_name_key" UNIQUE ("name_key"),
        CONSTRAINT "chk_guilds_level" CHECK ("level" BETWEEN 1 AND 5),
        CONSTRAINT "chk_guilds_treasury" CHECK ("treasury" >= 0),
        CONSTRAINT "chk_guilds_capacity" CHECK ("member_capacity" BETWEEN 30 AND 50)
      );
    `);
    await queryRunner.query(`
      CREATE TABLE "guild_members" (
        "user_id" UUID PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
        "guild_id" UUID NOT NULL REFERENCES "guilds"("id") ON DELETE CASCADE,
        "role" VARCHAR(16) NOT NULL DEFAULT 'member',
        "activity" INT NOT NULL DEFAULT 0,
        "donated_today" INT NOT NULL DEFAULT 0,
        "donation_service_date" DATE,
        "joined_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_guild_members_role" CHECK ("role" IN ('owner', 'member')),
        CONSTRAINT "chk_guild_members_activity" CHECK ("activity" >= 0),
        CONSTRAINT "chk_guild_members_donation" CHECK ("donated_today" >= 0)
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_guild_members_guild_joined"
      ON "guild_members" ("guild_id", "joined_at");
    `);
    await queryRunner.query(`
      CREATE TABLE "guild_ledger" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "guild_id" UUID NOT NULL REFERENCES "guilds"("id") ON DELETE CASCADE,
        "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "kind" VARCHAR(24) NOT NULL,
        "delta" BIGINT NOT NULL,
        "treasury_after" BIGINT NOT NULL,
        "reason" VARCHAR(100) NOT NULL,
        "idempotency_key" VARCHAR(200) NOT NULL,
        "metadata" JSONB NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_guild_ledger_idempotency" UNIQUE ("idempotency_key"),
        CONSTRAINT "chk_guild_ledger_kind" CHECK ("kind" IN ('donation', 'building_upgrade')),
        CONSTRAINT "chk_guild_ledger_delta" CHECK ("delta" <> 0),
        CONSTRAINT "chk_guild_ledger_treasury" CHECK ("treasury_after" >= 0)
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_guild_ledger_guild_created"
      ON "guild_ledger" ("guild_id", "created_at" DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "guild_ledger";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "guild_members";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "guilds";`);
  }
}
