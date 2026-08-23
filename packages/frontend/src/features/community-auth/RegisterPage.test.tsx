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

  it('creates a username account with versioned consent records and enters onboarding', async () => {
    const user = userEvent.setup();
    const register = vi.spyOn(communityAuthApi, 'register').mockResolvedValue({
      accessToken: 'short-lived',
      user: {
        id: 'public-1', publicId: 'public-1', email: '', username: 'office_user',
        displayName: 'office_user', accountStatus: 'active', onboardingCompleted: false,
        socialVerificationStatus: 'unverified',
      },
    });
    render(
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<CommunityRegisterPage />} />
          <Route path="/onboarding" element={<h1>设置职业</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByRole('textbox', { name: '账号' }), ' Office_User ');
    await user.type(screen.getByLabelText(/^密码/), 'secure-office-123');
    await user.type(screen.getByLabelText(/确认密码/), 'secure-office-123');
    await user.click(screen.getByRole('checkbox', { name: /已满 18 周岁/ }));
    await user.click(screen.getByRole('button', { name: '注册并进入' }));

    expect(register).toHaveBeenCalledWith({
      username: 'office_user',
      password: 'secure-office-123',
      consents: {
        termsVersion: COMMUNITY_LEGAL_VERSIONS.terms,
        privacyVersion: COMMUNITY_LEGAL_VERSIONS.privacy,
        communityGuidelinesVersion: COMMUNITY_LEGAL_VERSIONS.communityGuidelines,
        adultDeclarationVersion: COMMUNITY_LEGAL_VERSIONS.adultDeclaration,
      },
    });
    expect(await screen.findByRole('heading', { name: '设置职业' })).toBeInTheDocument();
  });

  it('submits and clears a short-lived referral binding', async () => {
    const user = userEvent.setup();
    saveCommunityReferralBinding({
      bindingToken: 'rct_one-time-binding',
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      inviter: { publicId: 'public-inviter', displayName: '邀请同事', avatarKey: 'violet' },
    });
    const register = vi.spyOn(communityAuthApi, 'register').mockResolvedValue({
      accessToken: 'short-lived',
      user: {
        id: 'public-2', publicId: 'public-2', email: '', username: 'invitee_user',
        displayName: 'invitee_user', accountStatus: 'active', onboardingCompleted: false,
        socialVerificationStatus: 'unverified',
      },
    });
    render(
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<CommunityRegisterPage />} />
          <Route path="/onboarding" element={<h1>设置职业</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText(/已接受 邀请同事 的邀请/)).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: '账号' }), 'invitee_user');
    await user.type(screen.getByLabelText(/^密码/), 'secure-office-456');
    await user.type(screen.getByLabelText(/确认密码/), 'secure-office-456');
    await user.click(screen.getByRole('checkbox', { name: /已满 18 周岁/ }));
    await user.click(screen.getByRole('button', { name: '注册并进入' }));

    expect(register).toHaveBeenCalledWith(expect.objectContaining({
      referralToken: 'rct_one-time-binding',
    }));
    expect(window.sessionStorage.getItem('zbrs.community.referral-binding.v1')).toBeNull();
  });
});
