import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { communityNewsApi, type CommunityAuthUser, type CommunityDailyHotNews, type CommunityNewsPublishedItem } from '../../api/community';
import { resetCommunityAuthStoreForTests, useCommunityAuthStore } from '../../app/store/community-auth-store';
import { CommunityNewsDetailPage } from './CommunityNewsDetailPage';
import { CommunityNewsPage } from './CommunityNewsPage';
import { CommunityNewsEditorialPage } from './CommunityNewsEditorialPage';
import { CommunityNewsTrendingPage } from './CommunityNewsTrendingPage';

const summary = '这是一段来自编辑团队的原创短摘要，只帮助读者判断是否值得前往来源网站阅读完整上下文。';

const publishedItem: CommunityNewsPublishedItem = {
  id: '11111111-1111-4111-8111-111111111111',
  status: 'published',
  summary,
  source: { name: '示例官方来源' },
  originalPublishedAt: '2026-08-20T08:00:00.000Z',
  originalUrl: 'https://news.example.com/articles/1',
  publishedAt: '2026-08-20T09:00:00.000Z',
  lastCorrectedAt: null,
  correctionNote: null,
  discussion: { commentsEnabled: false, createPostPath: '/community/new?sourceUrl=test' },
};

const activeUser: CommunityAuthUser = {
  id: 'public-1',
  publicId: 'public-1',
  email: 'user@example.com',
  displayName: '小张',
  accountStatus: 'active',
  onboardingCompleted: true,
  socialVerificationStatus: 'verified',
  battleProfession: 'developer',
};

const dailyHeadlines: CommunityDailyHotNews = {
  serviceDate: '2026-09-08', updatedAt: '2026-09-08T00:00:00.000Z', nextUpdateAt: '2026-09-09T00:00:00.000Z',
  schedule: '每天 08:00（北京时间）',
  categories: [
    { id: 'general', label: '综合', count: 1 }, { id: 'domestic', label: '国内', count: 1 },
    { id: 'world', label: '国际', count: 1 }, { id: 'society', label: '社会', count: 0 },
    { id: 'finance', label: '财经', count: 1 }, { id: 'culture', label: '文娱', count: 0 }, { id: 'sports', label: '体育', count: 0 },
  ],
  items: [
    { id: 'general-1', headline: '今日综合标题', source: '中国新闻网', category: 'general', originalUrl: 'https://www.chinanews.com.cn/test/general', originalPublishedAt: null },
    { id: 'domestic-1', headline: '国内新闻标题', source: '中国新闻网', category: 'domestic', originalUrl: 'https://www.chinanews.com.cn/test/domestic', originalPublishedAt: '2026-09-08T01:00:00.000Z' },
    { id: 'world-1', headline: '国际新闻标题', source: '中国新闻网', category: 'world', originalUrl: 'https://www.chinanews.com.cn/test/world', originalPublishedAt: null },
    { id: 'finance-1', headline: '财经新闻标题', source: '中国新闻网', category: 'finance', originalUrl: 'https://www.chinanews.com.cn/test/finance', originalPublishedAt: null },
  ],
};

function NavigationHistory(): React.JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  return <><output aria-label="当前路径">{location.pathname}{location.search}</output><button onClick={() => navigate(-1)}>后退</button><button onClick={() => navigate(1)}>前进</button></>;
}

