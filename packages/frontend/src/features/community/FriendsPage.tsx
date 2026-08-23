import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type JSX,
} from 'react';
import { Link } from 'react-router-dom';

import {
  communityProfileApi,
  communityRelationshipsApi,
  createCommunityIdempotencyKey,
  type CommunityBlock,
  type CommunityFriend,
  type CommunityFriendRequest,
  type CommunityPublicProfile,
} from '../../api/community';
import { Button, Card, EmptyState, Input, PageHeader, Tag } from '../../components/ui';
import { communityAvatarMark } from './profile-options';
import { communityRequestErrorMessage } from './request-error';
import {
  CommunitySocialVerificationPrompt,
  useCommunitySocialWriteBlocked,
} from './SocialVerificationGate';
import styles from './CommunityPages.module.css';

type FriendsTab = 'friends' | 'incoming' | 'outgoing' | 'blocked';

const TAB_LABELS: Array<{ id: FriendsTab; label: string }> = [
  { id: 'friends', label: '好友' },
  { id: 'incoming', label: '收到的申请' },
  { id: 'outgoing', label: '已发申请' },
  { id: 'blocked', label: '已拉黑' },
];

function looksLikePrivateIdentifier(value: string): boolean {
  return value.includes('@') || /^\+?[\d\s()-]{6,}$/.test(value);
}

