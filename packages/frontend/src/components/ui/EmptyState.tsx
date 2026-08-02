// packages/frontend/src/components/ui/EmptyState.tsx
// 空状态：图标 / emoji + 标题 + 描述 + 可选操作。

import type { JSX, ReactNode } from 'react';

import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  /** 图标或 emoji，默认 📭。 */
  icon?: ReactNode;
  /** 可选标题。 */
  title?: ReactNode;
  /** 主要说明文案。 */
  message: ReactNode;
  /** 可选操作区（按钮等）。 */
  actions?: ReactNode;
  className?: string;
}

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

/**
 * 空状态占位。
 *
 * 用于列表 / 搜索无结果等场景，图标以 `aria-hidden` 隐藏于辅助技术。
 */
export function EmptyState({
  icon = '📭',
  title,
  message,
  actions,
  className,
}: EmptyStateProps): JSX.Element {
  return (
    <div className={cx(styles.empty, className)}>
      <div className={styles.icon} aria-hidden="true">
        {icon}
      </div>
      {title != null && <h3 className={styles.title}>{title}</h3>}
      <p className={styles.message}>{message}</p>
      {actions != null && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
