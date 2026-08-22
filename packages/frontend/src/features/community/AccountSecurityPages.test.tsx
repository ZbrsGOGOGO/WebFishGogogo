import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resetCommunityAuthStoreForTests,
  useCommunityAuthStore,
} from '../../app/store/community-auth-store';
import {
  communityAccountApi,
  communityAuthApi,
  communitySecurityApi,
  type CommunityAuthUser,
} from '../../api/community';
import { CommunityAccountSecurityPage } from './AccountSecurityPage';
import { CommunityAccountStatusPage } from './AccountStatusPage';
import { CommunitySocialVerificationPage } from './SocialVerificationPage';

const activeUser: CommunityAuthUser = {
  id: 'public-1',
  publicId: 'public-1',
  email: 'user@example.com',
  displayName: '办公室小张',
  accountStatus: 'active',
  onboardingCompleted: true,
  socialVerificationStatus: 'unverified',
};

describe('community account security pages', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetCommunityAuthStoreForTests();
  });

  it('does not load or show account deletion while its release gate is closed', async () => {
    useCommunityAuthStore.setState({ phase: 'active', user: activeUser, sessionReady: true });
    vi.spyOn(communityAuthApi, 'sessions').mockResolvedValue([]);
    const getDeletion = vi.spyOn(communityAccountApi, 'getDeletion');

    render(<MemoryRouter><CommunityAccountSecurityPage /></MemoryRouter>);

    expect(await screen.findByText('暂时没有设备记录')).toBeInTheDocument();
    expect(getDeletion).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: '注销账号' })).not.toBeInTheDocument();
  });

  it('shows pending verification as pending and never presents it as verified', async () => {
    vi.spyOn(communitySecurityApi, 'getSocialVerification').mockResolvedValue({
      status: 'pending',
      provider: '可信核验服务',
      submittedAt: '2026-08-22T08:00:00.000Z',
    });

    render(<MemoryRouter><CommunitySocialVerificationPage /></MemoryRouter>);

    expect(await screen.findByText('核验处理中')).toBeInTheDocument();
    expect(screen.queryByText('已核验')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '开始身份核验' })).not.toBeInTheDocument();
    expect(screen.getByText(/身份信息永不在公开主页/)).toBeInTheDocument();
  });

  it('updates the in-memory social gate only from the verified server status', async () => {
    useCommunityAuthStore.setState({ phase: 'active', user: activeUser, sessionReady: true });
    vi.spyOn(communitySecurityApi, 'getSocialVerification').mockResolvedValue({
      status: 'verified',
      verifiedAt: '2026-08-22T08:00:00.000Z',
    });

    render(<MemoryRouter><CommunitySocialVerificationPage /></MemoryRouter>);

    expect(await screen.findByText('已核验')).toBeInTheDocument();
    await waitFor(() => {
      expect(useCommunityAuthStore.getState().user?.socialVerificationStatus).toBe('verified');
    });
  });

  it('submits an appeal and displays exactly the returned pending status', async () => {
    const user = userEvent.setup();
    useCommunityAuthStore.setState({
      phase: 'suspended',
      user: { ...activeUser, accountStatus: 'suspended' },
      sessionReady: true,
    });
    vi.spyOn(communityAccountApi, 'getStatus').mockResolvedValue({
      accountStatus: 'suspended',
      reasonCode: 'RATE_LIMIT_REVIEW',
      reason: '服务端正在复核异常操作。',
      canAppeal: true,
      appeal: null,
    });
    const submit = vi.spyOn(communityAccountApi, 'submitAppeal').mockResolvedValue({
      id: 'appeal-1',
      status: 'pending',
      submittedAt: '2026-08-22T08:00:00.000Z',
    });

    render(<MemoryRouter><CommunityAccountStatusPage /></MemoryRouter>);

    await screen.findByText(/服务端说明：服务端正在复核异常操作。/);
    await user.type(
      screen.getByLabelText(/^申诉说明/),
      '我认为本次处置可能有误，请重新核验对应时间段内的操作记录。',
    );
    await user.click(screen.getByRole('button', { name: '提交申诉' }));

    expect(submit).toHaveBeenCalledWith(
      '我认为本次处置可能有误，请重新核验对应时间段内的操作记录。',
    );
    expect(await screen.findByText('申诉处理中')).toBeInTheDocument();
    expect(screen.queryByText('申诉已通过')).not.toBeInTheDocument();
  });
});
