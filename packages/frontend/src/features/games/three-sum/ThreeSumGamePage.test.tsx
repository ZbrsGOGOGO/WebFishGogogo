import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ThreeSumGamePage } from './ThreeSumGamePage';

describe('ThreeSumGamePage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts a correct total and advances to a fresh question', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    render(
      <MemoryRouter
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <ThreeSumGamePage />
      </MemoryRouter>,
    );

    const answer = screen.getByLabelText('输入三个数字的总和');
    fireEvent.change(answer, { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: '提交答案' }));

    expect(screen.getByRole('status')).toHaveTextContent('回答正确');
    expect(screen.getByRole('status')).toHaveTextContent('1 + 1 + 1 = 3');
    expect(answer).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '下一题' }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(answer).toBeEnabled();
    expect(answer).toHaveValue(null);
    expect(screen.getByRole('button', { name: '提交答案' })).toBeDisabled();
  });
});
