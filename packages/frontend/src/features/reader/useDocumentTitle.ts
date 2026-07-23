// packages/frontend/src/features/reader/useDocumentTitle.ts
// 设置并在卸载时恢复 document.title 的副作用 hook（支撑 Req 5.3）。

import { useEffect } from 'react';

/**
 * 在组件挂载/标题变化时设置 `document.title`，卸载时恢复原标题。
 *
 * @param title 目标标签页标题；为 null/undefined 时不设置（保持原标题）。
 */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    if (title == null) {
      return;
    }
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
