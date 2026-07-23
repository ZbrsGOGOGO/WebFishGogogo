import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ArticleViewModel } from '@stealth-reader/shared';

import { ReaderPage } from './ReaderPage';
import { readingApi } from '../../api';

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    readingApi: {
      ...actual.readingApi,
      getArticle: vi.fn(),
    },
  };
});

const getArticleMock = readingApi.getArticle as unknown as ReturnType<
  typeof vi.fn
>;

function makeArticle(): ArticleViewModel {
  return {
    articleTitle: 'Redis 高可用架构实践',
    htmlBody: '<p>正文段落。</p>',
    fakeMeta: {
      views: 999,
      likes: 12,
      favorites: 5,
      tags: ['Redis', '架构'],
      columnName: '中间件',
      publishedAt: '2024-05-10T00:00:00.000Z',
    },
    progress: { documentId: 'd1', chapterIdx: 0, charOffset: 0, percent: 0 },
    skinId: 'csdn',
  };
}

function renderReaderAt(docId: string) {
  return render(
    <MemoryRouter initialEntries={[`/blog/article/${docId}`]}>
      <Routes>
        <Route path="/blog/article/:docId" element={<ReaderPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ReaderPage (Req 5.1, 5.3)', () => {
  beforeEach(() => {
    getArticleMock.mockReset();
    document.title = '';
  });

  it('renders the article and sets a blog-style tab title (Req 5.3)', async () => {
    getArticleMock.mockResolvedValue(makeArticle());
    renderReaderAt('d1');

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Redis 高可用架构实践' }),
      ).toBeInTheDocument();
    });

    expect(getArticleMock).toHaveBeenCalledWith('d1', undefined);
    expect(document.title).toBe('Redis 高可用架构实践_CSDN博客');
  });

  it('shows a forbidden message without leaking existence (Req 12.2)', async () => {
    const { ApiError } = await import('../../api');
    getArticleMock.mockRejectedValue(new ApiError(403, 'Forbidden'));
    renderReaderAt('other-user-doc');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('无权访问该内容');
    });
  });
});
