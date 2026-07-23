// packages/frontend/src/features/library/DocumentList.tsx
// 文档库列表：分页展示当前用户文档（Req 3.1/3.2），支持删除（Req 3.4）。
//
// 列表数据由父组件（LibraryPage）加载并下传，本组件仅负责呈现与交互。

import { useState, type JSX } from 'react';
import type { DocumentMeta } from '@stealth-reader/shared';

export interface DocumentListProps {
  documents: DocumentMeta[];
  total: number;
  page: number;
  pageSize: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
  onDelete: (id: string) => void | Promise<void>;
}

/** 文档状态中文标签。 */
const STATUS_LABEL: Record<DocumentMeta['status'], string> = {
  processing: '处理中',
  ready: '就绪',
  failed: '失败',
};

export function DocumentList({
  documents,
  total,
  page,
  pageSize,
  loading = false,
  onPageChange,
  onDelete,
}: DocumentListProps): JSX.Element {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  async function handleDelete(id: string): Promise<void> {
    setDeletingId(id);
    try {
      await onDelete(id);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section aria-labelledby="library-list-title">
      <h2 id="library-list-title">我的文档库</h2>

      {loading ? <p role="status">加载中…</p> : null}

      {!loading && documents.length === 0 ? (
        <p>暂无文档，上传一个开始阅读吧。</p>
      ) : (
        <ul aria-label="文档列表">
          {documents.map((doc) => (
            <li key={doc.id}>
              <span>{doc.title}</span>
              <span>（{STATUS_LABEL[doc.status]}）</span>
              <button
                type="button"
                onClick={() => handleDelete(doc.id)}
                disabled={deletingId === doc.id}
                aria-label={`删除 ${doc.title}`}
              >
                {deletingId === doc.id ? '删除中…' : '删除'}
              </button>
            </li>
          ))}
        </ul>
      )}

      <nav aria-label="分页" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={!hasPrev || loading}
        >
          上一页
        </button>
        <span>
          第 {page} / {totalPages} 页（共 {total} 篇）
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={!hasNext || loading}
        >
          下一页
        </button>
      </nav>
    </section>
  );
}
