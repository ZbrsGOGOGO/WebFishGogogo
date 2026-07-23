/**
 * POST /reading/:docId/bookmarks 请求体：在当前位置创建书签（Req 8.3）。
 *
 * documentId 由路由参数 :docId 提供。note 为可选备注。
 */
export interface CreateBookmarkDto {
  chapterIdx: number;
  charOffset: number;
  note?: string | null;
}
