import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  WorkstationTowerDefensePage,
  type WorkstationTowerDefenseCharacter,
} from './WorkstationTowerDefensePage';
import styles from './WorkstationTowerDefensePage.module.css';

const SETTINGS_KEY = 'momo.workstation-tower-defense.settings.v1';

function renderPage(character?: WorkstationTowerDefenseCharacter) {
  return render(
    <MemoryRouter>
      <WorkstationTowerDefensePage character={character} />
    </MemoryRouter>,
  );
}

describe('WorkstationTowerDefensePage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders a 12x8 local board with exactly one movable hero', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    renderPage();

    expect(screen.getByRole('heading', { name: '摸鱼升职记' })).toBeInTheDocument();
    expect(screen.getByText(/^工位塔防 ·/)).toBeInTheDocument();
    const board = screen.getByRole('group', { name: /工位塔防地图/ });
    expect(board.children).toHaveLength(96);
    expect(board.querySelectorAll(`.${styles.hero}`)).toHaveLength(1);
    expect(screen.getByText('游客同事 · 工位守卫')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '释放专注脉冲' })).toBeDisabled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('renders an injected community identity without importing account state', () => {
    renderPage({ displayName: '小张', avatarKey: 'green', avatarMark: '芽' });

    expect(screen.getByText('小张 · 工位守卫')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-avatar="green"]')).toHaveLength(2);
  });

  it('starts, moves from keyboard and touch controls, builds, upgrades, and sells a tower', () => {
    const intervalSpy = vi.spyOn(window, 'setInterval');
    renderPage();
    const board = screen.getByRole('group', { name: /工位塔防地图/ });

    fireEvent.click(screen.getByRole('button', { name: '空塔位 1' }));
    fireEvent.click(screen.getByRole('button', { name: /订书机/ }));
    expect(screen.getByRole('button', { name: '塔位 1，订书机 1 级' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^升级 ·/ }));
    expect(screen.getByRole('button', { name: '塔位 1，订书机 2 级' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^卖出/ }));
    expect(screen.getByRole('button', { name: '空塔位 1' })).toBeInTheDocument();
    expect(intervalSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '开始工位塔防' }));
    expect(intervalSpy).toHaveBeenCalledTimes(1);
    expect(board.children[73]?.querySelector(`.${styles.hero}`)).not.toBeNull();

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(board.children[73]?.querySelector(`.${styles.hero}`)).toBeNull();
    expect(board.children[74]?.querySelector(`.${styles.hero}`)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '向左移动' }));
    expect(board.children[73]?.querySelector(`.${styles.hero}`)).not.toBeNull();
  });

  it('upgrades the one hero and exposes all three office towers', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '开始工位塔防' }));
    fireEvent.click(screen.getByRole('button', { name: /升级角色/ }));

    expect(screen.getByText('工位守卫升到 2 级。')).toBeInTheDocument();
    expect(screen.getByText('Lv.2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '空塔位 2' }));
    expect(screen.getByRole('button', { name: /订书机/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /咖啡机/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /打印机/ })).toBeInTheDocument();
  });

  it('ignores typing shortcuts and auto-pauses when the window loses focus', () => {
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
    renderPage();
    const board = screen.getByRole('group', { name: /工位塔防地图/ });
    fireEvent.click(screen.getByRole('button', { name: '开始工位塔防' }));

    const input = document.createElement('textarea');
    document.body.append(input);
    input.focus();
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    expect(board.children[73]?.querySelector(`.${styles.hero}`)).not.toBeNull();

    fireEvent(window, new Event('blur'));
    expect(screen.getByText('已为你自动暂停')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '释放专注脉冲' })).toBeDisabled();
    expect(clearIntervalSpy).toHaveBeenCalled();
    input.remove();
  });

  it('pauses and resumes with P while preserving the board state', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '开始工位塔防' }));
    fireEvent.keyDown(window, { key: 'p' });

    expect(screen.getByText('工位塔防已暂停')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'p' });
    expect(screen.queryByText('工位塔防已暂停')).not.toBeInTheDocument();
  });

  it('resets an active run back to the preparation phase', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '开始工位塔防' }));
    fireEvent.click(screen.getByRole('button', { name: '重新开局' }));

    expect(screen.getByText('新的防线已重置，请先布置办公用品塔。')).toBeInTheDocument();
    expect(screen.getByText('工位防线准备中')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '开始工位塔防' })).toBeEnabled();
  });

  it('activates the focus pulse with Space when a target is nearby', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '开始工位塔防' }));
    fireEvent.click(screen.getByRole('button', { name: '向左移动' }));
    fireEvent.click(screen.getByRole('button', { name: '向上移动' }));
    fireEvent.click(screen.getByRole('button', { name: '向上移动' }));
    fireEvent.click(screen.getByRole('button', { name: '向上移动' }));
    act(() => vi.advanceTimersByTime(280));

    fireEvent.keyDown(window, { code: 'Space' });
    expect(screen.getByText('工位守卫释放了专注脉冲。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '释放专注脉冲' })).toBeDisabled();
  });

  it('auto-pauses when the page becomes hidden', () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '开始工位塔防' }));
    fireEvent(document, new Event('visibilitychange'));

    expect(screen.getByText('已为你自动暂停')).toBeInTheDocument();
  });

  it('discards corrupt local high-score settings without blocking play', () => {
    window.localStorage.setItem(SETTINGS_KEY, '{not-json');
    renderPage();

    expect(window.localStorage.getItem(SETTINGS_KEY)).toBeNull();
    expect(screen.getByText('本机最高分').nextElementSibling).toHaveTextContent('0');
    expect(screen.getByRole('button', { name: '开始工位塔防' })).toBeEnabled();
  });
});
