// packages/frontend/src/components/layout/Footer.test.tsx
// 页脚合规信息渲染测试（Req 13.4, 13.5）。

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
      screen.getByText(/轻量工具、经典小游戏和办公室主题玩法/),
    ).toBeInTheDocument();
    expect(screen.getByText('办公室轻社区')).toBeInTheDocument();
    expect(screen.queryByText(/审核/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('备案信息')).toBeInTheDocument();
  });

  it('社区版本只展示合规链接和备案，不展示主办者姓名或个人邮箱', () => {
    render(
      <MemoryRouter>
        <Footer reviewMode={false} publicMode={false} communityMode />
      </MemoryRouter>,
    );
    const footer = screen.getByRole('contentinfo', { name: '站点信息' });
    expect(footer).toHaveTextContent('办公室轻社区');
    expect(footer).not.toHaveTextContent('社区版');
    expect(within(footer).getByRole('link', { name: '社区规范' })).toHaveAttribute(
      'href',
      '/community-guidelines',
    );
    expect(footer).not.toHaveTextContent(/主办者|联系邮箱|@/);
  });
});
