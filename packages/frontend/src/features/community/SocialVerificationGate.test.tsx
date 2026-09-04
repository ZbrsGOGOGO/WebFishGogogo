import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('community social verification write gate', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('does not block an unverified account when social verification is disabled', async () => {
    vi.stubEnv('VITE_COMMUNITY_SOCIAL_VERIFICATION_ENABLED', 'false');
    vi.resetModules();
    const [{ useCommunitySocialWriteBlocked }, { useCommunityAuthStore }] =
      await Promise.all([
        import('./SocialVerificationGate'),
        import('../../app/store/community-auth-store'),
      ]);
    act(() => {
      useCommunityAuthStore.setState({
        user: {
          id: 'unverified-feature-off',
          publicId: 'unverified-feature-off',
          email: '',
          username: 'feature_off',
          displayName: '未核验用户',
          accountStatus: 'active',
          onboardingCompleted: true,
          socialVerificationStatus: 'unverified',
        },
      });
    });

    const { result } = renderHook(() => useCommunitySocialWriteBlocked());

    expect(result.current).toBe(false);
  });

  it('blocks only non-verified accounts when social verification is enabled', async () => {
    vi.stubEnv('VITE_COMMUNITY_SOCIAL_VERIFICATION_ENABLED', 'true');
    vi.resetModules();
    const [{ useCommunitySocialWriteBlocked }, { useCommunityAuthStore }] =
      await Promise.all([
        import('./SocialVerificationGate'),
        import('../../app/store/community-auth-store'),
      ]);
    act(() => {
      useCommunityAuthStore.setState({
        user: {
          id: 'verification-feature-on',
          publicId: 'verification-feature-on',
          email: '',
          username: 'feature_on',
          displayName: '待核验用户',
          accountStatus: 'active',
          onboardingCompleted: true,
          socialVerificationStatus: 'pending',
        },
      });
    });
    const { result } = renderHook(() => useCommunitySocialWriteBlocked());

    expect(result.current).toBe(true);

    act(() => {
      useCommunityAuthStore.setState((state) => ({
        user: state.user
          ? { ...state.user, socialVerificationStatus: 'verified' }
          : null,
      }));
    });

    expect(result.current).toBe(false);
  });
});
