// packages/frontend/src/components/ui/Input.test.tsx
// 输入组件渲染、标签关联、错误态无障碍测试。

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Input, Textarea } from './Input';

describe('Input', () => {
  it('通过 label 关联可访问名称', () => {
    render(<Input label="用户名" />);
    expect(screen.getByLabelText('用户名')).toBeInTheDocument();
  });

  it('错误态设置 aria-invalid 并以 alert 暴露提示', () => {
    render(<Input label="邮箱" error="格式不正确" />);
    const field = screen.getByLabelText('邮箱');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('格式不正确');
  });
});

describe('Textarea', () => {
  it('渲染多行输入并关联标签', () => {
    render(<Textarea label="备注" />);
    const field = screen.getByLabelText('备注');
    expect(field.tagName).toBe('TEXTAREA');
  });
});
