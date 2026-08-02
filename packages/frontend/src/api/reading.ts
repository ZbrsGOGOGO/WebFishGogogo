// packages/frontend/src/api/reading.ts
// 阅读引擎领域 API 客户端（对齐 backend ReadingController）。

import type { ArticleViewModel } from '@stealth-reader/shared';

import { http } from './http';

/** 章节目录项（对齐 backend ChapterTocItem）。 */
export interface ChapterTocItem {
  idx: number;
  title: string | null;
  charOffset: number;
  charLength: number;
}

/** 书签视图（对齐 backend BookmarkView）。 */
export interface Bookmark {
  id: string;
  documentId: string;
  chapterIdx: number;
  charOffset: number;
  note: string | null;
  createdAt: string;
}

/** 保存进度请求体（对齐 backend SaveProgressDto）。 */
export interface SaveProgressPayload {
  chapterIdx: number;
  charOffset: number;
  percent?: number;
}

/** 创建书签请求体（对齐 backend CreateBookmarkDto）。 */
export interface CreateBookmarkPayload {
  chapterIdx: number;
  charOffset: number;
  note?: string | null;
}

/** 客户端只上报当前可计时状态；有效时长始终由服务端计算。 */
export type ReadingSessionState = 'active' | 'hidden' | 'idle' | 'boss';

export interface ReadingSessionSnapshot {
  sessionId: string;
  state: ReadingSessionState;
  heartbeatIntervalMs: number;
  idleTimeoutMs: number;
  effectiveSeconds: number;
  qualified: boolean;
  eventQueued: boolean;
}

interface ReadingSessionWireResponse {
  id?: string;
  sessionId?: string;
  state?: ReadingSessionState;
  status?: ReadingSessionState;
  heartbeatIntervalMs?: number;
  heartbeatIntervalSeconds?: number;
  idleTimeoutMs?: number;
  idleTimeoutSeconds?: number;
  effectiveSeconds?: number;
  qualified?: boolean;
  eventQueued?: boolean;
}

const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000;
const DEFAULT_IDLE_TIMEOUT_MS = 120_000;

function positiveMilliseconds(
  milliseconds: number | undefined,
  seconds: number | undefined,
  fallback: number,
): number {
  const value =
    typeof milliseconds === 'number'
      ? milliseconds
      : typeof seconds === 'number'
        ? seconds * 1_000
        : fallback;
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

function normalizeSession(
  response: ReadingSessionWireResponse,
  fallbackState: ReadingSessionState,
): ReadingSessionSnapshot {
  const sessionId = response.sessionId ?? response.id;
  if (!sessionId) {
    throw new Error('阅读会话响应缺少 sessionId');
  }
  return {
    sessionId,
    state: response.state ?? response.status ?? fallbackState,
    heartbeatIntervalMs: positiveMilliseconds(
      response.heartbeatIntervalMs,
      response.heartbeatIntervalSeconds,
      DEFAULT_HEARTBEAT_INTERVAL_MS,
    ),
    idleTimeoutMs: positiveMilliseconds(
      response.idleTimeoutMs,
      response.idleTimeoutSeconds,
      DEFAULT_IDLE_TIMEOUT_MS,
    ),
    effectiveSeconds: Math.max(0, response.effectiveSeconds ?? 0),
    qualified: response.qualified ?? false,
    eventQueued: response.eventQueued ?? false,
  };
}

/**
 * GET /reading/:docId/article：获取伪装阅读视图。
 * _Requirements: 5.1_
 */
export function getArticle(
  docId: string,
  skin?: string,
): Promise<ArticleViewModel> {
  return http.get<ArticleViewModel>(
    `/reading/${encodeURIComponent(docId)}/article`,
    { query: { skin } },
  );
}

/**
 * PATCH /reading/:docId/progress：保存阅读进度（幂等）。
 * _Requirements: 7.1_
 */
export function saveProgress(
  docId: string,
  payload: SaveProgressPayload,
): Promise<void> {
  return http.patch<void>(
    `/reading/${encodeURIComponent(docId)}/progress`,
    payload,
  );
}

/**
 * GET /reading/:docId/chapters：按 idx 升序返回章节目录。
 * _Requirements: 8.1_
 */
export function getChapters(docId: string): Promise<ChapterTocItem[]> {
  return http.get<ChapterTocItem[]>(
    `/reading/${encodeURIComponent(docId)}/chapters`,
  );
}

/**
 * GET /reading/:docId/bookmarks：列出书签。
 * _Requirements: 8.4_
 */
export function listBookmarks(docId: string): Promise<Bookmark[]> {
  return http.get<Bookmark[]>(
    `/reading/${encodeURIComponent(docId)}/bookmarks`,
  );
}

/**
 * POST /reading/:docId/bookmarks：创建书签。
 * _Requirements: 8.3_
 */
export function createBookmark(
  docId: string,
  payload: CreateBookmarkPayload,
): Promise<Bookmark> {
  return http.post<Bookmark>(
    `/reading/${encodeURIComponent(docId)}/bookmarks`,
    payload,
  );
}

/**
 * DELETE /reading/:docId/bookmarks/:bookmarkId：删除本人书签。
 * _Requirements: 8.5_
 */
export function deleteBookmark(
  docId: string,
  bookmarkId: string,
): Promise<void> {
  return http.delete<void>(
    `/reading/${encodeURIComponent(docId)}/bookmarks/${encodeURIComponent(
      bookmarkId,
    )}`,
  );
}

export async function startReadingSession(
  documentId: string,
  clientSessionId: string,
  state: ReadingSessionState,
): Promise<ReadingSessionSnapshot> {
  const response = await http.post<ReadingSessionWireResponse>(
    '/v1/reading/sessions',
    { documentId, clientSessionId, state },
  );
  return normalizeSession(response, state);
}

export async function heartbeatReadingSession(
  sessionId: string,
  sequence: number,
  state: ReadingSessionState,
): Promise<ReadingSessionSnapshot> {
  const response = await http.post<ReadingSessionWireResponse>(
    `/v1/reading/sessions/${encodeURIComponent(sessionId)}/heartbeat`,
    { sequence, state },
  );
  return normalizeSession(response, state);
}

export async function endReadingSession(
  sessionId: string,
  sequence: number,
  state: ReadingSessionState,
): Promise<ReadingSessionSnapshot> {
  const response = await http.post<ReadingSessionWireResponse>(
    `/v1/reading/sessions/${encodeURIComponent(sessionId)}/end`,
    { sequence, state },
    { keepalive: true },
  );
  return normalizeSession(response, state);
}

export const readingApi = {
  getArticle,
  saveProgress,
  getChapters,
  listBookmarks,
  createBookmark,
  deleteBookmark,
  startSession: startReadingSession,
  heartbeatSession: heartbeatReadingSession,
  endSession: endReadingSession,
};
