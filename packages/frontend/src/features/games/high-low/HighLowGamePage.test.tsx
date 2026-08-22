import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HighLowGamePage } from './HighLowGamePage';

describe('HighLowGamePage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('allows a prediction, reveals both cards, and starts another round', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.8)
      .mockReturnValueOnce(0.1);

    render(
      <MemoryRouter>
        <HighLowGamePage />
      </MemoryRouter>,
    );

    const prediction = screen.getByRole('button', { name: /我更大/ });
    fireEvent.click(prediction);
    expect(prediction).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: '揭晓结果' }));

    expect(screen.getByRole('status')).toHaveTextContent('预测正确');
    expect(screen.getByRole('status')).toHaveTextContent('你的牌更大');
    expect(screen.getByText('J')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '再来一局' }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '揭晓结果' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /我更大/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});
