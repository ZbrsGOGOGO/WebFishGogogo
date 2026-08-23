import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDailyHotNewsAndInviteCoin1700000000022 implements MigrationInterface {
  name = 'AddDailyHotNewsAndInviteCoin1700000000022';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "wallet_balances"
        DROP CONSTRAINT "chk_wallet_currency",
        ADD CONSTRAINT "chk_wallet_currency" CHECK (
          "currency" IN ('office_coin', 'invite_coin', 'decor_coin', 'inspiration', 'water', 'sunlight', 'fertilizer')
        );
    `);
    await queryRunner.query(`
      ALTER TABLE "wallet_ledger"
        DROP CONSTRAINT "chk_wallet_ledger_currency",
        ADD CONSTRAINT "chk_wallet_ledger_currency" CHECK (
          "currency" IN ('office_coin', 'invite_coin', 'decor_coin', 'inspiration', 'water', 'sunlight', 'fertilizer')
        );
    `);
    await queryRunner.query(`
      CREATE TABLE "hot_news_refresh_runs" (
        "service_date" date PRIMARY KEY,
        "status" varchar(16) NOT NULL,
        "item_count" integer NOT NULL DEFAULT 0,
        "last_error" varchar(200),
        "started_at" timestamptz NOT NULL,
        "completed_at" timestamptz,
        "lease_expires_at" timestamptz NOT NULL,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_hot_news_refresh_status" CHECK ("status" IN ('running', 'completed', 'failed')),
        CONSTRAINT "chk_hot_news_refresh_item_count" CHECK ("item_count" >= 0)
      );
    `);
    await queryRunner.query(`
      CREATE TABLE "hot_news_headlines" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "service_date" date NOT NULL,
        "source_key" varchar(40) NOT NULL,
        "source_name" varchar(80) NOT NULL,
        "headline" varchar(300) NOT NULL,
        "original_url" varchar(2048) NOT NULL,
        "original_published_at" timestamptz,
        "rank" smallint NOT NULL,
        "fingerprint" char(64) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_hot_news_headlines_run" FOREIGN KEY ("service_date")
          REFERENCES "hot_news_refresh_runs" ("service_date") ON DELETE CASCADE,
        CONSTRAINT "chk_hot_news_headline_rank" CHECK ("rank" BETWEEN 1 AND 100)
      );
    `);
    await queryRunner.query(`CREATE INDEX "idx_hot_news_headlines_date_rank" ON "hot_news_headlines" ("service_date", "rank");`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_hot_news_headlines_fingerprint" ON "hot_news_headlines" ("fingerprint");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "hot_news_headlines";`);
    await queryRunner.query(`DROP TABLE "hot_news_refresh_runs";`);
    await queryRunner.query(`DELETE FROM "wallet_ledger" WHERE "currency" = 'invite_coin';`);
    await queryRunner.query(`DELETE FROM "wallet_balances" WHERE "currency" = 'invite_coin';`);
    await queryRunner.query(`
      ALTER TABLE "wallet_balances"
        DROP CONSTRAINT "chk_wallet_currency",
        ADD CONSTRAINT "chk_wallet_currency" CHECK (
          "currency" IN ('office_coin', 'decor_coin', 'inspiration', 'water', 'sunlight', 'fertilizer')
        );
    `);
    await queryRunner.query(`
      ALTER TABLE "wallet_ledger"
        DROP CONSTRAINT "chk_wallet_ledger_currency",
        ADD CONSTRAINT "chk_wallet_ledger_currency" CHECK (
          "currency" IN ('office_coin', 'decor_coin', 'inspiration', 'water', 'sunlight', 'fertilizer')
        );
    `);
  }
}
