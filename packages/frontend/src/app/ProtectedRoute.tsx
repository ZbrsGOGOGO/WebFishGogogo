// packages/frontend/src/app/ProtectedRoute.tsx
// 受保护路由包装器：未认证用户重定向到登录页（Req 1.5）。

import type { JSX } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuthStore } from './store/auth-store';

export interface ProtectedRouteProps {
  /** 未认证时重定向的目标路径（默认 /login）。 */
  redirectTo?: string;
  /** 可选：直接包裹的受保护内容；省略时渲染嵌套路由 <Outlet />。 */
  children?: JSX.Element;
}

/**
 * 若用户未持有有效令牌，则重定向到登录页并携带原始位置（登录后可回跳）；
 * 已认证时渲染受保护内容（children 或嵌套路由 Outlet）。
 *
 * _Requirements: 1.5_
 */
export function ProtectedRoute({
  redirectTo = '/login',
  children,
}: ProtectedRouteProps): JSX.Element {
  const token = useAuthStore((state) => state.token);
  const location = useLocation();

  if (!token) {
    return <Navigate to={redirectTo} replace state={{ from: location }} />;
  }

  return children ?? <Outlet />;
}
