import type { MigrationInterface, QueryRunner } from 'typeorm';

/** 社区第三批：帖子/问答、不可变修订、互动、举报与最小审核台。 */
export class AddCommunityContentAndModeration1700000000010
  implements MigrationInterface
{
  name = 'AddCommunityContentAndModeration1700000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "community_role" VARCHAR(16) NOT NULL DEFAULT 'user';
    `);
    await queryRunner.query(`
      ALTER TABLE "users" ADD CONSTRAINT "chk_users_community_role"
      CHECK ("community_role" IN ('user', 'moderator', 'admin'));
    `);

    await queryRunner.query(`
      CREATE TABLE "community_posts" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "author_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "active_revision_id" UUID,
        "pending_revision_id" UUID,
        "accepted_comment_id" UUID,
        "publication_status" VARCHAR(24) NOT NULL,
        "moderation_status" VARCHAR(16) NOT NULL DEFAULT 'normal',
        "last_review_decision" VARCHAR(16),
        "last_review_reason" VARCHAR(500),
        "moderation_reason" VARCHAR(500),
        "deleted_at" TIMESTAMPTZ,
        "version" INT NOT NULL DEFAULT 1,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_community_posts_publication"
          CHECK ("publication_status" IN ('draft', 'pending_review', 'published')),
        CONSTRAINT "chk_community_posts_moderation"
          CHECK ("moderation_status" IN ('normal', 'limited', 'hidden')),
        CONSTRAINT "chk_community_posts_review_decision"
          CHECK ("last_review_decision" IS NULL OR "last_review_decision" IN ('approved', 'rejected', 'withdrawn')),
        CONSTRAINT "chk_community_posts_version" CHECK ("version" > 0)
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_community_posts_publication"
      ON "community_posts" ("publication_status", "moderation_status", "deleted_at", "updated_at" DESC);
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_community_posts_author_updated"
      ON "community_posts" ("author_id", "updated_at" DESC);
    `);

    await queryRunner.query(`
      CREATE TABLE "community_post_revisions" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "post_id" UUID NOT NULL REFERENCES "community_posts"("id") ON DELETE CASCADE,
        "version" INT NOT NULL,
        "type" VARCHAR(24) NOT NULL,
        "channel" VARCHAR(32) NOT NULL,
        "title" VARCHAR(80) NOT NULL,
        "body" TEXT NOT NULL,
        "body_format" VARCHAR(24) NOT NULL,
        "tags" JSONB NOT NULL DEFAULT '[]',
        "search_document" TEXT NOT NULL,
        "content_hash" VARCHAR(64) NOT NULL,
        "publication_status" VARCHAR(24) NOT NULL,
        "moderation_status" VARCHAR(16) NOT NULL DEFAULT 'normal',
        "review_decision" VARCHAR(16),
        "review_reason" VARCHAR(500),
        "risk_level" VARCHAR(16) NOT NULL DEFAULT 'low',
        "effective_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_community_post_revisions_version" UNIQUE ("post_id", "version"),
        CONSTRAINT "chk_community_post_revisions_version" CHECK ("version" > 0),
        CONSTRAINT "chk_community_post_revisions_type" CHECK ("type" IN ('experience', 'question', 'retrospective')),
        CONSTRAINT "chk_community_post_revisions_channel" CHECK (
          "channel" IN ('general', 'developer', 'product-manager', 'qa', 'sales', 'human-resources', 'questions', 'retrospectives', 'tools')
        ),
        CONSTRAINT "chk_community_post_revisions_format" CHECK ("body_format" IN ('plain_text', 'restricted_markdown')),
        CONSTRAINT "chk_community_post_revisions_publication"
          CHECK ("publication_status" IN ('draft', 'pending_review', 'published')),
        CONSTRAINT "chk_community_post_revisions_moderation"
          CHECK ("moderation_status" IN ('normal', 'limited', 'hidden')),
        CONSTRAINT "chk_community_post_revisions_risk"
          CHECK ("risk_level" IN ('low', 'medium', 'high', 'critical'))
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_community_post_revisions_post_created"
      ON "community_post_revisions" ("post_id", "created_at" DESC);
    `);
    if (!this.usesPgMemFallback(queryRunner)) {
      await queryRunner.query(`
        CREATE INDEX "idx_community_post_revisions_fts"
        ON "community_post_revisions"
        USING GIN (to_tsvector('simple', "search_document"));
      `);
    }

    await queryRunner.query(`
      CREATE TABLE "community_comments" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "post_id" UUID NOT NULL REFERENCES "community_posts"("id") ON DELETE CASCADE,
        "author_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "parent_comment_id" UUID,
        "depth" SMALLINT NOT NULL,
        "active_revision_id" UUID,
        "pending_revision_id" UUID,
        "publication_status" VARCHAR(24) NOT NULL,
        "moderation_status" VARCHAR(16) NOT NULL DEFAULT 'normal',
        "last_review_decision" VARCHAR(16),
        "last_review_reason" VARCHAR(500),
        "moderation_reason" VARCHAR(500),
        "deleted_at" TIMESTAMPTZ,
        "version" INT NOT NULL DEFAULT 1,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_community_comments_depth" CHECK ("depth" IN (0, 1)),
        CONSTRAINT "chk_community_comments_publication"
          CHECK ("publication_status" IN ('draft', 'pending_review', 'published')),
        CONSTRAINT "chk_community_comments_moderation"
          CHECK ("moderation_status" IN ('normal', 'limited', 'hidden')),
        CONSTRAINT "chk_community_comments_version" CHECK ("version" > 0),
        CONSTRAINT "fk_community_comments_parent"
          FOREIGN KEY ("parent_comment_id") REFERENCES "community_comments"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_community_comments_post_created"
      ON "community_comments" ("post_id", "created_at", "id");
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_community_comments_author_updated"
      ON "community_comments" ("author_id", "updated_at" DESC);
    `);

    await queryRunner.query(`
      CREATE TABLE "community_comment_revisions" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "comment_id" UUID NOT NULL REFERENCES "community_comments"("id") ON DELETE CASCADE,
        "version" INT NOT NULL,
        "body" TEXT NOT NULL,
        "content_hash" VARCHAR(64) NOT NULL,
        "publication_status" VARCHAR(24) NOT NULL,
        "moderation_status" VARCHAR(16) NOT NULL DEFAULT 'normal',
        "review_decision" VARCHAR(16),
        "review_reason" VARCHAR(500),
        "risk_level" VARCHAR(16) NOT NULL DEFAULT 'low',
        "effective_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_community_comment_revisions_version" UNIQUE ("comment_id", "version"),
        CONSTRAINT "chk_community_comment_revisions_version" CHECK ("version" > 0),
        CONSTRAINT "chk_community_comment_revisions_publication"
          CHECK ("publication_status" IN ('draft', 'pending_review', 'published')),
        CONSTRAINT "chk_community_comment_revisions_moderation"
          CHECK ("moderation_status" IN ('normal', 'limited', 'hidden')),
        CONSTRAINT "chk_community_comment_revisions_risk"
          CHECK ("risk_level" IN ('low', 'medium', 'high', 'critical'))
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_community_comment_revisions_comment_created"
      ON "community_comment_revisions" ("comment_id", "created_at" DESC);
    `);
    await queryRunner.query(`
      ALTER TABLE "community_posts"
      ADD CONSTRAINT "fk_community_posts_active_revision"
        FOREIGN KEY ("active_revision_id") REFERENCES "community_post_revisions"("id") ON DELETE SET NULL,
      ADD CONSTRAINT "fk_community_posts_pending_revision"
        FOREIGN KEY ("pending_revision_id") REFERENCES "community_post_revisions"("id") ON DELETE SET NULL,
      ADD CONSTRAINT "fk_community_posts_accepted_comment"
        FOREIGN KEY ("accepted_comment_id") REFERENCES "community_comments"("id") ON DELETE SET NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE "community_comments"
      ADD CONSTRAINT "fk_community_comments_active_revision"
        FOREIGN KEY ("active_revision_id") REFERENCES "community_comment_revisions"("id") ON DELETE SET NULL,
      ADD CONSTRAINT "fk_community_comments_pending_revision"
        FOREIGN KEY ("pending_revision_id") REFERENCES "community_comment_revisions"("id") ON DELETE SET NULL;
    `);

    for (const [table, index] of [
      ['community_post_bookmarks', 'idx_community_post_bookmarks_post'],
      ['community_post_follows', 'idx_community_post_follows_post'],
      ['community_post_useful_reactions', 'idx_community_post_useful_post'],
    ] as const) {
      await queryRunner.query(`
        CREATE TABLE "${table}" (
          "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "post_id" UUID NOT NULL REFERENCES "community_posts"("id") ON DELETE CASCADE,
          "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY ("user_id", "post_id")
        );
      `);
      await queryRunner.query(`
        CREATE INDEX "${index}" ON "${table}" ("post_id", "created_at" DESC);
      `);
    }

    await queryRunner.query(`
      CREATE TABLE "community_content_reports" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "reporter_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "target_type" VARCHAR(16) NOT NULL,
        "target_id" UUID NOT NULL,
        "reason" VARCHAR(24) NOT NULL,
        "details" VARCHAR(1000),
        "evidence_snapshot" JSONB NOT NULL,
        "status" VARCHAR(16) NOT NULL DEFAULT 'open',
        "idempotency_key" VARCHAR(100) NOT NULL,
        "request_hash" VARCHAR(64) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_community_content_reports_idempotency" UNIQUE ("reporter_id", "idempotency_key"),
        CONSTRAINT "chk_community_content_reports_target" CHECK ("target_type" IN ('post', 'comment')),
        CONSTRAINT "chk_community_content_reports_reason"
          CHECK ("reason" IN ('illegal', 'harassment', 'spam', 'misinformation', 'privacy', 'other')),
        CONSTRAINT "chk_community_content_reports_status" CHECK ("status" IN ('open', 'resolved'))
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_community_content_reports_target"
      ON "community_content_reports" ("target_type", "target_id", "created_at" DESC);
    `);

    await queryRunner.query(`
      CREATE TABLE "community_moderation_cases" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "content_type" VARCHAR(16) NOT NULL,
        "content_id" UUID NOT NULL,
        "revision_id" UUID NOT NULL,
        "author_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "status" VARCHAR(16) NOT NULL DEFAULT 'open',
        "risk_level" VARCHAR(16) NOT NULL,
        "source_type" VARCHAR(24) NOT NULL,
        "title_snapshot" VARCHAR(80),
        "body_snapshot" TEXT NOT NULL,
        "content_state_snapshot" JSONB NOT NULL,
        "report_count" INT NOT NULL DEFAULT 0,
        "assigned_to" UUID REFERENCES "users"("id") ON DELETE SET NULL,
        "version" INT NOT NULL DEFAULT 1,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_community_moderation_cases_revision"
          UNIQUE ("content_type", "content_id", "revision_id"),
        CONSTRAINT "chk_community_moderation_cases_content" CHECK ("content_type" IN ('post', 'comment')),
        CONSTRAINT "chk_community_moderation_cases_status" CHECK ("status" IN ('open', 'in_review', 'resolved')),
        CONSTRAINT "chk_community_moderation_cases_risk" CHECK ("risk_level" IN ('low', 'medium', 'high', 'critical')),
        CONSTRAINT "chk_community_moderation_cases_source" CHECK ("source_type" IN ('submission', 'report', 'automated')),
        CONSTRAINT "chk_community_moderation_cases_counts" CHECK ("report_count" >= 0 AND "version" > 0)
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_community_moderation_cases_queue"
      ON "community_moderation_cases" ("status", "risk_level", "updated_at" DESC);
    `);

    await queryRunner.query(`
      CREATE TABLE "community_moderation_actions" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "case_id" UUID NOT NULL REFERENCES "community_moderation_cases"("id") ON DELETE RESTRICT,
        "actor_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "actor_role" VARCHAR(16) NOT NULL,
        "action" VARCHAR(24) NOT NULL,
        "reason" VARCHAR(500) NOT NULL,
        "previous_state" JSONB NOT NULL,
        "next_state" JSONB NOT NULL,
        "idempotency_key" VARCHAR(100) NOT NULL,
        "request_hash" VARCHAR(64) NOT NULL,
        "result" JSONB NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_community_moderation_actions_idempotency" UNIQUE ("actor_id", "idempotency_key"),
        CONSTRAINT "chk_community_moderation_actions_role" CHECK ("actor_role" IN ('moderator', 'admin')),
        CONSTRAINT "chk_community_moderation_actions_action" CHECK ("action" IN ('approve', 'limit', 'hide', 'restore'))
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_community_moderation_actions_case"
      ON "community_moderation_actions" ("case_id", "created_at");
    `);

    await queryRunner.query(`
      CREATE TABLE "community_admin_audit_logs" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "actor_id" UUID REFERENCES "users"("id") ON DELETE RESTRICT,
        "actor_role" VARCHAR(16) NOT NULL,
        "action" VARCHAR(64) NOT NULL,
        "target_type" VARCHAR(32) NOT NULL,
        "target_id" UUID NOT NULL,
        "reason" VARCHAR(500),
        "request_id" VARCHAR(100),
        "previous_state" JSONB NOT NULL,
        "next_state" JSONB NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_community_admin_audit_role" CHECK ("actor_role" IN ('system', 'user', 'moderator', 'admin'))
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_community_admin_audit_target"
      ON "community_admin_audit_logs" ("target_type", "target_id", "created_at");
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_community_admin_audit_actor"
      ON "community_admin_audit_logs" ("actor_id", "created_at");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "community_admin_audit_logs";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "community_moderation_actions";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "community_moderation_cases";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "community_content_reports";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "community_post_useful_reactions";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "community_post_follows";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "community_post_bookmarks";`);
    await queryRunner.query(`ALTER TABLE "community_comments" DROP CONSTRAINT IF EXISTS "fk_community_comments_active_revision";`);
    await queryRunner.query(`ALTER TABLE "community_comments" DROP CONSTRAINT IF EXISTS "fk_community_comments_pending_revision";`);
    await queryRunner.query(`ALTER TABLE "community_posts" DROP CONSTRAINT IF EXISTS "fk_community_posts_active_revision";`);
    await queryRunner.query(`ALTER TABLE "community_posts" DROP CONSTRAINT IF EXISTS "fk_community_posts_pending_revision";`);
    await queryRunner.query(`ALTER TABLE "community_posts" DROP CONSTRAINT IF EXISTS "fk_community_posts_accepted_comment";`);
    await queryRunner.query(`ALTER TABLE "community_comments" DROP CONSTRAINT IF EXISTS "fk_community_comments_parent";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "community_comment_revisions";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "community_comments";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "community_post_revisions";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "community_posts";`);
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "chk_users_community_role";`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "community_role";`);
  }

  private usesPgMemFallback(queryRunner: QueryRunner): boolean {
    const extra = queryRunner.connection.options.extra as
      | Record<string, unknown>
      | undefined;
    return extra?.contentSearchFallback === true;
  }
}
