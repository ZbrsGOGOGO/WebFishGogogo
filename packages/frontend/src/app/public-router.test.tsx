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
  it('presents the nine-system office community map without account features', () => {
    renderPublicAt();

    expect(
      screen.getByRole('heading', {
        name: '把工作里的角色，带进一个更有意思的办公室世界',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '开始办公室乐斗' })).toHaveAttribute(
      'href',
      '/ledou',
    );
    expect(screen.getByRole('heading', { name: '九个系统，围绕职业、成长和好友展开' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '主要系统' })).toHaveTextContent(
      '首页热点新闻经验交流农场乐斗投喂邀请我的主页好友',
    );
    expect(screen.getByText('人力资源管理')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '注册' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '登录' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '农场' })).toHaveAttribute(
      'href',
      '/#system-farm',
    );
  });

  it('loads the local office battle and keeps it API-free', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    renderPublicAt('/ledou');

    expect(
      await screen.findByRole('heading', { name: /先选职业/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /选择程序员/ })).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('lists only the two selected games and makes no API call', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    renderPublicAt('/games');

    expect(
      await screen.findByRole('heading', { name: '2 款经典游戏', level: 2 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /俄罗斯方块/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /坦克大战/ })).toBeInTheDocument();
    expect(screen.queryByText('贪食蛇')).not.toBeInTheDocument();
    expect(screen.queryByText('三数之和')).not.toBeInTheDocument();
    expect(screen.queryByText('午休竞技场')).not.toBeInTheDocument();
    expect(screen.queryByText('比大小')).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['/games/tetris', '俄罗斯方块'],
    ['/games/tank', '坦克大战'],
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

  it.each(['/games/snake', '/games/three-sum'])(
    'redirects removed game %s to the game center',
    async (path) => {
      renderPublicAt(path);
      expect(await screen.findByRole('heading', { name: '2 款经典游戏' })).toBeInTheDocument();
    },
  );

  it.each(['/games/arena', '/games/high-low', '/farm', '/login', '/register'])(
    'redirects the disabled route %s to the public homepage',
    async (path) => {
      renderPublicAt(path);

      await waitFor(() => {
        expect(
          screen.getByRole('heading', {
            name: '把工作里的角色，带进一个更有意思的办公室世界',
          }),
        ).toBeInTheDocument();
      });
    },
  );

  it('discloses local records and the implemented zero-day app log policy', () => {
    renderPublicAt('/privacy-policy');

    expect(
      screen.getByText(/浏览器本地存储保存最高分/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/常规访问日志保存期限为 0 天/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Web 与网关容器均禁用日志持久化/)).toBeInTheDocument();
    expect(screen.queryByText(/最多保留 5 个/)).not.toBeInTheDocument();
  });
});
