import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { announceLocalGameForeground } from '../game-input';
import { SnakeGamePage } from '../snake/SnakeGamePage';
import { TankBattlePage } from '../tank/TankBattlePage';
import { TetrisGamePage } from '../tetris/TetrisGamePage';
import { WorkstationTowerDefensePage } from '../../workstation-tower-defense/WorkstationTowerDefensePage';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); document.querySelectorAll('[data-exclusive-game-input]').forEach(node => node.remove()); vi.useRealTimers(); vi.restoreAllMocks(); });
describe('one foreground local game at a time', () => {
  for (const scenario of [
    { name: 'tower defense', Page: WorkstationTowerDefensePage, start: '开始工位塔防', resume: '继续防守' },
    { name: 'tank', Page: TankBattlePage, start: '开始战斗', resume: '继续战斗' },
    { name: 'snake', Page: SnakeGamePage, start: '开始游戏', resume: '继续游戏' },
    { name: 'tetris', Page: TetrisGamePage, start: '开始游戏', resume: '继续' },
  ]) {
    it(`pauses ${scenario.name} when Ballpoint becomes foreground; ignores its keys and never auto-resumes`, () => {
      const clearInterval = vi.spyOn(window, 'clearInterval');
      render(<MemoryRouter><scenario.Page /></MemoryRouter>);
      fireEvent.click(screen.getByRole('button', { name: scenario.start }));
      const canvas = document.createElement('canvas'); canvas.tabIndex = 0; canvas.dataset.exclusiveGameInput = 'ballpoint'; document.body.append(canvas); canvas.focus();
      fireEvent.keyDown(canvas, { key: 'w', code: 'KeyW' });
      expect(document.activeElement).toBe(canvas);
      act(() => announceLocalGameForeground('ballpoint'));
      expect(clearInterval).toHaveBeenCalled();
      for (const button of screen.getAllByRole('button', { name: scenario.resume })) expect(button).toBeEnabled();
      act(() => vi.advanceTimersByTime(5000));
      for (const button of screen.getAllByRole('button', { name: scenario.resume })) expect(button).toBeEnabled();
    });
  }
});
