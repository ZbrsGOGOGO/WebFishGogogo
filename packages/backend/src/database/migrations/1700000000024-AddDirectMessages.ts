import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDirectMessages1700000000024 implements MigrationInterface {
  name = 'AddDirectMessages1700000000024';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "chat_direct_conversations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_low_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "user_high_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "latest_sequence" bigint NOT NULL DEFAULT 0,
        "last_message_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_chat_direct_conversations_distinct_users"
          CHECK ("user_low_id" <> "user_high_id"),
        CONSTRAINT "chk_chat_direct_conversations_sequence"
          CHECK ("latest_sequence" >= 0)
      );
      CREATE UNIQUE INDEX "uq_chat_direct_conversations_pair"
        ON "chat_direct_conversations" ("user_low_id", "user_high_id");
      CREATE INDEX "idx_chat_direct_conversations_recent"
        ON "chat_direct_conversations" ("last_message_at" DESC, "updated_at" DESC);
    `);

    await queryRunner.query(`
      CREATE TABLE "chat_direct_conversation_members" (
        "conversation_id" uuid NOT NULL
          REFERENCES "chat_direct_conversations"("id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "last_read_sequence" bigint NOT NULL DEFAULT 0,
        "unread_count" integer NOT NULL DEFAULT 0,
        "muted_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("conversation_id", "user_id"),
        CONSTRAINT "chk_chat_direct_members_read_sequence"
          CHECK ("last_read_sequence" >= 0),
        CONSTRAINT "chk_chat_direct_members_unread_count"
          CHECK ("unread_count" >= 0)
      );
      CREATE INDEX "idx_chat_direct_members_user_recent"
        ON "chat_direct_conversation_members" ("user_id", "updated_at" DESC);
    `);

    await queryRunner.query(`
      CREATE TABLE "chat_direct_messages" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "conversation_id" uuid NOT NULL
          REFERENCES "chat_direct_conversations"("id") ON DELETE CASCADE,
        "author_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "client_message_id" varchar(100) NOT NULL,
        "request_hash" varchar(64) NOT NULL,
        "sequence" bigint NOT NULL,
        "body" text NOT NULL,
        "reply_to_message_id" uuid
          REFERENCES "chat_direct_messages"("id") ON DELETE SET NULL,
        "status" varchar(16) NOT NULL DEFAULT 'visible',
        "version" integer NOT NULL DEFAULT 1,
        "moderation_provider" varchar(64) NOT NULL,
        "moderation_decision" varchar(16) NOT NULL,
        "moderation_reference" varchar(160),
        "withdrawn_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_chat_direct_messages_sequence" CHECK ("sequence" > 0),
        CONSTRAINT "chk_chat_direct_messages_status"
          CHECK ("status" IN ('visible', 'withdrawn', 'moderated')),
        CONSTRAINT "chk_chat_direct_messages_moderation"
          CHECK ("moderation_decision" = 'allow')
      );
      CREATE UNIQUE INDEX "uq_chat_direct_messages_sequence"
        ON "chat_direct_messages" ("conversation_id", "sequence");
      CREATE UNIQUE INDEX "uq_chat_direct_messages_author_client"
        ON "chat_direct_messages" ("author_id", "client_message_id");
      CREATE INDEX "idx_chat_direct_messages_conversation_created"
        ON "chat_direct_messages" ("conversation_id", "created_at" DESC);
    `);

    await queryRunner.query(`
      CREATE TABLE "chat_direct_message_reports" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "message_id" uuid NOT NULL
          REFERENCES "chat_direct_messages"("id") ON DELETE CASCADE,
        "reporter_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "reason" varchar(24) NOT NULL,
        "detail" varchar(500),
        "body_hash" varchar(64) NOT NULL,
        "idempotency_key_hash" varchar(64) NOT NULL,
        "request_hash" varchar(64) NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'received',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_chat_direct_message_reports_reason"
          CHECK ("reason" IN ('harassment', 'spam', 'privacy', 'illegal', 'other')),
        CONSTRAINT "chk_chat_direct_message_reports_status"
          CHECK ("status" = 'received')
      );
      CREATE UNIQUE INDEX "uq_chat_direct_message_reports_idempotency"
        ON "chat_direct_message_reports" ("reporter_id", "idempotency_key_hash");
      CREATE INDEX "idx_chat_direct_message_reports_message"
        ON "chat_direct_message_reports" ("message_id", "created_at");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "chat_direct_message_reports";');
    await queryRunner.query('DROP TABLE IF EXISTS "chat_direct_messages" CASCADE;');
    await queryRunner.query('DROP TABLE IF EXISTS "chat_direct_conversation_members";');
    await queryRunner.query('DROP TABLE IF EXISTS "chat_direct_conversations";');
  }
}
