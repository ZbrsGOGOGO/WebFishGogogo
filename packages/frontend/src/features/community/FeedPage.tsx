import { useCallback, useEffect, useState, type FormEvent, type JSX } from 'react';
import { Link } from 'react-router-dom';

import {
  communityFeedsApi,
  createCommunityIdempotencyKey,
  type CommunityFeedOverview,
  type CommunityFeedType,
} from '../../api/community';
import { Button, Card, EmptyState, PageHeader, Tag } from '../../components/ui';
import { communityRequestErrorMessage } from './request-error';
import {
  CommunitySocialVerificationPrompt,
  useCommunitySocialWriteBlocked,
} from './SocialVerificationGate';
import styles from './CommunityPages.module.css';

const FEED_OPTIONS: Array<{ id: CommunityFeedType; icon: string; label: string }> = [
  { id: 'coffee', icon: '☕', label: '咖啡' },
  { id: 'cookie', icon: '🍪', label: '小饼干' },
  { id: 'cheer_note', icon: '📝', label: '加油便签' },
];

function feedLabel(type: CommunityFeedType): string {
  return FEED_OPTIONS.find((option) => option.id === type)?.label ?? type;
}

export function CommunityFeedPage(): JSX.Element {
  const socialWriteBlocked = useCommunitySocialWriteBlocked();
  const [overview, setOverview] = useState<CommunityFeedOverview | null>(null);
  const [recipientPublicId, setRecipientPublicId] = useState('');
  const [type, setType] = useState<CommunityFeedType>('coffee');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(undefined);
    try {
      const next = await communityFeedsApi.getOverview();
      setOverview(next);
      setRecipientPublicId((current) => current || next.eligibleFriends.find((friend) => !friend.fedToday)?.publicId || '');
    } catch (requestError) {
      setError(communityRequestErrorMessage(requestError, '投喂记录加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function send(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (socialWriteBlocked) {
      setError('完成身份核验后才能投喂好友');
      return;
    }
    if (!recipientPublicId) {
      setError('请选择一位当前可投喂的好友');
      return;
    }
    setSending(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const result = await communityFeedsApi.send(
        { recipientPublicId, type },
        createCommunityIdempotencyKey(`feed:${recipientPublicId}`),
      );
      setNotice(`服务端已确认送出${feedLabel(result.event.type)}`);
      await load();
    } catch (requestError) {
      setError(communityRequestErrorMessage(requestError, '投喂失败，请重试'));
    } finally {
      setSending(false);
    }
  }

  return (
    <main className={styles.page}>
      <PageHeader
        title="投喂"
        subtitle="给好友一次轻量鼓励。三种表现价值相同，不转移资产、不增加乐斗属性。"
      />
      {socialWriteBlocked ? (
        <CommunitySocialVerificationPrompt action="投喂好友" className={styles.error} />
      ) : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}

      {loading ? <p role="status">正在加载投喂状态…</p> : overview ? (
        <>
          <div className={styles.statGrid} aria-label="今日投喂额度">
            <Card><strong>{overview.sentToday}/{overview.sendDailyLimit}</strong><span>今日已发送</span></Card>
            <Card><strong>{overview.receivedToday}/{overview.receiveDailyLimit}</strong><span>今日已计入接收</span></Card>
          </div>

          <Card title="送一份鼓励">
            {overview.eligibleFriends.length === 0 ? (
              <EmptyState
                title="当前没有可投喂好友"
                message="只有好友可以投喂；已达到每日额度或今天已经投喂过的好友也不会重复计数。"
                actions={<Link to="/friends">查看好友</Link>}
              />
            ) : (
              <form className={styles.form} onSubmit={send}>
                <label className={styles.fieldLabel}>
                  好友
                  <select className={styles.select} value={recipientPublicId} onChange={(event) => setRecipientPublicId(event.target.value)}>
                    <option value="">请选择</option>
                    {overview.eligibleFriends.map((friend) => (
                      <option key={friend.publicId} value={friend.publicId} disabled={friend.fedToday}>
                        {friend.displayName}{friend.fedToday ? '（今日已投喂）' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <fieldset className={styles.feedChoices}>
                  <legend>选择表现</legend>
                  {FEED_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={styles.choiceButton}
                      data-selected={type === option.id}
                      aria-pressed={type === option.id}
                      onClick={() => setType(option.id)}
                    >
                      <strong aria-hidden="true">{option.icon}</strong>
                      <span>{option.label}</span>
                    </button>
                  ))}
                </fieldset>
                <Button type="submit" loading={sending} disabled={socialWriteBlocked || overview.sentToday >= overview.sendDailyLimit}>确认投喂</Button>
                <p className={styles.muted}>每次提交都有独立幂等键；401 或网络错误不会自动重放写请求。</p>
              </form>
            )}
          </Card>

          <Card title="最近记录">
            {overview.items.length === 0 ? (
              <EmptyState title="暂时没有投喂记录" message="服务端确认后的发送和接收记录会显示在这里。" />
            ) : overview.items.map((item) => (
              <article className={styles.simpleRow} key={item.id}>
                <div>
                  <strong>{item.direction === 'sent' ? `送给 ${item.user.displayName}` : `收到 ${item.user.displayName} 的鼓励`}</strong>
                  <small>{new Date(item.createdAt).toLocaleString('zh-CN')}</small>
                </div>
                <Tag>{feedLabel(item.type)}</Tag>
              </article>
            ))}
          </Card>
        </>
      ) : (
        <Button variant="secondary" onClick={() => void load()}>重新加载</Button>
      )}
    </main>
  );
}
