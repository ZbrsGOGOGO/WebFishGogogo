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

    expect(screen.getByText('游客试玩')).toBeInTheDocument();
    expect(screen.getByText(/登录后即可创建在线角色/)).toBeInTheDocument();
    expect(screen.getByText('无需登录')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /选择程序员/ })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('enters the server archive only behind the gate for an onboarded account', () => {
    const verified = { onboardingCompleted: true, socialVerificationStatus: 'verified' };
    expect(shouldUseCommunityBattleServer(false, false, 'active', verified)).toBe(false);
    expect(shouldUseCommunityBattleServer(true, false, 'guest', null)).toBe(false);
    expect(shouldUseCommunityBattleServer(true, false, 'active', {
      ...verified,
      onboardingCompleted: false,
    })).toBe(false);
    expect(shouldUseCommunityBattleServer(true, true, 'active', {
      ...verified,
      socialVerificationStatus: 'unverified',
    })).toBe(false);
    expect(shouldUseCommunityBattleServer(true, false, 'active', {
      ...verified,
      socialVerificationStatus: 'unverified',
    })).toBe(true);
    expect(shouldUseCommunityBattleServer(true, true, 'active', verified)).toBe(true);
    expect(shouldUseCommunityBattleServer(true, false, 'banned', verified)).toBe(false);
  });
});
