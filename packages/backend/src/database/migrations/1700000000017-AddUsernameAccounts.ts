import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Adds simple username/password accounts without disturbing legacy email users. */
export class AddUsernameAccounts1700000000017 implements MigrationInterface {
  name = 'AddUsernameAccounts1700000000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "username" varchar(20),
      ADD COLUMN "username_normalized" varchar(20);
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_users_username_normalized"
      ON "users" ("username_normalized")
      WHERE "username_normalized" IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_users_username_normalized";`);
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN "username_normalized",
      DROP COLUMN "username";
    `);
  }
}
