// packages/frontend/src/features/reader/useArticle.ts
// 拉取伪装阅读视图模型（ArticleViewModel）的数据 hook。
//
// 封装 GET /reading/:docId/article（api/reading.ts），暴露 loading/error/data
// 三态，供 ReaderPage 渲染。后续任务（16.2–16.5）可复用同一数据源接入控制/进度。

import { useCallback, useEffect, useState } from 'react';
import type { ArticleViewModel } from '@stealth-reader/shared';

import { ApiError, readingApi } from '../../api';

export interface UseArticleResult {
  article: ArticleViewModel | null;
  loading: boolean;
  /** 人类可读错误信息；无错误为 null。 */
  error: string | null;
  /** 是否为越权/禁止访问（HTTP 403）——不泄露文档是否存在（Req 12.2）。 */
  forbidden: boolean;
  /** 手动重新拉取。 */
  reload: () => void;
}

/**
 * 拉取指定文档的伪装阅读视图。
 *
 * @param docId 文档 ID；为 undefined 时不发起请求（loading=false）。
 * @param skin  可选皮肤 ID，透传给后端皮肤层。
 */
export function useArticle(
  docId: string | undefined,
  skin?: string,
): UseArticleResult {
  const [article, setArticle] = useState<ArticleViewModel | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(docId));
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(() => {
    if (!docId) {
      setArticle(null);
      setLoading(false);
      setError(null);
      setForbidden(false);
      return () => {};
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setForbidden(false);

    readingApi
      .getArticle(docId, skin)
      .then((vm) => {
        if (cancelled) return;
        setArticle(vm);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setArticle(null);
        if (err instanceof ApiError && err.status === 403) {
          setForbidden(true);
          setError('无权访问该内容');
        } else if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError('加载失败，请稍后重试');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [docId, skin]);

  useEffect(() => load(), [load]);

  const reload = useCallback(() => {
    load();
  }, [load]);

  return { article, loading, error, forbidden, reload };
}
