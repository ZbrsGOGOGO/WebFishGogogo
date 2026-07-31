import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 每日任务、最近活动与可靠事件投递底座。
 *
 * 业务事务先写 outbox，消费者再幂等更新任务进度与活动时间线。
 */
export class AddEngagementFoundation1700000000006
  implements MigrationInterface
{
  name = 'AddEngagementFoundation1700000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "task_definitions" (
        "key"              VARCHAR(64) PRIMARY KEY,
        "title"            VARCHAR(100) NOT NULL,
        "description"      VARCHAR(500) NOT NULL,
        "event_type"       VARCHAR(50) NOT NULL,
        "target_count"     INT NOT NULL,
        "reward_snapshot"  JSONB NOT NULL,
        "enabled"          BOOLEAN NOT NULL DEFAULT true,
        "display_order"    SMALLINT NOT NULL DEFAULT 0,
        "created_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_task_definition_target_count"
          CHECK ("target_count" > 0),
        CONSTRAINT "chk_task_definition_display_order"
          CHECK ("display_order" >= 0)
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_task_definitions_event_type"
      ON "task_definitions" ("event_type");
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_task_definitions_enabled_order"
      ON "task_definitions" ("enabled", "display_order");
    `);

    await queryRunner.query(`
      CREATE TABLE "user_task_progress" (
        "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"          UUID NOT NULL
          REFERENCES "users"("id") ON DELETE CASCADE,
        "task_key"         VARCHAR(64) NOT NULL
          REFERENCES "task_definitions"("key") ON DELETE RESTRICT,
        "local_date"       DATE NOT NULL,
        "timezone"         VARCHAR(50) NOT NULL DEFAULT 'Asia/Shanghai',
        "progress"         INT NOT NULL DEFAULT 0,
        "completed_at"     TIMESTAMPTZ,
        "claimed_at"       TIMESTAMPTZ,
        "reward_grant_id"  UUID UNIQUE
          REFERENCES "reward_grants"("id") ON DELETE RESTRICT,
        "version"          INT NOT NULL DEFAULT 1,
        "created_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_user_task_progress_daily"
          UNIQUE ("user_id", "task_key", "local_date"),
        CONSTRAINT "chk_user_task_progress_non_negative"
          CHECK ("progress" >= 0),
        CONSTRAINT "chk_user_task_progress_claimed_after_completed"
          CHECK ("claimed_at" IS NULL OR "completed_at" IS NOT NULL)
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_user_task_progress_user_date"
      ON "user_task_progress" ("user_id", "local_date");
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_user_task_progress_task_date"
      ON "user_task_progress" ("task_key", "local_date");
    `);

    await queryRunner.query(`
      CREATE TABLE "activity_events" (
        "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"          UUID NOT NULL
          REFERENCES "users"("id") ON DELETE CASCADE,
        "event_type"       VARCHAR(50) NOT NULL,
        "title"            VARCHAR(160) NOT NULL,
        "description"      VARCHAR(500),
        "source_type"      VARCHAR(50),
        "source_id"        VARCHAR(100),
        "metadata"         JSONB NOT NULL DEFAULT '{}',
        "local_date"       DATE NOT NULL,
        "occurred_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
        "idempotency_key"  VARCHAR(200) NOT NULL UNIQUE,
        "created_at"       TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_activity_events_user_occurred"
      ON "activity_events" ("user_id", "occurred_at" DESC);
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_activity_events_user_local_date"
      ON "activity_events" ("user_id", "local_date");
    `);

    await queryRunner.query(`
      CREATE TABLE "outbox_events" (
        "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"          UUID NOT NULL
          REFERENCES "users"("id") ON DELETE CASCADE,
        "event_type"       VARCHAR(100) NOT NULL,
        "aggregate_type"   VARCHAR(50) NOT NULL,
        "aggregate_id"     VARCHAR(100) NOT NULL,
        "payload"          JSONB NOT NULL,
        "status"           VARCHAR(16) NOT NULL DEFAULT 'pending',
        "attempts"         INT NOT NULL DEFAULT 0,
        "available_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        "processed_at"     TIMESTAMPTZ,
        "last_error"       TEXT,
        "idempotency_key"  VARCHAR(200) NOT NULL UNIQUE,
        "created_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_outbox_event_status"
          CHECK ("status" IN ('pending', 'processed', 'failed')),
        CONSTRAINT "chk_outbox_event_attempts"
          CHECK ("attempts" >= 0)
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_outbox_events_dispatch"
      ON "outbox_events" ("status", "available_at", "created_at");
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_outbox_events_user_created"
      ON "outbox_events" ("user_id", "created_at" DESC);
    `);

    await queryRunner.query(`
      CREATE TABLE "outbox_receipts" (
        "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "consumer_name"  VARCHAR(100) NOT NULL,
        "event_id"       UUID NOT NULL
          REFERENCES "outbox_events"("id") ON DELETE CASCADE,
        "processed_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_outbox_receipt_consumer_event"
          UNIQUE ("consumer_name", "event_id")
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_outbox_receipts_event"
      ON "outbox_receipts" ("event_id");
    `);

    await queryRunner.query(`
      INSERT INTO "task_definitions"
        (
          "key", "title", "description", "event_type", "target_count",
          "reward_snapshot", "display_order"
        )
      VALUES
        (
          'daily_checkin',
          '今日签到',
          '完成一次每日签到',
          'checkin.completed',
          1,
          '{"experience":10}',
          10
        ),
        (
          'daily_harvest',
          '收获作物',
          '在小农场收获一次成熟作物',
          'farm.crop.harvested',
          1,
          '{"experience":15,"energy":1}',
          20
        ),
        (
          'daily_arena',
          '参加竞技',
          '在午休斗技场完成一场战斗',
          'arena.battle.completed',
          1,
          '{"experience":20}',
          30
        )
      ON CONFLICT ("key") DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "outbox_receipts";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "outbox_events";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "activity_events";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_task_progress";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "task_definitions";`);
  }
}
