import type { JSX } from 'react';
import { Link } from 'react-router-dom';

import { COMMUNITY_FEATURE_FLAGS } from '../../app/community-nav';
import { useCommunityAuthStore } from '../../app/store/community-auth-store';

export function useCommunitySocialWriteBlocked(): boolean {
  const user = useCommunityAuthStore((state) => state.user);
  // 受路由保护的真实页面一定有 user；保留 null=false 方便独立组件测试和公开只读页。
  return Boolean(user && user.socialVerificationStatus !== 'verified');
}

export function CommunitySocialVerificationPrompt({
  action,
  className,
}: {
  action: string;
  className?: string;
}): JSX.Element {
  return (
    <p className={className} role="status">
      {action}前需要完成适用的身份核验。{' '}
      {COMMUNITY_FEATURE_FLAGS.socialVerification ? (
        <Link to="/settings/verification">查看身份核验状态</Link>
      ) : (
        <span>该功能暂不可用。</span>
      )}
    </p>
  );
}
