// packages/frontend/src/components/ui/Button.test.tsx
// 按钮渲染与交互态测试。

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { Button } from './Button';

describe('Button', () => {
  it('渲染子内容并默认 type=button', () => {
    render(<Button>提交</Button>);
    const btn = screen.getByRole('button', { name: '提交' });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('type', 'button');
  });

  it('点击触发 onClick', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>点我</Button>);
    fireEvent.click(screen.getByRole('button', { name: '点我' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('loading 时禁用并标记 aria-busy', () => {
    render(<Button loading>保存</Button>);
    const btn = screen.getByRole('button', { name: /保存/ });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
    // loading 状态展示 Spinner（role=status）。
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('disabled 时不触发 onClick', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        禁用
      </Button>,
    );
    fireEvent.click(screen.getByRole('button', { name: '禁用' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
