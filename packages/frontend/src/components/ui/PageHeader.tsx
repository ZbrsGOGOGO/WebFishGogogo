// packages/frontend/src/components/ui/PageHeader.tsx
// 页面标题区：标题 + 可选副标题 + 右侧操作槽。

import type { JSX, ReactNode } from 'react';

import styles from './PageHeader.module.css';

export interface PageHeaderProps {
  /** 主标题。 */
  title: ReactNode;
  /** 可选副标题 / 描述。 */
  subtitle?: ReactNode;
  /** 右侧操作槽（按钮等）。 */
  actions?: ReactNode;
  className?: string;
  headingLevel?: 1 | 2;
}

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

/**
 * 页面级标题区。
 *
 * 以 `<header>` 语义包裹，标题默认渲染为 `<h1>`，嵌套内容可改为 `<h2>`。
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
  headingLevel = 1,
}: PageHeaderProps): JSX.Element {
  const Heading = headingLevel === 2 ? 'h2' : 'h1';

  return (
    <header className={cx(styles.header, className)}>
      <div className={styles.texts}>
        <Heading className={styles.title}>{title}</Heading>
        {subtitle != null && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {actions != null && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
