import {
  CommunityApiError,
  communityHttp,
  getCommunitySessionGeneration,
  refreshCommunitySession,
  setCommunitySessionTokensIfCurrent,
  type CommunitySessionEnvelope,
} from './community-http';

export type CommunityAccountStatus =
  | 'pending_email'
  | 'active'
  | 'suspended'
  | 'banned'
  | 'deleting';

export type SocialVerificationStatus =
  | 'unverified'
  | 'pending'
  | 'verified'
  | 'rejected'
  | 'expired';

export type CommunityRole = 'member' | 'moderator' | 'admin' | 'safety';

export interface CommunityAuthUser {
  id: string;
  publicId: string;
  email: string;
  username?: string | null;
  displayName: string | null;
  accountStatus: CommunityAccountStatus;
  onboardingCompleted: boolean;
  socialVerificationStatus: SocialVerificationStatus;
  avatarKey?: string | null;
  battleProfession?: string | null;
  restrictionReason?: string | null;
  roles?: CommunityRole[];
}

export type CommunityLoginResult = CommunitySessionEnvelope<CommunityAuthUser>;

export interface CommunityRegisterPayload {
  username: string;
  password: string;
  referralToken?: string;
  consents: {
    termsVersion: string;
    privacyVersion: string;
    communityGuidelinesVersion: string;
    adultDeclarationVersion: string;
  };
}

export interface PendingCommunityRegistration {
  registrationId: string;
  emailMasked: string;
  verificationExpiresAt: string;
  resendAvailableAt: string;
  accountStatus: 'pending_email';
  devVerificationCode?: string;
}

export interface CommunityLoginPayload {
  username: string;
  password: string;
}

export interface CommunityDeviceSession {
  id: string;
  current: boolean;
  createdAt: string;
  lastActiveAt: string;
  deviceLabel: string;
  region?: string | null;
}

function acceptSession(
  result: CommunityLoginResult,
  expectedGeneration: number,
): CommunityLoginResult {
  if (
    !setCommunitySessionTokensIfCurrent(
      expectedGeneration,
      result.accessToken,
      result.csrfToken,
    )
  ) {
    throw new CommunityApiError(409, '会话已更新，忽略过期的登录结果', {
      code: 'STALE_AUTH_RESULT',
    });
  }
  return result;
}

export async function registerCommunityAccount(
  payload: CommunityRegisterPayload,
): Promise<CommunityLoginResult> {
  const sessionGeneration = getCommunitySessionGeneration();
  const result = await communityHttp.post<CommunityLoginResult>(
    '/v1/auth/account/register',
    payload,
    { auth: false, retryAfterRefresh: false },
  );
  return acceptSession(result, sessionGeneration);
}

export async function verifyCommunityEmail(payload: {
  registrationId: string;
  code: string;
}): Promise<CommunityLoginResult> {
  const sessionGeneration = getCommunitySessionGeneration();
  const result = await communityHttp.post<CommunityLoginResult>(
    '/v1/auth/verify-email',
    payload,
    { auth: false, retryAfterRefresh: false },
  );
  return acceptSession(result, sessionGeneration);
}

export function resendCommunityVerification(registrationId: string): Promise<
  Pick<PendingCommunityRegistration, 'verificationExpiresAt' | 'resendAvailableAt'> & {
    devVerificationCode?: string;
  }
> {
  return communityHttp.post(
    '/v1/auth/email/verification-requests',
    { registrationId },
    { auth: false, retryAfterRefresh: false },
  );
}

export async function loginCommunityAccount(
  payload: CommunityLoginPayload,
): Promise<CommunityLoginResult> {
  const sessionGeneration = getCommunitySessionGeneration();
  const result = await communityHttp.post<CommunityLoginResult>(
    '/v1/auth/account/login',
    payload,
    { auth: false, retryAfterRefresh: false },
  );
  return acceptSession(result, sessionGeneration);
}

export function restoreCommunitySession(): Promise<CommunityLoginResult> {
  return refreshCommunitySession<CommunityAuthUser>();
}

export async function logoutCommunityAccount(): Promise<void> {
  const sessionGeneration = getCommunitySessionGeneration();
  try {
    await communityHttp.post<void>('/v1/auth/logout');
  } finally {
    setCommunitySessionTokensIfCurrent(sessionGeneration, null);
  }
}

export async function logoutAllCommunitySessions(): Promise<void> {
  const sessionGeneration = getCommunitySessionGeneration();
  try {
    await communityHttp.post<void>('/v1/auth/logout-all');
  } finally {
    setCommunitySessionTokensIfCurrent(sessionGeneration, null);
  }
}

export function forgotCommunityPassword(email: string): Promise<void> {
  return communityHttp.post<void>(
    '/v1/auth/password-reset-requests',
    { email },
    { auth: false, retryAfterRefresh: false },
  );
}

export function resetCommunityPassword(payload: {
  token: string;
  newPassword: string;
}): Promise<void> {
  return communityHttp.post<void>('/v1/auth/password-resets', payload, {
    auth: false,
    retryAfterRefresh: false,
  });
}

export function changeCommunityPassword(payload: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  return communityHttp.post<void>('/v1/auth/password-change', payload, {
    // A successful request revokes the credential used for this request. Never
    // replay it automatically when the response boundary is uncertain.
    retryAfterRefresh: false,
  });
}

export function getCommunitySessions(): Promise<CommunityDeviceSession[]> {
  return communityHttp.get('/v1/auth/sessions');
}

export function revokeCommunitySession(sessionId: string): Promise<void> {
  return communityHttp.delete(`/v1/auth/sessions/${encodeURIComponent(sessionId)}`);
}

export const communityAuthApi = {
  register: registerCommunityAccount,
  verifyEmail: verifyCommunityEmail,
  resendVerification: resendCommunityVerification,
  login: loginCommunityAccount,
  refresh: restoreCommunitySession,
  logout: logoutCommunityAccount,
  logoutAll: logoutAllCommunitySessions,
  forgotPassword: forgotCommunityPassword,
  resetPassword: resetCommunityPassword,
  changePassword: changeCommunityPassword,
  sessions: getCommunitySessions,
  revokeSession: revokeCommunitySession,
};
