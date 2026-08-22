import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resetCommunityAuthStoreForTests,
  useCommunityAuthStore,
} from '../../app/store/community-auth-store';
import {
  communityProfileApi,
  type CommunityAuthUser,
  type CommunityProfile,
} from '../../api/community';
import { CommunityOnboardingPage } from './OnboardingPage';

const incompleteUser: CommunityAuthUser = {
  id: 'user-onboarding',
  publicId: 'ZBRS-ONBOARDING',
  email: 'onboarding@example.com',
  displayName: '旧昵称',
  accountStatus: 'active',
  onboardingCompleted: false,
  socialVerificationStatus: 'unverified',
};

describe('CommunityOnboardingPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetCommunityAuthStoreForTests();
    useCommunityAuthStore.setState({
      phase: 'active',
      sessionReady: true,
      user: incompleteUser,
    });
  });

  it('submits the selected identity and applies the returned profile before entering the community', async () => {
    const user = userEvent.setup();
    const returnedProfile: CommunityProfile = {
      ...incompleteUser,
      displayName: '服务端确认昵称',
      avatarKey: 'green',
      battleProfession: 'product',
      onboardingCompleted: true,
      bio: null,
    };
    const updateProfile = vi
      .spyOn(communityProfileApi, 'updateProfile')
      .mockResolvedValue(returnedProfile);

    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <Routes>
          <Route path="/onboarding" element={<CommunityOnboardingPage />} />
          <Route path="/" element={<h1>社区首页</h1>} />
          <Route path="/me" element={<h1>我的主页</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.clear(screen.getByLabelText(/社区昵称/));
    await user.type(screen.getByLabelText(/社区昵称/), '  新办公室昵称  ');
    await user.click(screen.getByRole('button', { name: /绿色工位/ }));
    await user.click(screen.getByRole('button', { name: /产品经理/ }));
    await user.click(screen.getByRole('button', { name: '保存并进入社区' }));

    expect(updateProfile).toHaveBeenCalledWith({
      displayName: '新办公室昵称',
      avatarKey: 'green',
      battleProfession: 'product',
      onboardingCompleted: true,
    });
    expect(await screen.findByRole('heading', { name: '社区首页' })).toBeInTheDocument();
    await waitFor(() => {
      expect(useCommunityAuthStore.getState()).toMatchObject({
        phase: 'active',
        user: returnedProfile,
      });
    });
    expect(screen.queryByRole('heading', { name: '我的主页' })).not.toBeInTheDocument();
  });
});
