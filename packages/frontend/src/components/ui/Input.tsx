// packages/frontend/src/components/ui/Input.tsx
// 表单输入组件：Input（单行）与 Textarea（多行）。
// 均支持 label、error 提示，聚焦时展示品牌红聚焦环。

import { useId } from 'react';
import type {
  InputHTMLAttributes,
  JSX,
  TextareaHTMLAttributes,
} from 'react';

import styles from './Input.module.css';

interface FieldCommon {
  /** 字段标签文本。 */
  label?: string;
  /** 错误提示文本，存在时字段进入无效态。 */
  error?: string;
  /** 是否为必填（标签后展示星号）。 */
  required?: boolean;
  /** 包裹容器的 className。 */
  wrapperClassName?: string;
}

export type InputProps = FieldCommon &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'required'>;

export type TextareaProps = FieldCommon &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'required'>;

/** 组合 className 的小工具。 */
function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

/**
 * 单行文本输入。
 *
 * 自动为 label / error 建立 `htmlFor` 与 `aria-describedby` 关联，
 * 错误态设置 `aria-invalid`。
 */
export function Input({
  label,
  error,
  required,
  wrapperClassName,
  id,
  className,
  ...rest
}: InputProps): JSX.Element {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const errorId = error ? `${fieldId}-error` : undefined;

  return (
    <div className={cx(styles.field, wrapperClassName)}>
      {label && (
        <label className={styles.label} htmlFor={fieldId}>
          {label}
          {required && <span className={styles.required} aria-hidden="true">*</span>}
        </label>
      )}
      <input
        id={fieldId}
        className={cx(styles.control, styles.input, error && styles.invalid, className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        aria-required={required || undefined}
        {...rest}
      />
      {error && (
        <span id={errorId} className={styles.error} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

/**
 * 多行文本输入。
 *
 * 与 {@link Input} 共享标签 / 错误提示 / 无障碍关联逻辑。
 */
export function Textarea({
  label,
  error,
  required,
  wrapperClassName,
  id,
  className,
  ...rest
}: TextareaProps): JSX.Element {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const errorId = error ? `${fieldId}-error` : undefined;

  return (
    <div className={cx(styles.field, wrapperClassName)}>
      {label && (
        <label className={styles.label} htmlFor={fieldId}>
          {label}
          {required && <span className={styles.required} aria-hidden="true">*</span>}
        </label>
      )}
      <textarea
        id={fieldId}
        className={cx(styles.control, styles.textarea, error && styles.invalid, className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        aria-required={required || undefined}
        {...rest}
      />
      {error && (
        <span id={errorId} className={styles.error} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