export function CommunityFriendsPage(): JSX.Element {
  const socialWriteBlocked = useCommunitySocialWriteBlocked();
  const [tab, setTab] = useState<FriendsTab>('friends');
  const [friends, setFriends] = useState<CommunityFriend[]>([]);
  const [incoming, setIncoming] = useState<CommunityFriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<CommunityFriendRequest[]>([]);
  const [blocks, setBlocks] = useState<CommunityBlock[]>([]);
  const [friendLimit, setFriendLimit] = useState(200);
  const [dailySent, setDailySent] = useState(0);
  const [dailyLimit, setDailyLimit] = useState(0);
  const [query, setQuery] = useState('');
  const [searchResult, setSearchResult] = useState<CommunityPublicProfile | null>(null);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string>();
  const [confirmKey, setConfirmKey] = useState<string>();
  const [error, setError] = useState<string>();
  const [searchError, setSearchError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const load = useCallback(async (showLoading = true): Promise<void> => {
    if (showLoading) setLoading(true);
    setError(undefined);
    try {
      const [friendPage, incomingPage, outgoingPage, blockPage] = await Promise.all([
        communityRelationshipsApi.listFriends(),
        communityRelationshipsApi.listRequests('incoming'),
        communityRelationshipsApi.listRequests('outgoing'),
        communityRelationshipsApi.listBlocks(),
      ]);
      setFriends(friendPage.items ?? []);
      setFriendLimit(friendPage.limit ?? 200);
      setIncoming(incomingPage.items ?? []);
      setOutgoing(outgoingPage.items ?? []);
      setBlocks(blockPage.items ?? []);
      setDailySent(outgoingPage.dailySent ?? 0);
      setDailyLimit(outgoingPage.dailyLimit ?? 0);
    } catch (requestError) {
      setError(communityRequestErrorMessage(requestError, '好友数据加载失败'));
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function search(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const publicId = query.trim();
    setSearchResult(null);
    setSearchError(undefined);
    setNotice(undefined);
    if (!publicId) {
      setSearchError('请输入完整公开编号');
      return;
    }
    if (looksLikePrivateIdentifier(publicId)) {
      setSearchError('只支持精确公开编号，不支持邮箱或手机号搜索');
      return;
    }
    if (/\s/.test(publicId) || publicId.length > 80) {
      setSearchError('公开编号格式不正确，请完整复制后重试');
      return;
    }
    setSearching(true);
    try {
      setSearchResult(await communityProfileApi.getPublic(publicId));
    } catch (requestError) {
      setSearchError(communityRequestErrorMessage(requestError, '没有找到该公开编号'));
    } finally {
      setSearching(false);
    }
  }

  async function mutate(
    key: string,
    operation: (idempotencyKey: string) => Promise<unknown>,
    successMessage: string,
  ): Promise<void> {
    setBusyKey(key);
    setError(undefined);
    setNotice(undefined);
    try {
      await operation(createCommunityIdempotencyKey(key));
      setNotice(successMessage);
      setConfirmKey(undefined);
      await load(false);
      if (searchResult) {
        setSearchResult(await communityProfileApi.getPublic(searchResult.publicId));
      }
    } catch (requestError) {
      setError(communityRequestErrorMessage(requestError, '操作失败，请重试'));
    } finally {
      setBusyKey(undefined);
    }
  }

  function dangerButton(
    key: string,
    label: string,
    confirmLabel: string,
    operation: (idempotencyKey: string) => Promise<unknown>,
    successMessage: string,
  ): JSX.Element {
    const confirming = confirmKey === key;
    return (
      <Button
        variant="danger"
        size="sm"
        loading={busyKey === key}
        onClick={() => {
          if (!confirming) {
            setConfirmKey(key);
            return;
          }
          void mutate(key, operation, successMessage);
        }}
      >
        {confirming ? confirmLabel : label}
      </Button>
    );
  }

  const visibleItems =
    tab === 'friends' ? friends : tab === 'incoming' ? incoming : tab === 'outgoing' ? outgoing : blocks;

  return (
    <main className={styles.page}>
      <PageHeader
        title="好友"
        subtitle="通过完整公开编号建立关系。平台不提供邮箱、手机号反查，也不上传通讯录。"
      />
      {socialWriteBlocked ? (
        <CommunitySocialVerificationPrompt action="主动建立好友关系" className={styles.error} />
      ) : null}

      <Card title="精确查找用户">
        <form className={styles.searchForm} noValidate onSubmit={search}>
          <Input
            label="公开编号 publicId"
            value={query}
            autoComplete="off"
            placeholder="粘贴完整公开编号"
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button type="submit" loading={searching}>查找</Button>
        </form>
        <p className={styles.muted}>只支持精确 publicId；禁止使用邮箱、手机号或通讯录查找用户。</p>
        {searchError ? <p className={styles.error} role="alert">{searchError}</p> : null}
        {searchResult ? (
          <article className={styles.personRow} aria-label="查找结果">
            <span className={styles.smallAvatar} aria-hidden="true">{communityAvatarMark(searchResult.avatarKey)}</span>
            <div>
              <strong>{searchResult.displayName}</strong>
              <small>{searchResult.publicId}</small>
              <Tag>{searchResult.relationship.status === 'friend' ? '已是好友' : '查找结果'}</Tag>
            </div>
            <div className={styles.inlineActions}>
              <Link to={`/users/${encodeURIComponent(searchResult.publicId)}`}>查看主页</Link>
              {searchResult.relationship.canRequest ? (
                <Button
                  size="sm"
                  disabled={socialWriteBlocked}
                  loading={busyKey === `friend-request:${searchResult.publicId}`}
                  onClick={() => void mutate(
                    `friend-request:${searchResult.publicId}`,
                    (key) => communityRelationshipsApi.sendRequest(searchResult.publicId, key),
                    '好友申请已发送',
                  )}
                >
                  发送申请
                </Button>
              ) : null}
            </div>
          </article>
        ) : null}
      </Card>

      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}

      <Card>
        <div className={styles.tabList} role="tablist" aria-label="好友分类">
          {TAB_LABELS.map((item) => {
            const count = item.id === 'friends'
              ? friends.length
              : item.id === 'incoming'
                ? incoming.length
                : item.id === 'outgoing'
                  ? outgoing.length
                  : blocks.length;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={styles.tabButton}
                data-selected={tab === item.id}
                onClick={() => setTab(item.id)}
              >
                {item.label} {count}
              </button>
            );
          })}
        </div>
        <p className={styles.muted}>
          {tab === 'friends'
            ? `${friends.length}/${friendLimit} 位好友`
            : tab === 'outgoing'
              ? `今日主动申请 ${dailySent}/${dailyLimit || '—'}`
              : '申请与拉黑记录'}
        </p>

        {loading ? <p role="status">正在加载好友关系…</p> : visibleItems.length === 0 ? (
          <EmptyState title="这里暂时没有记录" message="新的关系记录会显示在这里。" />
        ) : null}

        {!loading && tab === 'friends' ? friends.map((friend) => (
          <article className={styles.personRow} key={friend.publicId}>
            <span className={styles.smallAvatar} aria-hidden="true">{communityAvatarMark(friend.avatarKey)}</span>
            <div>
              <strong>{friend.displayName}</strong>
              <small>{friend.publicId}</small>
              <span>成为好友：{new Date(friend.friendsSince).toLocaleDateString('zh-CN')}</span>
            </div>
            <div className={styles.inlineActions}>
              <Link to={`/users/${encodeURIComponent(friend.publicId)}`}>主页</Link>
              {dangerButton(
                `remove:${friend.publicId}`,
                '删除好友',
                '确认删除',
                (key) => communityRelationshipsApi.removeFriend(friend.publicId, key),
                '好友已删除',
              )}
              {dangerButton(
                `block:${friend.publicId}`,
                '拉黑',
                '确认拉黑',
                (key) => communityRelationshipsApi.block(friend.publicId, key),
                '该用户已被拉黑',
              )}
            </div>
          </article>
        )) : null}

        {!loading && tab === 'incoming' ? incoming.map((request) => (
          <article className={styles.personRow} key={request.id}>
            <span className={styles.smallAvatar} aria-hidden="true">{communityAvatarMark(request.user.avatarKey)}</span>
            <div><strong>{request.user.displayName}</strong><small>{request.user.publicId}</small><span>{new Date(request.createdAt).toLocaleString('zh-CN')}</span></div>
            <div className={styles.inlineActions}>
              <Button size="sm" disabled={socialWriteBlocked} loading={busyKey === `accept:${request.id}`} onClick={() => void mutate(`accept:${request.id}`, (key) => communityRelationshipsApi.acceptRequest(request.id, key), '好友申请已接受')}>接受</Button>
              <Button variant="secondary" size="sm" loading={busyKey === `reject:${request.id}`} onClick={() => void mutate(`reject:${request.id}`, (key) => communityRelationshipsApi.rejectRequest(request.id, key), '好友申请已拒绝')}>拒绝</Button>
            </div>
          </article>
        )) : null}

        {!loading && tab === 'outgoing' ? outgoing.map((request) => (
          <article className={styles.personRow} key={request.id}>
            <span className={styles.smallAvatar} aria-hidden="true">{communityAvatarMark(request.user.avatarKey)}</span>
            <div><strong>{request.user.displayName}</strong><small>{request.user.publicId}</small><span>{new Date(request.createdAt).toLocaleString('zh-CN')}</span></div>
            <Button variant="secondary" size="sm" loading={busyKey === `cancel:${request.id}`} onClick={() => void mutate(`cancel:${request.id}`, (key) => communityRelationshipsApi.cancelRequest(request.id, key), '好友申请已取消')}>取消申请</Button>
          </article>
        )) : null}

        {!loading && tab === 'blocked' ? blocks.map((block) => (
          <article className={styles.personRow} key={block.publicId}>
            <span className={styles.smallAvatar} aria-hidden="true">{communityAvatarMark(block.avatarKey)}</span>
            <div><strong>{block.displayName}</strong><small>{block.publicId}</small><span>拉黑于 {new Date(block.blockedAt).toLocaleString('zh-CN')}</span></div>
            <Button variant="secondary" size="sm" loading={busyKey === `unblock:${block.publicId}`} onClick={() => void mutate(`unblock:${block.publicId}`, (key) => communityRelationshipsApi.unblock(block.publicId, key), '已解除拉黑')}>解除拉黑</Button>
          </article>
        )) : null}
      </Card>
    </main>
  );
}
