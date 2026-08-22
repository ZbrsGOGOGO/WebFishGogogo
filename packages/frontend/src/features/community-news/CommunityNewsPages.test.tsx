import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { communityNewsApi, type CommunityAuthUser, type CommunityNewsPublishedItem } from '../../api/community';
import { resetCommunityAuthStoreForTests, useCommunityAuthStore } from '../../app/store/community-auth-store';
import { CommunityNewsDetailPage } from './CommunityNewsDetailPage';
import { CommunityNewsPage } from './CommunityNewsPage';

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
  });

  it('shows only the source, dates, short summary and an HTTPS original link to guests', async () => {
    render(<MemoryRouter><CommunityNewsPage /></MemoryRouter>);

    expect(await screen.findByText(summary)).toBeInTheDocument();
    expect(screen.getByText('示例官方来源')).toBeInTheDocument();
    const original = screen.getByRole('link', { name: '前往来源网站阅读原文' });
    expect(original).toHaveAttribute('href', 'https://news.example.com/articles/1');
    expect(original).toHaveAttribute('target', '_blank');
    expect(screen.queryByText('我的资讯偏好')).not.toBeInTheDocument();
    expect(screen.queryByText('减少类似内容')).not.toBeInTheDocument();
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

    render(<MemoryRouter><CommunityNewsPage /></MemoryRouter>);
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
  });
});
