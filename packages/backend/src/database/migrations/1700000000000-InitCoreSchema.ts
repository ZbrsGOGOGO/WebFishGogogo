import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 初始核心表迁移。
 *
 * 严格对齐 design.md 关切点 4（Data Models）的 DDL：
 * users、documents、chapters、reading_progress、bookmarks、memos、fake_meta、
 * user_preferences（含 profession CHECK）、tools、tool_professions（junction，含 CHECK）
 * 及所有配套索引（含部分索引）。
 *
 * 正文不入库；仅存元数据、索引与用户数据。
 */
export class InitCoreSchema1700000000000 implements MigrationInterface {
  name = 'InitCoreSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // gen_random_uuid() 依赖 pgcrypto 扩展
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

    // -- 用户 --
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "email"         VARCHAR(255) UNIQUE NOT NULL,
        "password_hash" VARCHAR(255) NOT NULL,
        "display_name"  VARCHAR(100),
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // -- 文档（元数据；正文在对象存储） --
    await queryRunner.query(`
      CREATE TABLE "documents" (
        "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "owner_id"       UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "title"          VARCHAR(500) NOT NULL,
        "original_name"  VARCHAR(500),
        "encoding"       VARCHAR(20)  NOT NULL DEFAULT 'utf-8',
        "char_count"     BIGINT       NOT NULL DEFAULT 0,
        "chapter_count"  INT          NOT NULL DEFAULT 0,
        "storage_key"    VARCHAR(500) NOT NULL,
        "status"         VARCHAR(20)  NOT NULL DEFAULT 'processing',
        "deleted_at"     TIMESTAMPTZ,
        "created_at"     TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updated_at"     TIMESTAMPTZ  NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_documents_owner" ON "documents"("owner_id") WHERE "deleted_at" IS NULL;`,
    );

    // -- 章节索引 --
    await queryRunner.query(`
      CREATE TABLE "chapters" (
        "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "document_id"   UUID NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
        "idx"           INT  NOT NULL,
        "title"         VARCHAR(500),
        "char_offset"   BIGINT NOT NULL,
        "char_length"   INT    NOT NULL,
        "storage_key"   VARCHAR(500) NOT NULL,
        CONSTRAINT "uq_chapters_document_idx" UNIQUE ("document_id", "idx")
      );
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_chapters_doc" ON "chapters"("document_id");`,
    );

    // -- 阅读进度（每用户每文档一条） --
    await queryRunner.query(`
      CREATE TABLE "reading_progress" (
        "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"        UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "document_id"    UUID NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
        "chapter_idx"    INT    NOT NULL DEFAULT 0,
        "char_offset"    BIGINT NOT NULL DEFAULT 0,
        "percent"        NUMERIC(5,2) NOT NULL DEFAULT 0,
        "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_reading_progress_user_document" UNIQUE ("user_id", "document_id")
      );
    `);

    // -- 书签 --
    await queryRunner.query(`
      CREATE TABLE "bookmarks" (
        "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"      UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "document_id"  UUID NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
        "chapter_idx"  INT NOT NULL,
        "char_offset"  BIGINT NOT NULL,
        "note"         VARCHAR(500),
        "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_bookmarks_user_doc" ON "bookmarks"("user_id", "document_id");`,
    );

    // -- 便签（自动保存） --
    await queryRunner.query(`
      CREATE TABLE "memos" (
        "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"     UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "content"     TEXT NOT NULL DEFAULT '',
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_memos_user" ON "memos"("user_id");`,
    );

    // -- 假元数据（伪装层；同一文档稳定一致） --
    await queryRunner.query(`
      CREATE TABLE "fake_meta" (
        "document_id"  UUID PRIMARY KEY REFERENCES "documents"("id") ON DELETE CASCADE,
        "views"        INT NOT NULL,
        "likes"        INT NOT NULL,
        "favorites"    INT NOT NULL,
        "tags"         TEXT[] NOT NULL DEFAULT '{}',
        "column_name"  VARCHAR(200),
        "published_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "seed"         BIGINT NOT NULL
      );
    `);

    // -- 用户偏好（皮肤、阅读设置、老板键、职业等） --
    await queryRunner.query(`
      CREATE TABLE "user_preferences" (
        "user_id"      UUID PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
        "active_skin"  VARCHAR(50) NOT NULL DEFAULT 'csdn',
        "font_size"    INT NOT NULL DEFAULT 16,
        "line_height"  NUMERIC(3,1) NOT NULL DEFAULT 1.8,
        "theme"        VARCHAR(20) NOT NULL DEFAULT 'light',
        "boss_key"     VARCHAR(20) NOT NULL DEFAULT 'Escape',
        "profession"   VARCHAR(20),
        "settings"     JSONB NOT NULL DEFAULT '{}',
        "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_profession" CHECK (
          "profession" IS NULL OR
          "profession" IN ('开发','设计','运营','财务','销售','学生','其他')
        )
      );
    `);

    // -- 工具目录 --
    await queryRunner.query(`
      CREATE TABLE "tools" (
        "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "slug"         VARCHAR(64) UNIQUE NOT NULL,
        "name"         VARCHAR(200) NOT NULL,
        "category"     VARCHAR(50)  NOT NULL,
        "description"  VARCHAR(500),
        "icon"         VARCHAR(200),
        "enabled"      BOOLEAN      NOT NULL DEFAULT true,
        "created_at"   TIMESTAMPTZ  NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_tools_category" ON "tools"("category") WHERE "enabled" = true;`,
    );

    // -- 工具↔职业 多对多映射（junction table） --
    await queryRunner.query(`
      CREATE TABLE "tool_professions" (
        "tool_id"     UUID NOT NULL REFERENCES "tools"("id") ON DELETE CASCADE,
        "profession"  VARCHAR(20) NOT NULL,
        PRIMARY KEY ("tool_id", "profession"),
        CONSTRAINT "chk_tool_profession" CHECK (
          "profession" IN ('开发','设计','运营','财务','销售','学生','其他')
        )
      );
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_tool_professions_profession" ON "tool_professions"("profession");`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 反序删除，尊重外键依赖
    await queryRunner.query(`DROP TABLE IF EXISTS "tool_professions";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tools";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_preferences";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "fake_meta";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "memos";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bookmarks";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reading_progress";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chapters";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "documents";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users";`);
  }
}
