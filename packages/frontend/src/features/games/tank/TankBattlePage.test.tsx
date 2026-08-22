import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TankBattlePage } from './TankBattlePage';
import styles from './TankBattlePage.module.css';

describe('TankBattlePage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('starts combat, moves, fires, and pauses from the visible controls', () => {
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
    render(
      <MemoryRouter>
        <TankBattlePage />
      </MemoryRouter>,
    );

    const board = screen.getByRole('img', { name: /坦克战场/ });
    expect(screen.getByRole('link', { name: /返回游戏中心/ })).toHaveAttribute(
      'href',
      '/games',
    );
    expect(board).toHaveAttribute('aria-label', expect.stringContaining('3 个敌人'));
    expect(board.children[157]?.querySelector(`.${styles.player}`)).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '开始战斗' }));
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '向左' }));
    expect(board.children[157]?.querySelector(`.${styles.player}`)).toBeNull();
    expect(board.children[156]?.querySelector(`.${styles.player}`)).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '开火' }));
    expect(board.querySelector(`.${styles.playerBullet}`)).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '暂停' }));
    expect(screen.getByText('战斗已暂停')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '继续战斗' })).toBeEnabled();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
  });

  it('leaves text input shortcuts alone and auto-pauses when focus is lost', () => {
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
    render(
      <MemoryRouter>
        <TankBattlePage />
      </MemoryRouter>,
    );

    const board = screen.getByRole('img', { name: /坦克战场/ });
    fireEvent.click(screen.getByRole('button', { name: '开始战斗' }));
    const memo = document.createElement('textarea');
    document.body.append(memo);
    memo.focus();
    fireEvent.keyDown(memo, { key: 'ArrowLeft' });
    expect(board.children[157]?.querySelector(`.${styles.player}`)).not.toBeNull();

    fireEvent(window, new Event('blur'));
    expect(screen.getByText('已为你自动暂停')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '开火' })).toBeDisabled();
    expect(clearIntervalSpy).toHaveBeenCalled();
    memo.remove();
  });
});
