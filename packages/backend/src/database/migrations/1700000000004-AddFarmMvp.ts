import type { MigrationInterface, QueryRunner } from 'typeorm';

/** 农场 MVP：六槽土地、作物目录和可审计的种植周期。 */
export class AddFarmMvp1700000000004 implements MigrationInterface {
  name = 'AddFarmMvp1700000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "user_farms" (
        "user_id"      UUID PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
        "level"        SMALLINT NOT NULL DEFAULT 1,
        "experience"   BIGINT NOT NULL DEFAULT 0,
        "plot_count"   SMALLINT NOT NULL DEFAULT 4,
        "version"      INT NOT NULL DEFAULT 1,
        "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_user_farm_level" CHECK ("level" BETWEEN 1 AND 100),
        CONSTRAINT "chk_user_farm_experience" CHECK ("experience" >= 0),
        CONSTRAINT "chk_user_farm_plot_count" CHECK ("plot_count" BETWEEN 1 AND 6)
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "farm_plots" (
        "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"       UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "slot_index"    SMALLINT NOT NULL,
        "unlock_type"   VARCHAR(20) NOT NULL DEFAULT 'default',
        "unlock_level"  SMALLINT,
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_farm_plot_user_slot" UNIQUE ("user_id", "slot_index"),
        CONSTRAINT "chk_farm_plot_slot" CHECK ("slot_index" BETWEEN 1 AND 6),
        CONSTRAINT "chk_farm_plot_unlock_type"
          CHECK ("unlock_type" IN ('default', 'level', 'membership'))
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_farm_plots_user" ON "farm_plots" ("user_id");
    `);

    await queryRunner.query(`
      CREATE TABLE "crop_definitions" (
        "slug"                 VARCHAR(64) PRIMARY KEY,
        "name"                 VARCHAR(100) NOT NULL,
        "emoji"                VARCHAR(16) NOT NULL,
        "grow_seconds"         INT NOT NULL,
        "seed_item_slug"       VARCHAR(64) NOT NULL
          REFERENCES "item_definitions"("slug") ON DELETE RESTRICT,
        "seed_quantity"        INT NOT NULL DEFAULT 1,
        "water_cost"           INT NOT NULL DEFAULT 1,
        "harvest_rewards"      JSONB NOT NULL,
        "farm_exp_reward"      INT NOT NULL,
        "required_farm_level"  SMALLINT NOT NULL DEFAULT 1,
        "enabled"              BOOLEAN NOT NULL DEFAULT true,
        "created_at"           TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"           TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_crop_grow_seconds" CHECK ("grow_seconds" > 0),
        CONSTRAINT "chk_crop_seed_quantity" CHECK ("seed_quantity" > 0),
        CONSTRAINT "chk_crop_water_cost" CHECK ("water_cost" >= 0),
        CONSTRAINT "chk_crop_required_level"
          CHECK ("required_farm_level" BETWEEN 1 AND 100)
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "farm_plantings" (
        "id"                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"                    UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "plot_id"                    UUID NOT NULL REFERENCES "farm_plots"("id") ON DELETE CASCADE,
        "crop_slug"                  VARCHAR(64) NOT NULL
          REFERENCES "crop_definitions"("slug") ON DELETE RESTRICT,
        "status"                     VARCHAR(20) NOT NULL DEFAULT 'growing',
        "planted_at"                 TIMESTAMPTZ NOT NULL,
        "matures_at"                 TIMESTAMPTZ NOT NULL,
        "harvested_at"               TIMESTAMPTZ,
        "cost_snapshot"              JSONB NOT NULL,
        "reward_snapshot"            JSONB NOT NULL,
        "farm_exp_reward"            INT NOT NULL,
        "plant_idempotency_key"      VARCHAR(200) NOT NULL UNIQUE,
        "harvest_idempotency_key"    VARCHAR(200) UNIQUE,
        "harvest_result"             JSONB,
        "version"                    INT NOT NULL DEFAULT 1,
        "created_at"                 TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"                 TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_farm_planting_status"
          CHECK ("status" IN ('growing', 'harvested'))
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_farm_plantings_user_created"
      ON "farm_plantings" ("user_id", "created_at" DESC);
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_farm_active_planting"
      ON "farm_plantings" ("plot_id")
      WHERE "status" = 'growing';
    `);

    await queryRunner.query(`
      INSERT INTO "crop_definitions"
        (
          "slug", "name", "emoji", "grow_seconds", "seed_item_slug",
          "seed_quantity", "water_cost", "harvest_rewards",
          "farm_exp_reward", "required_farm_level"
        )
      VALUES
        (
          'wheat', '工位小麦', '🌾', 1800, 'seed_wheat',
          1, 1,
          '{"experience":20,"currencies":{"office_coin":5},"items":{"seed_wheat":1}}',
          10, 1
        ),
        (
          'strawberry', '午后草莓', '🍓', 7200, 'seed_strawberry',
          1, 2,
          '{"experience":35,"currencies":{"decor_coin":5},"items":{"seed_strawberry":1}}',
          20, 1
        ),
        (
          'coffee', '加班咖啡豆', '☕', 14400, 'seed_coffee',
          1, 2,
          '{"experience":50,"energy":1,"items":{"seed_coffee":1}}',
          30, 2
        )
      ON CONFLICT ("slug") DO NOTHING;
    `);

    // 已有用户只回填农场和土地；教学资产由应用层幂等奖励统一发放。
    await queryRunner.query(`
      INSERT INTO "user_farms" ("user_id")
      SELECT "id" FROM "users"
      ON CONFLICT ("user_id") DO NOTHING;
    `);
    for (let slot = 1; slot <= 6; slot += 1) {
      const unlockType =
        slot <= 4 ? 'default' : slot === 5 ? 'level' : 'membership';
      const unlockLevel = slot === 5 ? '5' : 'NULL';
      await queryRunner.query(`
        INSERT INTO "farm_plots"
          ("user_id", "slot_index", "unlock_type", "unlock_level")
        SELECT "id", ${slot}, '${unlockType}', ${unlockLevel} FROM "users"
        ON CONFLICT ("user_id", "slot_index") DO NOTHING;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "farm_plantings";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "crop_definitions";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "farm_plots";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_farms";`);
  }
}
