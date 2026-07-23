// packages/frontend/src/api/skin.ts
// 伪装/皮肤领域 API 客户端（对齐 backend SkinController）。

import { http } from './http';

/** 皮肤概要（对齐 backend SkinSummary）。 */
export interface SkinSummary {
  id: string;
  displayName: string;
}

/**
 * GET /skins：列出所有可用皮肤概要。公开端点（无用户数据）。
 * _Requirements: 5.1_
 */
export function listSkins(): Promise<SkinSummary[]> {
  return http.get<SkinSummary[]>('/skins', { auth: false });
}

export const skinApi = { listSkins };
