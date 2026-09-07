import { act, render, screen, waitFor } from '@testing-library/react';
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
    const searchSpy = vi.spyOn(communityProfileApi, 'findUser');
    renderPage();
    const input = screen.getByLabelText('账号或公开编号');

    input.focus();
    await user.keyboard('someone@example.com{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('不支持用邮箱或手机号');
    expect(searchSpy).not.toHaveBeenCalled();
  });

  it('supports exact publicId search and keyboard submission', async () => {
    const user = userEvent.setup();
    vi.spyOn(communityProfileApi, 'findUser').mockResolvedValue(publicProfile);
    renderPage();
    const input = screen.getByLabelText('账号或公开编号');

    input.focus();
    await user.keyboard('public-abc-123{Enter}');

    expect(await screen.findByRole('article', { name: '查找结果' })).toHaveTextContent('协作同事');
    expect(communityProfileApi.findUser).toHaveBeenCalledWith('public-abc-123');
    await waitFor(() => expect(screen.queryByText('正在加载好友关系…')).not.toBeInTheDocument());
  });

  it('accepts an @username without mistaking it for an email address', async () => {
    const user = userEvent.setup();
    vi.spyOn(communityProfileApi, 'findUser').mockResolvedValue({
      ...publicProfile,
      username: 'xiaoming',
    });
    renderPage();

    await user.type(screen.getByLabelText('账号或公开编号'), '@xiaoming');
    await user.click(screen.getByRole('button', { name: '查找' }));

    expect(await screen.findByRole('article', { name: '查找结果' })).toHaveTextContent('协作同事');
    expect(communityProfileApi.findUser).toHaveBeenCalledWith('@xiaoming');
  });

  it.each(['success', 'failure'] as const)('ignores a late lookup %s after a new search', async (outcome) => {
    const user = userEvent.setup();
    let resolveOld!: (profile: CommunityPublicProfile) => void;
    let rejectOld!: (error: Error) => void;
    const oldLookup = new Promise<CommunityPublicProfile>((resolve, reject) => {
      resolveOld = resolve;
      rejectOld = reject;
    });
    vi.spyOn(communityProfileApi, 'findUser')
      .mockReturnValueOnce(oldLookup)
      .mockResolvedValueOnce({ ...publicProfile, publicId: 'new-person', displayName: '新查找的同事' });
    renderPage();
    const input = screen.getByLabelText('账号或公开编号');
    await user.type(input, '@old_person');
    await user.click(screen.getByRole('button', { name: '查找' }));
    await user.clear(input);
    await user.type(input, '@new_person');
    await user.click(screen.getByRole('button', { name: '查找' }));
    expect(await screen.findByRole('article', { name: '查找结果' })).toHaveTextContent('新查找的同事');
    await act(async () => {
      if (outcome === 'success') resolveOld(publicProfile);
      else rejectOld(new Error('旧查询失败'));
    });
    expect(screen.getByRole('article', { name: '查找结果' })).toHaveTextContent('新查找的同事');
    expect(screen.queryByText('协作同事')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('hides the previous profile as soon as the lookup identifier changes', async () => {
    const user = userEvent.setup();
    vi.spyOn(communityProfileApi, 'findUser').mockResolvedValue(publicProfile);
    renderPage();
    const input = screen.getByLabelText('账号或公开编号');
    await user.type(input, '@old_person');
    await user.click(screen.getByRole('button', { name: '查找' }));
    expect(await screen.findByRole('button', { name: '发送申请' })).toBeInTheDocument();
    await user.clear(input);
    expect(screen.queryByRole('article', { name: '查找结果' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '发送申请' })).not.toBeInTheDocument();
  });

  it('allows proactive friend requests when social verification is disabled', async () => {
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
    vi.spyOn(communityProfileApi, 'findUser').mockResolvedValue(publicProfile);
    renderPage();

    await user.type(screen.getByLabelText('账号或公开编号'), 'public-abc-123');
    await user.click(screen.getByRole('button', { name: '查找' }));

    expect(await screen.findByRole('button', { name: '发送申请' })).toBeEnabled();
    expect(screen.queryByText(/主动建立好友关系前需要完成/)).not.toBeInTheDocument();
  });
});
