// packages/frontend/src/features/library/LibraryPage.tsx
// 文档库页面：编排上传、搜索、分页列表与删除。
//
// _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3, 3.4, 13.1_

import { useCallback, useEffect, useState, type JSX } from 'react';
import type { DocumentMeta } from '@stealth-reader/shared';
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from '@stealth-reader/shared';

import { ApiError, documentsApi } from '../../api';
import { Button, Card, Modal, PageHeader } from '../../components/ui';
import { DocumentList } from './DocumentList';
import { DocumentSearch } from './DocumentSearch';
import { DocumentUpload } from './DocumentUpload';
import styles from './LibraryPage.module.css';

export function LibraryPage(): JSX.Element {
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(DEFAULT_PAGE);
  const [pageSize] = useState(DEFAULT_PAGE_SIZE);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const loadDocuments = useCallback(
    async (
      nextPage: number,
      keyword: string,
      silent = false,
    ): Promise<void> => {
      if (!silent) setLoading(true);
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
        if (!silent) setLoading(false);
      }
    },
    [pageSize],
  );

  useEffect(() => {
    void loadDocuments(page, query);
    // 仅在页码或搜索关键字变化时重新加载。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, query]);

  useEffect(() => {
    if (!documents.some((document) => document.status === 'processing')) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      void loadDocuments(page, query, true);
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [documents, loadDocuments, page, query]);

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
    setUploadOpen(false);
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

  const readyCount = documents.filter(
    (document) => document.status === 'ready',
  ).length;

  return (
    <section aria-label="文档库">
      <PageHeader
        title="我的文档"
        subtitle="查找资料、继续阅读，进度与书签会自动保存在本机账户中。"
        actions={
          <div className={styles.headerActions}>
            <dl className={styles.headerStats} aria-label="文档统计">
              <div>
                <dt>全部</dt>
                <dd>{total}</dd>
              </div>
              <div>
                <dt>可阅读</dt>
                <dd>{readyCount}</dd>
              </div>
            </dl>
            <Button onClick={() => setUploadOpen(true)}>+ 导入文档</Button>
          </div>
        }
      />

      <Card className={styles.libraryCard}>
        <div className={styles.libraryToolbar}>
          <div>
            <span className={styles.eyebrow}>私人资料库</span>
            <h2>{query ? '搜索结果' : '全部文档'}</h2>
            <p>
              {query
                ? `正在查看与“${query}”相关的结果`
                : '按标题快速查找，并从上次进度继续阅读。'}
            </p>
          </div>
          <DocumentSearch value={query} onSearch={handleSearch} />
        </div>

        {error ? (
          <div className={styles.inlineError} role="alert">
            <span aria-hidden="true">!</span>
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void loadDocuments(page, query)}
            >
              重新加载
            </button>
          </div>
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
      </Card>

      <Modal
        open={uploadOpen}
        size="lg"
        title="导入私人文档"
        onClose={() => setUploadOpen(false)}
      >
        <DocumentUpload onUploaded={handleUploaded} />
      </Modal>
    </section>
  );
}
