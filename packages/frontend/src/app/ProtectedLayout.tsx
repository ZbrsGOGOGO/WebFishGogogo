// packages/frontend/src/app/ProtectedLayout.tsx
// 受保护应用区布局：在认证守卫通过后，渲染嵌套路由内容，
// 并在侧边持久挂载便签面板（Req 10.1, 10.2）。
//
// 便签面板作为全站级摸鱼小工具，在所有受保护页面（首页/库/阅读器/工具页）
// 均可用，跨页面与跨会话保持内容（挂载即恢复、编辑防抖自动保存）。

import type { JSX } from 'react';
import { Link, Outlet } from 'react-router-dom';

import { ProtectedRoute } from './ProtectedRoute';
import { MemoPanel } from '../features/memo';
import { useAuthStore } from './store/auth-store';

/**
 * 受保护布局：先经 ProtectedRoute 守卫（未认证重定向到登录页，Req 1.5），
 * 通过后渲染全局导航、嵌套路由 <Outlet /> 与侧边便签面板。
 *
 * 全局导航提供文档库 / 工具页等入口，使各受保护页面互相可达。
 *
 * _Requirements: 1.5, 10.1, 10.2_
 */
export function ProtectedLayout(): JSX.Element {
  const logout = useAuthStore((state) => state.logout);

  return (
    <ProtectedRoute>
      <div className="protected-layout">
        <nav
          aria-label="主导航"
          style={{
            display: 'flex',
            gap: '1rem',
            alignItems: 'center',
            padding: '0.5rem 1rem',
            borderBottom: '1px solid #e5e5e5',
          }}
        >
          <Link to="/">首页</Link>
          <Link to="/library">文档库</Link>
          <Link to="/tools">工具</Link>
          <button
            type="button"
            onClick={logout}
            style={{ marginLeft: 'auto' }}
          >
            退出登录
          </button>
        </nav>
        <Outlet />
        <aside className="memo-dock" aria-label="侧边便签">
          <MemoPanel />
        </aside>
      </div>
    </ProtectedRoute>
  );
}
