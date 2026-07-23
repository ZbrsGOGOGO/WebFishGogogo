// packages/frontend/src/components/ui/Tag.tsx
// 标签 / 徽标：柔和配色的小型状态标记。Badge 为其别名导出。

import type { HTMLAttributes, JSX, ReactNode } from 'react';

import styles from './Tag.module.css';

export type TagColor = 'brand' | 'neutral' | 'success' | 'danger';

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  /** 配色，默认 brand（柔和品牌红）。 */
  color?: TagColor;
  children?: ReactNode;
}

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

/**
 * 标签 / 徽标组件。
 *
 * 默认柔和品牌红外观，可通过 `color` 切换语义配色。
 */
export function Tag({
  color = 'brand',
  className,
  children,
  ...rest
}: TagProps): JSX.Element {
  return (
    <span className={cx(styles.tag, styles[color], className)} {...rest}>
      {children}
    </span>
  );
}

/** Badge 为 Tag 的语义别名。 */
export const Badge = Tag;
