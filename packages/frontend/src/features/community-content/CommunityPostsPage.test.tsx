import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { communityContentApi } from '../../api/community';
import { resetCommunityAuthStoreForTests, useCommunityAuthStore } from '../../app/store/community-auth-store';
import { CommunityPostsPage } from './CommunityPostsPage';

vi.mock('../../app/community-nav', () => ({ COMMUNITY_FEATURE_FLAGS: { community: true, chat: true, friends: true, moderation: true } }));
const empty = { items: [], availableTags: [], nextCursor: null, total: 0, writeEnabled: true };
function signedIn(roles: Array<'member' | 'moderator' | 'admin'> = ['member']): void {
  useCommunityAuthStore.setState({ phase: 'active', sessionReady: true, user: { id: 'u-1', publicId: 'u-1', email: 'user@example.invalid', displayName: '成员', accountStatus: 'active', onboardingCompleted: true, socialVerificationStatus: 'unverified', roles } });
}

describe('CommunityPostsPage', () => {
  beforeEach(() => { vi.restoreAllMocks(); resetCommunityAuthStoreForTests(); });

  it('invites the first post when the list is empty', async () => {
    vi.spyOn(communityContentApi, 'listPosts').mockResolvedValue({ items: [], availableTags: [], nextCursor: null, total: 0, writeEnabled: true });
    render(<MemoryRouter><CommunityPostsPage /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: '这里还没有帖子' })).toBeInTheDocument();
    expect(screen.getByText(/写下第一篇经验/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '发布帖子' })).toHaveAttribute('href', '/community/new');
    expect(screen.getByRole('link', { name: '写第一篇帖子' })).toBeInTheDocument();
  });

  it('keeps the writing entry visible for an unverified member without granting moderation', async () => {
    signedIn();
    vi.spyOn(communityContentApi, 'listPosts').mockResolvedValue(empty);
    render(<MemoryRouter><CommunityPostsPage /></MemoryRouter>);
    expect(await screen.findByText(/正常登录账号即可投稿/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '发布帖子' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '帖子审核' })).not.toBeInTheDocument();
  });

  it.each(['admin', 'moderator'] as const)('offers the existing %s role a direct review entry', async (role) => {
    signedIn([role]);
    vi.spyOn(communityContentApi, 'listPosts').mockResolvedValue(empty);
    render(<MemoryRouter><CommunityPostsPage /></MemoryRouter>);
    expect(await screen.findByRole('link', { name: '帖子审核' })).toHaveAttribute('href', '/moderation');
  });

  it('explains a closed write switch instead of hiding the editor', async () => {
    signedIn();
    vi.spyOn(communityContentApi, 'listPosts').mockResolvedValue({ ...empty, writeEnabled: false });
    render(<MemoryRouter><CommunityPostsPage /></MemoryRouter>);
    expect(await screen.findByText(/当前内容写入暂未开放/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '发布帖子' })).toBeInTheDocument();
  });

  it('does not apply the former account response after an account switch', async () => {
    signedIn();
    let resolveOld!: (page: typeof empty) => void;
    vi.spyOn(communityContentApi, 'listPosts').mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; })).mockResolvedValue({ ...empty, writeEnabled: false });
    render(<MemoryRouter><CommunityPostsPage /></MemoryRouter>);
    act(() => { const user = useCommunityAuthStore.getState().user!; useCommunityAuthStore.setState({ user: { ...user, id: 'u-2', publicId: 'u-2' } }); });
    expect(await screen.findByText(/当前内容写入暂未开放/)).toBeInTheDocument();
    await act(async () => { resolveOld(empty); });
    expect(screen.getByText(/当前内容写入暂未开放/)).toBeInTheDocument();
  });
});
