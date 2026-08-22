import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCommunityChat1700000000014 implements MigrationInterface {
  name = 'AddCommunityChat1700000000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "chat_rooms" (
        "slug" VARCHAR(24) PRIMARY KEY,
        "name" VARCHAR(80) NOT NULL,
        "description" VARCHAR(240) NOT NULL,
        "read_only" BOOLEAN NOT NULL DEFAULT false,
        "closed" BOOLEAN NOT NULL DEFAULT false,
        "slow_mode_seconds" INT NOT NULL DEFAULT 0,
        "latest_sequence" BIGINT NOT NULL DEFAULT 0,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_chat_rooms_slug" CHECK (
          "slug" IN ('general', 'developer', 'product', 'qa', 'sales', 'hr')
        ),
        CONSTRAINT "chk_chat_rooms_slow_mode" CHECK ("slow_mode_seconds" >= 0),
        CONSTRAINT "chk_chat_rooms_latest_sequence" CHECK ("latest_sequence" >= 0)
      );
    `);
    await queryRunner.query(`
      INSERT INTO "chat_rooms"
        ("slug", "name", "description", "slow_mode_seconds")
      VALUES
        ('general', '综合茶水间', '聊工作经验、日常方法与社区近况。', 3),
        ('developer', '研发工位', '交流开发实践、工程效率与技术成长。', 5),
        ('product', '产品会议室', '讨论需求、产品判断与协作方法。', 5),
        ('qa', '质量保障台', '交流测试策略、质量意识与问题复盘。', 5),
        ('sales', '客户会客区', '分享客户沟通、销售实践与服务经验。', 5),
        ('hr', '组织支持室', '交流招聘、组织协作与职业发展。', 5);
    `);

    await queryRunner.query(`
      CREATE TABLE "chat_socket_tickets" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "ticket_hash" VARCHAR(64) NOT NULL,
        "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "session_id" UUID NOT NULL REFERENCES "auth_sessions"("id") ON DELETE CASCADE,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "consumed_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX "uq_chat_socket_tickets_hash"
        ON "chat_socket_tickets" ("ticket_hash");
      CREATE INDEX "idx_chat_socket_tickets_expiry"
        ON "chat_socket_tickets" ("expires_at", "consumed_at");
    `);

    await queryRunner.query(`
      CREATE TABLE "chat_messages" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "room_slug" VARCHAR(24) NOT NULL
          REFERENCES "chat_rooms"("slug") ON DELETE RESTRICT,
        "author_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "client_message_id" VARCHAR(100) NOT NULL,
        "request_hash" VARCHAR(64) NOT NULL,
        "sequence" BIGINT NOT NULL,
        "body" TEXT NOT NULL,
        "reply_to_message_id" UUID REFERENCES "chat_messages"("id") ON DELETE SET NULL,
        "status" VARCHAR(16) NOT NULL DEFAULT 'visible',
        "version" INT NOT NULL DEFAULT 1,
        "moderation_provider" VARCHAR(64) NOT NULL,
        "moderation_decision" VARCHAR(16) NOT NULL,
        "moderation_reference" VARCHAR(160),
        "withdrawn_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_chat_messages_sequence" CHECK ("sequence" > 0),
        CONSTRAINT "chk_chat_messages_status" CHECK (
          "status" IN ('visible', 'withdrawn', 'moderated')
        ),
        CONSTRAINT "chk_chat_messages_moderation" CHECK (
          "moderation_decision" = 'allow'
        )
      );
      CREATE UNIQUE INDEX "uq_chat_messages_room_sequence"
        ON "chat_messages" ("room_slug", "sequence");
      CREATE UNIQUE INDEX "uq_chat_messages_author_client_id"
        ON "chat_messages" ("author_id", "client_message_id");
      CREATE INDEX "idx_chat_messages_room_created"
        ON "chat_messages" ("room_slug", "created_at");
    `);

    await queryRunner.query(`
      CREATE TABLE "chat_message_mentions" (
        "message_id" UUID NOT NULL REFERENCES "chat_messages"("id") ON DELETE CASCADE,
        "mentioned_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY ("message_id", "mentioned_user_id")
      );
      CREATE INDEX "idx_chat_message_mentions_user"
        ON "chat_message_mentions" ("mentioned_user_id", "message_id");
    `);

    await queryRunner.query(`
      CREATE TABLE "chat_message_reports" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "message_id" UUID NOT NULL REFERENCES "chat_messages"("id") ON DELETE CASCADE,
        "reporter_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "reason" VARCHAR(24) NOT NULL,
        "detail" VARCHAR(500),
        "body_hash" VARCHAR(64) NOT NULL,
        "idempotency_key_hash" VARCHAR(64) NOT NULL,
        "request_hash" VARCHAR(64) NOT NULL,
        "status" VARCHAR(16) NOT NULL DEFAULT 'received',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_chat_message_reports_reason" CHECK (
          "reason" IN ('harassment', 'spam', 'privacy', 'illegal', 'other')
        ),
        CONSTRAINT "chk_chat_message_reports_status" CHECK ("status" = 'received')
      );
      CREATE UNIQUE INDEX "uq_chat_message_reports_idempotency"
        ON "chat_message_reports" ("reporter_id", "idempotency_key_hash");
      CREATE INDEX "idx_chat_message_reports_message"
        ON "chat_message_reports" ("message_id", "created_at");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "chat_message_reports";');
    await queryRunner.query('DROP TABLE IF EXISTS "chat_message_mentions";');
    await queryRunner.query('DROP TABLE IF EXISTS "chat_messages" CASCADE;');
    await queryRunner.query('DROP TABLE IF EXISTS "chat_socket_tickets";');
    await queryRunner.query('DROP TABLE IF EXISTS "chat_rooms";');
  }
}
