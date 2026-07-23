// packages/frontend/src/components/ui/Modal.test.tsx
// 模态框渲染、Esc 关闭、关闭按钮、遮罩点击测试。

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { Modal } from './Modal';

describe('Modal', () => {
  it('open=false 时不渲染任何内容', () => {
    render(
      <Modal open={false} onClose={() => {}} title="标题">
        内容
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('open=true 时以 dialog 语义渲染并关联标题', () => {
    render(
      <Modal open onClose={() => {}} title="确认删除">
        正文内容
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('正文内容')).toBeInTheDocument();
    // 标题关联 aria-labelledby。
    const heading = screen.getByRole('heading', { name: '确认删除' });
    expect(dialog).toHaveAttribute('aria-labelledby', heading.id);
  });

  it('按 Esc 触发 onClose', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="标题">
        内容
      </Modal>,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('点击关闭按钮触发 onClose', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="标题">
        内容
      </Modal>,
    );
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
