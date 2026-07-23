// packages/frontend/src/features/tools/runtime/ToolRunnerModal.tsx
// 工具运行器 Modal：在对话框中懒加载并渲染注册表中对应 slug 的工具组件。
// 未发现 components/ui 通用 Modal，故此处实现一个最小自包含对话框。

import { Suspense, useEffect, useRef, type JSX } from 'react';

import { getToolRuntimeEntry } from './registry';

export interface ToolRunnerModalProps {
  /** 当前要运行的工具 slug；为 null 时不渲染 Modal。 */
  slug: string | null;
  /** Modal 标题（优先用后端 Tool.name，回退到注册表 displayName）。 */
  title?: string;
  /** 关闭回调。 */
  onClose: () => void;
}

/**
 * 给定 slug，在 Modal 中渲染注册的工具组件。
 * - slug 为 null：不渲染。
 * - slug 未注册：展示未找到提示。
 * 支持 Esc 关闭与遮罩点击关闭。
 */
export function ToolRunnerModal({
  slug,
  title,
  onClose,
}: ToolRunnerModalProps): JSX.Element | null {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Esc 关闭。
  useEffect(() => {
    if (slug === null) {
      return;
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [slug, onClose]);

  // 打开时将焦点移入对话框（可访问性）。
  useEffect(() => {
    if (slug !== null) {
      dialogRef.current?.focus();
    }
  }, [slug]);

  if (slug === null) {
    return null;
  }

  const entry = getToolRuntimeEntry(slug);
  const heading = title ?? entry?.displayName ?? slug;
  const ToolComponent = entry?.component ?? null;

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        tabIndex={-1}
        data-testid="tool-runner-modal"
        onClick={(event) => event.stopPropagation()}
        style={{
          background: 'var(--color-surface, #fff)',
          color: 'var(--color-text, inherit)',
          borderRadius: 8,
          padding: 16,
          minWidth: 320,
          maxWidth: '90vw',
          maxHeight: '85vh',
          overflow: 'auto',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.25)',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{heading}</h2>
          <button type="button" aria-label="关闭" onClick={onClose}>
            关闭
          </button>
        </header>

        <div>
          {ToolComponent ? (
            <Suspense fallback={<p>工具加载中…</p>}>
              <ToolComponent />
            </Suspense>
          ) : (
            <p data-testid="tool-runner-not-found">
              未找到工具「{slug}」的界面。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
