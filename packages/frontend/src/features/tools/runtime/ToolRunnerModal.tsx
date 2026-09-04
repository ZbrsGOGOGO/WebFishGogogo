import {
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  type JSX,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';

import { getToolRuntimeEntry } from './registry';
import styles from './ToolRunnerModal.module.css';

export interface ToolRunnerModalProps {
  slug: string | null;
  title?: string;
  onClose: () => void;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

/**
 * 本机工具运行层。
 *
 * 工具打开后锁定背景滚动，焦点被限制在弹层内；关闭时焦点回到原触发按钮。
 * 小屏设备使用全屏工作区，避免工具表单的固有宽度造成横向溢出。
 */
export function ToolRunnerModal({
  slug,
  title,
  onClose,
}: ToolRunnerModalProps): JSX.Element | null {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (slug === null) {
      return;
    }

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    const appRoot = document.getElementById('root');
    const rootWasInert = appRoot?.hasAttribute('inert') ?? false;
    const previousAriaHidden = appRoot?.getAttribute('aria-hidden') ?? null;
    document.body.style.overflow = 'hidden';
    appRoot?.setAttribute('inert', '');
    appRoot?.setAttribute('aria-hidden', 'true');
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      if (!rootWasInert) {
        appRoot?.removeAttribute('inert');
      }
      if (previousAriaHidden === null) {
        appRoot?.removeAttribute('aria-hidden');
      } else {
        appRoot?.setAttribute('aria-hidden', previousAriaHidden);
      }
      previousFocusRef.current?.focus();
    };
  }, [slug]);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }

      const dialog = dialogRef.current;
      if (!dialog) {
        return;
      }
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((element) => element.getAttribute('aria-hidden') !== 'true');

      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  if (slug === null) {
    return null;
  }

  const entry = getToolRuntimeEntry(slug);
  const heading = title ?? entry?.displayName ?? '工具';
  const ToolComponent = entry?.component ?? null;

  return createPortal(
    <div
      className={styles.overlay}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        data-testid="tool-runner-modal"
        onKeyDown={handleKeyDown}
      >
        <header className={styles.header}>
          <div className={styles.heading}>
            <span className={styles.eyebrow}>摸摸公司 · 本机工具</span>
            <h2 id={titleId}>{heading}</h2>
            <p id={descriptionId}>数据仅在当前浏览器中处理，不会上传。</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className={styles.closeButton}
            aria-label="关闭"
            onClick={onClose}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className={styles.body}>
          {ToolComponent ? (
            <Suspense
              fallback={
                <div className={styles.loading} role="status">
                  <span className={styles.loadingMark} aria-hidden="true" />
                  正在准备工具…
                </div>
              }
            >
              <ToolComponent />
            </Suspense>
          ) : (
            <div className={styles.notFound} data-testid="tool-runner-not-found">
              <strong>这个工具暂时无法打开</strong>
              <p>请返回工具目录后重新选择。</p>
            </div>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
