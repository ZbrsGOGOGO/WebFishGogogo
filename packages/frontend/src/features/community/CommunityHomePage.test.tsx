import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resetCommunityAuthStoreForTests,
  useCommunityAuthStore,
} from '../../app/store/community-auth-store';
import {
  communityNotificationsApi,
  communityProfileApi,
  type CommunityAuthUser,
  type CommunityProfile,
} from '../../api/community';
import { CommunityHomePage } from './CommunityHomePage';

const sessionUser: CommunityAuthUser = {
  id: 'user-1',
  publicId: 'ZBRS-1001',
  email: 'home@example.com',
  displayName: '首页用户',
  accountStatus: 'active',
  onboardingCompleted: true,
  socialVerificationStatus: 'verified',
  battleProfession: 'developer',
};

const currentProfile: CommunityProfile = {
  ...sessionUser,
  displayName: '真实主页用户',
  battleProfession: 'qa',
};

describe('CommunityHomePage profile summary', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetCommunityAuthStoreForTests();
    useCommunityAuthStore.setState({
      phase: 'active',
      sessionReady: true,
      user: sessionUser,
    });
    vi.spyOn(communityProfileApi, 'getMe').mockResolvedValue(currentProfile);
    vi.spyOn(communityNotificationsApi, 'list').mockResolvedValue({
      items: [],
      unreadCount: 0,
      nextCursor: null,
    });
  });

  it('uses the authoritative profile profession and renders its Chinese label', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <CommunityHomePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('真实主页用户')).toBeInTheDocument();
    expect(screen.getByText('社区职业：测试')).toBeInTheDocument();
    expect(screen.queryByText('社区职业：developer')).not.toBeInTheDocument();
    expect(communityProfileApi.getMe).toHaveBeenCalledTimes(1);
  });
});
