import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Additive, bound game progression. No wallet or historical score is rewritten. */
export class AddWordFrontProgress1700000000041 implements MigrationInterface {
  name = 'AddWordFrontProgress1700000000041';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "word_front_progress" (
      "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
      "merit" integer NOT NULL DEFAULT 0, "wins" integer NOT NULL DEFAULT 0, "losses" integer NOT NULL DEFAULT 0,
      "daily_date" date NOT NULL, "daily_earned" integer NOT NULL DEFAULT 0,
      "unlocks" jsonb NOT NULL DEFAULT '[]'::jsonb, "updated_at" timestamptz NOT NULL,
      CONSTRAINT "chk_word_front_progress_values" CHECK (
        "merit" BETWEEN 0 AND 1000000000 AND "wins" BETWEEN 0 AND 1000000000 AND "losses" BETWEEN 0 AND 1000000000
        AND "daily_earned" BETWEEN 0 AND 100 AND jsonb_typeof("unlocks") = 'array'
      )
    )`);
  }
  async down(queryRunner: QueryRunner): Promise<void> { await queryRunner.query(`DROP TABLE "word_front_progress"`); }
}
