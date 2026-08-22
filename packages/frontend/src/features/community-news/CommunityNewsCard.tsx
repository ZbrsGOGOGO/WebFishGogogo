import { useState, type JSX } from 'react';
import { Link } from 'react-router-dom';

import {
  communityNewsApi,
  createCommunityIdempotencyKey,
  type CommunityNewsFeedbackReason,
  type CommunityNewsPublishedItem,
} from '../../api/community';
import { Button, Tag } from '../../components/ui';
import { communityRequestErrorMessage } from '../community/request-error';
import { communityNewsHttpsUrl } from './news-utils';
import styles from './CommunityNews.module.css';

const FEEDBACK_LABELS: Record<CommunityNewsFeedbackReason, string> = {
  not_interested: '不感兴趣',
  not_relevant: '与我无关',
  seen_too_often: '看得太频繁',
  source_not_preferred: '不偏好该来源',
};

export function CommunityNewsCard({
  item,
  signedIn,
  onFeedback,
  detail = false,
}: {
  item: CommunityNewsPublishedItem;
  signedIn: boolean;
  onFeedback?: (articleId: string) => void;
  detail?: boolean;
}): JSX.Element {
  const [feedbackReason, setFeedbackReason] = useState<CommunityNewsFeedbackReason>('not_interested');
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string>();
  const [feedbackDone, setFeedbackDone] = useState(false);
  const originalUrl = communityNewsHttpsUrl(item.originalUrl);
  const discussionPath = item.discussion.createPostPath === '/community/new' || item.discussion.createPostPath.startsWith('/community/new?')
    ? item.discussion.createPostPath
    : '/community/new';

  async function submitFeedback(): Promise<void> {
    setFeedbackBusy(true);
    setFeedbackError(undefined);
    try {
      const result = await communityNewsApi.giveNegativeFeedback(
        item.id,
        feedbackReason,
        createCommunityIdempotencyKey(`news-feedback:${item.id}`),
      );
      if (result.acknowledged) {
        setFeedbackDone(true);
        onFeedback?.(item.id);
      }
    } catch (error) {
      setFeedbackError(communityRequestErrorMessage(error, '反馈提交失败'));
    } finally {
      setFeedbackBusy(false);
    }
  }

  return (
    <article className={detail ? styles.detailCard : styles.newsCard}>
      <header className={styles.cardMeta}>
        <Tag>{item.source.name}</Tag>
        <span>原文发布于 {new Date(item.originalPublishedAt).toLocaleString('zh-CN')}</span>
        <span>本站导读发布于 {new Date(item.publishedAt).toLocaleString('zh-CN')}</span>
      </header>
      {detail ? (
        <h2>来源导读摘要</h2>
      ) : (
        <h2><Link to={`/news/${encodeURIComponent(item.id)}`}>查看这条来源导读</Link></h2>
      )}
      <p className={styles.summary}>{item.summary}</p>
      {item.correctionNote ? (
        <aside className={styles.correction}>
          <strong>更正说明</strong>
          <p>{item.correctionNote}</p>
          {item.lastCorrectedAt ? <small>{new Date(item.lastCorrectedAt).toLocaleString('zh-CN')}</small> : null}
        </aside>
      ) : null}
      <div className={styles.cardActions}>
        {originalUrl ? (
          <a href={originalUrl} target="_blank" rel="noopener noreferrer nofollow">
            前往来源网站阅读原文
          </a>
        ) : (
          <span className={styles.linkUnavailable}>原文链接未通过 HTTPS 安全校验</span>
        )}
        <Link to={discussionPath}>围绕该来源写经验帖</Link>
      </div>
      {signedIn ? (
        <details className={styles.feedbackBox}>
          <summary>{feedbackDone ? '反馈已记录' : '减少类似内容'}</summary>
          {feedbackDone ? (
            <p role="status">服务端已记录这次偏好反馈。</p>
          ) : (
            <div className={styles.feedbackControls}>
              <label>
                反馈原因
                <select
                  value={feedbackReason}
                  onChange={(event) => setFeedbackReason(event.target.value as CommunityNewsFeedbackReason)}
                >
                  {Object.entries(FEEDBACK_LABELS).map(([value, label]) => (
                    <option value={value} key={value}>{label}</option>
                  ))}
                </select>
              </label>
              <Button size="sm" variant="secondary" loading={feedbackBusy} onClick={() => void submitFeedback()}>
                确认反馈
              </Button>
            </div>
          )}
          {feedbackError ? <p className={styles.error} role="alert">{feedbackError}</p> : null}
        </details>
      ) : null}
    </article>
  );
}
