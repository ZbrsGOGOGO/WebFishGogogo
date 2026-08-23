import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { GamesPage } from './GamesPage';

describe('GamesPage', () => {
  it('只提供俄罗斯方块和坦克大战入口', () => {
    render(
      <MemoryRouter>
        <GamesPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: '小游戏中心' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /俄罗斯方块/ })).toHaveAttribute(
      'href',
      '/games/tetris',
    );
    expect(screen.getByRole('link', { name: /坦克大战/ })).toHaveAttribute(
      'href',
      '/games/tank',
    );
    expect(screen.queryByRole('link', { name: /贪食蛇|三数之和|午休竞技场|比大小/ })).not.toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
