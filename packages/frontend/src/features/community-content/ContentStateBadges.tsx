import type { JSX } from 'react';

import type { CommunityContentState } from '../../api/community';
import { Tag } from '../../components/ui';
import { MODERATION_LABELS, PUBLICATION_LABELS } from './content-copy';
import styles from './CommunityContent.module.css';

export function ContentStateBadges({ state }: { state: CommunityContentState }): JSX.Element {
  return (
    <div className={styles.stateBadges} aria-label="内容状态">
      <Tag color={state.publicationStatus === 'published' ? 'success' : 'neutral'}>
        发布：{PUBLICATION_LABELS[state.publicationStatus]}
      </Tag>
      <Tag color={state.moderationStatus === 'normal' ? 'neutral' : 'danger'}>
        治理：{MODERATION_LABELS[state.moderationStatus]}
      </Tag>
      <Tag color={state.deletedAt ? 'danger' : 'neutral'}>
        删除：{state.deletedAt ? '已软删除' : '未删除'}
      </Tag>
      <Tag color="neutral">版本：v{state.version}</Tag>
    </div>
  );
}
