import type { MigrationInterface, QueryRunner } from 'typeorm';

/** 可堆叠道具目录、背包余额与不可变流水。 */
export class AddInventoryFoundation1700000000003
  implements MigrationInterface
{
  name = 'AddInventoryFoundation1700000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "item_definitions" (
        "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "slug"        VARCHAR(64) NOT NULL UNIQUE,
        "name"        VARCHAR(200) NOT NULL,
        "category"    VARCHAR(50) NOT NULL,
        "stackable"   BOOLEAN NOT NULL DEFAULT true,
        "metadata"    JSONB NOT NULL DEFAULT '{}',
        "enabled"     BOOLEAN NOT NULL DEFAULT true,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "inventory_stacks" (
        "user_id"     UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "item_id"     UUID NOT NULL REFERENCES "item_definitions"("id") ON DELETE RESTRICT,
        "quantity"    BIGINT NOT NULL DEFAULT 0,
        "version"     INT NOT NULL DEFAULT 1,
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY ("user_id", "item_id"),
        CONSTRAINT "chk_inventory_stack_quantity" CHECK ("quantity" >= 0)
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "inventory_ledger" (
        "id"                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"           UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "item_id"           UUID NOT NULL REFERENCES "item_definitions"("id") ON DELETE RESTRICT,
        "delta"             BIGINT NOT NULL,
        "quantity_after"    BIGINT NOT NULL,
        "source_type"       VARCHAR(50) NOT NULL,
        "source_id"         VARCHAR(100) NOT NULL,
        "reason"            VARCHAR(100) NOT NULL,
        "idempotency_key"   VARCHAR(200) NOT NULL UNIQUE,
        "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_inventory_ledger_delta" CHECK ("delta" <> 0),
        CONSTRAINT "chk_inventory_ledger_quantity_after"
          CHECK ("quantity_after" >= 0)
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_inventory_ledger_user_created"
      ON "inventory_ledger" ("user_id", "created_at" DESC);
    `);

    await queryRunner.query(`
      INSERT INTO "item_definitions"
        ("slug", "name", "category", "stackable", "metadata")
      VALUES
        ('seed_wheat', '小麦种子', 'farm_seed', true, '{"cropSlug":"wheat"}'),
        ('seed_strawberry', '草莓种子', 'farm_seed', true, '{"cropSlug":"strawberry"}'),
        ('seed_coffee', '咖啡豆种子', 'farm_seed', true, '{"cropSlug":"coffee"}')
      ON CONFLICT ("slug") DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "inventory_ledger";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "inventory_stacks";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "item_definitions";`);
  }
}
