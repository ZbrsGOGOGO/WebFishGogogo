import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { GamesPage } from './GamesPage';
import { PUBLIC_GAME_CARDS } from './public-game-cards';

describe('GamesPage', () => {
  it('提供三款动作游戏和命格模拟入口', () => {
    render(
      <MemoryRouter>
        <GamesPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: '小游戏中心' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /贪食蛇/ })).toHaveAttribute(
      'href',
      '/games/snake',
    );
    expect(screen.getByRole('link', { name: /俄罗斯方块/ })).toHaveAttribute(
      'href',
      '/games/tetris',
    );
    expect(screen.getByRole('link', { name: /坦克大战/ })).toHaveAttribute(
      'href',
      '/games/tank',
    );
    expect(screen.getByRole('link', { name: /遮司/ })).toHaveAttribute(
      'href',
      '/games/zhesi',
    );
    expect(PUBLIC_GAME_CARDS.find((game) => game.path === '/games/zhesi')).toBeDefined();
    expect(screen.queryByRole('link', { name: /三数之和|午休竞技场|比大小/ })).not.toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText(/模拟游戏的进度与记录仅保存在当前浏览器/)).toBeInTheDocument();
  });
});
