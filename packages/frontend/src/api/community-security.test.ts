import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  communityAccountApi,
  communityAuthApi,
  communitySecurityApi,
  requireHttpsVerificationLaunchUrl,
} from './community';
import {
  resetCommunityHttpForTests,
  setCommunitySessionTokens,
} from './community-http';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('community account security contracts', () => {
  beforeEach(() => {
    resetCommunityHttpForTests();
    setCommunitySessionTokens('access-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetCommunityHttpForTests();
  });

  it('only accepts absolute credential-free HTTPS verification launch URLs', () => {
    expect(requireHttpsVerificationLaunchUrl('https://verify.example.com/start?id=1'))
      .toBe('https://verify.example.com/start?id=1');
    expect(() => requireHttpsVerificationLaunchUrl('http://verify.example.com/start'))
      .toThrow(/HTTPS/);
    expect(() => requireHttpsVerificationLaunchUrl('/relative/start'))
      .toThrow(/无效/);
    expect(() => requireHttpsVerificationLaunchUrl('https://user:secret@verify.example.com/start'))
      .toThrow(/HTTPS/);
  });

  it('creates a verification session with a fixed return path and validates the response URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      sessionId: 'verify-session-1',
      launchUrl: 'https://verify.example.com/start/1',
      expiresAt: '2026-08-22T09:00:00.000Z',
    }));
    vi.stubGlobal('fetch', fetchMock);

    const session = await communitySecurityApi.createSocialVerificationSession();

    expect(session.launchUrl).toBe('https://verify.example.com/start/1');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1/me/social-verification/sessions');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ returnPath: '/settings/verification' });
  });

  it('never refreshes or replays a verification-session write after 401', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: 'expired' }, 401));
    vi.stubGlobal('fetch', fetchMock);

    await expect(communitySecurityApi.createSocialVerificationSession())
      .rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('uses the new anti-enumeration password reset endpoints and payload names', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await communityAuthApi.forgotPassword('user@example.com');
    await communityAuthApi.resetPassword({ token: 'opaque-token', newPassword: 'new-password-123' });

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(requestUrl).toContain('/v1/auth/password-reset-requests');
    expect(JSON.parse(String(requestInit.body))).toEqual({ email: 'user@example.com' });
    const [resetUrl, resetInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(resetUrl).toContain('/v1/auth/password-resets');
    expect(JSON.parse(String(resetInit.body))).toEqual({
      token: 'opaque-token',
      newPassword: 'new-password-123',
    });
  });

  it('sends DELETE confirmation and the caller idempotency key without replaying 401', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: 'expired' }, 401));
    vi.stubGlobal('fetch', fetchMock);

    await expect(communityAccountApi.requestDeletion('account-deletion:fixed'))
      .rejects.toMatchObject({ status: 401 });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1/me/account-deletion-requests');
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe('account-deletion:fixed');
    expect(JSON.parse(String(init.body))).toEqual({ confirmation: 'DELETE' });
  });

  it('submits an appeal as a non-replayed write', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: 'expired' }, 401));
    vi.stubGlobal('fetch', fetchMock);

    await expect(communityAccountApi.submitAppeal('处置可能有误，请重新核验相关记录。'))
      .rejects.toMatchObject({ status: 401 });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1/me/account-appeals');
    expect(JSON.parse(String(init.body))).toEqual({ reason: '处置可能有误，请重新核验相关记录。' });
  });

  it('uses the restricted-account read and cancellation paths exactly', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        accountStatus: 'deleting',
        canAppeal: false,
      }))
      .mockResolvedValueOnce(jsonResponse({
        status: 'cooling_off',
        canCancel: true,
      }))
      .mockResolvedValueOnce(jsonResponse({
        status: 'cancelled',
        canCancel: false,
      }));
    vi.stubGlobal('fetch', fetchMock);

    await communityAccountApi.getStatus();
    await communityAccountApi.getDeletion();
    await communityAccountApi.cancelDeletion();

    expect((fetchMock.mock.calls[0] as [string])[0]).toContain('/v1/me/account-status');
    expect((fetchMock.mock.calls[1] as [string])[0]).toContain('/v1/me/account-deletion');
    const [cancelUrl, cancelInit] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(cancelUrl).toContain('/v1/me/account-deletion/cancel');
    expect(cancelInit.method).toBe('POST');
  });
});
