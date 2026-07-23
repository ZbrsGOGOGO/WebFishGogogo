// packages/frontend/src/features/library/LibraryPage.tsx
// 文档库页面：编排上传、搜索、分页列表与删除。
//
// _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3, 3.4, 13.1_

import { useCallback, useEffect, useState, type JSX } from 'react';
import type { DocumentMeta } from '@stealth-reader/shared';
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from '@stealth-reader/shared';

import { ApiError, documentsApi } from '../../api';
import { DocumentList } from './DocumentList';
import { DocumentSearch } from './DocumentSearch';
import { DocumentUpload } from './DocumentUpload';

export function LibraryPage(): JSX.Element {
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(DEFAULT_PAGE);
  const [pageSize] = useState(DEFAULT_PAGE_SIZE);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDocuments = useCallback(
    async (nextPage: number, keyword: string): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const result = await documentsApi.listDocuments({
          page: nextPage,
          pageSize,
          q: keyword || undefined,
        });
        setDocuments(result.items);
        setTotal(result.total);
        setPage(result.page);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : '加载文档库失败');
      } finally {
        setLoading(false);
      }
    },
    [pageSize],
  );

  useEffect(() => {
    void loadDocuments(page, query);
    // 仅在页码或搜索关键字变化时重新加载。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, query]);

  const handleSearch = useCallback((keyword: string): void => {
    // 搜索时回到第一页（Req 3.2/3.3）。
    setPage(DEFAULT_PAGE);
    setQuery(keyword);
  }, []);

  const handlePageChange = useCallback((nextPage: number): void => {
    setPage(nextPage);
  }, []);

  const handleUploaded = useCallback((): void => {
    // 上传成功后回到第一页并刷新列表。
    setQuery('');
    setPage(DEFAULT_PAGE);
    void loadDocuments(DEFAULT_PAGE, '');
  }, [loadDocuments]);

  const handleDelete = useCallback(
    async (id: string): Promise<void> => {
      try {
        await documentsApi.deleteDocument(id);
        // 软删除后刷新当前页（Req 3.4）。
        await loadDocuments(page, query);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : '删除失败');
      }
    },
    [loadDocuments, page, query],
  );

  return (
    <section aria-labelledby="library-title">
      <h1 id="library-title">文档库</h1>

      <DocumentUpload onUploaded={handleUploaded} />

      <DocumentSearch value={query} onSearch={handleSearch} />

      {error ? (
        <p role="alert" style={{ color: 'crimson' }}>
          {error}
        </p>
      ) : null}

      <DocumentList
        documents={documents}
        total={total}
        page={page}
        pageSize={pageSize}
        loading={loading}
        onPageChange={handlePageChange}
        onDelete={handleDelete}
      />
    </section>
  );
}
