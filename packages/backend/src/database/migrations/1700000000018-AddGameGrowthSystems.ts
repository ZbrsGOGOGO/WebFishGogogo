import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Adds server-authoritative farm and office-battle progression state. */
export class AddGameGrowthSystems1700000000018 implements MigrationInterface {
  name = 'AddGameGrowthSystems1700000000018';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "desk_plants"
        ADD COLUMN "farm_coins" INT NOT NULL DEFAULT 0,
        ADD COLUMN "total_harvests" INT NOT NULL DEFAULT 0,
        ADD COLUMN "selected_crop_key" VARCHAR(32) NOT NULL DEFAULT 'desk_mint',
        ADD COLUMN "tool_levels" JSONB NOT NULL DEFAULT '{}',
        ADD COLUMN "skill_levels" JSONB NOT NULL DEFAULT '{}',
        ADD COLUMN "farm_version" INT NOT NULL DEFAULT 1;
    `);
    await queryRunner.query(`
      ALTER TABLE "desk_plants"
        ADD CONSTRAINT "chk_desk_plants_growth_assets"
          CHECK ("farm_coins" >= 0 AND "total_harvests" >= 0 AND "farm_version" > 0);
    `);
    await queryRunner.query(`
      ALTER TABLE "desk_plant_cycles"
        ADD COLUMN "crop_key" VARCHAR(32) NOT NULL DEFAULT 'desk_mint';
    `);
    await queryRunner.query(`
      ALTER TABLE "office_battle_profiles"
        ADD COLUMN "skill_levels" JSONB NOT NULL DEFAULT '{}';
    `);
    await queryRunner.query(`
      ALTER TABLE "office_battle_inventory_ledger"
        DROP CONSTRAINT "chk_office_battle_inventory_action";
    `);
    await queryRunner.query(`
      ALTER TABLE "office_battle_inventory_ledger"
        ADD CONSTRAINT "chk_office_battle_inventory_action"
          CHECK ("action" IN ('create', 'lock', 'equip', 'defense_equip', 'salvage', 'pending', 'claim', 'enhance'));
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "office_battle_inventory_ledger"
        DROP CONSTRAINT "chk_office_battle_inventory_action";
    `);
    await queryRunner.query(`
      ALTER TABLE "office_battle_inventory_ledger"
        ADD CONSTRAINT "chk_office_battle_inventory_action"
          CHECK ("action" IN ('create', 'lock', 'equip', 'defense_equip', 'salvage', 'pending', 'claim'));
    `);
    await queryRunner.query(`ALTER TABLE "office_battle_profiles" DROP COLUMN "skill_levels";`);
    await queryRunner.query(`ALTER TABLE "desk_plant_cycles" DROP COLUMN "crop_key";`);
    await queryRunner.query(`ALTER TABLE "desk_plants" DROP CONSTRAINT "chk_desk_plants_growth_assets";`);
    await queryRunner.query(`
      ALTER TABLE "desk_plants"
        DROP COLUMN "farm_version",
        DROP COLUMN "skill_levels",
        DROP COLUMN "tool_levels",
        DROP COLUMN "selected_crop_key",
        DROP COLUMN "total_harvests",
        DROP COLUMN "farm_coins";
    `);
  }
}
