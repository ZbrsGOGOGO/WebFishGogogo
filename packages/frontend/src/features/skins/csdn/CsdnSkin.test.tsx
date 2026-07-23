import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ArticleViewModel } from '@stealth-reader/shared';

import { CsdnSkin } from './CsdnSkin';
import { buildBlogTabTitle } from '../tab-title';

function makeArticle(
  overrides: Partial<ArticleViewModel> = {},
): ArticleViewModel {
  return {
    articleTitle: '深入理解 TypeScript 类型系统',
    htmlBody: '<p>第一段正文内容。</p><p>第二段。</p>',
    fakeMeta: {
      views: 12345,
      likes: 321,
      favorites: 88,
      tags: ['TypeScript', '前端', '类型系统'],
      columnName: 'TS 进阶',
      publishedAt: '2024-03-01T08:00:00.000Z',
    },
    progress: {
      documentId: 'doc-1',
      chapterIdx: 0,
      charOffset: 0,
      percent: 0,
    },
    skinId: 'csdn',
    ...overrides,
  };
}

describe('CsdnSkin (Req 5.1, 5.2)', () => {
  it('renders the fake title, breadcrumb, stats, tags and column (Req 5.2)', () => {
    render(<CsdnSkin article={makeArticle()} />);

    // 标题（假标题栏 + 文章标题）
    expect(
      screen.getByRole('heading', {
        name: '深入理解 TypeScript 类型系统',
      }),
    ).toBeInTheDocument();

    // 面包屑存在
    expect(
      screen.getByRole('navigation', { name: '面包屑' }),
    ).toBeInTheDocument();

    // 统计：阅读量/点赞/收藏（12345 → 1.2w 格式）
    const stats = screen.getByRole('list', { name: '文章统计' });
    expect(stats).toHaveTextContent('阅读量');
    expect(stats).toHaveTextContent('1.2w');
    expect(stats).toHaveTextContent('点赞');
    expect(stats).toHaveTextContent('收藏');

    // 标签
    const tags = screen.getByRole('list', { name: '文章标签' });
    expect(tags).toHaveTextContent('TypeScript');
    expect(tags).toHaveTextContent('前端');

    // 专栏名出现
    expect(screen.getAllByText(/TS 进阶/).length).toBeGreaterThan(0);
  });

  it('renders the blog body HTML (Req 5.1)', () => {
    render(<CsdnSkin article={makeArticle()} />);
    const body = screen.getByTestId('csdn-article-body');
    expect(body).toHaveTextContent('第一段正文内容。');
    expect(body).toHaveTextContent('第二段。');
  });

  it('falls back to a default column name when columnName is null', () => {
    const article = makeArticle({
      fakeMeta: { ...makeArticle().fakeMeta, columnName: null },
    });
    render(<CsdnSkin article={article} />);
    expect(screen.getAllByText(/技术专栏/).length).toBeGreaterThan(0);
  });

  it('renders control and sidebar slots when provided', () => {
    render(
      <CsdnSkin
        article={makeArticle()}
        controlsSlot={<div>控制条</div>}
        sidebarSlot={<div>目录</div>}
      />,
    );
    expect(screen.getByText('控制条')).toBeInTheDocument();
    expect(screen.getByText('目录')).toBeInTheDocument();
  });
});

describe('buildBlogTabTitle (Req 5.3)', () => {
  it('builds a CSDN-style tab title from the article title', () => {
    expect(buildBlogTabTitle('Hello World')).toBe('Hello World_CSDN博客');
  });

  it('falls back to a generic tech-blog title when empty', () => {
    expect(buildBlogTabTitle('   ')).toBe('技术博客_CSDN博客');
  });
});
