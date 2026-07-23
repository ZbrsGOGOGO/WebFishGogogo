// packages/frontend/src/components/ui/Modal.tsx
// 模态框 / 对话框：遮罩 + 居中面板 + 关闭按钮。
// 支持 Esc 关闭、点击遮罩关闭、轻量焦点陷阱（focus-trap-lite）。

import { useCallback, useEffect, useId, useRef } from 'react';
import type { JSX, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';

import styles from './Modal.module.css';

export interface ModalProps {
  /** 是否打开。 */
  open: boolean;
  /** 请求关闭的回调（Esc / 遮罩点击 / 关闭按钮触发）。 */
  onClose: () => void;
  /** 可选标题（用于 aria-labelledby）。 */
  title?: ReactNode;
  /** 主体内容。 */
  children?: ReactNode;
  /** 底部操作区。 */
  footer?: ReactNode;
  /** 点击遮罩是否关闭，默认 true。 */
  closeOnOverlayClick?: boolean;
  /** 关闭按钮的无障碍标签，默认"关闭"。 */
  closeLabel?: string;
}

/** 可获得焦点的元素选择器。 */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 模态对话框。
 *
 * - `role="dialog"` + `aria-modal="true"`，标题存在时关联 `aria-labelledby`。
 * - Esc 关闭；点击遮罩关闭（可关闭）。
 * - 轻量焦点陷阱：打开时聚焦面板，Tab / Shift+Tab 在面板内循环。
 * - 关闭后将焦点还原到打开前的触发元素。
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  closeOnOverlayClick = true,
  closeLabel = '关闭',
}: ModalProps): JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  // 打开时记录并转移焦点，关闭 / 卸载时还原。
  useEffect(() => {
    if (!open) {
      return;
    }
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const panel = panelRef.current;
    if (panel) {
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus();
    }

    return () => {
      previousFocusRef.current?.focus?.();
    };
  }, [open]);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }
      const panel = panelRef.current;
      if (!panel) {
        return;
      }
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  if (!open) {
    return null;
  }

  return (
    <div
      className={styles.overlay}
      onMouseDown={(event) => {
        if (closeOnOverlayClick && event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title != null ? titleId : undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        {title != null && (
          <div className={styles.header}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            <button
              type="button"
              className={styles.close}
              aria-label={closeLabel}
              onClick={onClose}
            >
              ×
            </button>
          </div>
        )}
        <div className={styles.body}>{children}</div>
        {footer != null && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
}
