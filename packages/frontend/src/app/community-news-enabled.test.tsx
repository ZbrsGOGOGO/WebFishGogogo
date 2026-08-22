import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('community news release flag', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('turns the guest homepage card into the real /news route when enabled', async () => {
    vi.stubEnv('VITE_COMMUNITY_NEWS_ENABLED', 'true');
    vi.resetModules();
    const [{ COMMUNITY_FEATURE_FLAGS }, { PublicLandingPage }] = await Promise.all([
      import('./community-nav'),
      import('../features/compliance/PublicLandingPage'),
    ]);

    expect(COMMUNITY_FEATURE_FLAGS.news).toBe(true);
    expect(COMMUNITY_FEATURE_FLAGS.newsAdmin).toBe(false);
    render(<MemoryRouter><PublicLandingPage /></MemoryRouter>);

    expect(screen.getByRole('link', { name: /热点新闻/ })).toHaveAttribute('href', '/news');
    expect(screen.getByText('卡片状态与当前发布闸门同步；已开放系统可直接进入，账号功能会在进入后安全校验。')).toBeInTheDocument();
  });

  it('mounts the real public page at /news instead of the unavailable page when enabled', async () => {
    vi.stubEnv('VITE_COMMUNITY_NEWS_ENABLED', 'true');
    vi.resetModules();
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/v1/news')) {
        return Promise.resolve(new Response(JSON.stringify({
          feed: 'latest',
          personalized: false,
          items: [],
          nextCursor: null,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      return Promise.resolve(new Response('', { status: 401 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const [{ CommunityModeRouter }, { resetCommunityAuthStoreForTests }] = await Promise.all([
      import('./community-router'),
      import('./store/community-auth-store'),
    ]);
    resetCommunityAuthStoreForTests();

    render(<MemoryRouter initialEntries={['/news']}><CommunityModeRouter /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: '热点新闻' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: '当前没有可展示的真实资讯' })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/v1/news'))).toBe(true);
  });

  it('keeps /news public but makes /news/admin unavailable without the independent admin flag', async () => {
    vi.stubEnv('VITE_COMMUNITY_NEWS_ENABLED', 'true');
    vi.stubEnv('VITE_COMMUNITY_NEWS_ADMIN_ENABLED', 'false');
    vi.resetModules();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const [{ CommunityModeRouter }, { resetCommunityAuthStoreForTests }] = await Promise.all([
      import('./community-router'),
      import('./store/community-auth-store'),
    ]);
    resetCommunityAuthStoreForTests();

    render(<MemoryRouter initialEntries={['/news/admin']}><CommunityModeRouter /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: '热点资讯编辑发布台尚未开放' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('mounts the guarded editing desk only when both news flags are enabled', async () => {
    vi.stubEnv('VITE_COMMUNITY_NEWS_ENABLED', 'true');
    vi.stubEnv('VITE_COMMUNITY_NEWS_ADMIN_ENABLED', 'true');
    vi.resetModules();
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/v1/admin/news/sources')) {
        return Promise.resolve(new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }));
      }
      if (url.includes('/v1/admin/news/articles')) {
        return Promise.resolve(new Response(JSON.stringify({ items: [], nextCursor: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }));
      }
      return Promise.resolve(new Response('', { status: 404 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const [{ CommunityModeRouter }, { resetCommunityAuthStoreForTests, useCommunityAuthStore }] = await Promise.all([
      import('./community-router'),
      import('./store/community-auth-store'),
    ]);
    resetCommunityAuthStoreForTests();
    useCommunityAuthStore.setState({
      phase: 'active',
      sessionReady: true,
      user: {
        id: 'public-moderator',
        publicId: 'public-moderator',
        email: 'moderator@example.com',
        displayName: '资讯版主',
        accountStatus: 'active',
        onboardingCompleted: true,
        socialVerificationStatus: 'verified',
        roles: ['moderator'],
      },
    });

    render(<MemoryRouter initialEntries={['/news/admin']}><CommunityModeRouter /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: '热点资讯编辑发布台' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '热点资讯编辑发布台' })).toHaveAttribute('href', '/news/admin');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/v1/admin/moderation/access'))).toBe(false);
  });
});
