// packages/shared/src/types/tool.ts
// 对齐 design.md 6.1 与 requirements.md Requirement 14

// 受支持职业集合（与 requirements.md Requirement 14 一致）
export enum Profession {
  Dev = '开发',
  Design = '设计',
  Ops = '运营',
  Finance = '财务',
  Sales = '销售',
  Student = '学生',
  Other = '其他',
}

// 工具目录中的单个工具（自有合规实用小工具）
export interface Tool {
  id: string;
  slug: string; // 稳定 key，前端据此加载工具组件
  name: string;
  category: string;
  description: string | null;
  icon: string | null;
  enabled: boolean;
  professions: Profession[]; // 该工具的职业标签集合（来自 tool_professions）
}

// 工具筛选 / 搜索查询
export interface ToolQuery {
  category?: string; // 按分类精确匹配
  query?: string; // 按名称关键字模糊匹配（大小写/空白规整后包含）
}

// 职业化推荐结果
export interface ToolRecommendation {
  profession: Profession;
  tools: Tool[]; // 每个工具的 professions 均包含 profession
}
