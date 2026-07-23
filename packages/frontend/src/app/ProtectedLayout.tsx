// packages/frontend/src/app/ProtectedLayout.tsx
// 受保护应用区布局：在认证守卫通过后，渲染嵌套路由内容，
// 并在侧边持久挂载便签面板（Req 10.1, 10.2）。
//
// 便签面板作为全站级摸鱼小工具，在所有受保护页面（首页/库/阅读器/工具页）
// 均可用，跨页面与跨会话保持内容（挂载即恢复、编辑防抖自动保存）。

import type { JSX } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';

import { ProtectedRoute } from './ProtectedRoute';
import { MemoPanel } from '../features/memo';
import { Button } from '../components/ui';
import { useAuthStore } from './store/auth-store';

/** 顶栏导航链接的 className，激活时高亮为品牌红。 */
function navLinkClass({ isActive }: { isActive: boolean }): string {
  return isActive ? 'topbar__link is-active' : 'topbar__link';
}

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
  const user = useAuthStore((state) => state.user);

  return (
    <ProtectedRoute>
      <div className="protected-layout">
        {/* CSDN 风格顶栏：品牌 LOGO（左）+ 导航（首页/文档库/工具）+ 退出（右）。 */}
        <header className="topbar">
          <div className="topbar__inner">
            <Link to="/" className="topbar__brand" aria-label="CSDN 首页">
              <span className="topbar__brand-mark" aria-hidden="true">
                C
              </span>
              CSDN
            </Link>
            <nav aria-label="主导航" className="topbar__nav">
              <NavLink to="/" end className={navLinkClass}>
                首页
              </NavLink>
              <NavLink to="/library" className={navLinkClass}>
                文档库
              </NavLink>
              <NavLink to="/tools" className={navLinkClass}>
                工具
              </NavLink>
            </nav>
            <div className="topbar__spacer" />
            {user ? (
              <span className="topbar__user" title={user.displayName ?? user.email}>
                {user.displayName ?? user.email}
              </span>
            ) : null}
            <Button variant="ghost" size="sm" onClick={logout}>
              退出登录
            </Button>
          </div>
        </header>
        <main className="protected-layout__main">
          <Outlet />
        </main>
        <aside className="memo-dock" aria-label="侧边便签">
          <MemoPanel />
        </aside>
      </div>
    </ProtectedRoute>
  );
}
