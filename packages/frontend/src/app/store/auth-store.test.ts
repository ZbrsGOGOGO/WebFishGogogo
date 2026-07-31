import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ApiError,
  authApi,
  clearStoredToken,
  getStoredToken,
  setStoredToken,
} from '../../api';
import { useAuthStore } from './auth-store';

const restoredUser = {
  id: 'user-1',
  email: 'a@example.com',
  displayName: '小明',
};

describe('auth store session restoration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearStoredToken();
    useAuthStore.setState({
      token: null,
      user: null,
      loading: false,
      sessionReady: true,
      error: null,
    });
  });

  it('restores a missing user from /auth/me when a token exists', async () => {
    setStoredToken('persisted-token');
    useAuthStore.setState({ token: 'persisted-token', user: null });
    const getCurrentUser = vi
      .spyOn(authApi, 'getCurrentUser')
      .mockResolvedValue(restoredUser);

    await useAuthStore.getState().restoreSession();

    expect(getCurrentUser).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState()).toMatchObject({
      token: 'persisted-token',
      user: restoredUser,
      loading: false,
      sessionReady: true,
      error: null,
    });
  });

  it('does not call /auth/me when no token exists or user is already loaded', async () => {
    const getCurrentUser = vi
      .spyOn(authApi, 'getCurrentUser')
      .mockResolvedValue(restoredUser);

    await useAuthStore.getState().restoreSession();
    useAuthStore.setState({ token: 'token', user: restoredUser });
    await useAuthStore.getState().restoreSession();

    expect(getCurrentUser).not.toHaveBeenCalled();
  });

  it('clears an invalid persisted session when /auth/me returns 401', async () => {
    setStoredToken('expired-token');
    useAuthStore.setState({ token: 'expired-token', user: null });
    vi.spyOn(authApi, 'getCurrentUser').mockRejectedValue(
      new ApiError(401, 'Invalid or expired token'),
    );

    await useAuthStore.getState().restoreSession();

    expect(getStoredToken()).toBeNull();
    expect(useAuthStore.getState()).toMatchObject({
      token: null,
      user: null,
      loading: false,
      sessionReady: true,
      error: null,
    });
  });

  it('keeps the token on a temporary network failure so restoration can retry', async () => {
    setStoredToken('persisted-token');
    useAuthStore.setState({ token: 'persisted-token', user: null });
    vi.spyOn(authApi, 'getCurrentUser').mockRejectedValue(
      new ApiError(0, '网络请求失败'),
    );

    await useAuthStore.getState().restoreSession();

    expect(getStoredToken()).toBe('persisted-token');
    expect(useAuthStore.getState()).toMatchObject({
      token: 'persisted-token',
      user: null,
      loading: false,
      sessionReady: true,
      error: '网络请求失败',
    });
  });

  it('does not let an old restore response overwrite a later logout', async () => {
    let resolveRequest: ((user: typeof restoredUser) => void) | undefined;
    vi.spyOn(authApi, 'getCurrentUser').mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );
    setStoredToken('persisted-token');
    useAuthStore.setState({ token: 'persisted-token', user: null });

    const restoring = useAuthStore.getState().restoreSession();
    useAuthStore.getState().logout();
    resolveRequest?.(restoredUser);
    await restoring;

    expect(useAuthStore.getState()).toMatchObject({
      token: null,
      user: null,
      loading: false,
      sessionReady: true,
    });
  });
});
