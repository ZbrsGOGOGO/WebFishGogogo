import type { JSX } from 'react';
import { Link, Outlet } from 'react-router-dom';

import { SITE_NAME } from '../../app/site-config';
import publicStyles from '../tools/PublicToolsPage.module.css';

export function PublicGameLayout(): JSX.Element {
  return (
    <main className={publicStyles.page}>
      <header className={publicStyles.header}>
        <Link className={publicStyles.brand} to="/" aria-label={`${SITE_NAME}首页`}>
          <span className={publicStyles.brandMark} aria-hidden="true">摸</span>
          <span>
            <strong>{SITE_NAME}</strong>
            <small>个人效率工作台</small>
          </span>
        </Link>
        <nav className={publicStyles.nav} aria-label="公开页面">
          <Link to="/">首页</Link>
          <Link to="/tools">实用工具</Link>
          <Link
            className={publicStyles.currentLink}
            to="/games"
            aria-current="page"
          >
            轻量游戏
          </Link>
          <Link to="/privacy-policy">隐私政策</Link>
          <Link to="/terms-of-service">服务条款</Link>
        </nav>
      </header>
      <Outlet />
    </main>
  );
}
