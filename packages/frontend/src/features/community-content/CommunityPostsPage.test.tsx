import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { communityContentApi } from '../../api/community';
import { CommunityPostsPage } from './CommunityPostsPage';

describe('CommunityPostsPage', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('invites the first post when the list is empty', async () => {
    vi.spyOn(communityContentApi, 'listPosts').mockResolvedValue({ items: [], availableTags: [], nextCursor: null, total: 0, writeEnabled: true });
    render(<MemoryRouter><CommunityPostsPage /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: '这里还没有帖子' })).toBeInTheDocument();
    expect(screen.getByText(/写下第一篇经验/)).toBeInTheDocument();
  });
});
