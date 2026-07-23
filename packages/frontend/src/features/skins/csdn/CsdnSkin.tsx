// packages/frontend/src/features/skins/csdn/CsdnSkin.tsx
// CSDN 风格皮肤组件：把标准化的 ArticleViewModel 渲染成"技术博客文章页"外观。
//
// 设计要点（design.md 关切点 3.2 / 3.3 与 Req 5.1/5.2/5.4）：
// - 皮肤只消费 ArticleViewModel，不直接依赖文档真实存储细节（Req 5.4）。
// - 展示假标题栏、面包屑、阅读量/点赞/收藏/标签/专栏等伪装元数据（Req 5.2）。
// - 正文以博客文章样式渲染（Req 5.1）。

import type { CSSProperties, JSX, ReactNode } from 'react';
import type { ArticleViewModel } from '@stealth-reader/shared';

import styles from './csdn-skin.module.css';

export interface CsdnSkinProps {
  /** 伪装阅读视图模型（由 backend 组装、SkinService 渲染）。 */
  article: ArticleViewModel;
  /**
   * 阅读控制区插槽（字号/行距/主题/翻页模式等）。
   * 后续任务 16.2 会在此挂载控制条。
   */
  controlsSlot?: ReactNode;
  /**
   * 侧栏插槽（章节目录 / 书签）。
   * 后续任务 16.4 会在此挂载 TOC / Bookmarks。
   */
  sidebarSlot?: ReactNode;
  /**
   * 正文样式覆盖（任务 16.2：字号/行距）。内联样式优先于模块类，
   * 不传时沿用皮肤默认排版。
   */
  bodyStyle?: CSSProperties;
  /**
   * 明暗主题（任务 16.2 / Req 6.4）。默认 'light' 保持既有外观。
   */
  theme?: 'light' | 'dark';
  /**
   * 正文呈现模式（任务 16.2 / Req 6.5）。'paging' 时正文限高并允许分页滚动，
   * 默认 'scroll' 保持整篇顺序滚动。
   */
  readingMode?: 'scroll' | 'paging';
}

/** 将较大的伪造统计数字格式化为 "1.2w" 风格，贴近国内博客展示习惯。 */
function formatCount(value: number): string {
  if (value >= 10000) {
    return `${(value / 10000).toFixed(1)}w`;
  }
  return String(value);
}

/** 将 ISO 时间格式化为 "YYYY-MM-DD" 展示（发布时间）。 */
function formatPublishedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toISOString().slice(0, 10);
}

/**
 * CSDN 风格文章视图。
 *
 * 注意：`htmlBody` 为 backend 皮肤层渲染后的博客正文 HTML（源自用户自有内容），
 * 此处以 `dangerouslySetInnerHTML` 注入以保真博客排版。内容清洗由渲染端（backend
 * SkinService）负责，前端不再二次转义以免破坏排版结构。
 */
export function CsdnSkin({
  article,
  controlsSlot,
  sidebarSlot,
  bodyStyle,
  theme = 'light',
  readingMode = 'scroll',
}: CsdnSkinProps): JSX.Element {
  const { articleTitle, htmlBody, fakeMeta } = article;
  const columnName = fakeMeta.columnName ?? '技术专栏';

  return (
    <div
      className={styles.root}
      data-skin={article.skinId}
      data-theme={theme}
      data-reading-mode={readingMode}
    >
      {/* 假顶部标题栏：模拟博客站点导航条 */}
      <header className={styles.topbar}>
        <span className={styles.logo}>CSDN</span>
        <nav className={styles.topnav} aria-label="站点导航">
          <span>首页</span>
          <span>博客</span>
          <span>下载</span>
          <span>学院</span>
          <span>问答</span>
        </nav>
        <div className={styles.topbarSpacer} />
        {controlsSlot ? (
          <div className={styles.controls}>{controlsSlot}</div>
        ) : null}
      </header>

      {/* 面包屑（Req 5.2） */}
      <nav className={styles.breadcrumb} aria-label="面包屑">
        <span>博客</span>
        <span className={styles.sep}>›</span>
        <span>{columnName}</span>
        <span className={styles.sep}>›</span>
        <span className={styles.crumbCurrent}>{articleTitle}</span>
      </nav>

      <div className={styles.layout}>
        <main className={styles.main}>
          <article className={styles.article}>
            <h1 className={styles.title}>{articleTitle}</h1>

            {/* 文章元信息行：发布时间 + 专栏 + 统计（Req 5.2） */}
            <div className={styles.meta}>
              <span className={styles.author}>码农进阶</span>
              <span className={styles.publishedAt}>
                {formatPublishedAt(fakeMeta.publishedAt)}
              </span>
              <span className={styles.column}>专栏：{columnName}</span>
            </div>

            <ul className={styles.stats} aria-label="文章统计">
              <li>
                <span className={styles.statLabel}>阅读量</span>
                <span className={styles.statValue}>
                  {formatCount(fakeMeta.views)}
                </span>
              </li>
              <li>
                <span className={styles.statLabel}>点赞</span>
                <span className={styles.statValue}>
                  {formatCount(fakeMeta.likes)}
                </span>
              </li>
              <li>
                <span className={styles.statLabel}>收藏</span>
                <span className={styles.statValue}>
                  {formatCount(fakeMeta.favorites)}
                </span>
              </li>
            </ul>

            {/* 标签（Req 5.2） */}
            {fakeMeta.tags.length > 0 ? (
              <ul className={styles.tags} aria-label="文章标签">
                {fakeMeta.tags.map((tag) => (
                  <li key={tag} className={styles.tag}>
                    {tag}
                  </li>
                ))}
              </ul>
            ) : null}

            {/* 正文（Req 5.1）：backend 已渲染为博客正文 HTML。
                字号/行距通过 bodyStyle 内联覆盖（任务 16.2 / Req 6.4）。 */}
            <div
              className={styles.body}
              data-testid="csdn-article-body"
              data-reading-mode={readingMode}
              style={bodyStyle}
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: htmlBody }}
            />
          </article>
        </main>

        {sidebarSlot ? (
          <aside className={styles.sidebar} aria-label="侧栏">
            {sidebarSlot}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
