import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddZhesiArcadeGame1700000000025 implements MigrationInterface {
  name = 'AddZhesiArcadeGame1700000000025';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "arcade_game_runs"
        DROP CONSTRAINT "chk_arcade_game_runs_game",
        ADD CONSTRAINT "chk_arcade_game_runs_game"
          CHECK ("game_key" IN ('tetris', 'tank', 'zhesi'));
    `);
    await queryRunner.query(`
      ALTER TABLE "arcade_best_scores"
        DROP CONSTRAINT "chk_arcade_best_scores_game",
        ADD CONSTRAINT "chk_arcade_best_scores_game"
          CHECK ("game_key" IN ('tetris', 'tank', 'zhesi'));
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "arcade_best_scores"
        DROP CONSTRAINT "chk_arcade_best_scores_game",
        ADD CONSTRAINT "chk_arcade_best_scores_game"
          CHECK ("game_key" IN ('tetris', 'tank'));
    `);
    await queryRunner.query(`
      ALTER TABLE "arcade_game_runs"
        DROP CONSTRAINT "chk_arcade_game_runs_game",
        ADD CONSTRAINT "chk_arcade_game_runs_game"
          CHECK ("game_key" IN ('tetris', 'tank'));
    `);
  }
}
