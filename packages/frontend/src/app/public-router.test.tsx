import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PublicModeRouter } from './public-router';

function renderPublicAt(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PublicModeRouter />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('public site mode', () => {
  it('presents tools and four browser games without account features', () => {
    renderPublicAt();

    expect(
      screen.getByRole('heading', {
        name: '常用工具与轻松一刻，打开就能用',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '打开实用工具' })).toHaveAttribute(
      'href',
      '/tools',
    );
    expect(screen.getByRole('link', { name: '进入游戏中心' })).toHaveAttribute(
      'href',
      '/games',
    );
    expect(screen.getByText('4 款')).toBeInTheDocument();
    expect(screen.getByText(/无需注册登录/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '注册' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '登录' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '农场' })).not.toBeInTheDocument();
  });

  it('lists only the four approved local games and makes no API call', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    renderPublicAt('/games');

    expect(
      await screen.findByRole('heading', { name: '4 款轻量游戏', level: 2 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /贪食蛇/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /方块消除/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /坦克大战/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /三数之和/ })).toBeInTheDocument();
    expect(screen.queryByText('午休竞技场')).not.toBeInTheDocument();
    expect(screen.queryByText('比大小')).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['/games/snake', '贪食蛇'],
    ['/games/tetris', '方块消除'],
    ['/games/tank', '坦克大战'],
    ['/games/three-sum', '三数之和'],
  ])('loads the public game deep link %s', async (path, heading) => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    renderPublicAt(path);

    expect(
      await screen.findByRole('heading', { name: heading }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /返回游戏中心/ })).toHaveAttribute(
      'href',
      '/games',
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each(['/games/arena', '/games/high-low', '/farm', '/login', '/register'])(
    'redirects the disabled route %s to the public homepage',
    async (path) => {
      renderPublicAt(path);

      await waitFor(() => {
        expect(
          screen.getByRole('heading', {
            name: '常用工具与轻松一刻，打开就能用',
          }),
        ).toBeInTheDocument();
      });
    },
  );

  it('discloses browser-local game records in the privacy policy', () => {
    renderPublicAt('/privacy-policy');

    expect(
      screen.getByText(/浏览器本地存储保存最高分/),
    ).toBeInTheDocument();
  });
});
