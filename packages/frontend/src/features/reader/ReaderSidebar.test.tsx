import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { ReaderSidebar } from './ReaderSidebar';
import type { Bookmark, ChapterTocItem } from '../../api';
import type { UseReaderSidebarResult } from './useReaderSidebar';

function makeChapters(): ChapterTocItem[] {
  return [
    { idx: 0, title: '第一章 开端', charOffset: 0, charLength: 100 },
    { idx: 1, title: '第二章 发展', charOffset: 100, charLength: 120 },
    { idx: 2, title: null, charOffset: 220, charLength: 80 },
  ];
}

function makeBookmarks(): Bookmark[] {
  return [
    {
      id: 'b1',
      documentId: 'd1',
      chapterIdx: 1,
      charOffset: 42,
      note: '重要段落',
      createdAt: '2024-05-10T08:30:00.000Z',
    },
  ];
}

function makeSidebar(
  overrides: Partial<UseReaderSidebarResult> = {},
): UseReaderSidebarResult {
  return {
    chapters: makeChapters(),
    bookmarks: makeBookmarks(),
    loading: false,
    error: null,
    addBookmark: vi.fn().mockResolvedValue(undefined),
    removeBookmark: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn(),
    ...overrides,
  };
}

describe('ReaderSidebar (Req 8.1-8.5)', () => {
  it('lists chapters in idx order and jumps on click (Req 8.1, 8.2)', () => {
    const onJumpToChapter = vi.fn();
    render(
      <ReaderSidebar
        sidebar={makeSidebar()}
        currentPosition={{ chapterIdx: 0, charOffset: 0 }}
        onJumpToChapter={onJumpToChapter}
        onJumpToBookmark={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '第二章 发展' }));
    expect(onJumpToChapter).toHaveBeenCalledWith(
      expect.objectContaining({ idx: 1 }),
    );
  });

  it('creates a bookmark at the current position (Req 8.3)', () => {
    const sidebar = makeSidebar();
    render(
      <ReaderSidebar
        sidebar={sidebar}
        currentPosition={{ chapterIdx: 2, charOffset: 15 }}
        onJumpToChapter={vi.fn()}
        onJumpToBookmark={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '+ 添加书签' }));
    expect(sidebar.addBookmark).toHaveBeenCalledWith({
      chapterIdx: 2,
      charOffset: 15,
    });
  });

  it('jumps to a bookmark when selected (Req 8.4)', () => {
    const onJumpToBookmark = vi.fn();
    render(
      <ReaderSidebar
        sidebar={makeSidebar()}
        currentPosition={{ chapterIdx: 0, charOffset: 0 }}
        onJumpToChapter={vi.fn()}
        onJumpToBookmark={onJumpToBookmark}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /重要段落/ }));
    expect(onJumpToBookmark).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'b1', chapterIdx: 1, charOffset: 42 }),
    );
  });

  it('deletes a bookmark (Req 8.5)', () => {
    const sidebar = makeSidebar();
    render(
      <ReaderSidebar
        sidebar={sidebar}
        currentPosition={{ chapterIdx: 0, charOffset: 0 }}
        onJumpToChapter={vi.fn()}
        onJumpToBookmark={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '删除书签' }));
    expect(sidebar.removeBookmark).toHaveBeenCalledWith('b1');
  });

  it('shows empty states when there are no chapters or bookmarks', () => {
    render(
      <ReaderSidebar
        sidebar={makeSidebar({ chapters: [], bookmarks: [] })}
        currentPosition={{ chapterIdx: 0, charOffset: 0 }}
        onJumpToChapter={vi.fn()}
        onJumpToBookmark={vi.fn()}
      />,
    );

    expect(screen.getByText('暂无章节')).toBeInTheDocument();
    expect(screen.getByText('暂无书签')).toBeInTheDocument();
  });
});
