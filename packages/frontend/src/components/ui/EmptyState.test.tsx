// packages/frontend/src/components/ui/EmptyState.test.tsx
// 空状态与标签组件渲染测试。

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { EmptyState } from './EmptyState';
import { Tag, Badge } from './Tag';

describe('EmptyState', () => {
  it('渲染标题与说明文案', () => {
    render(<EmptyState title="暂无文档" message="上传第一份文档开始阅读" />);
    expect(screen.getByRole('heading', { name: '暂无文档' })).toBeInTheDocument();
    expect(screen.getByText('上传第一份文档开始阅读')).toBeInTheDocument();
  });
});

describe('Tag', () => {
  it('渲染文本内容', () => {
    render(<Tag>草稿</Tag>);
    expect(screen.getByText('草稿')).toBeInTheDocument();
  });

  it('Badge 为 Tag 的别名', () => {
    expect(Badge).toBe(Tag);
  });
});
