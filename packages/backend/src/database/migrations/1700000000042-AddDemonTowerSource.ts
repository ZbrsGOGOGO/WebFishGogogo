import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Independent persistence for the ZIP-sourced game. The historical demon_tower_*
 * schema is deliberately left untouched so an application rollback remains safe.
 */
export class AddDemonTowerSource1700000000042 implements MigrationInterface {
  name = 'AddDemonTowerSource1700000000042';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "demon_tower_source_profiles" (
      "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
      "version" integer NOT NULL DEFAULT 1 CHECK ("version" BETWEEN 1 AND 2147483647),
      "schema_version" integer NOT NULL DEFAULT 1 CHECK ("schema_version" = 1),
      "save_data" jsonb NOT NULL CHECK (jsonb_typeof("save_data") = 'object'),
      "display_name" varchar(100) NOT NULL,
      "level" integer NOT NULL DEFAULT 1 CHECK ("level" BETWEEN 1 AND 120),
      "power" integer NOT NULL DEFAULT 0 CHECK ("power" BETWEEN 0 AND 10000000),
      "last_save_request_id" uuid,
      "last_save_request_hash" varchar(64),
      "last_save_receipt" jsonb,
      "created_at" timestamptz NOT NULL,
      "updated_at" timestamptz NOT NULL,
      CHECK (("last_save_request_id" IS NULL AND "last_save_request_hash" IS NULL AND "last_save_receipt" IS NULL)
        OR ("last_save_request_id" IS NOT NULL AND "last_save_request_hash" IS NOT NULL AND "last_save_receipt" IS NOT NULL
          AND length("last_save_request_hash") = 64 AND jsonb_typeof("last_save_receipt") = 'object'))
    )`);
    await queryRunner.query('CREATE INDEX "ix_demon_tower_source_rank" ON "demon_tower_source_profiles" ("power" DESC, "level" DESC, "updated_at", "user_id")');

    await queryRunner.query(`CREATE TABLE "demon_tower_source_world_floors" (
      "layer_id" integer PRIMARY KEY CHECK ("layer_id" BETWEEN 1 AND 9),
      "status" varchar(16) NOT NULL CHECK ("status" IN ('open', 'cleared', 'locked')),
      "boss_hp" integer NOT NULL CHECK ("boss_hp" >= 0),
      "boss_max_hp" integer NOT NULL CHECK ("boss_max_hp" > 0 AND "boss_hp" <= "boss_max_hp"),
      "clues" integer NOT NULL DEFAULT 0 CHECK ("clues" >= 0),
      "channel" integer NOT NULL DEFAULT 0 CHECK ("channel" >= 0),
      "channel_goal" integer NOT NULL CHECK ("channel_goal" > 0 AND "channel" <= "channel_goal"),
      "boss_name" varchar(48) NOT NULL,
      "terrain" varchar(12) NOT NULL CHECK ("terrain" IN ('plain', 'mount', 'lake', 'ocean')),
      "version" integer NOT NULL DEFAULT 1 CHECK ("version" BETWEEN 1 AND 2147483647),
      "updated_at" timestamptz NOT NULL,
      CHECK (("status" = 'cleared' AND "boss_hp" = 0) OR ("status" <> 'cleared')),
      CHECK ("status" <> 'locked' OR ("boss_hp" = "boss_max_hp" AND "channel" = 0))
    )`);

    await queryRunner.query(`CREATE TABLE "demon_tower_source_contributions" (
      "layer_id" integer NOT NULL REFERENCES "demon_tower_source_world_floors"("layer_id") ON DELETE CASCADE,
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "boss_damage" bigint NOT NULL DEFAULT 0 CHECK ("boss_damage" BETWEEN 0 AND 9007199254740991),
      "materials" bigint NOT NULL DEFAULT 0 CHECK ("materials" BETWEEN 0 AND 9007199254740991),
      "clues" bigint NOT NULL DEFAULT 0 CHECK ("clues" BETWEEN 0 AND 9007199254740991),
      "updated_at" timestamptz NOT NULL,
      PRIMARY KEY ("layer_id", "user_id")
    )`);
    await queryRunner.query('CREATE INDEX "ix_demon_tower_source_contribution_rank" ON "demon_tower_source_contributions" ("layer_id", "boss_damage" DESC, "materials" DESC, "updated_at", "user_id")');

    await queryRunner.query(`CREATE TABLE "demon_tower_source_daily_actions" (
      "service_date" date NOT NULL,
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "boss_attempts" integer NOT NULL DEFAULT 0 CHECK ("boss_attempts" BETWEEN 0 AND 10),
      "donated_materials" integer NOT NULL DEFAULT 0 CHECK ("donated_materials" BETWEEN 0 AND 2000),
      "mutation_count" integer NOT NULL DEFAULT 0 CHECK ("mutation_count" BETWEEN 0 AND 120),
      "save_count" integer NOT NULL DEFAULT 0 CHECK ("save_count" BETWEEN 0 AND 720),
      "save_bytes" bigint NOT NULL DEFAULT 0 CHECK ("save_bytes" BETWEEN 0 AND 67108864),
      "updated_at" timestamptz NOT NULL,
      PRIMARY KEY ("service_date", "user_id")
    )`);

    await queryRunner.query(`CREATE TABLE "demon_tower_source_commands" (
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "request_id" uuid NOT NULL,
      "kind" varchar(24) NOT NULL CHECK ("kind" IN ('damage', 'channel', 'clue')),
      "request_hash" varchar(64) NOT NULL CHECK (length("request_hash") = 64),
      "receipt" jsonb NOT NULL CHECK (jsonb_typeof("receipt") = 'object'),
      "created_at" timestamptz NOT NULL,
      PRIMARY KEY ("user_id", "request_id")
    )`);
    await queryRunner.query('CREATE INDEX "ix_demon_tower_source_commands_created" ON "demon_tower_source_commands" ("created_at")');

    const now = new Date();
    const layers = [
      [1, 'open', 1200, 280, '百战羚王·犼野', 'plain'],
      [2, 'locked', 2400, 360, '九幽狼主·苍裂', 'plain'],
      [3, 'locked', 3600, 440, '赤焰魔君·焚天', 'mount'],
      [4, 'locked', 4800, 520, '寒冰蛟后·凝霜', 'lake'],
      [5, 'locked', 6000, 600, '雷霆鹫皇·破云', 'ocean'],
      [6, 'locked', 7200, 680, '腐骨蛛皇·千丝', 'mount'],
      [7, 'locked', 8400, 760, '幻月狐祖·魅生', 'plain'],
      [8, 'locked', 9600, 840, '镇岳石王·磐危', 'mount'],
      [9, 'locked', 10800, 920, '九层妖塔之主·无相', 'ocean'],
    ] as const;
    for (const [layerId, status, bossHp, channelGoal, bossName, terrain] of layers) {
      await queryRunner.query(`INSERT INTO "demon_tower_source_world_floors"
        ("layer_id", "status", "boss_hp", "boss_max_hp", "clues", "channel", "channel_goal", "boss_name", "terrain", "version", "updated_at")
        VALUES ($1,$2,$3,$3,0,0,$4,$5,$6,1,$7)`, [layerId, status, bossHp, channelGoal, bossName, terrain, now]);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(`SELECT
      ((SELECT COUNT(*) FROM "demon_tower_source_profiles")
        + (SELECT COUNT(*) FROM "demon_tower_source_contributions")
        + (SELECT COUNT(*) FROM "demon_tower_source_daily_actions")
        + (SELECT COUNT(*) FROM "demon_tower_source_commands"))::int AS "userCount",
      (SELECT COUNT(*) FROM "demon_tower_source_world_floors"
        WHERE "version" <> 1 OR "clues" <> 0 OR "channel" <> 0 OR "boss_hp" <> "boss_max_hp"
          OR "status" <> CASE WHEN "layer_id" = 1 THEN 'open' ELSE 'locked' END)::int AS "changedWorld",
      (SELECT COUNT(*) FROM "demon_tower_source_world_floors")::int AS "worldCount"`) as Array<{
        userCount: number;
        changedWorld: number;
        worldCount: number;
      }>;
    const state = rows[0];
    if (!state || Number(state.userCount) > 0 || Number(state.changedWorld) > 0 || Number(state.worldCount) !== 9) {
      throw new Error('Cannot remove demon-tower source tables after player or shared-world data exists');
    }
    for (const table of [
      'demon_tower_source_commands',
      'demon_tower_source_daily_actions',
      'demon_tower_source_contributions',
      'demon_tower_source_world_floors',
      'demon_tower_source_profiles',
    ]) await queryRunner.query(`DROP TABLE "${table}"`);
  }
}
