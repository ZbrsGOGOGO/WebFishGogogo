// packages/frontend/src/components/ui/Button.tsx
// 通用按钮组件：变体 / 尺寸 / disabled / loading。

import type { ButtonHTMLAttributes, JSX, ReactNode } from 'react';

import { Spinner } from './Spinner';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 视觉变体，默认 primary。 */
  variant?: ButtonVariant;
  /** 尺寸，默认 md。 */
  size?: ButtonSize;
  /** 加载态：展示 Spinner 并禁用交互。 */
  loading?: boolean;
  /** 占满父容器宽度。 */
  fullWidth?: boolean;
  children?: ReactNode;
}

/**
 * 通用按钮。
 *
 * - 4 种变体：primary / secondary / ghost / danger。
 * - loading 时展示内联 Spinner，并以 `aria-busy` 标记忙碌状态。
 * - disabled 或 loading 时阻止点击。
 */
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  className,
  children,
  type,
  ...rest
}: ButtonProps): JSX.Element {
  const classes = [
    styles.button,
    styles[variant],
    styles[size],
    loading ? styles.loading : null,
    fullWidth ? styles.fullWidth : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type ?? 'button'}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner size="sm" label="处理中" />}
      {children}
    </button>
  );
}
