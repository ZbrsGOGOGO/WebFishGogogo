// packages/frontend/src/api/tools.ts
// 工具页领域 API 客户端（对齐 backend ToolsController）。

import type {
  Profession,
  Tool,
  ToolRecommendation,
} from '@stealth-reader/shared';

import { http } from './http';

/** 工具筛选/搜索结果（对齐 backend ToolListResult）。 */
export interface ToolListResult {
  tools: Tool[];
  noMatch: boolean;
  message: string | null;
}

/** 工具启动结果（对齐 backend ToolLaunchResult）。 */
export interface ToolLaunchResult {
  toolId: string;
  slug: string;
  available: boolean;
}

/** 工具列表 / 筛选查询。 */
export interface ToolsQuery {
  category?: string;
  q?: string;
}

/**
 * GET /tools 或 GET /tools?category=&q=
 *
 * 无筛选参数时后端返回 Tool[]（全部可用工具，Req 14.1）；
 * 带 category / q 时返回 ToolListResult（含无匹配提示，Req 14.3/14.4）。
 * _Requirements: 14.1, 14.3, 14.4_
 */
export function listTools(
  query: ToolsQuery = {},
): Promise<Tool[] | ToolListResult> {
  return http.get<Tool[] | ToolListResult>('/tools', {
    query: { category: query.category, q: query.q },
  });
}

/**
 * GET /tools/recommend?profession=
 *
 * 提供 profession 时选择并持久化职业后推荐（Req 14.2/14.6）；
 * 不提供时使用已持久化职业推荐，未设置职业时后端返回 null（Req 14.7）。
 * _Requirements: 14.2, 14.6, 14.7_
 */
export function recommendTools(
  profession?: Profession,
): Promise<ToolRecommendation | null> {
  return http.get<ToolRecommendation | null>('/tools/recommend', {
    query: { profession },
  });
}

/**
 * POST /tools/:id/launch：启动指定工具并返回其可用状态。
 * _Requirements: 14.5_
 */
export function launchTool(id: string): Promise<ToolLaunchResult> {
  return http.post<ToolLaunchResult>(
    `/tools/${encodeURIComponent(id)}/launch`,
  );
}

export const toolsApi = { listTools, recommendTools, launchTool };
