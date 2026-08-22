import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { communityModerationApi, communityNewsApi, type CommunityAuthUser } from '../api/community';
import { RequireCommunityModerator } from './community-route-guards';
import { resetCommunityAuthStoreForTests, useCommunityAuthStore } from './store/community-auth-store';

const user: CommunityAuthUser = {
  id: 'public-1', publicId: 'public-1', email: 'u@example.com', displayName: '审核用户', accountStatus: 'active', onboardingCompleted: true, socialVerificationStatus: 'verified', roles: ['member'],
};

describe('RequireCommunityModerator', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetCommunityAuthStoreForTests();
  });

  function renderGuard() {
    return render(<MemoryRouter><RequireCommunityModerator><p>审核机密内容</p></RequireCommunityModerator></MemoryRouter>);
  }

  it('denies an ordinary member without requesting moderator data', () => {
    const accessSpy = vi.spyOn(communityModerationApi, 'getAccess');
    useCommunityAuthStore.setState({ phase: 'active', user, sessionReady: true });
    renderGuard();
    expect(screen.getByRole('heading', { name: '没有审核权限' })).toBeInTheDocument();
    expect(screen.queryByText('审核机密内容')).not.toBeInTheDocument();
    expect(accessSpy).not.toHaveBeenCalled();
  });

  it('requires a second successful server permission check for moderators', async () => {
    vi.spyOn(communityModerationApi, 'getAccess').mockResolvedValue({ allowed: true, role: 'moderator', permissions: ['approve', 'limit', 'hide', 'restore'] });
    useCommunityAuthStore.setState({ phase: 'active', user: { ...user, roles: ['moderator'] }, sessionReady: true });
    renderGuard();
    expect(await screen.findByText('审核机密内容')).toBeInTheDocument();
    expect(communityModerationApi.getAccess).toHaveBeenCalledOnce();
  });

  it('uses the news-admin RBAC endpoint when the content feature is independently closed', async () => {
    const contentAccess = vi.spyOn(communityModerationApi, 'getAccess');
    vi.spyOn(communityNewsApi, 'listSources').mockResolvedValue({ items: [] });
    useCommunityAuthStore.setState({ phase: 'active', user: { ...user, roles: ['moderator'] }, sessionReady: true });
    render(<MemoryRouter><RequireCommunityModerator scope="news"><p>新闻编辑内容</p></RequireCommunityModerator></MemoryRouter>);

    expect(await screen.findByText('新闻编辑内容')).toBeInTheDocument();
    expect(communityNewsApi.listSources).toHaveBeenCalledOnce();
    expect(contentAccess).not.toHaveBeenCalled();
  });
});
