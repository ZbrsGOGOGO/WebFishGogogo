// packages/frontend/src/features/home/HomePage.tsx
// 受保护首页：仪表盘式落地页，提供文档库 / 工具入口。

import type { JSX } from 'react';
import { Link } from 'react-router-dom';
import { DEFAULT_CHARS_PER_PAGE } from '@stealth-reader/shared';

import { useAuthStore } from '../../app/store/auth-store';
import { Card, PageHeader } from '../../components/ui';

interface HomeEntry {
  to: string;
  icon: string;
  name: string;
  desc: string;
}

const ENTRIES: HomeEntry[] = [
  {
    to: '/library',
    icon: '📚',
    name: '文档库',
    desc: '上传、管理并检索你的文档资料。',
  },
  {
    to: '/tools',
    icon: '🛠️',
    name: '工具',
    desc: '按职业推荐的实用小工具集合。',
  },
];

export function HomePage(): JSX.Element {
  const user = useAuthStore((state) => state.user);

  const greeting = user
    ? `欢迎，${user.displayName ?? user.email}`
    : '已登录';

  return (
    <section aria-label="首页">
      <PageHeader
        title="摸鱼阅读器"
        subtitle={`${greeting} · 每页默认字符数 ${DEFAULT_CHARS_PER_PAGE}`}
      />
      <nav aria-label="主导航">
        <div className="home-grid">
          {ENTRIES.map((entry) => (
            <Link key={entry.to} to={entry.to} className="home-entry">
              <Card className="home-entry__card">
                <span className="home-entry__icon" aria-hidden="true">
                  {entry.icon}
                </span>
                <h2 className="home-entry__name">{entry.name}</h2>
                <p className="home-entry__desc">{entry.desc}</p>
              </Card>
            </Link>
          ))}
        </div>
      </nav>
    </section>
  );
}
