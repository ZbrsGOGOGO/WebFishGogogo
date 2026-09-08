import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEVELOPMENT_LIMITS } from '@stealth-reader/shared';

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
    expect(screen.getByText('选择你感兴趣的系统直接进入；需要保存成长进度的功能会请你先登录。')).toBeInTheDocument();
  });

  it('mounts the real member page at /news instead of the unavailable page when enabled', async () => {
    vi.stubEnv('VITE_COMMUNITY_NEWS_ENABLED', 'true');
    vi.resetModules();
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/farm')) {
        return Promise.resolve(new Response(JSON.stringify({
          serverTime: '2026-09-08T00:00:00.000Z', growth: { officeCoins: 620 },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      if (url.includes('/v1/development/access')) {
        return Promise.resolve(new Response(JSON.stringify({
          enabled: false,
          role: null,
          reviewMode: 'manual',
          limits: DEVELOPMENT_LIMITS,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      if (url.includes('/v1/me/news-preferences')) {
        return Promise.resolve(new Response(JSON.stringify({
          personalizationEnabled: false,
          topicPreferences: [],
          selectedProfession: null,
          version: null,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      if (url.includes('/v1/news/headlines/today')) {
        return Promise.resolve(new Response(JSON.stringify({
          serviceDate: null, updatedAt: null, nextUpdateAt: '2026-09-09T00:00:00.000Z',
          schedule: '每天 08:00（北京时间）', categories: [], items: [],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
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
    const [{ CommunityModeRouter }, { resetCommunityAuthStoreForTests, useCommunityAuthStore }] = await Promise.all([
      import('./community-router'),
      import('./store/community-auth-store'),
    ]);
    resetCommunityAuthStoreForTests();
    useCommunityAuthStore.setState({
      phase: 'active',
      sessionReady: true,
      user: {
        id: 'member-news',
        publicId: 'member-news',
        email: 'member@example.com',
        displayName: '新闻读者',
        accountStatus: 'active',
        onboardingCompleted: true,
        socialVerificationStatus: 'unverified',
      },
    });

    render(<MemoryRouter initialEntries={['/news']}><CommunityModeRouter /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: '热点新闻' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: '暂无已同步的新闻' })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/v1/news'))).toBe(true);
  });

  it('adds news and official-board entrances to the responsive workbench homepage', async () => {
    vi.stubEnv('VITE_COMMUNITY_NEWS_ENABLED', 'true');
    vi.resetModules();
    const [{ CommunityHomePage }, { resetCommunityAuthStoreForTests }] = await Promise.all([
      import('../features/community/CommunityHomePage'), import('./store/community-auth-store'),
    ]);
    resetCommunityAuthStoreForTests();
    render(<MemoryRouter><CommunityHomePage /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: '摸鱼间隙，看看新闻' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '分类新闻' })).toHaveAttribute('href', '/news');
    expect(screen.getByRole('link', { name: '每日热榜' })).toHaveAttribute('href', '/news/trending');
  });

  it.each([
    { path: '/news/trending', title: '每日热榜', endpoint: '/v1/news/trending/today' },
    { path: '/news/editorial', title: '编辑导读', endpoint: '/v1/news?feed=latest' },
    { path: '/news/article-1', title: '资讯导读', endpoint: '/v1/news/article-1' },
  ])('resolves $path without treating a static column as an article ID', async ({ path, title, endpoint }) => {
    vi.stubEnv('VITE_COMMUNITY_NEWS_ENABLED', 'true');
    vi.resetModules();
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      let body: unknown;
      if (url.endsWith('/v1/farm')) body = { serverTime: '2026-09-08T00:00:00.000Z', growth: { officeCoins: 620 } };
      else if (url.endsWith('/v1/development/access')) body = { enabled: false, role: null, reviewMode: 'manual', limits: DEVELOPMENT_LIMITS };
      else if (url.endsWith('/v1/me/news-preferences')) body = { personalizationEnabled: false, topicPreferences: [], selectedProfession: null, version: null };
      else if (url.endsWith('/v1/news/trending/today')) body = {
        serviceDate: null, updatedAt: null, nextUpdateAt: '2026-09-09T00:10:00.000Z',
        schedule: '每天 08:10（北京时间）', boards: [],
      };
      else if (url.endsWith('/v1/news?feed=latest')) body = { feed: 'latest', personalized: false, items: [], nextCursor: null };
      else if (url.endsWith('/v1/news/article-1')) body = { id: 'article-1', status: 'withdrawn', notice: '该导读已下线。', withdrawnAt: null };
      else throw new Error(`unexpected request: ${url}`);
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const [{ CommunityModeRouter }, { resetCommunityAuthStoreForTests, useCommunityAuthStore }] = await Promise.all([
      import('./community-router'), import('./store/community-auth-store'),
    ]);
    resetCommunityAuthStoreForTests();
    useCommunityAuthStore.setState({ phase: 'active', sessionReady: true, user: {
      id: 'news-route-member', publicId: 'news-route-member', email: 'member@example.com', displayName: '新闻读者',
      accountStatus: 'active', onboardingCompleted: true, socialVerificationStatus: 'unverified',
    } });
    render(<MemoryRouter initialEntries={[path]}><CommunityModeRouter /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith(endpoint))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => /\/v1\/news\/(trending|editorial)$/.test(String(url)))).toBe(false);
  });

  it.each(['/news/trending', '/news/editorial'])('keeps enabled %s private to members', async (path) => {
    vi.stubEnv('VITE_COMMUNITY_NEWS_ENABLED', 'true');
    vi.resetModules();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const [{ CommunityModeRouter }, { resetCommunityAuthStoreForTests }] = await Promise.all([
      import('./community-router'), import('./store/community-auth-store'),
    ]);
    resetCommunityAuthStoreForTests();
    render(<MemoryRouter initialEntries={[path]}><CommunityModeRouter /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: '欢迎回来' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps /news member-only and makes /news/admin unavailable without the independent admin flag', async () => {
    vi.stubEnv('VITE_COMMUNITY_NEWS_ENABLED', 'true');
    vi.stubEnv('VITE_COMMUNITY_NEWS_ADMIN_ENABLED', 'false');
    vi.resetModules();
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/farm')) {
        return Promise.resolve(new Response(JSON.stringify({
          serverTime: '2026-09-08T00:00:00.000Z', growth: { officeCoins: 620 },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      if (url.includes('/v1/development/access')) {
        return Promise.resolve(new Response(JSON.stringify({
          enabled: false,
          role: null,
          reviewMode: 'manual',
          limits: DEVELOPMENT_LIMITS,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      throw new Error(`unexpected request: ${url}`);
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
        id: 'member-news-admin-closed',
        publicId: 'member-news-admin-closed',
        email: 'member@example.com',
        displayName: '普通成员',
        accountStatus: 'active',
        onboardingCompleted: true,
        socialVerificationStatus: 'unverified',
      },
    });

    render(<MemoryRouter initialEntries={['/news/admin']}><CommunityModeRouter /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: '热点资讯编辑发布台尚未开放' })).toBeInTheDocument();
    expect(fetchMock.mock.calls.every(([url]) => String(url).includes('/v1/development/access') || String(url).endsWith('/v1/farm'))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/v1/news'))).toBe(false);
  });

  it('mounts the guarded editing desk only when both news flags are enabled', async () => {
    vi.stubEnv('VITE_COMMUNITY_NEWS_ENABLED', 'true');
    vi.stubEnv('VITE_COMMUNITY_NEWS_ADMIN_ENABLED', 'true');
    vi.resetModules();
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/farm')) {
        return Promise.resolve(new Response(JSON.stringify({
          serverTime: '2026-09-08T00:00:00.000Z', growth: { officeCoins: 620 },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      if (url.includes('/v1/development/access')) {
        return Promise.resolve(new Response(JSON.stringify({
          enabled: false,
          role: null,
          reviewMode: 'manual',
          limits: DEVELOPMENT_LIMITS,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
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
