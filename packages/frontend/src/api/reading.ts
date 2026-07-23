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

export const readingApi = {
  getArticle,
  saveProgress,
  getChapters,
  listBookmarks,
  createBookmark,
  deleteBookmark,
};
