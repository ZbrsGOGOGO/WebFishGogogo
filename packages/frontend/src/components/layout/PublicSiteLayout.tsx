import type { JSX } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';

import { PUBLIC_SYSTEM_NAV } from '../../app/public-nav';
import { SITE_NAME } from '../../app/site-config';
import styles from './PublicSiteLayout.module.css';

export function PublicSiteLayout(): JSX.Element {
  const location = useLocation();

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link className={styles.brand} to="/" aria-label={`${SITE_NAME}首页`}>
          <span className={styles.brandMark} aria-hidden="true">Z</span>
          <span>
            <strong>{SITE_NAME}</strong>
            <small>办公室轻社区</small>
          </span>
        </Link>
        <div className={styles.utilityLinks}>
          <Link to="/tools">工具箱</Link>
          <Link to="/games">小游戏</Link>
        </div>
      </header>

      <nav className={styles.systemNav} aria-label="主要系统">
        <div>
          {PUBLIC_SYSTEM_NAV.map((item) => {
            const current = item.id === 'home'
              ? location.pathname === '/'
              : item.available && location.pathname === item.path;
            return item.available ? (
              <Link
                key={item.id}
                to={item.path}
                aria-current={current ? 'page' : undefined}
                data-current={current}
              >
                {item.label}
              </Link>
            ) : (
              <a key={item.id} href={item.path}>
                {item.label}
              </a>
            );
          })}
        </div>
      </nav>

      <Outlet />
    </div>
  );
}
