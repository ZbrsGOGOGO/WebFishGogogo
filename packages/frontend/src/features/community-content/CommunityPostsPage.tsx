import { useCallback, useEffect, useRef, useState, type FormEvent, type JSX } from 'react';
import { Link } from 'react-router-dom';

import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import {
  COMMUNITY_CONTENT_CHANNELS,
  communityContentApi,
  type CommunityContentChannel,
  type CommunityPostSort,
  type CommunityPostSummary,
  type CommunityPostType,
} from '../../api/community';
import { Button, Card, EmptyState, Input, PageHeader, Tag } from '../../components/ui';
import { communityRequestErrorMessage } from '../community/request-error';
import { CommunityExperienceNav } from '../community-chat';
import { CHANNEL_LABELS, POST_TYPE_LABELS } from './content-copy';
import { ContentStateBadges } from './ContentStateBadges';
import styles from './CommunityContent.module.css';

export function CommunityPostsPage(): JSX.Element {
  const phase = useCommunityAuthStore((state) => state.phase);
  const user = useCommunityAuthStore((state) => state.user);
  const [items, setItems] = useState<CommunityPostSummary[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [writeEnabled, setWriteEnabled] = useState(false);
  const [channel, setChannel] = useState<CommunityContentChannel | 'all'>('all');
  const [type, setType] = useState<CommunityPostType | 'all'>('all');
  const [sort, setSort] = useState<CommunityPostSort>('latest');
  const [tag, setTag] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string>();
  const requestSequence = useRef(0);

  const load = useCallback(async (cursor?: string, append = false): Promise<void> => {
    const sequence = ++requestSequence.current;
    append ? setLoadingMore(true) : setLoading(true);
    setError(undefined);
    try {
      const page = await communityContentApi.listPosts({ channel, type, sort, tag: tag || undefined, q: query || undefined, cursor });
      if (sequence !== requestSequence.current) return;
      setItems((current) => append ? [...current, ...(page.items ?? [])] : (page.items ?? []));
      setAvailableTags(page.availableTags ?? []);
      setWriteEnabled(page.writeEnabled === true);
      setNextCursor(page.nextCursor ?? null);
    } catch (requestError) {
      if (sequence === requestSequence.current) {
        setError(communityRequestErrorMessage(requestError, '帖子列表加载失败'));
      }
    } finally {
      if (sequence === requestSequence.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [channel, query, sort, tag, type]);

  useEffect(() => {
    setItems([]);
    void load();
  }, [load]);

  function search(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setQuery(searchInput.trim());
  }

  const canPublish =
    writeEnabled &&
    phase === 'active' &&
    user?.socialVerificationStatus === 'verified';

  return (
    <main className={styles.page}>
      <CommunityExperienceNav />
      <PageHeader
        title="经验交流"
        subtitle="真实用户的经验、问答和复盘。职业频道只代表主题，不证明作者的现实职业。"
        actions={canPublish
          ? <Link className={styles.primaryLink} to="/community/new">发布内容</Link>
          : phase === 'guest'
            ? <Link to="/login">登录后参与</Link>
            : !writeEnabled
              ? <span>当前只读</span>
              : <Link to="/account/security">完成适用的社交核验后发布</Link>}
      />

      <Card>
        <form className={styles.searchForm} onSubmit={search}>
          <Input label="搜索标题、正文和标签" value={searchInput} maxLength={100} onChange={(event) => setSearchInput(event.target.value)} />
          <Button type="submit">搜索</Button>
        </form>
        <div className={styles.filters}>
          <label>频道<select value={channel} onChange={(event) => setChannel(event.target.value as CommunityContentChannel | 'all')}><option value="all">全部频道</option>{COMMUNITY_CONTENT_CHANNELS.map((item) => <option key={item} value={item}>{CHANNEL_LABELS[item]}</option>)}</select></label>
          <label>类型<select value={type} onChange={(event) => setType(event.target.value as CommunityPostType | 'all')}><option value="all">全部类型</option>{Object.entries(POST_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>排序<select value={sort} onChange={(event) => setSort(event.target.value as CommunityPostSort)}><option value="latest">最新</option><option value="popular">热门</option><option value="unresolved">未解决问答</option></select></label>
        </div>
        {availableTags.length > 0 ? (
          <div className={styles.tagFilters} aria-label="标签筛选">
            <button type="button" data-selected={!tag} onClick={() => setTag('')}>全部标签</button>
            {availableTags.map((item) => <button key={item} type="button" data-selected={tag === item} onClick={() => setTag(item)}>{item}</button>)}
          </div>
        ) : null}
      </Card>

      {error ? <div className={styles.error} role="alert"><p>{error}</p><Button variant="secondary" size="sm" onClick={() => void load()}>重试</Button></div> : null}
      {loading ? <p role="status">正在加载真实帖子…</p> : items.length === 0 ? (
        <EmptyState
          title="当前还没有真实帖子"
          message={query || tag || channel !== 'all' || type !== 'all' ? '没有符合当前筛选的内容，可以调整搜索条件。' : '社区不会用假用户、假评论或假热度填充列表。'}
          actions={canPublish ? <Link className={styles.primaryLink} to="/community/new">写第一篇内容</Link> : undefined}
        />
      ) : (
        <section className={styles.postList} aria-label="帖子列表">
          {items.map((post) => (
            <article className={styles.postCard} key={post.id}>
              <div className={styles.postMeta}>
                <Tag>{POST_TYPE_LABELS[post.type]}</Tag>
                <span>{CHANNEL_LABELS[post.channel]}</span>
                <span>{new Date(post.updatedAt).toLocaleString('zh-CN')}</span>
              </div>
              <h2><Link to={`/community/posts/${encodeURIComponent(post.id)}`}>{post.title}</Link></h2>
              <p>{post.excerpt}</p>
              <div className={styles.tags}>{post.tags.map((item) => <button type="button" key={item} onClick={() => setTag(item)}>#{item}</button>)}</div>
              <ContentStateBadges state={post} />
              <footer>
                <span>{post.author.displayName}</span>
                <span>有用 {post.usefulCount}</span>
                <span>评论 {post.commentCount}</span>
                {post.type === 'question' ? <span>{post.acceptedCommentId ? '已解决' : '待解决'}</span> : null}
              </footer>
            </article>
          ))}
        </section>
      )}
      {nextCursor ? <Button variant="secondary" fullWidth loading={loadingMore} onClick={() => void load(nextCursor, true)}>加载更多</Button> : null}
    </main>
  );
}
