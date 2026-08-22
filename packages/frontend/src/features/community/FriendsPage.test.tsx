import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resetCommunityAuthStoreForTests,
  useCommunityAuthStore,
} from '../../app/store/community-auth-store';
import {
  communityProfileApi,
  communityRelationshipsApi,
  type CommunityPublicProfile,
} from '../../api/community';
import { CommunityFriendsPage } from './FriendsPage';

const publicProfile: CommunityPublicProfile = {
  publicId: 'public-abc-123',
  displayName: '协作同事',
  avatarKey: 'green',
  battleProfession: 'developer',
  relationship: {
    status: 'none',
    canRequest: true,
    canFeed: false,
    canEncouragePlant: false,
    canBlock: true,
  },
};

describe('CommunityFriendsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetCommunityAuthStoreForTests();
    vi.spyOn(communityRelationshipsApi, 'listFriends').mockResolvedValue({
      items: [], total: 0, limit: 200, nextCursor: null,
    });
    vi.spyOn(communityRelationshipsApi, 'listRequests').mockResolvedValue({
      items: [], pendingIncomingCount: 0, pendingOutgoingCount: 0, dailySent: 0, dailyLimit: 20,
    });
    vi.spyOn(communityRelationshipsApi, 'listBlocks').mockResolvedValue({ items: [] });
  });

  function renderPage() {
    return render(<MemoryRouter><CommunityFriendsPage /></MemoryRouter>);
  }

  it('rejects email and phone lookup without sending an API request', async () => {
    const user = userEvent.setup();
    const searchSpy = vi.spyOn(communityProfileApi, 'getPublic');
    renderPage();
    const input = screen.getByLabelText('公开编号 publicId');

    input.focus();
    await user.keyboard('someone@example.com{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('不支持邮箱或手机号搜索');
    expect(searchSpy).not.toHaveBeenCalled();
  });

  it('supports exact publicId search and keyboard submission', async () => {
    const user = userEvent.setup();
    vi.spyOn(communityProfileApi, 'getPublic').mockResolvedValue(publicProfile);
    renderPage();
    const input = screen.getByLabelText('公开编号 publicId');

    input.focus();
    await user.keyboard('public-abc-123{Enter}');

    expect(await screen.findByRole('article', { name: '查找结果' })).toHaveTextContent('协作同事');
    expect(communityProfileApi.getPublic).toHaveBeenCalledWith('public-abc-123');
    await waitFor(() => expect(screen.queryByText('正在加载好友关系…')).not.toBeInTheDocument());
  });

  it('keeps proactive friend requests disabled before social verification', async () => {
    const user = userEvent.setup();
    useCommunityAuthStore.setState({
      phase: 'active',
      sessionReady: true,
      user: {
        id: 'public-me',
        publicId: 'public-me',
        email: 'me@example.com',
        displayName: '当前用户',
        accountStatus: 'active',
        onboardingCompleted: true,
        socialVerificationStatus: 'unverified',
      },
    });
    vi.spyOn(communityProfileApi, 'getPublic').mockResolvedValue(publicProfile);
    renderPage();

    await user.type(screen.getByLabelText('公开编号 publicId'), 'public-abc-123');
    await user.click(screen.getByRole('button', { name: '查找' }));

    expect(await screen.findByText(/主动建立好友关系前需要完成/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '发送申请' })).toBeDisabled();
  });
});
