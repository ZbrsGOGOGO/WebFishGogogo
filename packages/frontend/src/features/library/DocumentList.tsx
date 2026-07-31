// packages/frontend/src/features/library/DocumentList.tsx
// 文档库列表：分页展示当前用户文档（Req 3.1/3.2），支持删除（Req 3.4）。
//
// 列表数据由父组件（LibraryPage）加载并下传，本组件仅负责呈现与交互。

import { useState, type JSX } from 'react';
import type { DocumentMeta } from '@stealth-reader/shared';
import { Link } from 'react-router-dom';

import { Button, EmptyState, Modal, Tag } from '../../components/ui';
import styles from './LibraryPage.module.css';

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

const STATUS_COLOR: Record<
  DocumentMeta['status'],
  'brand' | 'success' | 'danger'
> = {
  processing: 'brand',
  ready: 'success',
  failed: 'danger',
};

function formatCount(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '时间未知';
  }
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

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
  const [pendingDelete, setPendingDelete] = useState<DocumentMeta | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  async function handleDelete(id: string): Promise<void> {
    setDeletingId(id);
    try {
      await onDelete(id);
      setPendingDelete(null);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className={styles.documentList} aria-label="我的文档列表">
      {loading ? (
        <div className={styles.listLoading} role="status" aria-live="polite">
          <span aria-hidden="true" />
          正在整理文档…
        </div>
      ) : null}

      {!loading && documents.length === 0 ? (
        <EmptyState
          icon="📚"
          title="这里还没有文档"
          message="上传一份 TXT 文本，几秒后就能开始阅读。"
        />
      ) : (
        <ul className={styles.documentGrid} aria-label="文档列表">
          {documents.map((doc) => (
            <li key={doc.id}>
              <article className={styles.documentCard}>
                <div className={styles.documentIcon} aria-hidden="true">
                  TXT
                </div>
                <div className={styles.documentContent}>
                  <div className={styles.documentTopline}>
                    <h3 title={doc.title}>{doc.title}</h3>
                    <Tag color={STATUS_COLOR[doc.status]}>
                      {STATUS_LABEL[doc.status]}
                    </Tag>
                  </div>
                  <dl className={styles.documentMeta}>
                    <div>
                      <dt>章节</dt>
                      <dd>{formatCount(doc.chapterCount)}</dd>
                    </div>
                    <div>
                      <dt>字符</dt>
                      <dd>{formatCount(doc.charCount)}</dd>
                    </div>
                    <div>
                      <dt>编码</dt>
                      <dd>{doc.encoding.toUpperCase()}</dd>
                    </div>
                    <div>
                      <dt>上传</dt>
                      <dd>{formatDate(doc.createdAt)}</dd>
                    </div>
                  </dl>
                  <div className={styles.documentActions}>
                    {doc.status === 'ready' ? (
                      <Link
                        className={styles.readLink}
                        to={`/blog/article/${encodeURIComponent(doc.id)}`}
                      >
                        开始阅读
                      </Link>
                    ) : (
                      <span className={styles.unavailableAction}>
                        {doc.status === 'processing'
                          ? '解析完成后可阅读'
                          : '解析失败'}
                      </span>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      loading={deletingId === doc.id}
                      aria-label={`删除 ${doc.title}`}
                      onClick={() => setPendingDelete(doc)}
                    >
                      删除
                    </Button>
                  </div>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}

      <nav className={styles.pagination} aria-label="分页">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => onPageChange(page - 1)}
          disabled={!hasPrev || loading}
        >
          上一页
        </Button>
        <span>
          第 {page} / {totalPages} 页（共 {total} 篇）
        </span>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => onPageChange(page + 1)}
          disabled={!hasNext || loading}
        >
          下一页
        </Button>
      </nav>

      <Modal
        open={pendingDelete !== null}
        title="删除文档"
        closeOnOverlayClick={deletingId === null}
        onClose={() => {
          if (deletingId === null) setPendingDelete(null);
        }}
        footer={
          <>
            <Button
              variant="secondary"
              disabled={deletingId !== null}
              onClick={() => setPendingDelete(null)}
            >
              取消
            </Button>
            <Button
              variant="danger"
              loading={deletingId !== null}
              onClick={() => {
                if (pendingDelete) void handleDelete(pendingDelete.id);
              }}
            >
              确认删除
            </Button>
          </>
        }
      >
        <p className={styles.deletePrompt}>
          确定删除“{pendingDelete?.title}”吗？
        </p>
        <p className={styles.deleteHint}>
          文档将从当前账户的资料库中移除，此操作不能在页面内撤销。
        </p>
      </Modal>
    </section>
  );
}
