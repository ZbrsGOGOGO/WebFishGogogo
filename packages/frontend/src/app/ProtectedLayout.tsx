// packages/frontend/src/app/ProtectedLayout.tsx
// 受保护应用区布局：在认证守卫通过后，渲染嵌套路由内容，
// 并在侧边持久挂载便签面板（Req 10.1, 10.2）。
//
// 便签面板作为全站级摸鱼小工具，在所有受保护页面（首页/库/阅读器/工具页）
// 均可用，跨页面与跨会话保持内容（挂载即恢复、编辑防抖自动保存）。

import { useEffect, useState, type JSX } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';

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
  const location = useLocation();
  const [memoOpen, setMemoOpen] = useState(false);
  const isReader = location.pathname.startsWith('/blog/article/');

  useEffect(() => {
    setMemoOpen(false);
  }, [location.pathname]);

  return (
    <ProtectedRoute>
      <div className={`protected-layout${isReader ? ' is-reader' : ''}`}>
        <a className="skip-link" href="#main-content">
          跳到主要内容
        </a>
        <header className="topbar">
          <div className="topbar__inner">
            <Link
              to="/"
              className="topbar__brand"
              aria-label="ZBRS 技术工具工坊首页"
            >
              <span className="topbar__brand-mark" aria-hidden="true">
                Z
              </span>
              <span className="topbar__brand-copy">
                <strong>ZBRS</strong>
                <small>技术工具工坊</small>
              </span>
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
              <NavLink to="/farm" className={navLinkClass}>
                农场
              </NavLink>
              <NavLink to="/games" className={navLinkClass}>
                小游戏
              </NavLink>
            </nav>
            <div className="topbar__spacer" />
            <span className="topbar__edition">本机版</span>
            {user ? (
              <span className="topbar__user" title={user.displayName ?? user.email}>
                {user.displayName ?? user.email}
              </span>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              aria-expanded={memoOpen}
              aria-controls="memo-drawer"
              onClick={() => setMemoOpen((open) => !open)}
            >
              便签
            </Button>
            <Button variant="ghost" size="sm" onClick={logout}>
              退出
            </Button>
          </div>
        </header>
        <div className="protected-layout__body">
          <main id="main-content" className="protected-layout__main" tabIndex={-1}>
            <Outlet />
          </main>
        </div>
        {memoOpen ? (
          <button
            type="button"
            className="memo-backdrop"
            aria-label="关闭便签"
            onClick={() => setMemoOpen(false)}
          />
        ) : null}
        {memoOpen ? (
          <div id="memo-drawer" className="memo-dock is-open">
            <div className="memo-dock__heading">
              <span>随手便签</span>
              <button
                type="button"
                className="memo-dock__close"
                aria-label="关闭便签"
                onClick={() => setMemoOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="memo-dock__body">
              <MemoPanel />
            </div>
          </div>
        ) : null}
      </div>
    </ProtectedRoute>
  );
}
