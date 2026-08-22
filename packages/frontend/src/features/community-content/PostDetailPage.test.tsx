import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { communityContentApi, type CommunityComment, type CommunityPostDetail } from '../../api/community';
import { resetCommunityAuthStoreForTests, useCommunityAuthStore } from '../../app/store/community-auth-store';
import { CommunityPostDetailPage } from './PostDetailPage';

const post: CommunityPostDetail = {
  id: 'q-1', type: 'question', channel: 'questions', title: '如何安全处理并发编辑问题', excerpt: '摘要', body: '这是一段公开显示并且满足产品长度约束的问答正文内容。', bodyFormat: 'plain_text', tags: ['并发'],
  author: { publicId: 'author-1', displayName: '提问者', avatarKey: 'blue' }, createdAt: '2026-08-22T00:00:00Z', updatedAt: '2026-08-22T00:00:00Z', commentCount: 2, usefulCount: 1, usefulByMe: false, bookmarked: false, followed: false, acceptedCommentId: 'c-1',
  publicationStatus: 'published', moderationStatus: 'normal', deletedAt: null, version: 2,
  writeEnabled: true,
  permissions: { canComment: true, canEdit: false, canDelete: false, canRestore: false, canSubmitReview: false, canWithdrawReview: false, canAcceptAnswer: false, canReport: true },
};

function comment(id: string, depth: 0 | 1, parentCommentId: string | null): CommunityComment {
  return {
    id, postId: 'q-1', parentCommentId, depth, body: depth === 0 ? '一级回答内容' : '一级回复内容',
    author: { publicId: `u-${id}`, displayName: depth === 0 ? '回答者' : '回复者', avatarKey: 'green' }, createdAt: '2026-08-22T01:00:00Z', updatedAt: '2026-08-22T01:00:00Z', usefulCount: 0,
    publicationStatus: 'published', moderationStatus: 'normal', deletedAt: null, version: 1,
    permissions: { canReply: true, canEdit: false, canDelete: false, canRestore: false, canSubmitReview: false, canWithdrawReview: false, canReport: true },
  };
}

describe('CommunityPostDetailPage comments', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetCommunityAuthStoreForTests();
    useCommunityAuthStore.setState({ phase: 'active', sessionReady: true, user: { id: 'viewer', publicId: 'viewer', email: 'v@example.com', displayName: '读者', accountStatus: 'active', onboardingCompleted: true, socialVerificationStatus: 'verified' } });
  });

  it('renders only a two-level tree and never offers a third-level reply', async () => {
    vi.spyOn(communityContentApi, 'getPost').mockResolvedValue(post);
    vi.spyOn(communityContentApi, 'listComments').mockResolvedValue({ items: [comment('c-1', 0, null), comment('c-2', 1, 'c-1')], nextCursor: null });
    render(<MemoryRouter initialEntries={['/community/posts/q-1']}><Routes><Route path="/community/posts/:id" element={<CommunityPostDetailPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: post.title })).toBeInTheDocument();
    expect(screen.getByText('一级回答内容')).toBeInTheDocument();
    expect(screen.getByText('一级回复内容')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '回复' })).toHaveLength(1);
    expect(screen.getByText('已采纳回答')).toBeInTheDocument();
  });
});
