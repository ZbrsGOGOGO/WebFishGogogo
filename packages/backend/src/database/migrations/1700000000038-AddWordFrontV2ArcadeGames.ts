import type { MigrationInterface, QueryRunner } from 'typeorm';

/** A distinct score season keeps six-chapter v2 results separate from v1. */
export class AddWordFrontV2ArcadeGames1700000000038 implements MigrationInterface {
  name = 'AddWordFrontV2ArcadeGames1700000000038';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['arcade_game_runs', 'arcade_best_scores'] as const) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
          DROP CONSTRAINT "chk_${table}_game",
          ADD CONSTRAINT "chk_${table}_game"
            CHECK ("game_key" IN ('tetris', 'tank', 'zhesi', 'word_story', 'word_endless', 'word_story_v2', 'word_endless_v2'));
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['arcade_game_runs', 'arcade_best_scores'] as const) {
      const rows = await queryRunner.query(
        `SELECT COUNT(*)::int AS count FROM "${table}" WHERE "game_key" IN ('word_story_v2', 'word_endless_v2')`,
      ) as Array<{ count: number }>;
      if (Number(rows[0]?.count ?? 0) > 0) throw new Error(`Cannot remove word-front v2 game keys while ${table} contains results`);
    }
    for (const table of ['arcade_best_scores', 'arcade_game_runs'] as const) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
          DROP CONSTRAINT "chk_${table}_game",
          ADD CONSTRAINT "chk_${table}_game"
            CHECK ("game_key" IN ('tetris', 'tank', 'zhesi', 'word_story', 'word_endless'));
      `);
    }
  }
}
