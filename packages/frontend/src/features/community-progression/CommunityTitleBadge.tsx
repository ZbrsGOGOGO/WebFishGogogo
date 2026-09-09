import { COMMUNITY_ACHIEVEMENTS, type TitleBadge } from '@stealth-reader/shared';
import type { JSX } from 'react';
import styles from './Progression.module.css';

/** Only server-selected, known cosmetic labels. Never part of the login name. */
export function CommunityTitleBadge({ title, hidden = false, equipped = true }: { title?: TitleBadge | null; hidden?: boolean; equipped?: boolean }): JSX.Element | null {
  if (hidden || !title || !COMMUNITY_ACHIEVEMENTS.some((item) => item.title.key === title.key && item.title.label === title.label)) return null;
  return <span className={styles.titleBadge} aria-label={`${equipped ? '佩戴称号' : '称号'}：${title.label}`}>{title.label}</span>;
}

export function CommunityHonors({ honors }: { honors: ReadonlyArray<TitleBadge | string> }): JSX.Element {
  return <span className={styles.honors}>{honors.map((title, index) => typeof title === 'string' ? <span key={`legacy-${index}`}>{title}</span> : <CommunityTitleBadge key={title.key} title={title} equipped={false} />)}</span>;
}
