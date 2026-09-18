import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Dedicated ranked keys for the rebuilt 8x10 rules; previous traces remain immutable. */
export class AddWordFrontV4ArcadeGames1700000000040 implements MigrationInterface {
  name = 'AddWordFrontV4ArcadeGames1700000000040';
  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['arcade_game_runs', 'arcade_best_scores'] as const) await queryRunner.query(`
      ALTER TABLE "${table}" DROP CONSTRAINT "chk_${table}_game",
      ADD CONSTRAINT "chk_${table}_game" CHECK ("game_key" IN
        ('tetris','tank','zhesi','word_story','word_endless','word_story_v2','word_endless_v2','word_story_v3','word_endless_v3','word_story_v4','word_endless_v4'));
    `);
    await queryRunner.query(`CREATE TABLE "word_front_room_snapshots" (
      "id" uuid PRIMARY KEY, "state" jsonb NOT NULL, "expires_at" timestamptz NOT NULL, "updated_at" timestamptz NOT NULL
    )`);
    await queryRunner.query(`CREATE INDEX "ix_word_front_room_snapshots_expiry" ON "word_front_room_snapshots" ("expires_at")`);
    await queryRunner.query(`CREATE TABLE "word_front_map_drafts" (
      "key" varchar(32) PRIMARY KEY, "name" varchar(64) NOT NULL, "cells" jsonb NOT NULL,
      "version" integer NOT NULL DEFAULT 1, "author_id" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL,
      "updated_at" timestamptz NOT NULL,
      CONSTRAINT "chk_word_front_map_drafts_version" CHECK ("version" >= 1)
    )`);
    await queryRunner.query(`INSERT INTO "word_front_map_drafts" ("key","name","cells","version","author_id","updated_at") VALUES
      ('changban','长坂坡回廊','["A######S","P##ooo#P","P##ooo#P","P##PPPPP","PPPPpppp","ppppp##p","ppppp##p","p#...##p","p#...##p","S######A"]'::jsonb,1,NULL,now()),
      ('dangyang','当阳桥','["A..###.S","P..###.P","P..PPPPP","P..P....","PPPP.##.","p...####","ppp....#","..p....#","..pppppp","S######A"]'::jsonb,1,NULL,now()),
      ('cao-camp','曹营突围','["A......S","PPPPP...","....P...","....PPPP",".......P",".......P","......pp","......pp",".......p","SppppppA"]'::jsonb,1,NULL,now())`);
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['arcade_game_runs', 'arcade_best_scores'] as const) {
      const rows = await queryRunner.query(`SELECT COUNT(*)::int AS count FROM "${table}" WHERE "game_key" IN ('word_story_v4','word_endless_v4')`) as Array<{ count: number }>;
      if (Number(rows[0]?.count ?? 0) > 0) throw new Error(`Cannot remove word-front v4 game keys while ${table} contains results`);
    }
    const custom = await queryRunner.query(`SELECT COUNT(*)::int AS count FROM "word_front_map_drafts" WHERE "author_id" IS NOT NULL OR "version" > 1`) as Array<{ count: number }>;
    if (Number(custom[0]?.count ?? 0) > 0) throw new Error('Cannot remove word-front map studio while edited drafts exist');
    await queryRunner.query(`DROP TABLE "word_front_map_drafts"`);
    await queryRunner.query(`DROP TABLE "word_front_room_snapshots"`);
    for (const table of ['arcade_best_scores', 'arcade_game_runs'] as const) await queryRunner.query(`
      ALTER TABLE "${table}" DROP CONSTRAINT "chk_${table}_game",
      ADD CONSTRAINT "chk_${table}_game" CHECK ("game_key" IN
        ('tetris','tank','zhesi','word_story','word_endless','word_story_v2','word_endless_v2','word_story_v3','word_endless_v3'));
    `);
  }
}
