// packages/frontend/src/components/layout/Footer.test.tsx
// 页脚合规信息渲染测试（Req 13.4, 13.5）。

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { Footer } from './Footer';
import { USER_CONTENT_FOOTER_STATEMENT } from '../compliance/content-declaration';

function renderFooter() {
  return render(
    <MemoryRouter>
      <Footer />
    </MemoryRouter>,
  );
}

describe('Footer', () => {
  it('展示"内容为用户上传且合法"声明（Req 13.4）', () => {
    renderFooter();
    expect(screen.getByText(USER_CONTENT_FOOTER_STATEMENT)).toBeInTheDocument();
  });

  it('提供隐私政策与服务条款链接（Req 13.5）', () => {
    renderFooter();
    expect(
      screen.getByRole('link', { name: '隐私政策' }),
    ).toHaveAttribute('href', '/privacy-policy');
    expect(
      screen.getByRole('link', { name: '服务条款' }),
    ).toHaveAttribute('href', '/terms-of-service');
  });

  it('展示 ICP/备案友好信息占位（Req 13.4）', () => {
    renderFooter();
    // 备案号仍为占位符时展示"备案信息待补充"提示。
    expect(screen.getByText('备案信息待补充')).toBeInTheDocument();
  });

  it('以 contentinfo 语义暴露页脚', () => {
    renderFooter();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });
});
