import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { COMMUNITY_LEGAL_VERSIONS } from '../../app/community-legal';
import { resetCommunityAuthStoreForTests } from '../../app/store/community-auth-store';
import { communityAuthApi } from '../../api/community';
import { CommunityRegisterPage } from './RegisterPage';
import { saveCommunityReferralBinding } from './referral-binding';

describe('CommunityRegisterPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
    resetCommunityAuthStoreForTests();
  });

  it('submits beta access, versioned consents and adult declaration before verification', async () => {
    const user = userEvent.setup();
    const register = vi.spyOn(communityAuthApi, 'register').mockResolvedValue({
      registrationId: 'reg-1',
      emailMasked: 'u***@example.com',
      verificationExpiresAt: new Date(Date.now() + 600_000).toISOString(),
      resendAvailableAt: new Date(Date.now() + 60_000).toISOString(),
      accountStatus: 'pending_email',
    });
    render(
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<CommunityRegisterPage />} />
          <Route path="/register/verify" element={<h1>验证下一步</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/Beta 准入码/), 'BETA-ONE');
    await user.type(screen.getByLabelText(/邮箱/), ' User@Example.COM ');
    await user.type(screen.getByLabelText(/昵称/), '办公室小张');
    await user.type(screen.getByLabelText(/^密码/), 'secure-office-123');
    await user.type(screen.getByLabelText(/确认密码/), 'secure-office-123');
    await user.click(screen.getByRole('checkbox', { name: /服务条款/ }));
    await user.click(screen.getByRole('checkbox', { name: /隐私政策/ }));
    await user.click(screen.getByRole('checkbox', { name: /社区规范/ }));
    await user.click(screen.getByRole('checkbox', { name: /已满 18 周岁/ }));
    await user.click(screen.getByRole('button', { name: '提交并验证邮箱' }));

    expect(register).toHaveBeenCalledWith({
      betaAccessCode: 'BETA-ONE',
      email: 'user@example.com',
      displayName: '办公室小张',
      password: 'secure-office-123',
      consents: {
        termsVersion: COMMUNITY_LEGAL_VERSIONS.terms,
        privacyVersion: COMMUNITY_LEGAL_VERSIONS.privacy,
        communityGuidelinesVersion: COMMUNITY_LEGAL_VERSIONS.communityGuidelines,
        adultDeclarationVersion: COMMUNITY_LEGAL_VERSIONS.adultDeclaration,
      },
    });
    expect(await screen.findByRole('heading', { name: '验证下一步' })).toBeInTheDocument();
  });

  it('submits and clears a short-lived referral binding without replacing the beta code', async () => {
    const user = userEvent.setup();
    saveCommunityReferralBinding({
      bindingToken: 'rct_one-time-binding',
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      inviter: { publicId: 'public-inviter', displayName: '邀请同事', avatarKey: 'violet' },
    });
    const register = vi.spyOn(communityAuthApi, 'register').mockResolvedValue({
      registrationId: 'reg-referral',
      emailMasked: 'i***@example.com',
      verificationExpiresAt: new Date(Date.now() + 600_000).toISOString(),
      resendAvailableAt: new Date(Date.now() + 60_000).toISOString(),
      accountStatus: 'pending_email',
    });
    render(
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<CommunityRegisterPage />} />
          <Route path="/register/verify" element={<h1>验证下一步</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText(/已接受 邀请同事 的推荐/)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Beta 准入码/), 'BETA-TWO');
    await user.type(screen.getByLabelText(/邮箱/), 'invitee@example.com');
    await user.type(screen.getByLabelText(/昵称/), '被邀请同事');
    await user.type(screen.getByLabelText(/^密码/), 'secure-office-456');
    await user.type(screen.getByLabelText(/确认密码/), 'secure-office-456');
    for (const checkbox of screen.getAllByRole('checkbox')) await user.click(checkbox);
    await user.click(screen.getByRole('button', { name: '提交并验证邮箱' }));

    expect(register).toHaveBeenCalledWith(expect.objectContaining({
      betaAccessCode: 'BETA-TWO',
      referralToken: 'rct_one-time-binding',
    }));
    expect(window.sessionStorage.getItem('zbrs.community.referral-binding.v1')).toBeNull();
  });
});
