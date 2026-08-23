import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Daily shared guild boss runs and per-member contribution records. */
export class AddGuildBoss1700000000021 implements MigrationInterface {
  name = 'AddGuildBoss1700000000021';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "guild_boss_runs" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "guild_id" UUID NOT NULL REFERENCES "guilds"("id") ON DELETE CASCADE,
        "service_date" DATE NOT NULL,
        "boss_key" VARCHAR(40) NOT NULL,
        "boss_name" VARCHAR(40) NOT NULL,
        "max_hp" BIGINT NOT NULL,
        "remaining_hp" BIGINT NOT NULL,
        "status" VARCHAR(16) NOT NULL DEFAULT 'active',
        "defeated_at" TIMESTAMPTZ,
        "ends_at" TIMESTAMPTZ NOT NULL,
        "version" INT NOT NULL DEFAULT 1,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_guild_boss_runs_daily" UNIQUE ("guild_id", "service_date"),
        CONSTRAINT "chk_guild_boss_runs_hp" CHECK (
          "max_hp" > 0 AND "remaining_hp" >= 0 AND "remaining_hp" <= "max_hp"
        ),
        CONSTRAINT "chk_guild_boss_runs_status" CHECK ("status" IN ('active', 'defeated'))
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_guild_boss_runs_guild_created"
      ON "guild_boss_runs" ("guild_id", "created_at" DESC);
    `);
    await queryRunner.query(`
      CREATE TABLE "guild_boss_contributions" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "run_id" UUID NOT NULL REFERENCES "guild_boss_runs"("id") ON DELETE CASCADE,
        "guild_id" UUID NOT NULL REFERENCES "guilds"("id") ON DELETE CASCADE,
        "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "damage" BIGINT NOT NULL,
        "critical_hit" BOOLEAN NOT NULL DEFAULT FALSE,
        "reward_snapshot" JSONB NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_guild_boss_contributions_member" UNIQUE ("run_id", "user_id"),
        CONSTRAINT "chk_guild_boss_contributions_damage" CHECK ("damage" > 0)
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_guild_boss_contributions_rank"
      ON "guild_boss_contributions" ("run_id", "damage" DESC, "created_at" ASC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "guild_boss_contributions";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "guild_boss_runs";`);
  }
}
