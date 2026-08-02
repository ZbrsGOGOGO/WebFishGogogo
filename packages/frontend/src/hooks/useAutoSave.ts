// packages/frontend/src/hooks/useAutoSave.ts
// 通用防抖自动保存 hook：值变化后以防抖方式调用 save，用于便签、阅读进度等无侵入保存场景。

import { useEffect, useRef, useState } from 'react';

import { useDebouncedCallback } from './useDebouncedCallback';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface UseAutoSaveOptions<T> {
  /** 当前待保存的值。 */
  value: T;
  /** 执行保存的异步函数。 */
  save: (value: T) => Promise<unknown>;
  /** 防抖延迟（毫秒），默认 800ms。 */
  delay?: number;
  /** 是否启用自动保存；false 时不触发（例如初始加载完成前）。默认 true。 */
  enabled?: boolean;
}

export interface UseAutoSaveResult {
  /** 当前保存状态。 */
  status: SaveStatus;
  /** 最近一次保存失败的错误信息（成功后清空）。 */
  error: string | null;
  /** 立即触发挂起的保存（跳过剩余防抖等待）。 */
  flush: () => void;
}

/**
 * 监听 value 变化并防抖保存。
 * - 首次挂载的初始值不会触发保存（仅在值发生变化后保存），避免刚加载即回写。
 * - 组件卸载时取消挂起保存。
 */
export function useAutoSave<T>({
  value,
  save,
  delay = 800,
  enabled = true,
}: UseAutoSaveOptions<T>): UseAutoSaveResult {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  // 记录上一次已处理的值，用于跳过初始值与无变化的重复触发。
  const lastValueRef = useRef<T>(value);
  // 标识首次运行，避免初始 value 触发保存。
  const initializedRef = useRef(false);
  // 使用递增序号忽略过期的保存响应（后发先至时以最新为准）。
  const saveSeqRef = useRef(0);

  const debouncedSave = useDebouncedCallback((next: T) => {
    const seq = ++saveSeqRef.current;
    setStatus('saving');
    setError(null);
    void save(next)
      .then(() => {
        if (seq === saveSeqRef.current) {
          setStatus('saved');
        }
      })
      .catch((err: unknown) => {
        if (seq === saveSeqRef.current) {
          setStatus('error');
          setError(err instanceof Error ? err.message : '保存失败');
        }
      });
  }, delay);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (!initializedRef.current) {
      initializedRef.current = true;
      lastValueRef.current = value;
      return;
    }
    if (Object.is(value, lastValueRef.current)) {
      return;
    }
    lastValueRef.current = value;
    debouncedSave(value);
  }, [value, enabled, debouncedSave]);

  return { status, error, flush: debouncedSave.flush };
}
