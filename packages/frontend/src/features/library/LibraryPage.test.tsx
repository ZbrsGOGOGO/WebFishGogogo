import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { documentsApi } from '../../api';
import { LibraryPage } from './LibraryPage';

const readyDocument = {
  id: 'doc-1',
  ownerId: 'user-1',
  title: '前端架构手册.txt',
  encoding: 'utf-8',
  charCount: 12_600,
  chapterCount: 8,
  status: 'ready' as const,
  createdAt: '2026-07-24T08:00:00.000Z',
};

describe('LibraryPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the document workspace and ready document metadata', async () => {
    vi.spyOn(documentsApi, 'listDocuments').mockResolvedValue({
      items: [readyDocument],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    render(
      <MemoryRouter>
        <LibraryPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: '我的文档' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('前端架构手册.txt')).toBeInTheDocument();
    expect(screen.getByText('12,600')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '开始阅读' })).toHaveAttribute(
      'href',
      '/blog/article/doc-1',
    );
  });

  it('searches by title and resets to the first page', async () => {
    const listSpy = vi.spyOn(documentsApi, 'listDocuments').mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });

    render(
      <MemoryRouter>
        <LibraryPage />
      </MemoryRouter>,
    );

    await screen.findByText('这里还没有文档');
    fireEvent.change(screen.getByLabelText('搜索标题'), {
      target: { value: '架构' },
    });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));

    await waitFor(() =>
      expect(listSpy).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 20,
        q: '架构',
      }),
    );
    expect(screen.getByText(/正在查看与“架构”相关的结果/)).toBeInTheDocument();
  });
});
