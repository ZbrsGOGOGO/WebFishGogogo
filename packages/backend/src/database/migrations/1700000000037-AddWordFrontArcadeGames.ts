import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Adds isolated word-front score keys without changing existing arcade rows. */
export class AddWordFrontArcadeGames1700000000037 implements MigrationInterface {
  name = 'AddWordFrontArcadeGames1700000000037';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['arcade_game_runs', 'arcade_best_scores'] as const) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
          DROP CONSTRAINT "chk_${table}_game",
          ADD CONSTRAINT "chk_${table}_game"
            CHECK ("game_key" IN ('tetris', 'tank', 'zhesi', 'word_story', 'word_endless'));
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Never silently erase player results when an older build is selected.
    for (const table of ['arcade_game_runs', 'arcade_best_scores'] as const) {
      const rows = await queryRunner.query(
        `SELECT COUNT(*)::int AS count FROM "${table}" WHERE "game_key" IN ('word_story', 'word_endless')`,
      ) as Array<{ count: number }>;
      if (Number(rows[0]?.count ?? 0) > 0) {
        throw new Error(`Cannot remove word-front game keys while ${table} contains results`);
      }
    }
    for (const table of ['arcade_best_scores', 'arcade_game_runs'] as const) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
          DROP CONSTRAINT "chk_${table}_game",
          ADD CONSTRAINT "chk_${table}_game"
            CHECK ("game_key" IN ('tetris', 'tank', 'zhesi'));
      `);
    }
  }
}