describe('community news public pages', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetCommunityAuthStoreForTests();
    vi.spyOn(communityNewsApi, 'list').mockResolvedValue({
      feed: 'latest',
      personalized: false,
      items: [publishedItem],
      nextCursor: null,
    });
    vi.spyOn(communityNewsApi, 'getDailyHeadlines').mockResolvedValue({
      serviceDate: '2026-08-23',
      updatedAt: '2026-08-23T00:00:00.000Z',
      nextUpdateAt: '2026-08-24T00:00:00.000Z',
      schedule: '每天 08:00（北京时间）',
      items: [{ id: 'headline-1', headline: '今日官方热点标题', source: '新华网', originalUrl: 'https://www.xinhuanet.com/example', originalPublishedAt: null }],
    });
  });

  it('shows only the source, dates, short summary and an HTTPS original link to guests', async () => {
    render(<MemoryRouter initialEntries={['/news/editorial']}><CommunityNewsEditorialPage /></MemoryRouter>);

    expect(await screen.findByText(summary)).toBeInTheDocument();
    expect(screen.getByText('示例官方来源')).toBeInTheDocument();
    const original = screen.getByRole('link', { name: '前往来源网站阅读原文' });
    expect(original).toHaveAttribute('href', 'https://news.example.com/articles/1');
    expect(original).toHaveAttribute('target', '_blank');
    expect(screen.queryByText('我的资讯偏好')).not.toBeInTheDocument();
    expect(screen.queryByText('减少类似内容')).not.toBeInTheDocument();
    expect(communityNewsApi.getDailyHeadlines).not.toHaveBeenCalled();
  });

  it('loads signed-in preferences and only removes a card after acknowledged feedback', async () => {
    useCommunityAuthStore.setState({ phase: 'active', user: activeUser, sessionReady: true });
    vi.spyOn(communityNewsApi, 'getPreferences').mockResolvedValue({
      personalizationEnabled: true,
      topicPreferences: ['typescript'],
      selectedProfession: 'developer',
      version: 2,
    });
    const feedback = vi.spyOn(communityNewsApi, 'giveNegativeFeedback').mockResolvedValue({
      acknowledged: true,
      articleId: publishedItem.id,
      reason: 'not_interested',
    });

    render(<MemoryRouter initialEntries={['/news/editorial']}><CommunityNewsEditorialPage /></MemoryRouter>);
    expect(await screen.findByDisplayValue('typescript')).toBeInTheDocument();
    fireEvent.click(screen.getByText('减少类似内容'));
    fireEvent.click(screen.getByRole('button', { name: '确认反馈' }));

    await waitFor(() => expect(feedback).toHaveBeenCalledOnce());
    expect(await screen.findByText('反馈已记录，这条资讯已从当前页面移除。')).toBeInTheDocument();
    expect(screen.queryByText(summary)).not.toBeInTheDocument();
  });

  it('renders a withdrawn detail as a notice without an original-content shell', async () => {
    vi.spyOn(communityNewsApi, 'get').mockResolvedValue({
      id: publishedItem.id,
      status: 'withdrawn',
      notice: '来源授权已撤销，该导读已经下线。',
      withdrawnAt: '2026-08-21T08:00:00.000Z',
    });

    render(
      <MemoryRouter initialEntries={[`/news/${publishedItem.id}`]}>
        <Routes><Route path="/news/:id" element={<CommunityNewsDetailPage />} /></Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '该资讯当前不可阅读' })).toBeInTheDocument();
    expect(screen.getByText('来源授权已撤销，该导读已经下线。')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '前往来源网站阅读原文' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '返回编辑导读' })).toHaveAttribute('href', '/news/editorial');
  });

  it('filters real headline categories using shareable URLs and browser back/forward', async () => {
    vi.mocked(communityNewsApi.getDailyHeadlines).mockResolvedValue(dailyHeadlines);
    render(<MemoryRouter initialEntries={['/news?category=finance&keep=1']}><NavigationHistory /><CommunityNewsPage /></MemoryRouter>);

    expect(await screen.findByRole('link', { name: '财经新闻标题' })).toHaveAttribute('href', dailyHeadlines.items[3].originalUrl);
    expect(screen.queryByRole('link', { name: '国内新闻标题' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '财经 1' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '体育 0' })).toBeDisabled();
    expect(screen.getByRole('link', { name: '分类新闻' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('button', { name: /科技/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '国内 1' }));
    expect(await screen.findByRole('link', { name: '国内新闻标题' })).toBeInTheDocument();
    expect(screen.getByLabelText('当前路径')).toHaveTextContent('/news?category=domestic&keep=1');
    fireEvent.click(screen.getByRole('button', { name: '后退' }));
    expect(await screen.findByRole('link', { name: '财经新闻标题' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '前进' }));
    expect(await screen.findByRole('link', { name: '国内新闻标题' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '全部 4' }));
    expect(screen.getByLabelText('当前路径')).toHaveTextContent('/news?keep=1');
    expect(screen.getByRole('list', { name: '全部新闻列表' }).children).toHaveLength(4);
    expect(communityNewsApi.getDailyHeadlines).toHaveBeenCalledOnce();
    expect(communityNewsApi.list).not.toHaveBeenCalled();
  });

  it('places legacy headlines in general without inventing categories or unsafe links', async () => {
    vi.mocked(communityNewsApi.getDailyHeadlines).mockResolvedValue({
      ...dailyHeadlines, categories: undefined, updatedAt: 'invalid date', items: [
        { ...dailyHeadlines.items[0], category: undefined, originalUrl: 'javascript:alert(1)', originalPublishedAt: 'invalid date' },
      ],
    });
    render(<MemoryRouter initialEntries={['/news?category=general']}><CommunityNewsPage /></MemoryRouter>);
    expect(await screen.findByText('今日综合标题')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '综合 1' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('link', { name: '今日综合标题' })).not.toBeInTheDocument();
    expect(screen.getByText('原文链接暂不可用')).toBeInTheDocument();
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /国内/ })).not.toBeInTheDocument();
  });

  it('shows a retryable fetch error, never a fabricated preparing state, and recovers', async () => {
    vi.mocked(communityNewsApi.getDailyHeadlines).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(dailyHeadlines);
    render(<MemoryRouter initialEntries={['/news']}><CommunityNewsPage /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('本次没有取得新闻数据');
    expect(screen.queryByText('今日热点正在准备')).not.toBeInTheDocument();
    expect(screen.queryByText('暂无已同步的新闻')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByRole('link', { name: '今日综合标题' })).toHaveAttribute('target', '_blank');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText(/新闻快照更新/)).toHaveTextContent('北京时间');
  });

  it('shows an honest empty response and handles unknown category URLs as all news', async () => {
    vi.mocked(communityNewsApi.getDailyHeadlines).mockResolvedValue({ ...dailyHeadlines, items: [], categories: [] });
    render(<MemoryRouter initialEntries={['/news?category=made-up']}><CommunityNewsPage /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: '暂无已同步的新闻' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '全部 0' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps editorial profession, topic filtering and versioned preferences functional', async () => {
    useCommunityAuthStore.setState({ phase: 'active', user: activeUser, sessionReady: true });
    const preferences = { personalizationEnabled: true, topicPreferences: ['typescript'], selectedProfession: 'developer' as const, version: 2 };
    vi.spyOn(communityNewsApi, 'getPreferences').mockResolvedValue(preferences);
    vi.spyOn(communityNewsApi, 'updatePreferences').mockResolvedValue({ ...preferences, version: 3 });
    render(<MemoryRouter initialEntries={['/news/editorial']}><CommunityNewsEditorialPage /></MemoryRouter>);
    expect(await screen.findByDisplayValue('typescript')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('职业方向'), { target: { value: 'developer' } });
    fireEvent.change(screen.getByLabelText('主题（精确标签）'), { target: { value: 'TypeScript' } });
    fireEvent.click(screen.getByRole('button', { name: '应用主题' }));
    await waitFor(() => expect(communityNewsApi.list).toHaveBeenLastCalledWith({ feed: 'latest', profession: 'developer', topic: 'typescript', cursor: undefined }));
    fireEvent.click(screen.getByRole('button', { name: '保存偏好' }));
    expect(await screen.findByText('资讯偏好已保存。')).toBeInTheDocument();
    expect(communityNewsApi.updatePreferences).toHaveBeenCalledWith({ personalizationEnabled: true, topicPreferences: ['typescript'], expectedVersion: 2 }, expect.any(String));
    expect(screen.getByRole('link', { name: '编辑导读' })).toHaveAttribute('aria-current', 'page');
  });

  it('presents eight official external entrances without making leaderboard requests or fake ranks', () => {
    render(<MemoryRouter initialEntries={['/news/trending']}><NavigationHistory /><CommunityNewsTrendingPage /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: '前往官方榜单，站内未同步榜单条目' })).toBeInTheDocument();
    const officialLinks = screen.getAllByRole('link', { name: /前往官方榜单（新窗口）/ });
    expect(officialLinks).toHaveLength(8);
    for (const link of officialLinks) {
      expect(link.getAttribute('href')).toMatch(/^https:\/\//);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow');
    }
    expect(screen.getByRole('link', { name: /微博热搜，前往/ })).toHaveAttribute('href', 'https://s.weibo.com/top/summary?cate=realtimehot');
    expect(screen.getByRole('link', { name: /知乎热榜，前往/ })).toHaveAttribute('href', 'https://www.zhihu.com/hot');
    expect(screen.queryByText(/更新时间|万热度|排名第/)).not.toBeInTheDocument();
    expect(communityNewsApi.getDailyHeadlines).not.toHaveBeenCalled();
    expect(communityNewsApi.list).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '科技知识' }));
    expect(screen.getByLabelText('当前路径')).toHaveTextContent('/news/trending?group=technology');
    expect(screen.getAllByRole('link', { name: /前往官方榜单（新窗口）/ })).toHaveLength(2);
    expect(screen.queryByRole('link', { name: /微博热搜，前往/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '后退' }));
    expect(screen.getAllByRole('link', { name: /前往官方榜单（新窗口）/ })).toHaveLength(8);
  });
});
