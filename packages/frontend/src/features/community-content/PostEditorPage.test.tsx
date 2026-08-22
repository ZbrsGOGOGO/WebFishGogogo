import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CommunityApiError, communityContentApi, type CommunityPostDetail } from '../../api/community';
import { resetCommunityAuthStoreForTests, useCommunityAuthStore } from '../../app/store/community-auth-store';
import { CommunityPostEditorPage } from './PostEditorPage';

const post: CommunityPostDetail = {
  id: 'p-1', type: 'experience', channel: 'general', title: '这是一个有效的经验标题', excerpt: '摘要', body: '这是满足最小长度限制的正文内容，用于验证并发编辑冲突提示。', bodyFormat: 'plain_text', tags: ['测试'],
  author: { publicId: 'u-1', displayName: '作者', avatarKey: 'green' }, createdAt: '2026-08-22T00:00:00Z', updatedAt: '2026-08-22T00:00:00Z', commentCount: 0, usefulCount: 0, usefulByMe: false, bookmarked: false, followed: false, acceptedCommentId: null,
  publicationStatus: 'draft', moderationStatus: 'normal', deletedAt: null, version: 3,
  writeEnabled: true,
  permissions: { canComment: false, canEdit: true, canDelete: true, canRestore: false, canSubmitReview: true, canWithdrawReview: false, canAcceptAnswer: false, canReport: false },
};

describe('CommunityPostEditorPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetCommunityAuthStoreForTests();
    useCommunityAuthStore.setState({ phase: 'active', sessionReady: true, user: { id: 'u-1', publicId: 'u-1', email: 'u@example.com', displayName: '作者', accountStatus: 'active', onboardingCompleted: true, socialVerificationStatus: 'verified' } });
  });

  it('does not overwrite a newer server version after 409', async () => {
    const user = userEvent.setup();
    vi.spyOn(communityContentApi, 'getPost').mockResolvedValue(post);
    vi.spyOn(communityContentApi, 'updatePost').mockRejectedValue(new CommunityApiError(409, 'conflict', { currentVersion: 4 }));
    render(<MemoryRouter initialEntries={['/community/posts/p-1/edit']}><Routes><Route path="/community/posts/:id/edit" element={<CommunityPostEditorPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByDisplayValue(post.title)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '保存草稿' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('没有覆盖服务器内容');
    expect(screen.getByText('服务器当前版本：v4')).toBeInTheDocument();
    expect(communityContentApi.updatePost).toHaveBeenCalledWith('p-1', expect.any(Object), 3, expect.stringContaining('post-update:p-1'));
  });
});
