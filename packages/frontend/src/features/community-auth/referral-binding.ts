import type { CommunityReferralPreview } from '../../api/community';

const REFERRAL_BINDING_KEY = 'zbrs.community.referral-binding.v1';

export interface CommunityReferralBinding {
  token: string;
  expiresAt: string;
  inviterDisplayName: string;
}

export function saveCommunityReferralBinding(
  preview: CommunityReferralPreview,
): CommunityReferralBinding {
  const binding = {
    token: preview.bindingToken,
    expiresAt: preview.expiresAt,
    inviterDisplayName: preview.inviter.displayName,
  };
  try {
    globalThis.sessionStorage?.setItem(REFERRAL_BINDING_KEY, JSON.stringify(binding));
  } catch {
    // 页面内仍可继续；禁用 sessionStorage 时刷新后需重新打开邀请链接。
  }
  return binding;
}

export function loadCommunityReferralBinding(
  now = Date.now(),
): CommunityReferralBinding | null {
  try {
    const raw = globalThis.sessionStorage?.getItem(REFERRAL_BINDING_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<CommunityReferralBinding>;
    const expiresAt = typeof value.expiresAt === 'string'
      ? Date.parse(value.expiresAt)
      : Number.NaN;
    if (
      typeof value.token !== 'string' ||
      !value.token ||
      typeof value.inviterDisplayName !== 'string' ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= now
    ) {
      clearCommunityReferralBinding();
      return null;
    }
    return value as CommunityReferralBinding;
  } catch {
    clearCommunityReferralBinding();
    return null;
  }
}

export function clearCommunityReferralBinding(): void {
  try {
    globalThis.sessionStorage?.removeItem(REFERRAL_BINDING_KEY);
  } catch {
    // 清理失败不会改变服务端一次性 token 的过期与消费语义。
  }
}
