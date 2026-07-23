// packages/frontend/src/app/providers.tsx
// 全局 Provider 组合：路由 Provider（BrowserRouter）等横切上下文集中在此。
//
// 状态管理使用 Zustand（store 为模块级单例，无需 Context Provider），
// 故此处目前仅注入 BrowserRouter；后续如引入主题/查询等 Provider 在此叠加。

import type { JSX, ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';

export interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps): JSX.Element {
  return <BrowserRouter>{children}</BrowserRouter>;
}
