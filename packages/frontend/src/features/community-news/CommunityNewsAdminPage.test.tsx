import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CommunityApiError,
  communityNewsApi,
  type CommunityAuthUser,
  type CommunityNewsAdminArticle,
  type CommunityNewsAdminSource,
} from '../../api/community';
import { resetCommunityAuthStoreForTests, useCommunityAuthStore } from '../../app/store/community-auth-store';
import { CommunityNewsAdminPage } from './CommunityNewsAdminPage';

const source: CommunityNewsAdminSource = {
  id: '11111111-1111-4111-8111-111111111111',
  name: '核验官方来源',
  sourceType: 'official',
  homepageUrl: 'https://news.example.com/',
  trustRank: 80,
  authorizationStatus: 'verified',
  authorizationEvidenceRef: 'internal-evidence-1',
  authorizationValidFrom: null,
  authorizationValidUntil: null,
  authorizationRevokedAt: null,
  version: 1,
  createdAt: '2026-08-20T07:00:00.000Z',
  updatedAt: '2026-08-20T07:00:00.000Z',
};

const { authorizationEvidenceRef: _evidence, ...editorSource } = source;
const article: CommunityNewsAdminArticle = {
  id: '22222222-2222-4222-8222-222222222222',
  status: 'draft',
  version: 3,
  source: editorSource,
  currentRevision: {
    version: 3,
    originalTitle: '需要独立复核的原始标题',
    summary: '这是一段由编辑人员独立撰写的来源导读摘要，长度符合服务端限制，不会复制或镜像来源网站的完整文章内容。',
    originalUrl: 'https://news.example.com/articles/2',
    originalPublishedAt: '2026-08-20T08:00:00.000Z',
    professionTags: ['developer'],
    topicTags: ['typescript'],
    correctionNote: null,
    createdAt: '2026-08-20T09:00:00.000Z',
  },
  publishedRevision: null,
  pendingRevision: null,
  submittedBy: null,
  submittedAt: null,
  reviewedBy: null,
  publishedAt: null,
  lastCorrectedAt: null,
  withdrawnAt: null,
  withdrawalNotice: null,
  createdAt: '2026-08-20T09:00:00.000Z',
  updatedAt: '2026-08-20T09:00:00.000Z',
};

const admin: CommunityAuthUser = {
  id: 'public-admin',
  publicId: 'public-admin',
  email: 'admin@example.com',
  displayName: '编辑管理员',
  accountStatus: 'active',
  onboardingCompleted: true,
  socialVerificationStatus: 'verified',
  roles: ['admin'],
};

describe('community news admin page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetCommunityAuthStoreForTests();
    useCommunityAuthStore.setState({ phase: 'active', user: admin, sessionReady: true });
    vi.spyOn(communityNewsApi, 'listSources').mockResolvedValue({ items: [source] });
    vi.spyOn(communityNewsApi, 'listAdminArticles').mockResolvedValue({ items: [article], nextCursor: null });
    vi.spyOn(communityNewsApi, 'getAdminArticle').mockResolvedValue(article);
  });

  it('loads real sources and drafts, and surfaces a 409 without overwriting the server version', async () => {
    const revise = vi.spyOn(communityNewsApi, 'reviseDraft').mockRejectedValue(
      new CommunityApiError(409, 'version conflict', { currentVersion: 4 }),
    );
    render(<MemoryRouter><CommunityNewsAdminPage /></MemoryRouter>);

    fireEvent.click(await screen.findByRole('button', { name: /需要独立复核的原始标题/ }));
    expect(await screen.findByDisplayValue('需要独立复核的原始标题')).toBeInTheDocument();
    expect(screen.getByLabelText('已核验来源')).toHaveValue(source.id);
    expect(screen.queryByText('internal-evidence-1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '保存修订' }));
    await waitFor(() => expect(revise).toHaveBeenCalledOnce());
    expect(await screen.findByText(/本次操作未覆盖服务器内容/)).toBeInTheDocument();
  });
});
