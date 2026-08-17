import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { GamesPage } from './GamesPage';

describe('GamesPage', () => {
  it('提供全部六款小游戏入口和玩法说明', () => {
    render(
      <MemoryRouter>
        <GamesPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: '小游戏中心' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /午休竞技场/ }),
    ).toHaveAttribute('href', '/games/arena');
    expect(screen.getByText('Lv.3 解锁')).toBeInTheDocument();
    expect(screen.getByText('AI 单人对战')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /贪食蛇/ })).toHaveAttribute(
      'href',
      '/games/snake',
    );
    expect(screen.getByRole('link', { name: /方块消除/ })).toHaveAttribute(
      'href',
      '/games/tetris',
    );
    expect(screen.getByRole('link', { name: /坦克大战/ })).toHaveAttribute(
      'href',
      '/games/tank',
    );
    expect(screen.getByRole('link', { name: /比大小/ })).toHaveAttribute(
      'href',
      '/games/high-low',
    );
    expect(screen.getByRole('link', { name: /三数之和/ })).toHaveAttribute(
      'href',
      '/games/three-sum',
    );
    expect(screen.getByText('6')).toBeInTheDocument();
  });
});
