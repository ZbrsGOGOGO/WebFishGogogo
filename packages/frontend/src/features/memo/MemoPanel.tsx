// packages/frontend/src/features/memo/MemoPanel.tsx
// 侧边便签面板：挂载时恢复用户上次保存的便签内容（Req 10.2），
// 编辑时以防抖方式自动保存（Req 10.1），无需手动操作。

import { useEffect, useState, type JSX } from 'react';

import { getMemo, saveMemo } from '../../api/memo';
import { useAutoSave } from '../../hooks/useAutoSave';

/** 保存状态到用户可见提示文案的映射。 */
const STATUS_LABEL: Record<string, string> = {
  idle: '',
  saving: '保存中…',
  saved: '已保存',
  error: '保存失败，稍后重试',
};

export interface MemoPanelProps {
  /** 防抖延迟（毫秒），默认 800ms。 */
  autoSaveDelay?: number;
}

export function MemoPanel({ autoSaveDelay = 800 }: MemoPanelProps): JSX.Element {
  const [content, setContent] = useState('');
  // 加载完成前不启用自动保存，避免用初始空值覆盖服务端已存内容。
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 挂载时恢复上次保存的便签内容（Req 10.2）。
  useEffect(() => {
    let active = true;
    getMemo()
      .then((memo) => {
        if (active) {
          setContent(memo.content ?? '');
          setLoaded(true);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setLoadError(err instanceof Error ? err.message : '便签加载失败');
          // 仍允许编辑并保存新内容。
          setLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  // 内容变化后防抖自动保存（Req 10.1）。
  const { status, error: saveError, flush } = useAutoSave({
    value: content,
    save: saveMemo,
    delay: autoSaveDelay,
    enabled: loaded,
  });

  const statusText = saveError
    ? STATUS_LABEL.error
    : STATUS_LABEL[status] ?? '';

  return (
    <aside aria-labelledby="memo-title" className="memo-panel">
      <header className="memo-panel__header">
        <h2 id="memo-title">便签</h2>
        <span
          className="memo-panel__status"
          role="status"
          aria-live="polite"
        >
          {statusText}
        </span>
      </header>
      {loadError ? (
        <p role="alert" style={{ color: 'crimson' }}>
          {loadError}
        </p>
      ) : null}
      <textarea
        aria-label="便签内容"
        className="memo-panel__textarea"
        placeholder="随手记点什么，自动保存…"
        value={content}
        disabled={!loaded}
        // 失焦时立即落盘挂起的改动，减少丢失风险。
        onBlur={flush}
        onChange={(e) => setContent(e.target.value)}
      />
    </aside>
  );
}
