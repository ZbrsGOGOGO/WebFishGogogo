// packages/frontend/src/components/compliance/SelfOwnedContentDeclaration.test.tsx
// 自有合法内容声明组件渲染测试（Req 13.1）。

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { SelfOwnedContentDeclaration } from './SelfOwnedContentDeclaration';
import {
  SELF_OWNED_CONTENT_DECLARATION_ITEMS,
  SELF_OWNED_CONTENT_DECLARATION_TITLE,
} from './content-declaration';

describe('SelfOwnedContentDeclaration', () => {
  it('展示声明标题（Req 13.1）', () => {
    render(<SelfOwnedContentDeclaration />);
    expect(
      screen.getByRole('heading', {
        name: SELF_OWNED_CONTENT_DECLARATION_TITLE,
      }),
    ).toBeInTheDocument();
  });

  it('逐条展示所有合规承诺项（Req 13.1）', () => {
    render(<SelfOwnedContentDeclaration />);
    for (const item of SELF_OWNED_CONTENT_DECLARATION_ITEMS) {
      expect(screen.getByText(item)).toBeInTheDocument();
    }
  });
});
