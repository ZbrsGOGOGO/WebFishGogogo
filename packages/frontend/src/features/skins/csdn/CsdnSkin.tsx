import type { CSSProperties, JSX, ReactNode } from 'react';
import type { ArticleViewModel } from '@stealth-reader/shared';

import styles from './csdn-skin.module.css';

export interface CsdnSkinProps {
  article: ArticleViewModel;
  controlsSlot?: ReactNode;
  sidebarSlot?: ReactNode;
  bodyStyle?: CSSProperties;
  theme?: 'light' | 'dark';
  readingMode?: 'scroll' | 'paging';
}

/**
 * ZBRS 阅读工作台。
 *
 * 组件名仍保留 CsdnSkin 以兼容历史 skinId 和后端协议；用户界面不再呈现
 * 第三方站点仿制元素，只展示私有文档、阅读控制与本机进度。
 */
export function CsdnSkin({
  article,
  controlsSlot,
  sidebarSlot,
  bodyStyle,
  theme = 'light',
  readingMode = 'scroll',
}: CsdnSkinProps): JSX.Element {
  const { articleTitle, htmlBody } = article;
  const progressPercent = Math.max(
    0,
    Math.min(100, Math.round(article.progress.percent)),
  );

  return (
    <div
      className={styles.root}
      data-skin={article.skinId}
      data-theme={theme}
      data-reading-mode={readingMode}
    >
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <a className={styles.backLink} href="/library">
            <span aria-hidden="true">←</span>
            文档库
          </a>
          <div className={styles.readerIdentity}>
            <span className={styles.logo} aria-hidden="true">
              Z
            </span>
            <span>
              <strong>ZBRS 阅读工作台</strong>
              <small>沉浸阅读 · 自动保存进度</small>
            </span>
          </div>
          {controlsSlot ? (
            <div className={styles.controls}>{controlsSlot}</div>
          ) : null}
        </div>
      </header>

      <nav className={styles.breadcrumb} aria-label="面包屑">
        <span>我的文档</span>
        <span className={styles.sep}>/</span>
        <span className={styles.crumbCurrent}>{articleTitle}</span>
      </nav>

      <div className={styles.layout}>
        <div className={styles.main}>
          <article className={styles.article}>
            <header className={styles.articleHeader}>
              <div className={styles.documentBadge}>私有文档</div>
              <h1 className={styles.title}>{articleTitle}</h1>
              <div className={styles.meta}>
                <span>本机私有内容</span>
                <span>进度 {progressPercent}%</span>
                <span>阅读位置自动保存</span>
              </div>
            </header>

            <div
              className={styles.body}
              data-testid="csdn-article-body"
              data-reading-mode={readingMode}
              style={bodyStyle}
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: htmlBody }}
            />
            <footer className={styles.articleFooter}>
              <span>阅读进度会自动保存在本机账户中</span>
              <a href="/library">返回文档库</a>
            </footer>
          </article>
        </div>

        {sidebarSlot ? (
          <aside className={styles.sidebar} aria-label="阅读导航">
            {sidebarSlot}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
