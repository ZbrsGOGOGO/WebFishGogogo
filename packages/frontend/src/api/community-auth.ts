import {
  communityHttp,
  refreshCommunitySession,
  setCommunitySessionTokens,
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
  email: string;
  password: string;
  displayName: string;
  betaAccessCode: string;
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
  email: string;
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

function acceptSession(result: CommunityLoginResult): CommunityLoginResult {
  setCommunitySessionTokens(result.accessToken, result.csrfToken);
  return result;
}

export async function registerCommunityAccount(
  payload: CommunityRegisterPayload,
): Promise<PendingCommunityRegistration> {
  return communityHttp.post<PendingCommunityRegistration>(
    '/v1/auth/register',
    payload,
    { auth: false, retryAfterRefresh: false },
  );
}

export async function verifyCommunityEmail(payload: {
  registrationId: string;
  code: string;
}): Promise<CommunityLoginResult> {
  const result = await communityHttp.post<CommunityLoginResult>(
    '/v1/auth/verify-email',
    payload,
    { auth: false, retryAfterRefresh: false },
  );
  return acceptSession(result);
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
  const result = await communityHttp.post<CommunityLoginResult>(
    '/v1/auth/login',
    payload,
    { auth: false, retryAfterRefresh: false },
  );
  return acceptSession(result);
}

export function restoreCommunitySession(): Promise<CommunityLoginResult> {
  return refreshCommunitySession<CommunityAuthUser>();
}

export async function logoutCommunityAccount(): Promise<void> {
  try {
    await communityHttp.post<void>('/v1/auth/logout');
  } finally {
    setCommunitySessionTokens(null);
  }
}

export async function logoutAllCommunitySessions(): Promise<void> {
  try {
    await communityHttp.post<void>('/v1/auth/logout-all');
  } finally {
    setCommunitySessionTokens(null);
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
  sessions: getCommunitySessions,
  revokeSession: revokeCommunitySession,
};
