import { type JSX } from 'react';
import { Link } from 'react-router-dom';

import { COMMUNITY_FEATURE_FLAGS } from '../../app/community-nav';
import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import { CommunityBattlePage } from './CommunityBattlePage';
import { OfficeBattlePage } from './OfficeBattlePage';
import styles from './OfficeBattleGatewayPage.module.css';

export function shouldUseCommunityBattleServer(
  serverEnabled: boolean,
  verificationRequired: boolean,
  phase: string,
  user: {
    onboardingCompleted: boolean;
    socialVerificationStatus: string;
  } | null,
): boolean {
  return serverEnabled &&
    user !== null &&
    phase === 'active' &&
    user.onboardingCompleted &&
    (!verificationRequired || user.socialVerificationStatus === 'verified');
}

/**
 * 本机试玩与正式档案的唯一分流点。任何本机存档都不会被读取、上传或转换成
 * 正式资产；服务端闸门关闭时继续保持原有游客试玩行为。
 */
export function OfficeBattleGatewayPage(): JSX.Element {
  const phase = useCommunityAuthStore((state) => state.phase);
  const user = useCommunityAuthStore((state) => state.user);
  const formalReady = shouldUseCommunityBattleServer(
    COMMUNITY_FEATURE_FLAGS.battleServer,
    COMMUNITY_FEATURE_FLAGS.socialVerification,
    phase,
    user,
  );

  if (formalReady) return <CommunityBattlePage />;

  return (
    <div className={styles.gateway}>
      <aside className={styles.modeNotice} aria-labelledby="battle-mode-title">
        <div>
          <strong id="battle-mode-title">{formalReady ? '我的乐斗角色' : '游客试玩'}</strong>
          <p>
            {formalReady
              ? '等级、装备和战绩会跟随当前账号保存。'
              : '登录后即可创建在线角色，并使用好友对战、排行榜和成长系统。'}
          </p>
        </div>
        {!COMMUNITY_FEATURE_FLAGS.battleServer ? (
          <span className={styles.status}>无需登录</span>
        ) : phase === 'guest' || phase === 'pending_email' ? (
          <Link to="/login">登录账号</Link>
        ) : phase === 'active' && !user?.onboardingCompleted ? (
          <Link to="/onboarding">完善我的工位</Link>
        ) : COMMUNITY_FEATURE_FLAGS.socialVerification &&
          phase === 'active' &&
          user?.socialVerificationStatus !== 'verified' ? (
          <Link to="/settings/verification">完善账号状态</Link>
        ) : (
          <Link to="/account/status">查看账号状态</Link>
        )}
      </aside>
      <OfficeBattlePage />
    </div>
  );
}
