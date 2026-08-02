// packages/frontend/src/components/ui/index.ts
// 通用 UI 组件库统一出口。仅依赖设计令牌（tokens.css），无第三方 UI 框架。

export { Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';

export { Input, Textarea } from './Input';
export type { InputProps, TextareaProps } from './Input';

export { Card } from './Card';
export type { CardProps } from './Card';

export { PageHeader } from './PageHeader';
export type { PageHeaderProps } from './PageHeader';

export { Tag, Badge } from './Tag';
export type { TagProps, TagColor } from './Tag';

export { Modal } from './Modal';
export type { ModalProps } from './Modal';

export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';

export { Spinner } from './Spinner';
export type { SpinnerProps, SpinnerSize } from './Spinner';
