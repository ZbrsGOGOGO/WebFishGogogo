import { beforeEach, describe, expect, it, vi } from 'vitest';

import { communityAuthApi, type CommunityAuthUser } from '../../api/community';
import {
  resetCommunityAuthStoreForTests,
  useCommunityAuthStore,
} from './community-auth-store';

const activeUser: CommunityAuthUser = {
  id: 'public-1',
  publicId: 'public-1',
  email: 'user@example.com',
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

  it('keeps registration pending until email verification and never auto-logins', async () => {
    const registration = {
      registrationId: 'reg-1',
      emailMasked: 'u***@example.com',
      verificationExpiresAt: '2026-08-22T12:10:00.000Z',
      resendAvailableAt: '2026-08-22T12:01:00.000Z',
      accountStatus: 'pending_email' as const,
    };
    const register = vi.spyOn(communityAuthApi, 'register').mockResolvedValue(registration);
    const login = vi.spyOn(communityAuthApi, 'login');
    vi.spyOn(communityAuthApi, 'verifyEmail').mockResolvedValue({
      accessToken: 'short-lived',
      user: activeUser,
    });

    await useCommunityAuthStore.getState().register({
      email: 'user@example.com',
      password: 'a-secure-password',
      displayName: '小张',
      betaAccessCode: 'BETA',
      consents: {
        termsVersion: 'v1',
        privacyVersion: 'v1',
        communityGuidelinesVersion: 'v1',
        adultDeclarationVersion: 'v1',
      },
    });

    expect(register).toHaveBeenCalledOnce();
    expect(login).not.toHaveBeenCalled();
    expect(useCommunityAuthStore.getState().phase).toBe('pending_email');
    expect(window.sessionStorage.getItem('zbrs.community.pending-registration.v1')).toContain('reg-1');
    expect(window.localStorage).toHaveLength(0);

    await useCommunityAuthStore.getState().verifyEmail('123456');
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
});

