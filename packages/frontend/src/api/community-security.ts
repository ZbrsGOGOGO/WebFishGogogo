import { communityHttp } from './community-http';

export type CommunitySocialVerificationStatus =
  | 'not_started'
  | 'pending'
  | 'verified'
  | 'failed'
  | 'expired';

export interface CommunitySocialVerification {
  status: CommunitySocialVerificationStatus;
  provider?: string | null;
  submittedAt?: string | null;
  verifiedAt?: string | null;
  failureCode?: string | null;
}

export interface CommunitySocialVerificationSession {
  sessionId: string;
  launchUrl: string;
  expiresAt: string;
}

export function requireHttpsVerificationLaunchUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('身份核验服务返回了无效的启动地址');
  }
  if (
    url.protocol !== 'https:' ||
    Boolean(url.username) ||
    Boolean(url.password)
  ) {
    throw new Error('身份核验只能通过安全的 HTTPS 地址启动');
  }
  return url.href;
}

export function getCommunitySocialVerification(): Promise<CommunitySocialVerification> {
  return communityHttp.get('/v1/me/social-verification');
}

export async function createCommunitySocialVerificationSession(): Promise<
  CommunitySocialVerificationSession
> {
  const session = await communityHttp.post<CommunitySocialVerificationSession>(
    '/v1/me/social-verification/sessions',
    { returnPath: '/settings/verification' },
    { retryAfterRefresh: false },
  );
  return {
    ...session,
    launchUrl: requireHttpsVerificationLaunchUrl(session.launchUrl),
  };
}

export const communitySecurityApi = {
  getSocialVerification: getCommunitySocialVerification,
  createSocialVerificationSession: createCommunitySocialVerificationSession,
};
