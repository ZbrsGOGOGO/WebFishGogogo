import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CommunityApiError,
  communityAuthApi,
  type CommunityAuthUser,
  type CommunityLoginResult,
} from '../../api/community';
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

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

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

  it('does not restore a token or identity when an old refresh succeeds after reset', async () => {
    const refreshResult = deferred<CommunityLoginResult>();
    vi.spyOn(communityAuthApi, 'refresh').mockReturnValue(refreshResult.promise);
    useCommunityAuthStore.setState({
      phase: 'bootstrapping',
      sessionReady: false,
      user: null,
    });

    const restoring = useCommunityAuthStore.getState().restoreSession();
    useCommunityAuthStore.getState().reset();
    refreshResult.resolve({
      accessToken: 'stale-restored-token',
      user: { ...activeUser, displayName: '旧会话' },
    });
    await restoring;

    expect(getCommunityAccessToken()).toBeNull();
    expect(useCommunityAuthStore.getState()).toMatchObject({
      phase: 'guest',
      user: null,
      sessionReady: true,
    });
  });

  it('keeps a new login when an older restore later fails', async () => {
    const refreshResult = deferred<CommunityLoginResult>();
    vi.spyOn(communityAuthApi, 'refresh').mockReturnValue(refreshResult.promise);
    vi.spyOn(communityAuthApi, 'login').mockImplementation(async () => {
      setCommunitySessionTokens('new-login-token', 'new-login-csrf');
      return {
        accessToken: 'new-login-token',
        csrfToken: 'new-login-csrf',
        user: { ...activeUser, displayName: '新会话' },
      };
    });
    useCommunityAuthStore.setState({
      phase: 'bootstrapping',
      sessionReady: false,
      user: null,
    });

    const restoring = useCommunityAuthStore.getState().restoreSession();
    await useCommunityAuthStore.getState().login({
      username: 'office_user',
      password: 'a-secure-password',
    });
    refreshResult.reject(
      new CommunityApiError(401, '旧刷新令牌已失效', { code: 'INVALID_SESSION' }),
    );
    await restoring;

    expect(getCommunityAccessToken()).toBe('new-login-token');
    expect(useCommunityAuthStore.getState()).toMatchObject({
      phase: 'active',
      user: { displayName: '新会话' },
      sessionReady: true,
      error: null,
      bootstrapError: null,
    });
  });

  it('keeps a newer restore single-flight when a detached restore settles', async () => {
    const oldRefresh = deferred<CommunityLoginResult>();
    const currentRefresh = deferred<CommunityLoginResult>();
    const refresh = vi
      .spyOn(communityAuthApi, 'refresh')
      .mockReturnValueOnce(oldRefresh.promise)
      .mockReturnValueOnce(currentRefresh.promise);
    useCommunityAuthStore.setState({
      phase: 'bootstrapping',
      sessionReady: false,
      user: null,
    });

    const oldRestore = useCommunityAuthStore.getState().restoreSession();
    useCommunityAuthStore.getState().reset();
    useCommunityAuthStore.setState({
      phase: 'bootstrapping',
      sessionReady: false,
      user: null,
    });
    const currentRestore = useCommunityAuthStore.getState().restoreSession();

    oldRefresh.resolve({ accessToken: 'old-token', user: activeUser });
    await oldRestore;
    const joinedCurrentRestore = useCommunityAuthStore.getState().restoreSession();
    expect(joinedCurrentRestore).toBe(currentRestore);
    expect(refresh).toHaveBeenCalledTimes(2);

    currentRefresh.resolve({
      accessToken: 'current-token',
      user: { ...activeUser, displayName: '当前会话' },
    });
    await currentRestore;
    expect(useCommunityAuthStore.getState().user?.displayName).toBe('当前会话');
  });

  it.each([
    ['logout', 'logout'],
    ['logoutAll', 'logoutAll'],
  ] as const)('%s makes the local session guest before its request or restore settles', async (
    action,
    apiMethod,
  ) => {
    const refreshResult = deferred<CommunityLoginResult>();
    const logoutResult = deferred<void>();
    vi.spyOn(communityAuthApi, 'refresh').mockReturnValue(refreshResult.promise);
    vi.spyOn(communityAuthApi, apiMethod).mockReturnValue(logoutResult.promise);
    setCommunitySessionTokens('active-token', 'active-csrf');
    useCommunityAuthStore.setState({
      phase: 'bootstrapping',
      sessionReady: false,
      user: activeUser,
    });

    const restoring = useCommunityAuthStore.getState().restoreSession();
    const loggingOut = useCommunityAuthStore.getState()[action]();

    expect(getCommunityAccessToken()).toBeNull();
    expect(useCommunityAuthStore.getState()).toMatchObject({
      phase: 'guest',
      user: null,
      loading: false,
      sessionReady: true,
    });

    refreshResult.resolve({ accessToken: 'stale-token', user: activeUser });
    await restoring;
    expect(useCommunityAuthStore.getState()).toMatchObject({
      phase: 'guest',
      user: null,
    });

    logoutResult.reject(new Error('network unavailable'));
    await loggingOut;
    expect(useCommunityAuthStore.getState().phase).toBe('guest');
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
