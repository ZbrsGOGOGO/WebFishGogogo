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
  it('shows a truthful limited-function landing page', () => {
    renderReviewAt();

    expect(screen.getByText('当前为合规审核版本')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: '让个人资料与常用工具，保持简单、清楚、可控',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('账户注册与登录')).toBeInTheDocument();
    expect(screen.getAllByText('审核期间关闭')).toHaveLength(2);
    expect(screen.queryByRole('link', { name: '登录' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '注册' })).not.toBeInTheDocument();
  });

  it('keeps privacy and terms public', () => {
    renderReviewAt('/privacy-policy');
    expect(screen.getByRole('heading', { name: '隐私政策' })).toBeInTheDocument();
    expect(screen.getByText(/不开放账户注册、登录、内容上传/)).toBeInTheDocument();
  });

  it('redirects business routes to the review landing page', () => {
    renderReviewAt('/games/tetris');
    expect(screen.getByText('当前为合规审核版本')).toBeInTheDocument();
    expect(screen.queryByText('俄罗斯方块')).not.toBeInTheDocument();
  });
});
