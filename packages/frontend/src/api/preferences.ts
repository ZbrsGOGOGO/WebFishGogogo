// packages/frontend/src/api/preferences.ts
// 用户偏好领域 API 客户端（对齐 backend PreferencesController）。

import type { Profession } from '@stealth-reader/shared';

import { http } from './http';

/**
 * 用户偏好视图（对齐 backend UserPreference 实体）。
 * lineHeight 为 numeric，后端以字符串返回。
 */
export interface UserPreferences {
  userId: string;
  activeSkin: string;
  fontSize: number;
  lineHeight: string;
  theme: string;
  bossKey: string;
  profession: Profession | null;
  settings: Record<string, unknown>;
  updatedAt: string;
}

/** 偏好部分更新请求体（对齐 backend UpdatePreferencesDto）。 */
export interface UpdatePreferencesPayload {
  activeSkin?: string;
  fontSize?: number;
  lineHeight?: number | string;
  theme?: string;
  bossKey?: string;
  profession?: Profession | null;
  settings?: Record<string, unknown>;
}

/**
 * GET /preferences：读取当前用户偏好（无记录时后端返回默认值）。
 * _Requirements: 6.4_
 */
export function getPreferences(): Promise<UserPreferences> {
  return http.get<UserPreferences>('/preferences');
}

/**
 * PUT /preferences：部分更新偏好（含 profession 持久化）。
 * _Requirements: 6.4, 9.4, 14.6_
 */
export function updatePreferences(
  payload: UpdatePreferencesPayload,
): Promise<UserPreferences> {
  return http.put<UserPreferences>('/preferences', payload);
}

export const preferencesApi = { getPreferences, updatePreferences };
