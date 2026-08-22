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
      startSession: vi.fn(),
      heartbeatSession: vi.fn(),
      endSession: vi.fn(),
    },
  };
});

const getArticleMock = readingApi.getArticle as unknown as ReturnType<
  typeof vi.fn
>;
const startSessionMock = readingApi.startSession as unknown as ReturnType<
  typeof vi.fn
>;
const endSessionMock = readingApi.endSession as unknown as ReturnType<
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
    startSessionMock.mockReset();
    endSessionMock.mockReset();
    startSessionMock.mockResolvedValue({
      sessionId: 'session-1',
      state: 'active',
      heartbeatIntervalMs: 15_000,
      idleTimeoutMs: 120_000,
      effectiveSeconds: 0,
      qualified: false,
      eventQueued: false,
    });
    endSessionMock.mockResolvedValue({
      sessionId: 'session-1',
      state: 'active',
      heartbeatIntervalMs: 15_000,
      idleTimeoutMs: 120_000,
      effectiveSeconds: 0,
      qualified: false,
      eventQueued: false,
    });
    document.title = '';
  });

  it('renders the article and sets a blog-style tab title (Req 5.3)', async () => {
    getArticleMock.mockResolvedValue(makeArticle());
    renderReaderAt('d1');

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Redis 高可用架构实践' }),
      ).toBeInTheDocument();
      expect(document.title).toBe(
        'Redis 高可用架构实践 - ZBRS 阅读工作台',
      );
    });

    expect(getArticleMock).toHaveBeenCalledWith('d1', undefined);
    expect(await screen.findByText('有效阅读计时中')).toBeInTheDocument();
    expect(startSessionMock).toHaveBeenCalledWith(
      'd1',
      expect.any(String),
      'active',
    );
  });

  it('shows a forbidden message without leaking existence (Req 12.2)', async () => {
    const { ApiError } = await import('../../api');
    getArticleMock.mockRejectedValue(new ApiError(403, 'Forbidden'));
    renderReaderAt('other-user-doc');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        '当前账户没有访问权限',
      );
    });
    expect(startSessionMock).not.toHaveBeenCalled();
  });
});
