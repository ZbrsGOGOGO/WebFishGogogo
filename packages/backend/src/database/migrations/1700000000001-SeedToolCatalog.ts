import type { MigrationInterface, QueryRunner } from 'typeorm';

import { TOOL_CATALOG_SEED } from '../../modules/tools/tool-catalog.seed';

/**
 * 工具目录种子迁移。
 *
 * 写入人工精选的自有、合规实用小工具（下班倒计时、计时器、日期计算、计算器、
 * 汇率换算、单位/格式转换、文本处理、字数统计、JSON 格式化、时间戳转换、
 * 正则测试、颜色转换）及其职业标签映射（tool_professions）。
 *
 * 合规基线（requirements.md Req 14.8）：仅收录合规实用工具，
 * 绝不收录任何赌博、博彩、盗版或违法玩法工具。
 *
 * 幂等性：按 slug 冲突时跳过（ON CONFLICT DO NOTHING），可安全重复执行。
 */
export class SeedToolCatalog1700000000001 implements MigrationInterface {
  name = 'SeedToolCatalog1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const tool of TOOL_CATALOG_SEED) {
      const rows: Array<{ id: string }> = await queryRunner.query(
        `INSERT INTO "tools" ("slug", "name", "category", "description", "icon", "enabled")
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT ("slug") DO NOTHING
         RETURNING "id";`,
        [tool.slug, tool.name, tool.category, tool.description, tool.icon],
      );

      // slug 已存在时 RETURNING 为空，回查其 id 以补齐职业映射。
      let toolId: string | undefined = rows[0]?.id;
      if (!toolId) {
        const existing: Array<{ id: string }> = await queryRunner.query(
          `SELECT "id" FROM "tools" WHERE "slug" = $1;`,
          [tool.slug],
        );
        toolId = existing[0]?.id;
      }
      if (!toolId) continue;

      for (const profession of tool.professions) {
        await queryRunner.query(
          `INSERT INTO "tool_professions" ("tool_id", "profession")
           VALUES ($1, $2)
           ON CONFLICT ("tool_id", "profession") DO NOTHING;`,
          [toolId, profession],
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const slugs = TOOL_CATALOG_SEED.map((t) => t.slug);
    // tool_professions 通过 ON DELETE CASCADE 随 tools 删除
    await queryRunner.query(`DELETE FROM "tools" WHERE "slug" = ANY($1);`, [
      slugs,
    ]);
  }
}
