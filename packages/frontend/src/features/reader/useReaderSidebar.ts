// packages/frontend/src/features/reader/useReaderSidebar.ts
// 章节目录与书签数据 hook（任务 16.4）。
//
// 职责：
// - 加载某文档按 idx 升序排列的章节目录（Req 8.1）。
// - 加载该文档的书签列表（Req 8.4）。
// - 在当前阅读位置创建书签（Req 8.3）。
// - 删除本人书签（Req 8.5）。
//
// 说明：
// - 该 hook 只负责数据获取与写操作编排，跳转（Req 8.2/8.4）由 ReaderPage 通过
//   reportProgress 落实到阅读位置，因此不在此处理导航。
// - 章节列表在 hook 内再次按 idx 升序排序，保证展示顺序稳定（对齐后端 Req 8.1）。

import { useCallback, useEffect, useRef, useState } from 'react';

import { readingApi, type Bookmark, type ChapterTocItem } from '../../api';

/** 创建书签时需要的当前阅读位置。 */
export interface BookmarkPosition {
  chapterIdx: number;
  charOffset: number;
  note?: string | null;
}

export interface UseReaderSidebarResult {
  /** 按 idx 升序排列的章节目录（Req 8.1）。 */
  chapters: ChapterTocItem[];
  /** 该文档的书签列表（Req 8.4）。 */
  bookmarks: Bookmark[];
  /** 章节/书签是否加载中。 */
  loading: boolean;
  /** 人类可读错误信息；无错误为 null。 */
  error: string | null;
  /** 在给定位置创建书签并刷新列表（Req 8.3）。 */
  addBookmark: (position: BookmarkPosition) => Promise<void>;
  /** 删除指定书签并刷新列表（Req 8.5）。 */
  removeBookmark: (bookmarkId: string) => Promise<void>;
  /** 手动重新拉取章节与书签。 */
  reload: () => void;
}

/** 按 idx 升序返回章节目录副本（不修改入参）。 */
function sortByIdx(chapters: ChapterTocItem[]): ChapterTocItem[] {
  return [...chapters].sort((a, b) => a.idx - b.idx);
}

/**
 * 加载并管理某文档的章节目录与书签。
 *
 * @param docId 文档 ID；为 undefined 时不发起请求。
 */
export function useReaderSidebar(
  docId: string | undefined,
): UseReaderSidebarResult {
  const [chapters, setChapters] = useState<ChapterTocItem[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState<boolean>(Boolean(docId));
  const [error, setError] = useState<string | null>(null);

  // 记录最近一次生效的 docId，避免异步返回错乱到已切换的文档。
  const activeDocRef = useRef<string | undefined>(docId);

  const refreshBookmarks = useCallback(async () => {
    if (!docId) return;
    const list = await readingApi.listBookmarks(docId);
    if (activeDocRef.current === docId) {
      setBookmarks(list);
    }
  }, [docId]);

  const load = useCallback(() => {
    if (!docId) {
      setChapters([]);
      setBookmarks([]);
      setLoading(false);
      setError(null);
      return () => {};
    }

    let cancelled = false;
    activeDocRef.current = docId;
    setLoading(true);
    setError(null);

    Promise.all([
      readingApi.getChapters(docId),
      readingApi.listBookmarks(docId),
    ])
      .then(([chapterList, bookmarkList]) => {
        if (cancelled) return;
        setChapters(sortByIdx(chapterList));
        setBookmarks(bookmarkList);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '目录/书签加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [docId]);

  useEffect(() => load(), [load]);

  const addBookmark = useCallback(
    async (position: BookmarkPosition) => {
      if (!docId) return;
      await readingApi.createBookmark(docId, {
        chapterIdx: position.chapterIdx,
        charOffset: position.charOffset,
        note: position.note ?? null,
      });
      await refreshBookmarks();
    },
    [docId, refreshBookmarks],
  );

  const removeBookmark = useCallback(
    async (bookmarkId: string) => {
      if (!docId) return;
      await readingApi.deleteBookmark(docId, bookmarkId);
      await refreshBookmarks();
    },
    [docId, refreshBookmarks],
  );

  const reload = useCallback(() => {
    load();
  }, [load]);

  return {
    chapters,
    bookmarks,
    loading,
    error,
    addBookmark,
    removeBookmark,
    reload,
  };
}
