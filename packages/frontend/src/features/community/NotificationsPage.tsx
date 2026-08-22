import { useEffect, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';

import {
  communityNotificationsApi,
  type CommunityNotification,
  type CommunityNotificationCategory,
} from '../../api/community';
import { Button, Card, EmptyState, PageHeader, Tag } from '../../components/ui';
import styles from './CommunityPages.module.css';
import { communityRequestErrorMessage } from './request-error';

const CATEGORY_LABELS: Record<CommunityNotification['category'], string> = {
  security: '账号安全',
  system: '系统公告',
  reply: '回复',
  friend: '好友',
  feed: '投喂',
  invite: '邀请',
  farm: '绿植',
  battle: '乐斗',
};

type NotificationFilter = 'all' | 'security' | 'friend' | 'feed' | 'farm';

const FILTERS: Array<{ id: NotificationFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'security', label: '安全' },
  { id: 'friend', label: '好友' },
  { id: 'feed', label: '投喂' },
  { id: 'farm', label: '绿植' },
];

export function CommunityNotificationsPage(): JSX.Element {
  const [items, setItems] = useState<CommunityNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    communityNotificationsApi
      .list()
      .then((page) => {
        if (!active) return;
        setItems(page.items ?? []);
        setUnreadCount(page.unreadCount ?? 0);
        setNextCursor(page.nextCursor ?? null);
      })
      .catch((requestError) => {
        if (active) setError(communityRequestErrorMessage(requestError, '通知加载失败'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function loadMore(): Promise<void> {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(undefined);
    try {
      const page = await communityNotificationsApi.list(nextCursor);
      setItems((current) => [
        ...current,
        ...page.items.filter((item) => !current.some((entry) => entry.id === item.id)),
      ]);
      setUnreadCount(page.unreadCount ?? 0);
      setNextCursor(page.nextCursor ?? null);
    } catch (requestError) {
      setError(communityRequestErrorMessage(requestError, '更多通知加载失败'));
    } finally {
      setLoadingMore(false);
    }
  }

  async function markRead(item: CommunityNotification): Promise<void> {
    if (item.readAt) return;
    try {
      await communityNotificationsApi.read(item.id);
      const readAt = new Date().toISOString();
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, readAt } : entry));
      setUnreadCount((current) => Math.max(0, current - 1));
    } catch (requestError) {
      setError(communityRequestErrorMessage(requestError, '标记已读失败'));
    }
  }

  async function markAllRead(): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      await communityNotificationsApi.readAll();
      const readAt = new Date().toISOString();
      setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? readAt })));
      setUnreadCount(0);
    } catch (requestError) {
      setError(communityRequestErrorMessage(requestError, '全部已读失败'));
    } finally {
      setBusy(false);
    }
  }

  async function markCategoryRead(category: CommunityNotificationCategory): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      await communityNotificationsApi.readByCategory(category);
      const readAt = new Date().toISOString();
      const changed = items.filter((item) => item.category === category && !item.readAt).length;
      setItems((current) => current.map((item) => item.category === category ? { ...item, readAt: item.readAt ?? readAt } : item));
      setUnreadCount((current) => Math.max(0, current - changed));
    } catch (requestError) {
      setError(communityRequestErrorMessage(requestError, '分类已读失败'));
    } finally {
      setBusy(false);
    }
  }

  const visibleItems = filter === 'all' ? items : items.filter((item) => item.category === filter);
  const visibleUnread = visibleItems.filter((item) => !item.readAt).length;

  return (
    <main className={styles.page}>
      <PageHeader
        title="通知中心"
        subtitle={`未读 ${Math.min(unreadCount, 99)}${unreadCount > 99 ? '+' : ''} 条`}
        actions={<Button variant="secondary" size="sm" disabled={unreadCount === 0} loading={busy} onClick={() => void markAllRead()}>全部已读</Button>}
      />
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <Card>
        <div className={styles.notificationToolbar}>
          <div className={styles.tabList} role="tablist" aria-label="通知分类">
            {FILTERS.map((item) => (
              <button key={item.id} type="button" role="tab" aria-selected={filter === item.id} data-selected={filter === item.id} className={styles.tabButton} onClick={() => setFilter(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
          {filter !== 'all' ? (
            <Button variant="ghost" size="sm" disabled={visibleUnread === 0} loading={busy} onClick={() => void markCategoryRead(filter)}>
              当前分类全部已读
            </Button>
          ) : null}
        </div>
        {loading ? <p role="status">正在加载通知…</p> : visibleItems.length === 0 ? (
          <EmptyState title="暂时没有通知" message="安全通知、系统公告以及后续好友互动会显示在这里。" />
        ) : visibleItems.map((item) => (
          <article className={`${styles.notificationRow} ${item.readAt ? '' : styles.unread}`} key={item.id}>
            <div>
              <Tag color={item.category === 'security' ? 'danger' : 'neutral'}>{CATEGORY_LABELS[item.category]}</Tag>
              <strong>{item.title}</strong>
              <p>{item.summary}</p>
              <small>{new Date(item.createdAt).toLocaleString('zh-CN')}</small>
            </div>
            <div className={styles.inlineActions}>
              {item.resourcePath ? <Link to={item.resourcePath}>查看</Link> : null}
              {!item.readAt ? <Button variant="ghost" size="sm" onClick={() => void markRead(item)}>标为已读</Button> : null}
            </div>
          </article>
        ))}
        {filter === 'all' && nextCursor ? (
          <Button variant="secondary" fullWidth loading={loadingMore} onClick={() => void loadMore()}>
            加载更多通知
          </Button>
        ) : null}
      </Card>
    </main>
  );
}
