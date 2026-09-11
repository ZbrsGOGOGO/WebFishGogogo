import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type CommunityAuthUser } from '../api/community';
import { Footer } from '../components/layout/Footer';
import { CommunityModeRouter } from './community-router';
import {
  resetCommunityAuthStoreForTests,
  useCommunityAuthStore,
} from './store/community-auth-store';

const activeUser: CommunityAuthUser = {
  id: 'public-1',
  publicId: 'public-1',
  email: 'user@example.com',
  displayName: '小张',
  accountStatus: 'active',
  onboardingCompleted: true,
  socialVerificationStatus: 'unverified',
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CommunityModeRouter />
      <Footer reviewMode={false} publicMode={false} communityMode />
    </MemoryRouter>,
  );
}

describe('community mode routes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
    resetCommunityAuthStoreForTests();
  });

  it('renders the playable workbench homepage without advertising disabled systems', () => {
    renderAt('/');

    expect(screen.getByRole('heading', { name: '你的日常工作台' })).toBeInTheDocument();
    const systemNavigation = screen.getByRole('navigation', { name: '全部系统' });
    expect(within(systemNavigation).getByRole('link', { name: '首页' })).toHaveAttribute('href', '/');
    expect(within(systemNavigation).getByRole('link', { name: '工位塔防' })).toHaveAttribute('href', '/tower-defense');
    expect(within(systemNavigation).getByRole('link', { name: '小游戏' })).toHaveAttribute('href', '/games');
    expect(within(systemNavigation).getByRole('link', { name: '工具' })).toHaveAttribute('href', '/tools');
    expect(within(systemNavigation).getByRole('link', { name: '我的工作台' })).toHaveAttribute('href', '/me');
    for (const label of ['热点新闻', '经验交流', '农场', '投喂', '邀请', '好友']) {
      expect(systemNavigation).not.toHaveTextContent(label);
    }
    expect(screen.getByRole('link', { name: '登录' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: '注册工位' })).toHaveAttribute('href', '/register');
    const footer = screen.getByRole('contentinfo', { name: '站点信息' });
    expect(footer).toHaveTextContent('摸鱼成长社区');
    expect(footer).not.toHaveTextContent('社区版');
    expect(within(footer).getByLabelText('备案信息')).toBeInTheDocument();
    expect(within(footer).getByRole('link', { name: '隐私政策' })).toHaveAttribute('href', '/privacy-policy');
    expect(within(footer).getByRole('link', { name: '服务条款' })).toHaveAttribute('href', '/terms-of-service');
    expect(within(footer).getByRole('link', { name: '社区规范' })).toHaveAttribute('href', '/community-guidelines');
    expect(footer).not.toHaveTextContent(/主办者|联系邮箱|@/);
  });

  it('redirects a guest from a private profile to login', async () => {
    renderAt('/me');
    expect(await screen.findByRole('heading', { name: '欢迎回来' })).toBeInTheDocument();
  });

  it.each(['/community', '/farm', '/tower-defense', '/ledou', '/news', '/users/member-1', '/leaderboards', '/games/rooms', '/games/demon-tower'])(
    'redirects a guest from member system %s to login',
    async (path) => {
      renderAt(path);
      expect(await screen.findByRole('heading', { name: '欢迎回来' })).toBeInTheDocument();
    },
  );

  it('keeps tools and independent mini games available to guests', async () => {
    const { unmount } = renderAt('/tools');
    expect(screen.getByRole('heading', { name: '常用的小工具，打开就能用' })).toBeInTheDocument();
    unmount();

    renderAt('/games');
    expect(await screen.findByRole('heading', { name: '小游戏专区' })).toBeInTheDocument();
  });

  it.each(['/tools', '/games', '/games/demon-tower', '/office', '/users/member-1', '/privacy-policy', '/terms-of-service', '/not-a-real-page'])(
    'keeps one shared directory and desktop workbench on signed-in route %s',
    async (path) => {
      useCommunityAuthStore.setState({ phase: 'active', user: activeUser, sessionReady: true });
      renderAt(path);
      const sidebar = await screen.findByRole('complementary', { name: '我的工作台' });
      expect(within(sidebar).getByRole('link', { name: '工具' })).toHaveAttribute('href', '/tools');
      expect(within(sidebar).getByRole('button', { name: '目录设置' })).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: '浏览全部栏目' })).toHaveLength(1);
      fireEvent.click(screen.getByRole('button', { name: '浏览全部栏目' }));
      expect(screen.getAllByRole('dialog', { name: '全部栏目' })).toHaveLength(1);
    },
  );

  it.each([
    ['全部系统', '小游戏', '/games', '小游戏专区'],
    ['全部系统', '工具', '/tools', '常用的小工具，打开就能用'],
    ['小游戏、工具与搭子快捷入口', '小游戏', '/games', '小游戏专区'],
    ['小游戏、工具与搭子快捷入口', '工具', '/tools', '常用的小工具，打开就能用'],
    ['全部系统', '工位搭子', '/desk-pet', '领一个工位搭子'],
    ['小游戏、工具与搭子快捷入口', '工位搭子', '/desk-pet', '领一个工位搭子'],
  ])('opens %s / %s in one click without requiring login', async (navigation, label, path, heading) => {
    renderAt('/');
    const link = within(screen.getByRole('navigation', { name: navigation })).getByRole('link', { name: label });
    expect(link).toHaveAttribute('href', path);
    fireEvent.click(link);
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '欢迎回来' })).not.toBeInTheDocument();
  });

  it.each(['/games/demon-tower', '/games/demon-tower/leaderboard'])('keeps disabled demon tower route %s non-mutating', async (path) => {
    useCommunityAuthStore.setState({ phase: 'active', user: activeUser, sessionReady: true });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderAt(path);
    expect(await screen.findByRole('heading', { name: '九层妖塔暂未开放' })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/demon-tower'))).toBe(false);
    expect(screen.queryByRole('button', { name: /创建.*档案/ })).not.toBeInTheDocument();
  });

  it('does not present password reset as available while its backend gate is closed', async () => {
    renderAt('/password/forgot');
    expect(await screen.findByRole('heading', { name: '找回密码暂不可用' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '发送重置说明' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '查看隐私政策与联系渠道' })).toHaveAttribute('href', '/privacy-policy');
  });

  it('requires login before showing a closed social-verification system', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/settings/verification');

    expect(await screen.findByRole('heading', { name: '欢迎回来' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires login before showing a closed chat system', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/community/chat');

    expect(await screen.findByRole('heading', { name: '欢迎回来' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['/news/unreleased-article', '/news/trending', '/news/editorial'])('requires login before showing a closed news system at %s', async (path) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderAt(path);

    expect(await screen.findByRole('heading', { name: '欢迎回来' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('only lets a pending registration reach email verification', async () => {
    useCommunityAuthStore.setState({
      phase: 'pending_email',
      sessionReady: true,
      pendingRegistration: {
        registrationId: 'reg-1',
        emailMasked: 'u***@example.com',
        verificationExpiresAt: new Date(Date.now() + 600_000).toISOString(),
        resendAvailableAt: new Date(Date.now() + 60_000).toISOString(),
        accountStatus: 'pending_email',
      },
    });
    renderAt('/me');
    expect(await screen.findByRole('heading', { name: '验证邮箱' })).toBeInTheDocument();
    expect(screen.getByText(/u\*\*\*@example.com/)).toBeInTheDocument();
  });

  it('requires onboarding before active account pages', async () => {
    useCommunityAuthStore.setState({
      phase: 'active',
      user: { ...activeUser, onboardingCompleted: false },
      sessionReady: true,
    });
    renderAt('/me');
    expect(await screen.findByRole('heading', { name: '设置你的办公室身份' })).toBeInTheDocument();
  });

  it('routes suspended accounts to the restricted status page', async () => {
    useCommunityAuthStore.setState({
      phase: 'suspended',
      user: { ...activeUser, accountStatus: 'suspended' },
      sessionReady: true,
    });
    renderAt('/me');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '账号状态' })).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: '账号暂时停用' })).toBeInTheDocument();
  });
});
