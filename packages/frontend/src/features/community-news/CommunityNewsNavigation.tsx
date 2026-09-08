import type { JSX } from 'react';
import { NavLink } from 'react-router-dom';

import styles from './CommunityNews.module.css';

export function CommunityNewsNavigation(): JSX.Element {
  return (
    <nav className={styles.newsNavigation} aria-label="新闻栏目">
      <NavLink to="/news" end>分类新闻</NavLink>
      <NavLink to="/news/trending">每日热榜</NavLink>
      <NavLink to="/news/editorial">编辑导读</NavLink>
    </nav>
  );
}
