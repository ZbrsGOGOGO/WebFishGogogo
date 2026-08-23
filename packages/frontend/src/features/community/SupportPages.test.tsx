import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { communityInvitesApi } from '../../api/community';
import { CommunityFeedPage } from './FeedPage';
import { CommunityInvitePage } from './InvitePage';

describe('support and invitation placeholders', () => {
  afterEach(() => vi.restoreAllMocks());

  it('explains site-owner support without presenting a fake payment control', () => {
    render(<CommunityFeedPage />);
    expect(screen.getByRole('heading', { name: '投喂站长' })).toBeInTheDocument();
    expect(screen.getByText('爱发电接入中')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '前往爱发电' })).not.toBeInTheDocument();
    expect(screen.getByText(/不赠送办公币/)).toBeInTheDocument();
  });

  it('shows only the persisted invitation-coin balance while actions are closed', async () => {
    vi.spyOn(communityInvitesApi, 'getOverview').mockResolvedValue({
      enabled: false,
      invitationCoins: 3,
      code: null,
      shareUrl: null,
      openedCount: 0,
      registeredCount: 0,
      pendingQualificationCount: 0,
      qualifiedCount: 0,
      invalidCount: 0,
      dailyQualifiedCount: 0,
      dailyQualifiedLimit: 5,
      monthlyQualifiedCount: 0,
      monthlyQualifiedLimit: 20,
      monthlyRewardCount: 0,
      monthlyRewardLimit: 5,
      rewardDescription: '邀请功能开发中',
      entries: [],
    });
    render(<CommunityInvitePage />);
    expect(await screen.findByText('3')).toBeInTheDocument();
    expect(screen.getByText(/邀请流程稍后上线/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /推荐码|邀请链接/ })).not.toBeInTheDocument();
  });
});
