import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTrustedReadingSessions1700000000007
  implements MigrationInterface
{
  name = 'AddTrustedReadingSessions1700000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "reading_sessions" (
        "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"             UUID NOT NULL
          REFERENCES "users"("id") ON DELETE CASCADE,
        "document_id"         UUID NOT NULL
          REFERENCES "documents"("id") ON DELETE CASCADE,
        "client_session_id"   VARCHAR(64) NOT NULL,
        "status"              VARCHAR(16) NOT NULL DEFAULT 'active',
        "last_state"          VARCHAR(16) NOT NULL DEFAULT 'active',
        "heartbeat_sequence"  INT NOT NULL DEFAULT 0,
        "effective_seconds"   INT NOT NULL DEFAULT 0,
        "last_chapter_idx"    INT,
        "last_char_offset"    BIGINT,
        "started_at"          TIMESTAMPTZ NOT NULL,
        "last_heartbeat_at"   TIMESTAMPTZ NOT NULL,
        "ended_at"            TIMESTAMPTZ,
        "version"             INT NOT NULL DEFAULT 1,
        "created_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_reading_session_client"
          UNIQUE ("user_id", "client_session_id"),
        CONSTRAINT "chk_reading_session_status"
          CHECK ("status" IN ('active', 'paused', 'ended', 'expired')),
        CONSTRAINT "chk_reading_session_state"
          CHECK ("last_state" IN ('active', 'hidden', 'idle', 'boss')),
        CONSTRAINT "chk_reading_session_effective_seconds"
          CHECK ("effective_seconds" >= 0),
        CONSTRAINT "chk_reading_session_heartbeat_sequence"
          CHECK ("heartbeat_sequence" >= 0)
      );
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_reading_sessions_one_active_user"
      ON "reading_sessions" ("user_id")
      WHERE "status" = 'active';
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_reading_sessions_user_status"
      ON "reading_sessions" ("user_id", "status");
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_reading_sessions_last_heartbeat"
      ON "reading_sessions" ("last_heartbeat_at");
    `);

    await queryRunner.query(`
      CREATE TABLE "reading_daily_usage" (
        "user_id"             UUID NOT NULL
          REFERENCES "users"("id") ON DELETE CASCADE,
        "local_date"          DATE NOT NULL,
        "timezone"            VARCHAR(50) NOT NULL DEFAULT 'Asia/Shanghai',
        "effective_seconds"   INT NOT NULL DEFAULT 0,
        "goal_completed_at"   TIMESTAMPTZ,
        "version"             INT NOT NULL DEFAULT 1,
        "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY ("user_id", "local_date"),
        CONSTRAINT "chk_reading_daily_usage_effective_seconds"
          CHECK ("effective_seconds" >= 0)
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_reading_daily_usage_date"
      ON "reading_daily_usage" ("local_date");
    `);

    await queryRunner.query(`
      INSERT INTO "task_definitions"
        (
          "key", "title", "description", "event_type", "target_count",
          "reward_snapshot", "display_order"
        )
      VALUES
        (
          'daily_reading',
          '专注阅读',
          '累计完成 10 分钟有效阅读',
          'reading.session.completed',
          1,
          '{"experience":15}',
          15
        )
      ON CONFLICT ("key") DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "user_task_progress" WHERE "task_key" = 'daily_reading';
    `);
    await queryRunner.query(`
      DELETE FROM "task_definitions" WHERE "key" = 'daily_reading';
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "reading_daily_usage";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reading_sessions";`);
  }
}
