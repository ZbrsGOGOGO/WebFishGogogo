// packages/frontend/src/features/tools/runtime/useToolRunner.ts
// 工具运行器打开/关闭状态管理。

import { useCallback, useState } from 'react';

/** 当前运行中的工具（供 Modal 渲染）。 */
export interface ActiveTool {
  slug: string;
  title: string;
}

export interface UseToolRunnerResult {
  /** 当前打开的工具；未打开时为 null。 */
  activeTool: ActiveTool | null;
  /** 打开指定工具的运行器。 */
  open: (slug: string, title: string) => void;
  /** 关闭运行器。 */
  close: () => void;
}

/** 管理工具运行器 Modal 的开合状态。 */
export function useToolRunner(): UseToolRunnerResult {
  const [activeTool, setActiveTool] = useState<ActiveTool | null>(null);

  const open = useCallback((slug: string, title: string): void => {
    setActiveTool({ slug, title });
  }, []);

  const close = useCallback((): void => {
    setActiveTool(null);
  }, []);

  return { activeTool, open, close };
}
