// packages/frontend/src/features/tools/runtime/StubTool.tsx
// 占位工具组件：在真实工具逻辑（T2/T3/T4）落地前，统一展示「开发中」。

import type { JSX } from 'react';

export interface StubToolProps {
  /** 工具展示名。 */
  name: string;
}

/**
 * 占位工具组件。真实实现将由 T2（时间/计算类）、T3（开发者类）、
 * T4（文本类）替换 registry 中对应 slug 的懒加载组件。
 */
export function StubTool({ name }: StubToolProps): JSX.Element {
  return (
    <div data-testid="tool-stub">
      <p>{name}</p>
      <p>开发中</p>
    </div>
  );
}
