import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddArcadeLeaderboardsAndChatRetention1700000000023 implements MigrationInterface {
  name = 'AddArcadeLeaderboardsAndChatRetention1700000000023';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "arcade_game_runs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "game_key" varchar(16) NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'active',
        "score" integer,
        "metrics" jsonb NOT NULL DEFAULT '{}',
        "started_at" timestamptz NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "completed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_arcade_game_runs_user" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "chk_arcade_game_runs_game" CHECK ("game_key" IN ('tetris', 'tank')),
        CONSTRAINT "chk_arcade_game_runs_status" CHECK ("status" IN ('active', 'completed', 'expired')),
        CONSTRAINT "chk_arcade_game_runs_score" CHECK ("score" IS NULL OR "score" >= 0)
      );
    `);
    await queryRunner.query(`CREATE INDEX "idx_arcade_game_runs_user_game_status" ON "arcade_game_runs" ("user_id", "game_key", "status");`);
    await queryRunner.query(`CREATE INDEX "idx_arcade_game_runs_expiry" ON "arcade_game_runs" ("status", "expires_at");`);

    await queryRunner.query(`
      CREATE TABLE "arcade_best_scores" (
        "game_key" varchar(16) NOT NULL,
        "user_id" uuid NOT NULL,
        "best_score" integer NOT NULL,
        "run_id" uuid NOT NULL UNIQUE,
        "metrics" jsonb NOT NULL DEFAULT '{}',
        "achieved_at" timestamptz NOT NULL,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("game_key", "user_id"),
        CONSTRAINT "fk_arcade_best_scores_user" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_arcade_best_scores_run" FOREIGN KEY ("run_id") REFERENCES "arcade_game_runs" ("id") ON DELETE RESTRICT,
        CONSTRAINT "chk_arcade_best_scores_game" CHECK ("game_key" IN ('tetris', 'tank')),
        CONSTRAINT "chk_arcade_best_scores_score" CHECK ("best_score" >= 0)
      );
    `);
    await queryRunner.query(`CREATE INDEX "idx_arcade_best_scores_ranking" ON "arcade_best_scores" ("game_key", "best_score" DESC, "achieved_at" ASC);`);

  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "arcade_best_scores";`);
    await queryRunner.query(`DROP TABLE "arcade_game_runs";`);
  }
}
