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

describe('CsdnSkin / ZBRS 阅读工作台', () => {
  it('renders the document title, breadcrumb and real reading status', () => {
    render(<CsdnSkin article={makeArticle()} />);

    expect(
      screen.getByRole('heading', {
        name: '深入理解 TypeScript 类型系统',
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole('navigation', { name: '面包屑' }),
    ).toBeInTheDocument();

    expect(screen.getByText('私有文档')).toBeInTheDocument();
    expect(screen.getByText('本机私有内容')).toBeInTheDocument();
    expect(screen.getByText('进度 0%')).toBeInTheDocument();
    expect(screen.queryByText('码农进阶')).not.toBeInTheDocument();
    expect(screen.queryByText('TS 进阶')).not.toBeInTheDocument();
  });

  it('renders the blog body HTML (Req 5.1)', () => {
    render(<CsdnSkin article={makeArticle()} />);
    const body = screen.getByTestId('csdn-article-body');
    expect(body).toHaveTextContent('第一段正文内容。');
    expect(body).toHaveTextContent('第二段。');
  });

  it('does not expose generated metadata when columnName is null', () => {
    const article = makeArticle({
      fakeMeta: { ...makeArticle().fakeMeta, columnName: null },
    });
    render(<CsdnSkin article={article} />);
    expect(screen.getByText('本机私有内容')).toBeInTheDocument();
    expect(screen.queryByText('技术专栏')).not.toBeInTheDocument();
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
  it('builds a ZBRS article tab title from the article title', () => {
    expect(buildBlogTabTitle('Hello World')).toBe(
      'Hello World - ZBRS 阅读工作台',
    );
  });

  it('falls back to a generic tech-blog title when empty', () => {
    expect(buildBlogTabTitle('   ')).toBe('ZBRS 阅读工作台');
  });
});
