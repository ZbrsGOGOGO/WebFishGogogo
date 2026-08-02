// packages/frontend/src/components/ui/Spinner.tsx
// 加载指示器（Spinner）。可访问：role="status" + aria-label。

import type { JSX } from 'react';

import styles from './Spinner.module.css';

export type SpinnerSize = 'sm' | 'md' | 'lg';

export interface SpinnerProps {
  /** 尺寸，默认 md。 */
  size?: SpinnerSize;
  /** 无障碍标签，默认"加载中"。 */
  label?: string;
  className?: string;
}

/**
 * 通用加载指示器。
 *
 * 以 `role="status"` 暴露给辅助技术，视觉为品牌红旋转环。
 */
export function Spinner({
  size = 'md',
  label = '加载中',
  className,
}: SpinnerProps): JSX.Element {
  const classes = [styles.spinner, styles[size], className]
    .filter(Boolean)
    .join(' ');

  return (
    <span role="status" aria-label={label} className={classes}>
      <span
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
    </span>
  );
}
