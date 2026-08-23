import { useCallback, useEffect, useMemo, useState, type FormEvent, type JSX } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import {
  CommunityApiError,
  communityContentApi,
  createCommunityIdempotencyKey,
  type CommunityComment,
  type CommunityPostDetail,
  type CommunityPostRevision,
} from '../../api/community';
import { Button, Card, EmptyState, PageHeader, Tag, Textarea } from '../../components/ui';
import { communityRequestErrorMessage } from '../community/request-error';
import { CHANNEL_LABELS, POST_TYPE_LABELS } from './content-copy';
import { ContentReportForm } from './ContentReportForm';
import { ContentStateBadges } from './ContentStateBadges';
import {
  communityContentLinkWarnings,
  validateCommunityComment,
} from './content-validation';
import styles from './CommunityContent.module.css';

type ReportTarget = { type: 'post' | 'comment'; id: string };

export function CommunityPostDetailPage(): JSX.Element {
  const { id = '' } = useParams();
  const phase = useCommunityAuthStore((state) => state.phase);
  const user = useCommunityAuthStore((state) => state.user);
  const [post, setPost] = useState<CommunityPostDetail | null>(null);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>();
  const [commentBody, setCommentBody] = useState('');
  const [replyTo, setReplyTo] = useState<CommunityComment | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget>();
  const [revisions, setRevisions] = useState<CommunityPostRevision[]>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [commentError, setCommentError] = useState<string>();
  const [conflictVersion, setConflictVersion] = useState<number>();

  const load = useCallback(async (): Promise<void> => {
    if (!id) return;
    setLoading(true);
    setError(undefined);
    try {
      const [nextPost, commentPage] = await Promise.all([
        communityContentApi.getPost(id),
        communityContentApi.listComments(id),
      ]);
      setPost(nextPost);
      setComments(commentPage.items ?? []);
      setNextCursor(commentPage.nextCursor ?? null);
      setRevisions(undefined);
    } catch (requestError) {
      setError(communityRequestErrorMessage(requestError, '帖子详情加载失败'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const repliesByParent = useMemo(() => {
    const map = new Map<string, CommunityComment[]>();
    comments.filter((comment) => comment.depth === 1 && comment.parentCommentId).forEach((comment) => {
      const list = map.get(comment.parentCommentId!) ?? [];
      list.push(comment);
      map.set(comment.parentCommentId!, list);
    });
    return map;
  }, [comments]);
  const rootComments = comments.filter((comment) => comment.depth === 0 && !comment.parentCommentId);
  const commentWarnings = communityContentLinkWarnings(commentBody);
  const canWrite =
    post?.writeEnabled === true &&
    phase === 'active' &&
    user?.socialVerificationStatus === 'verified';

  function handleMutationError(requestError: unknown, fallback: string): void {
    if (requestError instanceof CommunityApiError && requestError.status === 409) {
      const currentVersion = requestError.body && typeof requestError.body === 'object' && 'currentVersion' in requestError.body
        ? Number((requestError.body as { currentVersion?: unknown }).currentVersion)
        : undefined;
      setConflictVersion(Number.isFinite(currentVersion) ? currentVersion : undefined);
      setError('内容版本已变化，操作没有覆盖服务器数据。请刷新后再决定。');
      return;
    }
    setError(communityRequestErrorMessage(requestError, fallback));
  }

  async function mutate(
    key: string,
    operation: () => Promise<unknown>,
    success: string,
  ): Promise<void> {
    setBusyKey(key);
    setError(undefined);
    setNotice(undefined);
    setConflictVersion(undefined);
    try {
      await operation();
      setNotice(success);
      setConfirmDelete(false);
      await load();
    } catch (requestError) {
      handleMutationError(requestError, '操作失败，请重试');
    } finally {
      setBusyKey(undefined);
    }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!post) return;
    const validationError = validateCommunityComment(commentBody);
    setCommentError(validationError);
    if (validationError) return;
    setBusyKey('comment-create');
    setCommentError(undefined);
    try {
      await communityContentApi.createComment(
        post.id,
        commentBody.trim(),
        replyTo?.id ?? null,
        createCommunityIdempotencyKey(`comment:${post.id}`),
      );
      setCommentBody('');
      setReplyTo(null);
      setNotice('评论已提交，显示状态以审核结果为准');
      await load();
    } catch (requestError) {
      setCommentError(communityRequestErrorMessage(requestError, '评论提交失败'));
    } finally {
      setBusyKey(undefined);
    }
  }

  async function loadMoreComments(): Promise<void> {
    if (!post || !nextCursor) return;
    setLoadingMore(true);
    try {
      const page = await communityContentApi.listComments(post.id, nextCursor);
      setComments((current) => [...current, ...(page.items ?? [])]);
      setNextCursor(page.nextCursor ?? null);
    } catch (requestError) {
      setError(communityRequestErrorMessage(requestError, '更多评论加载失败'));
    } finally {
      setLoadingMore(false);
    }
  }

  async function loadRevisions(): Promise<void> {
    if (!post) return;
    if (revisions) {
      setRevisions(undefined);
      return;
    }
    setRevisionsLoading(true);
    setError(undefined);
    try {
      const page = await communityContentApi.listPostRevisions(post.id);
      setRevisions(page.items ?? []);
    } catch (requestError) {
      setError(communityRequestErrorMessage(requestError, '版本记录加载失败'));
    } finally {
      setRevisionsLoading(false);
    }
  }

  function commentBodyForViewer(comment: CommunityComment): string {
    if (comment.deletedAt) return '该评论已删除。';
    if (comment.moderationStatus === 'hidden' && !comment.permissions.canEdit) return '该评论已被审核隐藏。';
    return comment.body;
  }

  function renderComment(comment: CommunityComment): JSX.Element {
    const accepted = post?.acceptedCommentId === comment.id;
    return (
      <article className={styles.comment} key={comment.id} data-depth={comment.depth}>
        <header>
          <strong>{comment.author.displayName}</strong>
          <span>{new Date(comment.createdAt).toLocaleString('zh-CN')}</span>
          {accepted ? <Tag color="success">已采纳回答</Tag> : null}
        </header>
        <ContentStateBadges state={comment} />
        {comment.lastReviewDecision === 'rejected' && comment.permissions.canEdit ? <p className={styles.reviewReason}>审核未通过：{comment.lastReviewReason ?? '未提供公开原因'}</p> : null}
        <p className={styles.commentBody}>{commentBodyForViewer(comment)}</p>
        <div className={styles.actions}>
          {comment.depth === 0 && comment.permissions.canReply && canWrite && !comment.deletedAt ? <Button variant="ghost" size="sm" onClick={() => setReplyTo(comment)}>回复</Button> : null}
          {post?.type === 'question' && post.permissions.canAcceptAnswer && comment.publicationStatus === 'published' && !comment.deletedAt ? (
            <Button variant="secondary" size="sm" loading={busyKey === `accept:${comment.id}`} onClick={() => void mutate(
              `accept:${comment.id}`,
              () => communityContentApi.acceptAnswer(post.id, accepted ? null : comment.id, post.version),
              accepted ? '已取消采纳' : '回答已采纳',
            )}>{accepted ? '取消采纳' : '采纳回答'}</Button>
          ) : null}
          {comment.permissions.canDelete && !comment.deletedAt ? <Button variant="danger" size="sm" loading={busyKey === `delete-comment:${comment.id}`} onClick={() => void mutate(`delete-comment:${comment.id}`, () => communityContentApi.deleteComment(comment.id, comment.version), '评论已删除')}>删除</Button> : null}
          {comment.permissions.canRestore && comment.deletedAt ? <Button variant="secondary" size="sm" loading={busyKey === `restore-comment:${comment.id}`} onClick={() => void mutate(`restore-comment:${comment.id}`, () => communityContentApi.restoreComment(comment.id, comment.version), '评论已恢复，原治理状态仍然有效')}>恢复</Button> : null}
          {comment.permissions.canReport && !comment.deletedAt ? <Button variant="ghost" size="sm" onClick={() => setReportTarget({ type: 'comment', id: comment.id })}>举报</Button> : null}
        </div>
        {reportTarget?.type === 'comment' && reportTarget.id === comment.id ? <ContentReportForm targetType="comment" targetId={comment.id} onClose={() => setReportTarget(undefined)} /> : null}
        {comment.depth === 0 ? <div className={styles.replies}>{(repliesByParent.get(comment.id) ?? []).map(renderComment)}</div> : null}
      </article>
    );
  }

  return (
    <main className={styles.page}>
      {loading ? <p role="status">正在加载帖子…</p> : null}
      {error ? <div className={styles.error} role="alert"><p>{error}</p>{conflictVersion ? <p>内容已更新：v{conflictVersion}</p> : null}<Button variant="secondary" size="sm" onClick={() => void load()}>加载最新内容</Button></div> : null}
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
      {!loading && !post ? <EmptyState title="无法显示这篇内容" message="内容可能不存在、已隐藏，或你没有查看权限。" actions={<Link to="/community">返回经验交流</Link>} /> : null}

      {post ? (
        <>
          <PageHeader
            title={post.title}
            subtitle={`${POST_TYPE_LABELS[post.type]} · ${CHANNEL_LABELS[post.channel]} · ${post.author.displayName}`}
            actions={<Link to="/community">返回列表</Link>}
          />
          <ContentStateBadges state={post} />
          {post.lastReviewDecision === 'rejected' && post.permissions.canEdit ? <div className={styles.reviewReason}><strong>审核未通过</strong><p>{post.lastReviewReason ?? '未提供公开原因'}</p></div> : null}
          {post.moderationStatus !== 'normal' && post.permissions.canEdit ? <div className={styles.reviewReason}><strong>当前治理处置</strong><p>{post.moderationReason ?? '请查看通知或申诉渠道了解详情。'}</p></div> : null}

          <Card>
            {post.deletedAt ? (
              <div className={styles.deletedBody}><strong>这篇内容已删除</strong><p>作者删除后最多 30 天内可申请恢复，具体截止时间见下方。</p><p>删除时间：{new Date(post.deletedAt).toLocaleString('zh-CN')}</p>{post.restoreUntil ? <p>可恢复截止：{new Date(post.restoreUntil).toLocaleString('zh-CN')}</p> : null}</div>
            ) : post.moderationStatus === 'hidden' && !post.permissions.canEdit ? (
              <p>这篇内容已被审核隐藏。</p>
            ) : (
              <pre className={styles.postBody}>{post.body}</pre>
            )}
            <div className={styles.tags}>{post.tags.map((item) => <Tag key={item}>#{item}</Tag>)}</div>
            <div className={styles.postStats}><span>有用 {post.usefulCount}</span><span>评论 {post.commentCount}</span><span>版本 v{post.version}</span></div>
          </Card>

          <Card title="帖子操作">
            <div className={styles.actions}>
              {canWrite && !post.deletedAt ? <Button variant="secondary" size="sm" loading={busyKey === 'useful'} onClick={() => void mutate('useful', () => communityContentApi.setUseful(post.id, !post.usefulByMe), post.usefulByMe ? '已取消有用标记' : '已标记为有用')}>{post.usefulByMe ? '取消有用' : '有用'}</Button> : null}
              {canWrite && !post.deletedAt ? <Button variant="secondary" size="sm" loading={busyKey === 'bookmark'} onClick={() => void mutate('bookmark', () => communityContentApi.setBookmark(post.id, !post.bookmarked), post.bookmarked ? '已取消收藏' : '已收藏')}>{post.bookmarked ? '取消收藏' : '收藏'}</Button> : null}
              {canWrite && !post.deletedAt ? <Button variant="secondary" size="sm" loading={busyKey === 'follow'} onClick={() => void mutate('follow', () => communityContentApi.setFollow(post.id, !post.followed), post.followed ? '已取消关注' : '已关注回复')}>{post.followed ? '取消关注' : '关注回复'}</Button> : null}
              {post.permissions.canEdit && !post.deletedAt ? <Link to={`/community/posts/${encodeURIComponent(post.id)}/edit`}>编辑</Link> : null}
              {post.permissions.canEdit ? <Button variant="ghost" size="sm" loading={revisionsLoading} onClick={() => void loadRevisions()}>{revisions ? '收起版本记录' : '查看版本记录'}</Button> : null}
              {post.permissions.canSubmitReview && !post.deletedAt ? <Button size="sm" loading={busyKey === 'submit-review'} onClick={() => void mutate('submit-review', () => communityContentApi.submitPostReview(post.id, post.version), '已提交审核')}>提交审核</Button> : null}
              {post.permissions.canWithdrawReview && !post.deletedAt ? <Button variant="secondary" size="sm" loading={busyKey === 'withdraw-review'} onClick={() => void mutate('withdraw-review', () => communityContentApi.withdrawPostReview(post.id, post.version), '已撤回审核')}>撤回审核</Button> : null}
              {post.permissions.canDelete && !post.deletedAt ? <Button variant="danger" size="sm" loading={busyKey === 'delete-post'} onClick={() => {
                if (!confirmDelete) { setConfirmDelete(true); return; }
                void mutate('delete-post', () => communityContentApi.deletePost(post.id, post.version), '内容已删除，可在页面显示的期限内恢复');
              }}>{confirmDelete ? '确认删除' : '删除'}</Button> : null}
              {post.permissions.canRestore && post.deletedAt ? <Button size="sm" loading={busyKey === 'restore-post'} onClick={() => void mutate('restore-post', () => communityContentApi.restorePost(post.id, post.version), '内容已恢复，原审核与治理状态仍然有效')}>恢复内容</Button> : null}
              {post.permissions.canReport && !post.deletedAt ? <Button variant="ghost" size="sm" onClick={() => setReportTarget({ type: 'post', id: post.id })}>举报</Button> : null}
            </div>
            {reportTarget?.type === 'post' ? <ContentReportForm targetType="post" targetId={post.id} onClose={() => setReportTarget(undefined)} /> : null}
            {revisions ? (
              <div className={styles.revisionList} aria-label="帖子版本记录">
                {revisions.length === 0 ? <p>暂无版本记录。</p> : revisions.map((revision) => (
                  <article key={revision.id}>
                    <strong>v{revision.version}</strong>
                    <span>发布：{revision.publicationStatus} · 治理：{revision.moderationStatus}</span>
                    <small>{new Date(revision.createdAt).toLocaleString('zh-CN')}</small>
                    {revision.reviewReason ? <p>{revision.reviewReason}</p> : null}
                  </article>
                ))}
              </div>
            ) : null}
          </Card>

          <section aria-labelledby="comments-title">
            <h2 id="comments-title">评论与回答</h2>
            {post.permissions.canComment && canWrite && !post.deletedAt ? (
              <Card>
                <form className={styles.commentForm} onSubmit={submitComment}>
                  {replyTo ? <div className={styles.replying}>正在回复 {replyTo.author.displayName}<Button variant="ghost" size="sm" onClick={() => setReplyTo(null)}>取消</Button></div> : null}
                  <Textarea label={replyTo ? '回复内容' : '评论内容'} value={commentBody} maxLength={5_000} rows={5} error={commentError} onChange={(event) => setCommentBody(event.target.value)} />
                  {commentWarnings.map((warning) => <p className={styles.warning} key={warning}>{warning}</p>)}
                  <Button type="submit" loading={busyKey === 'comment-create'}>提交{replyTo ? '回复' : '评论'}</Button>
                </form>
              </Card>
            ) : !canWrite && phase === 'active' ? <p className={styles.warning}>完成适用的社交核验后才能评论。</p> : null}

            {comments.length === 0 ? <EmptyState title="还没有真实评论" message="社区不会使用假评论填充讨论。" /> : <div className={styles.commentTree}>{rootComments.map(renderComment)}</div>}
            {nextCursor ? <Button variant="secondary" fullWidth loading={loadingMore} onClick={() => void loadMoreComments()}>加载更多评论</Button> : null}
          </section>
        </>
      ) : null}
    </main>
  );
}
