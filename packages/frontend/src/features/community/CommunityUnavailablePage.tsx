import type { JSX } from 'react';
import { Link } from 'react-router-dom';

import { COMMUNITY_SYSTEM_NAV, type CommunitySystemId } from '../../app/community-nav';
import { EmptyState } from '../../components/ui';
import styles from './CommunityPages.module.css';

export function CommunityUnavailablePage({
  system,
  title,
  message,
}: {
  system: CommunitySystemId;
  title?: string;
  message?: string;
}): JSX.Element {
  const item = COMMUNITY_SYSTEM_NAV.find((entry) => entry.id === system);
  return (
    <main className={styles.page}>
      <EmptyState
        icon="⏳"
        title={title ?? `${item?.label ?? '该系统'}尚未开放`}
        message={message ?? '这个入口已有正式路由，但会在相应的安全、治理和容量验收通过后才启用。'}
        actions={<Link className={styles.primaryLink} to="/">返回首页</Link>}
      />
    </main>
  );
}
