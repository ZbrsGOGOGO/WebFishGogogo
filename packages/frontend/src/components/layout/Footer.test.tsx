// packages/frontend/src/components/layout/Footer.test.tsx
// 页脚合规信息渲染测试（Req 13.4, 13.5）。

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { Footer } from './Footer';

function renderFooter() {
  return render(
    <MemoryRouter>
      <Footer reviewMode={false} />
    </MemoryRouter>,
  );
}

describe('Footer', () => {
  it('展示本地数据说明', () => {
    renderFooter();
    expect(
      screen.getByText(/个人资料与使用记录由您的本地服务保存/),
    ).toBeInTheDocument();
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

  it('单机版不展示未配置的备案占位', () => {
    renderFooter();
    expect(screen.getByText(/本机版/)).toBeInTheDocument();
    expect(screen.queryByText('备案信息待补充')).not.toBeInTheDocument();
  });

  it('以 contentinfo 语义暴露页脚', () => {
    renderFooter();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('公开版本使用正常站点文案且不暴露内部发布状态', () => {
    render(
      <MemoryRouter>
        <Footer reviewMode publicMode />
      </MemoryRouter>,
    );
    expect(
      screen.getByText(/工具与单机游戏可直接在浏览器中使用/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/审核/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('备案信息')).toBeInTheDocument();
  });
});
