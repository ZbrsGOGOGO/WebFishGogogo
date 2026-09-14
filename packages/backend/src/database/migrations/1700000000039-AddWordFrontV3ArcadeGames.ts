import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Isolate v3 scores while preserving every live v1/v2 run and leaderboard. */
export class AddWordFrontV3ArcadeGames1700000000039 implements MigrationInterface {
  name = 'AddWordFrontV3ArcadeGames1700000000039';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['arcade_game_runs', 'arcade_best_scores'] as const) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
          DROP CONSTRAINT "chk_${table}_game",
          ADD CONSTRAINT "chk_${table}_game"
            CHECK ("game_key" IN ('tetris', 'tank', 'zhesi', 'word_story', 'word_endless', 'word_story_v2', 'word_endless_v2', 'word_story_v3', 'word_endless_v3'));
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['arcade_game_runs', 'arcade_best_scores'] as const) {
      const rows = await queryRunner.query(
        `SELECT COUNT(*)::int AS count FROM "${table}" WHERE "game_key" IN ('word_story_v3', 'word_endless_v3')`,
      ) as Array<{ count: number }>;
      if (Number(rows[0]?.count ?? 0) > 0) throw new Error(`Cannot remove word-front v3 game keys while ${table} contains results`);
    }
    for (const table of ['arcade_best_scores', 'arcade_game_runs'] as const) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
          DROP CONSTRAINT "chk_${table}_game",
          ADD CONSTRAINT "chk_${table}_game"
            CHECK ("game_key" IN ('tetris', 'tank', 'zhesi', 'word_story', 'word_endless', 'word_story_v2', 'word_endless_v2'));
      `);
    }
  }
}
