// packages/frontend/src/components/ui/Card.tsx
// 卡片容器：surface 背景、边框、圆角、阴影，可选标题 / 头部操作区。

import type { HTMLAttributes, JSX, ReactNode } from 'react';

import styles from './Card.module.css';

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** 可选标题；提供后渲染头部区域。 */
  title?: ReactNode;
  /** 头部右侧操作区（例如按钮），需与 title 搭配。 */
  headerActions?: ReactNode;
  /** 卡片主体内容。 */
  children?: ReactNode;
  /** 主体区域的 className。 */
  bodyClassName?: string;
}

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

/**
 * 通用卡片。
 *
 * 提供 `title` 时渲染带底边的头部，可通过 `headerActions` 放置操作。
 */
export function Card({
  title,
  headerActions,
  children,
  className,
  bodyClassName,
  ...rest
}: CardProps): JSX.Element {
  const hasHeader = title != null || headerActions != null;

  return (
    <div className={cx(styles.card, className)} {...rest}>
      {hasHeader && (
        <div className={styles.header}>
          {title != null && <h3 className={styles.title}>{title}</h3>}
          {headerActions}
        </div>
      )}
      <div className={cx(styles.body, bodyClassName)}>{children}</div>
    </div>
  );
}
