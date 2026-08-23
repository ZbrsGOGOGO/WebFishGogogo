import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TetrisGamePage } from './TetrisGamePage';

function activeColumns(board: HTMLElement): number[] {
  const cells = Array.from(
    board.querySelectorAll<HTMLElement>('[role="gridcell"]'),
  );

  return cells
    .map((cell, index) =>
      cell.dataset.active === 'true' ? index % 10 : null,
    )
    .filter((column): column is number => column !== null);
}

function renderGame(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <TetrisGamePage />
    </MemoryRouter>,
  );
}

describe('TetrisGamePage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renders a playable 10 × 20 board, stats, preview, and screen controls', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    renderGame();

    expect(
      screen.getByRole('heading', { name: '俄罗斯方块' }),
    ).toBeInTheDocument();
    const board = screen.getByRole('grid', { name: '俄罗斯方块棋盘' });
    expect(within(board).getAllByRole('row')).toHaveLength(20);
    expect(within(board).getAllByRole('gridcell')).toHaveLength(200);
    expect(screen.getByTestId('tetris-score')).toHaveTextContent('0');
    expect(screen.getByText('准备开始')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '开始游戏' })).toBeEnabled();
    expect(screen.getByRole('link', { name: /返回游戏中心/ })).toHaveAttribute(
      'href',
      '/games',
    );
    expect(screen.getByText('Lv.1')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /下一块：/ })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '向左移动' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '旋转方块' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '软降' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '硬降' })).toBeDisabled();
  });

  it('supports keyboard movement and on-screen hard drop, then resets', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    renderGame();

    const board = screen.getByTestId('tetris-board');
    fireEvent.click(screen.getByRole('button', { name: '开始游戏' }));
    const columnsBefore = activeColumns(board);

    fireEvent.keyDown(window, { key: 'ArrowLeft' });

    const columnsAfter = activeColumns(board);
    expect(Math.min(...columnsAfter)).toBe(Math.min(...columnsBefore) - 1);

    fireEvent.click(screen.getByRole('button', { name: '硬降' }));

    expect(Number(screen.getByTestId('tetris-score').textContent)).toBeGreaterThan(
      0,
    );
    expect(
      board.querySelectorAll(
        '[data-cell]:not([data-cell="empty"]):not([data-active="true"])',
      ).length,
    ).toBe(4);

    fireEvent.click(screen.getByRole('button', { name: '重置本局' }));

    expect(screen.getByTestId('tetris-score')).toHaveTextContent('0');
    expect(screen.getByText('准备开始')).toBeInTheDocument();
    expect(
      board.querySelectorAll(
        '[data-cell]:not([data-cell="empty"]):not([data-active="true"])',
      ).length,
    ).toBe(0);
  });

  it('pauses gravity, resumes at the current level speed, and cleans timers', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
    const { unmount } = renderGame();

    expect(setIntervalSpy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '开始游戏' }));
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '暂停' }));

    expect(screen.getByRole('status')).toHaveTextContent('游戏已暂停');
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '硬降' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '继续' }));

    expect(setIntervalSpy).toHaveBeenCalledTimes(2);

    act(() => {
      vi.advanceTimersByTime(850);
    });
    expect(setIntervalSpy).toHaveBeenCalledTimes(2);

    fireEvent(window, new Event('blur'));
    expect(screen.getByText('已为你自动暂停')).toBeInTheDocument();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(2);

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
