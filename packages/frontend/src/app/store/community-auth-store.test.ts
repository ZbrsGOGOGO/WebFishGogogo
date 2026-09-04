import { beforeEach, describe, expect, it, vi } from 'vitest';

import { communityAuthApi, type CommunityAuthUser } from '../../api/community';
import {
  getCommunityAccessToken,
  setCommunitySessionTokens,
} from '../../api/community-http';
import {
  resetCommunityAuthStoreForTests,
  useCommunityAuthStore,
} from './community-auth-store';

const activeUser: CommunityAuthUser = {
  id: 'public-1',
  publicId: 'public-1',
  email: 'user@example.com',
  username: 'office_user',
  displayName: '小张',
  accountStatus: 'active',
  onboardingCompleted: false,
  socialVerificationStatus: 'unverified',
};

describe('community auth store', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    resetCommunityAuthStoreForTests();
  });

  it('activates a username account immediately without persisting credentials in browser storage', async () => {
    const register = vi.spyOn(communityAuthApi, 'register').mockResolvedValue({
      accessToken: 'short-lived',
      user: activeUser,
    });
    const login = vi.spyOn(communityAuthApi, 'login');

    await useCommunityAuthStore.getState().register({
      username: 'office_user',
      password: 'a-secure-password',
      consents: {
        termsVersion: 'v1',
        privacyVersion: 'v1',
        communityGuidelinesVersion: 'v1',
        adultDeclarationVersion: 'v1',
      },
    });

    expect(register).toHaveBeenCalledOnce();
    expect(login).not.toHaveBeenCalled();
    expect(useCommunityAuthStore.getState()).toMatchObject({
      phase: 'active',
      user: activeUser,
      pendingRegistration: null,
    });
    expect(window.sessionStorage).toHaveLength(0);
    expect(window.localStorage).toHaveLength(0);
  });

  it('single-flights StrictMode-style startup restoration', async () => {
    const refresh = vi.spyOn(communityAuthApi, 'refresh').mockResolvedValue({
      accessToken: 'short-lived',
      user: { ...activeUser, onboardingCompleted: true },
    });
    useCommunityAuthStore.setState({
      phase: 'bootstrapping',
      sessionReady: false,
      user: null,
    });

    await Promise.all([
      useCommunityAuthStore.getState().restoreSession(),
      useCommunityAuthStore.getState().restoreSession(),
    ]);

    expect(refresh).toHaveBeenCalledOnce();
    expect(useCommunityAuthStore.getState()).toMatchObject({
      phase: 'active',
      sessionReady: true,
      user: { onboardingCompleted: true },
    });
  });

  it('forgets the in-memory access token when a security action resets the session', () => {
    setCommunitySessionTokens('revoked-access-token');
    useCommunityAuthStore.setState({ phase: 'active', user: activeUser });

    useCommunityAuthStore.getState().reset();

    expect(getCommunityAccessToken()).toBeNull();
    expect(useCommunityAuthStore.getState()).toMatchObject({
      phase: 'guest',
      user: null,
      sessionReady: true,
    });
  });
});
