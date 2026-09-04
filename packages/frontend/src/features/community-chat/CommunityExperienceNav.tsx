import { type JSX } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { COMMUNITY_FEATURE_FLAGS } from '../../app/community-nav';
import styles from './CommunityChat.module.css';

export function CommunityExperienceNav(): JSX.Element {
  const location = useLocation();
  return (
    <nav className={styles.experienceNav} aria-label="经验交流分区">
      {COMMUNITY_FEATURE_FLAGS.community ? (
        <Link to="/community" aria-current={location.pathname === '/community' ? 'page' : undefined}>
          帖子与问答
        </Link>
      ) : null}
      {COMMUNITY_FEATURE_FLAGS.chat ? (
        <Link to="/community/chat" aria-current={location.pathname.startsWith('/community/chat') ? 'page' : undefined}>
          固定聊天室
        </Link>
      ) : null}
      {COMMUNITY_FEATURE_FLAGS.chat && COMMUNITY_FEATURE_FLAGS.friends ? (
        <Link to="/messages" aria-current={location.pathname.startsWith('/messages') ? 'page' : undefined}>
          私人消息
        </Link>
      ) : null}
      {COMMUNITY_FEATURE_FLAGS.friends ? (
        <Link to="/friends" aria-current={location.pathname.startsWith('/friends') ? 'page' : undefined}>
          好友与申请
        </Link>
      ) : null}
    </nav>
  );
}
