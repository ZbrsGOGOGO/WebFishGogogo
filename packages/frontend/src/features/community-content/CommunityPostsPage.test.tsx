import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { communityContentApi } from '../../api/community';
import { CommunityPostsPage } from './CommunityPostsPage';

describe('CommunityPostsPage', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('shows a truthful empty state without fake posts or heat', async () => {
    vi.spyOn(communityContentApi, 'listPosts').mockResolvedValue({ items: [], availableTags: [], nextCursor: null, total: 0, writeEnabled: true });
    render(<MemoryRouter><CommunityPostsPage /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: '当前还没有真实帖子' })).toBeInTheDocument();
    expect(screen.getByText(/不会用假用户、假评论或假热度/)).toBeInTheDocument();
  });
});
