import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Traceable, human-edited external news summaries. No crawler or seed data. */
export class AddEditorialNews1700000000015 implements MigrationInterface {
  name = 'AddEditorialNews1700000000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "news_sources" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" VARCHAR(120) NOT NULL,
        "source_type" VARCHAR(16) NOT NULL,
        "homepage_url" VARCHAR(2048) NOT NULL,
        "trust_rank" SMALLINT NOT NULL DEFAULT 50,
        "authorization_status" VARCHAR(16) NOT NULL,
        "authorization_evidence_ref" VARCHAR(200) NOT NULL,
        "authorization_valid_from" TIMESTAMPTZ,
        "authorization_valid_until" TIMESTAMPTZ,
        "authorization_revoked_at" TIMESTAMPTZ,
        "version" INT NOT NULL DEFAULT 1,
        "created_by" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "updated_by" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_news_sources_name" UNIQUE ("name"),
        CONSTRAINT "chk_news_sources_type"
          CHECK ("source_type" IN ('owned', 'official', 'licensed')),
        CONSTRAINT "chk_news_sources_authorization"
          CHECK ("authorization_status" IN ('verified', 'revoked', 'expired')),
        CONSTRAINT "chk_news_sources_trust_rank" CHECK ("trust_rank" BETWEEN 1 AND 100),
        CONSTRAINT "chk_news_sources_version" CHECK ("version" > 0)
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "news_articles" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "public_id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "source_id" UUID NOT NULL REFERENCES "news_sources"("id") ON DELETE RESTRICT,
        "status" VARCHAR(24) NOT NULL DEFAULT 'draft',
        "current_revision_id" UUID,
        "pending_revision_id" UUID,
        "published_revision_id" UUID,
        "created_by" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "submitted_by" UUID REFERENCES "users"("id") ON DELETE RESTRICT,
        "submitted_at" TIMESTAMPTZ,
        "reviewed_by" UUID REFERENCES "users"("id") ON DELETE RESTRICT,
        "published_at" TIMESTAMPTZ,
        "last_corrected_at" TIMESTAMPTZ,
        "withdrawn_at" TIMESTAMPTZ,
        "withdrawal_notice" VARCHAR(500),
        "version" INT NOT NULL DEFAULT 1,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_news_articles_public_id" UNIQUE ("public_id"),
        CONSTRAINT "chk_news_articles_status"
          CHECK ("status" IN ('draft', 'pending_review', 'published', 'withdrawn')),
        CONSTRAINT "chk_news_articles_version" CHECK ("version" > 0)
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_news_articles_publication"
      ON "news_articles" ("status", "published_at" DESC, "id" DESC);
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_news_articles_source"
      ON "news_articles" ("source_id", "status");
    `);

    await queryRunner.query(`
      CREATE TABLE "news_article_revisions" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "article_id" UUID NOT NULL REFERENCES "news_articles"("id") ON DELETE CASCADE,
        "version" INT NOT NULL,
        "original_title" VARCHAR(300) NOT NULL,
        "summary" VARCHAR(300) NOT NULL,
        "original_url" VARCHAR(2048) NOT NULL,
        "original_published_at" TIMESTAMPTZ NOT NULL,
        "profession_tags" JSONB NOT NULL DEFAULT '[]',
        "topic_tags" JSONB NOT NULL DEFAULT '[]',
        "correction_note" VARCHAR(500),
        "content_hash" VARCHAR(64) NOT NULL,
        "created_by" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_news_article_revisions_version" UNIQUE ("article_id", "version"),
        CONSTRAINT "chk_news_article_revisions_version" CHECK ("version" > 0)
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_news_article_revisions_article"
      ON "news_article_revisions" ("article_id", "created_at");
    `);
    await queryRunner.query(`
      ALTER TABLE "news_articles"
      ADD CONSTRAINT "fk_news_articles_current_revision"
        FOREIGN KEY ("current_revision_id") REFERENCES "news_article_revisions"("id") ON DELETE RESTRICT,
      ADD CONSTRAINT "fk_news_articles_pending_revision"
        FOREIGN KEY ("pending_revision_id") REFERENCES "news_article_revisions"("id") ON DELETE RESTRICT,
      ADD CONSTRAINT "fk_news_articles_published_revision"
        FOREIGN KEY ("published_revision_id") REFERENCES "news_article_revisions"("id") ON DELETE RESTRICT;
    `);

    await queryRunner.query(`
      CREATE TABLE "news_review_decisions" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "article_id" UUID NOT NULL REFERENCES "news_articles"("id") ON DELETE RESTRICT,
        "revision_id" UUID NOT NULL REFERENCES "news_article_revisions"("id") ON DELETE RESTRICT,
        "submitted_by" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "reviewer_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "decision" VARCHAR(16) NOT NULL,
        "reason" VARCHAR(500) NOT NULL,
        "source_authorization_snapshot" JSONB NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_news_review_decisions_revision" UNIQUE ("revision_id"),
        CONSTRAINT "chk_news_review_decisions_decision"
          CHECK ("decision" IN ('approved', 'rejected')),
        CONSTRAINT "chk_news_review_separation" CHECK ("submitted_by" <> "reviewer_id")
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_news_review_decisions_article"
      ON "news_review_decisions" ("article_id", "created_at");
    `);

    await queryRunner.query(`
      CREATE TABLE "news_user_preferences" (
        "user_id" UUID PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
        "personalization_enabled" BOOLEAN NOT NULL DEFAULT false,
        "topic_preferences" JSONB NOT NULL DEFAULT '[]',
        "version" INT NOT NULL DEFAULT 1,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_news_user_preferences_version" CHECK ("version" > 0)
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "news_negative_feedback" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "article_id" UUID NOT NULL REFERENCES "news_articles"("id") ON DELETE CASCADE,
        "reason" VARCHAR(32) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_news_negative_feedback_user_article" UNIQUE ("user_id", "article_id"),
        CONSTRAINT "chk_news_negative_feedback_reason" CHECK (
          "reason" IN ('not_interested', 'not_relevant', 'seen_too_often', 'source_not_preferred')
        )
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_news_negative_feedback_user"
      ON "news_negative_feedback" ("user_id", "created_at" DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "news_negative_feedback";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "news_user_preferences";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "news_review_decisions";`);
    await queryRunner.query(`ALTER TABLE "news_articles" DROP CONSTRAINT IF EXISTS "fk_news_articles_current_revision";`);
    await queryRunner.query(`ALTER TABLE "news_articles" DROP CONSTRAINT IF EXISTS "fk_news_articles_pending_revision";`);
    await queryRunner.query(`ALTER TABLE "news_articles" DROP CONSTRAINT IF EXISTS "fk_news_articles_published_revision";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "news_article_revisions";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "news_articles";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "news_sources";`);
  }
}
