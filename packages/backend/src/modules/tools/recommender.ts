// backend/src/modules/tools/recommender.ts
// 工具页核心逻辑：职业化推荐与筛选/搜索的无副作用纯函数。
// 对齐 design.md 6.3.5 与 Correctness Property 7 / 8（Requirements 14.2, 14.3, 14.8）。

import type { Profession, Tool, ToolQuery } from '@stealth-reader/shared';

/**
 * 规整字符串用于名称关键字模糊匹配：去除首尾空白、折叠内部空白、统一小写。
 * 使得 "  Word  Count " 与 "word count" 语义等价。
 */
function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * 依据职业从工具目录中推荐相关工具。
 * Postconditions:
 *   - 返回集合中每个 tool 都满足 tool.professions.includes(profession)
 *   - 返回集合中每个 tool 都满足 tool.enabled === true
 *   - 返回集合是 catalog 的子集（不臆造工具）
 *   - 无副作用（不修改 catalog）
 */
export function recommendTools(catalog: Tool[], profession: Profession): Tool[] {
  return catalog.filter(
    (tool) => tool.enabled === true && tool.professions.includes(profession),
  );
}

/**
 * 按分类 / 名称关键字筛选工具目录。
 * 查询谓词 matches(tool, q):
 *   (q.category 未提供 或 tool.category === q.category)
 *   AND (q.query 未提供 或 normalize(tool.name).includes(normalize(q.query)))
 * Postconditions:
 *   - 返回集合中每个 tool 都满足 matches(tool, q) === true
 *   - catalog 中所有满足 matches 的工具都出现在返回集合中（不漏）
 *   - 返回集合是 catalog 的子集，无重复（Array.prototype.filter 保持元素唯一性与顺序）
 *   - 无副作用（不修改 catalog）
 */
export function filterTools(catalog: Tool[], q: ToolQuery): Tool[] {
  const normalizedQuery = q.query === undefined ? undefined : normalize(q.query);

  return catalog.filter((tool) => {
    const categoryMatches =
      q.category === undefined || tool.category === q.category;
    const queryMatches =
      normalizedQuery === undefined ||
      normalize(tool.name).includes(normalizedQuery);
    return categoryMatches && queryMatches;
  });
}
