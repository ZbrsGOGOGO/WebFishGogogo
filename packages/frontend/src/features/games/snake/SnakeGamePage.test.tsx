import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SNAKE_TICK_MS, SnakeGamePage } from './SnakeGamePage';

function headPosition(): string | null {
  return screen.getByTestId('snake-head').getAttribute('data-cell');
}

function renderGame(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <SnakeGamePage />
    </MemoryRouter>,
  );
}

describe('SnakeGamePage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders a 20 × 20 board, controls, and initial scores', () => {
    renderGame();

    expect(screen.getByTestId('snake-board').children).toHaveLength(400);
    expect(screen.getByRole('link', { name: /返回游戏中心/ })).toHaveAttribute(
      'href',
      '/games',
    );
    expect(screen.getByRole('status')).toHaveTextContent('等待开始');
    expect(screen.getByTestId('current-score')).toHaveTextContent('0');
    expect(screen.getByTestId('high-score')).toHaveTextContent('0');
    expect(screen.getByRole('button', { name: '开始游戏' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '暂停' })).toBeDisabled();
    expect(screen.getByRole('group', { name: '屏幕方向控制' })).toBeVisible();
  });

  it('starts, responds to arrow/WASD keys and screen controls, and pauses', () => {
    renderGame();
    fireEvent.click(screen.getByRole('button', { name: '开始游戏' }));

    fireEvent.keyDown(window, { key: 'ArrowUp' });
    act(() => {
      vi.advanceTimersByTime(SNAKE_TICK_MS);
    });
    expect(headPosition()).toBe('10,9');

    fireEvent.keyDown(window, { key: 'a' });
    act(() => {
      vi.advanceTimersByTime(SNAKE_TICK_MS);
    });
    expect(headPosition()).toBe('9,9');

    fireEvent.click(screen.getByRole('button', { name: '向下移动' }));
    act(() => {
      vi.advanceTimersByTime(SNAKE_TICK_MS);
    });
    expect(headPosition()).toBe('9,10');

    fireEvent.click(screen.getByRole('button', { name: '暂停' }));
    expect(screen.getByRole('status')).toHaveTextContent('已暂停');
    const pausedPosition = headPosition();

    act(() => {
      vi.advanceTimersByTime(SNAKE_TICK_MS * 3);
    });
    expect(headPosition()).toBe(pausedPosition);

    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    act(() => {
      vi.advanceTimersByTime(SNAKE_TICK_MS);
    });
    expect(headPosition()).not.toBe(pausedPosition);
  });

  it('updates and persists the high score after eating food', () => {
    // The adjacent square (11, 10) is open-cell index 208 of 397.
    vi.mocked(Math.random).mockReturnValue(208.1 / 397);
    renderGame();

    fireEvent.click(screen.getByRole('button', { name: '开始游戏' }));
    act(() => {
      vi.advanceTimersByTime(SNAKE_TICK_MS);
    });

    expect(screen.getByTestId('current-score')).toHaveTextContent('10');
    expect(screen.getByTestId('high-score')).toHaveTextContent('10');
    expect(window.localStorage.getItem('zbrs-snake-high-score')).toBe('10');

    fireEvent.click(screen.getByRole('button', { name: '重置' }));
    expect(screen.getByTestId('current-score')).toHaveTextContent('0');
    expect(screen.getByTestId('high-score')).toHaveTextContent('10');
  });

  it('reports a wall collision and offers a fresh round', () => {
    renderGame();
    fireEvent.click(screen.getByRole('button', { name: '开始游戏' }));

    act(() => {
      vi.advanceTimersByTime(SNAKE_TICK_MS * 10);
    });

    expect(screen.getByRole('status')).toHaveTextContent('游戏结束');
    expect(screen.getByText('撞到边界了')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '再来一局' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '向上移动' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '再来一局' }));
    expect(screen.getByRole('status')).toHaveTextContent('游戏中');
    expect(headPosition()).toBe('10,10');
  });

  it('cleans up the active game timer when unmounted', () => {
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
    const { unmount } = renderGame();
    fireEvent.click(screen.getByRole('button', { name: '开始游戏' }));

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it('does not capture memo input and automatically pauses on window blur', () => {
    renderGame();
    fireEvent.click(screen.getByRole('button', { name: '开始游戏' }));

    const memo = document.createElement('textarea');
    document.body.append(memo);
    memo.focus();
    fireEvent.keyDown(memo, { key: 'ArrowUp' });
    act(() => {
      vi.advanceTimersByTime(SNAKE_TICK_MS);
    });
    expect(headPosition()).toBe('11,10');

    fireEvent(window, new Event('blur'));
    expect(screen.getByRole('status')).toHaveTextContent('已暂停');
    expect(screen.getByText('已为你自动暂停')).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
    memo.remove();
  });
});
