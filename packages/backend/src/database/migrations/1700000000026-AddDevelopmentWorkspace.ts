import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDevelopmentWorkspace1700000000026 implements MigrationInterface {
  name = 'AddDevelopmentWorkspace1700000000026';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "development_members" (
        "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
        "granted_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "granted_at" timestamptz NOT NULL DEFAULT now(),
        "revoked_at" timestamptz
      );
      CREATE INDEX "idx_development_members_active"
        ON "development_members" ("revoked_at", "granted_at");
    `);

    await queryRunner.query(`
      CREATE TABLE "development_requests" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "author_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "client_request_id" varchar(100) NOT NULL,
        "request_hash" varchar(64) NOT NULL,
        "title" varchar(120) NOT NULL,
        "category" varchar(24) NOT NULL,
        "description" text NOT NULL,
        "status" varchar(24) NOT NULL DEFAULT 'submitted',
        "version" integer NOT NULL DEFAULT 1,
        "attachment_count" integer NOT NULL DEFAULT 0,
        "attachment_bytes" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_development_requests_category"
          CHECK ("category" IN ('bug', 'feature', 'ui', 'game', 'other')),
        CONSTRAINT "chk_development_requests_status"
          CHECK ("status" IN ('submitted', 'needs_info', 'accepted', 'rejected', 'in_progress', 'done')),
        CONSTRAINT "chk_development_requests_version" CHECK ("version" >= 1),
        CONSTRAINT "chk_development_requests_attachment_count"
          CHECK ("attachment_count" BETWEEN 0 AND 5),
        CONSTRAINT "chk_development_requests_attachment_bytes"
          CHECK ("attachment_bytes" BETWEEN 0 AND 20971520)
      );
      CREATE UNIQUE INDEX "uq_development_requests_author_client"
        ON "development_requests" ("author_id", "client_request_id");
      CREATE INDEX "idx_development_requests_author_updated"
        ON "development_requests" ("author_id", "updated_at" DESC, "id" DESC);
      CREATE INDEX "idx_development_requests_status_updated"
        ON "development_requests" ("status", "updated_at" DESC, "id" DESC);
    `);

    await queryRunner.query(`
      CREATE TABLE "development_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "request_id" uuid NOT NULL
          REFERENCES "development_requests"("id") ON DELETE CASCADE,
        "actor_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "kind" varchar(16) NOT NULL,
        "body" text NOT NULL,
        "status" varchar(24),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_development_events_kind"
          CHECK ("kind" IN ('created', 'comment', 'decision', 'attachment')),
        CONSTRAINT "chk_development_events_status"
          CHECK ("status" IS NULL OR "status" IN ('submitted', 'needs_info', 'accepted', 'rejected', 'in_progress', 'done'))
      );
      CREATE INDEX "idx_development_events_request_created"
        ON "development_events" ("request_id", "created_at", "id");
    `);

    await queryRunner.query(`
      CREATE TABLE "development_attachments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "request_id" uuid NOT NULL
          REFERENCES "development_requests"("id") ON DELETE CASCADE,
        "filename" varchar(255) NOT NULL,
        "media_type" varchar(100) NOT NULL,
        "bytes" integer NOT NULL,
        "sha256" varchar(64) NOT NULL,
        "extraction" varchar(24) NOT NULL,
        "excerpt" text,
        "warnings" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "content" bytea NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_development_attachments_bytes"
          CHECK ("bytes" BETWEEN 1 AND 5242880),
        CONSTRAINT "chk_development_attachments_content_bytes"
          CHECK (octet_length("content") = "bytes"),
        CONSTRAINT "chk_development_attachments_extraction"
          CHECK ("extraction" IN ('text', 'metadata_only'))
      );
      CREATE INDEX "idx_development_attachments_request_created"
        ON "development_attachments" ("request_id", "created_at", "id");
      CREATE INDEX "idx_development_attachments_sha256"
        ON "development_attachments" ("sha256");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "development_attachments";');
    await queryRunner.query('DROP TABLE IF EXISTS "development_events";');
    await queryRunner.query('DROP TABLE IF EXISTS "development_requests";');
    await queryRunner.query('DROP TABLE IF EXISTS "development_members";');
  }
}
