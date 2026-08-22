import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { communityInvitesApi } from '../../api/community';
import { CommunityReferralAcceptPage } from './ReferralAcceptPage';

describe('CommunityReferralAcceptPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  it('previews the share code and continues with an opaque binding token', async () => {
    const user = userEvent.setup();
    const preview = vi.spyOn(communityInvitesApi, 'preview').mockResolvedValue({
      bindingToken: 'rct_one-time-binding',
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      inviter: { publicId: 'public-inviter', displayName: '邀请同事', avatarKey: 'violet' },
    });
    render(
      <MemoryRouter initialEntries={['/invite/accept?code=ref_share-code']}>
        <Routes>
          <Route path="/invite/accept" element={<CommunityReferralAcceptPage />} />
          <Route path="/register" element={<h1>注册账号</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText((_content, element) =>
      element?.tagName === 'P' &&
      element.textContent === '邀请同事 邀请你加入办公室社区。',
    )).toBeInTheDocument();
    expect(preview).toHaveBeenCalledWith('ref_share-code');
    const stored = window.sessionStorage.getItem('zbrs.community.referral-binding.v1');
    expect(stored).toContain('rct_one-time-binding');
    expect(stored).not.toContain('ref_share-code');
    await user.click(screen.getByRole('button', { name: '继续创建账号' }));
    expect(await screen.findByRole('heading', { name: '注册账号' })).toBeInTheDocument();
  });

  it('does not call the backend for a truncated invitation URL', async () => {
    const preview = vi.spyOn(communityInvitesApi, 'preview');
    render(
      <MemoryRouter initialEntries={['/invite/accept']}>
        <CommunityReferralAcceptPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/缺少推荐码/);
    expect(preview).not.toHaveBeenCalled();
  });
});
