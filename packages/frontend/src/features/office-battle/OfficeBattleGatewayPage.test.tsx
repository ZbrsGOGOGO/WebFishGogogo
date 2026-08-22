import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetCommunityAuthStoreForTests } from '../../app/store/community-auth-store';
import {
  OfficeBattleGatewayPage,
  shouldUseCommunityBattleServer,
} from './OfficeBattleGatewayPage';

describe('OfficeBattleGatewayPage default gate', () => {
  beforeEach(() => {
    resetCommunityAuthStoreForTests();
    window.localStorage.clear();
  });

  it('keeps the server archive closed and runs the existing guest local trial without an API call', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <OfficeBattleGatewayPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('单机畅玩模式')).toBeInTheDocument();
    expect(screen.getByText(/等级和装备会保存在当前设备/)).toBeInTheDocument();
    expect(screen.getByText('无需登录')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /选择程序员/ })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('enters the server archive only behind the gate for an onboarded account', () => {
    const verified = { onboardingCompleted: true, socialVerificationStatus: 'verified' };
    expect(shouldUseCommunityBattleServer(false, 'active', verified)).toBe(false);
    expect(shouldUseCommunityBattleServer(true, 'guest', null)).toBe(false);
    expect(shouldUseCommunityBattleServer(true, 'active', {
      ...verified,
      onboardingCompleted: false,
    })).toBe(false);
    expect(shouldUseCommunityBattleServer(true, 'active', {
      ...verified,
      socialVerificationStatus: 'unverified',
    })).toBe(false);
    expect(shouldUseCommunityBattleServer(true, 'active', verified)).toBe(true);
    expect(shouldUseCommunityBattleServer(true, 'banned', verified)).toBe(false);
  });
});
