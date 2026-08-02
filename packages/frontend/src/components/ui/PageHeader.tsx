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
}

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

/**
 * 页面级标题区。
 *
 * 以 `<header>` 语义包裹，标题渲染为 `<h1>`，副标题与操作槽可选。
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: PageHeaderProps): JSX.Element {
  return (
    <header className={cx(styles.header, className)}>
      <div className={styles.texts}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle != null && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {actions != null && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
