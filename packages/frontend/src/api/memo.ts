// packages/frontend/src/api/memo.ts
// 便签领域 API 客户端（对齐 backend MemoController）。

import { http } from './http';

/** 便签内容视图（对齐 backend MemoContent）。 */
export interface MemoContent {
  content: string;
  updatedAt: string | null;
}

/**
 * GET /memo：恢复当前用户上次保存的便签内容。
 * _Requirements: 10.2_
 */
export function getMemo(): Promise<MemoContent> {
  return http.get<MemoContent>('/memo');
}

/**
 * PUT /memo：保存当前用户便签最新内容（防抖由 UI 层负责）。
 * _Requirements: 10.1_
 */
export function saveMemo(content: string): Promise<MemoContent> {
  return http.put<MemoContent>('/memo', { content });
}

export const memoApi = { getMemo, saveMemo };
