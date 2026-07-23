// packages/frontend/src/features/home/HomePage.tsx
// 受保护首页占位：后续任务（15+）将挂载文档库 / 阅读器等 feature。

import type { JSX } from 'react';
import { Link } from 'react-router-dom';
import { DEFAULT_CHARS_PER_PAGE } from '@stealth-reader/shared';

import { useAuthStore } from '../../app/store/auth-store';

export function HomePage(): JSX.Element {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  return (
    <section aria-labelledby="home-title">
      <h1 id="home-title">摸鱼阅读器</h1>
      <p>
        {user
          ? `欢迎，${user.displayName ?? user.email}`
          : '已登录'}
      </p>
      <p>前端框架就绪。每页默认字符数：{DEFAULT_CHARS_PER_PAGE}</p>
      <nav aria-label="主导航">
        <ul>
          <li>
            <Link to="/library">📚 文档库</Link>
          </li>
          <li>
            <Link to="/tools">🛠️ 工具</Link>
          </li>
        </ul>
      </nav>
      <button type="button" onClick={logout}>
        退出登录
      </button>
    </section>
  );
}
