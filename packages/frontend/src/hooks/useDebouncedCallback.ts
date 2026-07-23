// packages/frontend/src/hooks/useDebouncedCallback.ts
// 通用防抖回调 hook：在最后一次调用后延迟 delay 毫秒执行，用于进度/便签等无侵入自动保存。

import { useCallback, useEffect, useRef } from 'react';

export interface DebouncedCallback<Args extends unknown[]> {
  /** 触发一次防抖调用；每次调用都会重置计时器。 */
  (...args: Args): void;
  /** 取消尚未触发的挂起调用。 */
  cancel: () => void;
  /** 立即执行最近一次挂起的调用（若有），并清除计时器。 */
  flush: () => void;
}

/**
 * 返回一个稳定的防抖函数。
 * - 连续调用只在停止调用 delay 毫秒后执行最后一次。
 * - 组件卸载时自动取消挂起调用，避免对已卸载组件产生副作用。
 * - 使用 ref 持有最新回调，避免因回调变化频繁重建计时逻辑。
 */
export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delay: number,
): DebouncedCallback<Args> {
  const callbackRef = useRef(callback);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingArgsRef = useRef<Args | null>(null);

  // 始终引用最新回调，使防抖函数本身保持稳定。
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    clear();
    pendingArgsRef.current = null;
  }, [clear]);

  const flush = useCallback(() => {
    if (timerRef.current !== null && pendingArgsRef.current !== null) {
      clear();
      const args = pendingArgsRef.current;
      pendingArgsRef.current = null;
      callbackRef.current(...args);
    }
  }, [clear]);

  const debounced = useCallback(
    (...args: Args) => {
      pendingArgsRef.current = args;
      clear();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const pending = pendingArgsRef.current;
        pendingArgsRef.current = null;
        if (pending !== null) {
          callbackRef.current(...pending);
        }
      }, delay);
    },
    [clear, delay],
  );

  // 卸载时取消挂起调用。
  useEffect(() => cancel, [cancel]);

  return Object.assign(debounced, { cancel, flush });
}
