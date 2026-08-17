import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ReviewModeRouter } from '../../app/review-router';

function renderReviewAt(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ReviewModeRouter />
    </MemoryRouter>,
  );
}

describe('Review mode', () => {
  it('shows a normal public product landing page', () => {
    renderReviewAt();

    expect(screen.getByText('轻量个人效率工作台')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: '让个人资料与常用工具，保持简单、清楚、可控',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/审核/)).not.toBeInTheDocument();
    expect(screen.queryByText('账户注册与登录')).not.toBeInTheDocument();
    expect(screen.queryByText('轻量休闲互动')).not.toBeInTheDocument();
    expect(screen.queryByText('站点规划')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '现在就能使用的轻量工具' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '登录' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '注册' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '打开实用工具' })).toHaveAttribute(
      'href',
      '/tools',
    );
  });

  it('keeps privacy and terms public', () => {
    renderReviewAt('/privacy-policy');
    expect(screen.getByRole('heading', { name: '隐私政策' })).toBeInTheDocument();
    expect(screen.getByText(/不会主动收集账户资料/)).toBeInTheDocument();
  });

  it('redirects business routes to the review landing page', () => {
    renderReviewAt('/games/tetris');
    expect(screen.getByText('轻量个人效率工作台')).toBeInTheDocument();
    expect(screen.queryByText('方块消除')).not.toBeInTheDocument();
  });
});
