// packages/frontend/src/features/reader/ReaderSidebar.tsx
// 阅读侧栏：章节目录 + 书签（任务 16.4）。挂载到 ReaderPage 的 sidebarSlot
// （CsdnSkin 右侧信息栏）。
//
// 功能与需求映射：
// - 展示按 idx 升序的章节目录，点击跳转到该章节起始处（Req 8.1 / 8.2）。
// - 在当前阅读位置创建书签（Req 8.3）。
// - 列出书签并点击跳转到书签记录的章节序号与偏移处（Req 8.4）。
// - 删除本人书签（Req 8.5）。
//
// 该组件为纯呈现 + 交互，数据与写操作由 useReaderSidebar 提供；跳转通过
// onJumpToChapter / onJumpToBookmark 回调交回 ReaderPage 落实到阅读位置。

import type { JSX } from 'react';

import type { Bookmark, ChapterTocItem } from '../../api';
import styles from './reader-sidebar.module.css';
import type { BookmarkPosition, UseReaderSidebarResult } from './useReaderSidebar';

export interface ReaderSidebarProps {
  /** 由 {@link useReaderSidebar} 提供的章节/书签数据与操作。 */
  sidebar: UseReaderSidebarResult;
  /** 当前所在章节序号，用于在目录中高亮。 */
  currentChapterIdx?: number;
  /** 创建书签所需的当前阅读位置（Req 8.3）。 */
  currentPosition: BookmarkPosition;
  /** 跳转到某章节起始处（Req 8.2）。 */
  onJumpToChapter: (chapter: ChapterTocItem) => void;
  /** 跳转到某书签记录的位置（Req 8.4）。 */
  onJumpToBookmark: (bookmark: Bookmark) => void;
}

/** 将 ISO 时间格式化为 "MM-DD HH:mm" 简短展示。 */
function formatCreatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** 书签展示标题：优先备注，其次章节/偏移信息。 */
function bookmarkLabel(bookmark: Bookmark): string {
  if (bookmark.note && bookmark.note.trim().length > 0) {
    return bookmark.note;
  }
  return `第 ${bookmark.chapterIdx + 1} 章 · 位置 ${bookmark.charOffset}`;
}

export function ReaderSidebar({
  sidebar,
  currentChapterIdx,
  currentPosition,
  onJumpToChapter,
  onJumpToBookmark,
}: ReaderSidebarProps): JSX.Element {
  const { chapters, bookmarks, error, addBookmark, removeBookmark } = sidebar;

  const handleAddBookmark = () => {
    void addBookmark(currentPosition);
  };

  const handleRemoveBookmark = (bookmarkId: string) => {
    void removeBookmark(bookmarkId);
  };

  return (
    <div className={styles.sidebar} data-testid="reader-sidebar">
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}

      {/* 章节目录（Req 8.1 / 8.2） */}
      <section className={styles.panel} aria-label="章节目录">
        <header className={styles.panelHeader}>
          <span className={styles.panelTitle}>目录</span>
        </header>
        {chapters.length === 0 ? (
          <p className={styles.empty}>暂无章节</p>
        ) : (
          <ul className={styles.list}>
            {chapters.map((chapter) => (
              <li key={chapter.idx} className={styles.item}>
                <button
                  type="button"
                  className={styles.chapterBtn}
                  data-active={chapter.idx === currentChapterIdx}
                  onClick={() => onJumpToChapter(chapter)}
                  title={chapter.title ?? `第 ${chapter.idx + 1} 章`}
                >
                  {chapter.title ?? `第 ${chapter.idx + 1} 章`}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 书签（Req 8.3 / 8.4 / 8.5） */}
      <section className={styles.panel} aria-label="书签">
        <header className={styles.panelHeader}>
          <span className={styles.panelTitle}>书签</span>
          <button
            type="button"
            className={styles.addBtn}
            onClick={handleAddBookmark}
          >
            + 添加书签
          </button>
        </header>
        {bookmarks.length === 0 ? (
          <p className={styles.empty}>暂无书签</p>
        ) : (
          <ul className={styles.list}>
            {bookmarks.map((bookmark) => (
              <li key={bookmark.id} className={styles.item}>
                <button
                  type="button"
                  className={styles.bookmarkBtn}
                  onClick={() => onJumpToBookmark(bookmark)}
                  title={bookmarkLabel(bookmark)}
                >
                  {bookmarkLabel(bookmark)}
                  <span className={styles.bookmarkMeta}>
                    {' '}
                    · {formatCreatedAt(bookmark.createdAt)}
                  </span>
                </button>
                <button
                  type="button"
                  className={styles.deleteBtn}
                  aria-label="删除书签"
                  onClick={() => handleRemoveBookmark(bookmark.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
