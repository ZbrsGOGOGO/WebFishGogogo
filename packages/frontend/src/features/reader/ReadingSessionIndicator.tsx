import type { JSX } from 'react';

import { Tag, type TagColor } from '../../components/ui';
import type { UseTrustedReadingSessionResult } from './useTrustedReadingSession';
import styles from './reading-session-indicator.module.css';

export interface ReadingSessionIndicatorProps {
  session: UseTrustedReadingSessionResult;
}

function presentation(
  session: UseTrustedReadingSessionResult,
): { color: TagColor; label: string } | null {
  if (session.eventQueued) {
    return { color: 'brand', label: '阅读任务同步中' };
  }
  if (session.connection === 'error') {
    return { color: 'danger', label: '阅读计时待重连' };
  }
  if (session.connection === 'starting') {
    return { color: 'neutral', label: '阅读计时连接中' };
  }
  if (session.connection === 'inactive') return null;
  if (session.state === 'boss') {
    return { color: 'neutral', label: '隐私模式 · 计时暂停' };
  }
  if (session.state === 'hidden') {
    return { color: 'neutral', label: '页面隐藏 · 计时暂停' };
  }
  if (session.state === 'idle') {
    return { color: 'neutral', label: '暂无操作 · 计时暂停' };
  }
  if (session.qualified) {
    return { color: 'success', label: '有效阅读已达成' };
  }
  return { color: 'success', label: '有效阅读计时中' };
}

export function ReadingSessionIndicator({
  session,
}: ReadingSessionIndicatorProps): JSX.Element | null {
  const meta = presentation(session);
  if (!meta) return null;
  return (
    <Tag
      className={styles.indicator}
      color={meta.color}
      role="status"
      aria-live="polite"
      title={session.error ?? undefined}
    >
      <span className={styles.dot} aria-hidden="true" />
      {meta.label}
    </Tag>
  );
}
