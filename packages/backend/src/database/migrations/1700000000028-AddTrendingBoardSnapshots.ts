import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTrendingBoardSnapshots1700000000028 implements MigrationInterface {
  name = 'AddTrendingBoardSnapshots1700000000028';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "trending_news_board_runs" (
        "service_date" date NOT NULL,
        "board_id" varchar(40) NOT NULL,
        "status" varchar(16) NOT NULL,
        "item_count" smallint NOT NULL DEFAULT 0,
        "last_error" varchar(200),
        "started_at" timestamptz NOT NULL,
        "completed_at" timestamptz,
        "lease_expires_at" timestamptz NOT NULL,
        "retry_not_before" timestamptz,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_trending_news_board_runs" PRIMARY KEY ("service_date", "board_id"),
        CONSTRAINT "chk_trending_news_board_run_status" CHECK ("status" IN ('running', 'completed', 'failed')),
        CONSTRAINT "chk_trending_news_board_run_count" CHECK ("item_count" >= 0)
      );
    `);
    await queryRunner.query(`
      CREATE TABLE "trending_news_items" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "service_date" date NOT NULL,
        "board_id" varchar(40) NOT NULL,
        "source_item_id" varchar(200) NOT NULL,
        "rank" smallint NOT NULL,
        "title" varchar(300) NOT NULL,
        "original_url" varchar(2048),
        "heat_text" varchar(80),
        "published_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_trending_news_items_run" FOREIGN KEY ("service_date", "board_id")
          REFERENCES "trending_news_board_runs" ("service_date", "board_id") ON DELETE CASCADE,
        CONSTRAINT "chk_trending_news_item_rank" CHECK ("rank" BETWEEN 1 AND 20)
      );
    `);
    await queryRunner.query(`CREATE INDEX "idx_trending_news_board_runs_board_date" ON "trending_news_board_runs" ("board_id", "service_date" DESC);`);
    await queryRunner.query(`CREATE INDEX "idx_trending_news_items_board_date_rank" ON "trending_news_items" ("board_id", "service_date" DESC, "rank");`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_trending_news_items_source_item" ON "trending_news_items" ("service_date", "board_id", "source_item_id");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "trending_news_items";`);
    await queryRunner.query(`DROP TABLE "trending_news_board_runs";`);
  }
}
