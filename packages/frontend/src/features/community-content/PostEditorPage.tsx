import { useEffect, useMemo, useState, type FormEvent, type JSX } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import {
  COMMUNITY_CONTENT_CHANNELS,
  CommunityApiError,
  communityContentApi,
  createCommunityIdempotencyKey,
  type CommunityContentChannel,
  type CommunityPostDetail,
  type CommunityPostType,
  type SaveCommunityPostPayload,
} from '../../api/community';
import { Button, Card, Input, PageHeader, Textarea } from '../../components/ui';
import { communityRequestErrorMessage } from '../community/request-error';
import { CHANNEL_LABELS, POST_TYPE_LABELS } from './content-copy';
import {
  communityContentLinkWarnings,
  parseCommunityTags,
  validateCommunityPost,
  type CommunityPostValidationErrors,
} from './content-validation';
import { ContentStateBadges } from './ContentStateBadges';
import styles from './CommunityContent.module.css';

export function CommunityPostEditorPage(): JSX.Element {
  const { id: routePostId } = useParams();
  const navigate = useNavigate();
  const user = useCommunityAuthStore((state) => state.user);
  const [workingPostId, setWorkingPostId] = useState(routePostId);
  const [existing, setExisting] = useState<CommunityPostDetail | null>(null);
  const [type, setType] = useState<CommunityPostType>('experience');
  const [channel, setChannel] = useState<CommunityContentChannel>('general');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [bodyFormat, setBodyFormat] = useState<'plain_text' | 'restricted_markdown'>('plain_text');
  const [writeEnabled, setWriteEnabled] = useState(false);
  const [preview, setPreview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<'draft' | 'review'>();
  const [errors, setErrors] = useState<CommunityPostValidationErrors>({});
  const [requestError, setRequestError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [conflictVersion, setConflictVersion] = useState<number>();

  useEffect(() => {
    let active = true;
    if (!routePostId) {
      communityContentApi
        .listPosts()
        .then((page) => {
          if (!active) return;
          setWriteEnabled(page.writeEnabled === true);
          if (!page.writeEnabled) setRequestError('经验交流当前为只读，暂不能创建内容');
        })
        .catch((error) => {
          if (active) setRequestError(communityRequestErrorMessage(error, '发布能力检查失败'));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }
    communityContentApi
      .getPost(routePostId)
      .then((post) => {
        if (!active) return;
        setWriteEnabled(post.writeEnabled === true);
        if (!post.permissions.canEdit) {
          setRequestError('你没有权限编辑这篇内容');
          return;
        }
        setExisting(post);
        setWorkingPostId(post.id);
        setType(post.type);
        setChannel(post.channel);
        setTitle(post.title);
        setBody(post.body);
        setTagsInput(post.tags.join('，'));
        setBodyFormat(post.bodyFormat);
      })
      .catch((error) => {
        if (active) setRequestError(communityRequestErrorMessage(error, '草稿加载失败'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [routePostId]);

  const payload = useMemo<SaveCommunityPostPayload>(() => ({
    type,
    channel,
    title: title.trim(),
    body: body.trim(),
    tags: parseCommunityTags(tagsInput),
    bodyFormat,
  }), [body, bodyFormat, channel, tagsInput, title, type]);
  const warnings = useMemo(() => communityContentLinkWarnings(body), [body]);
  const verified = user?.socialVerificationStatus === 'verified';
  const canWrite = verified && writeEnabled;

  async function persist(submitForReview: boolean): Promise<void> {
    const nextErrors = validateCommunityPost(payload);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    if (!writeEnabled) {
      setRequestError('经验交流当前为只读，暂不能保存或提交内容');
      return;
    }
    if (!verified) {
      setRequestError('发布内容前需要完成适用的社交核验');
      return;
    }
    setBusyAction(submitForReview ? 'review' : 'draft');
    setRequestError(undefined);
    setNotice(undefined);
    setConflictVersion(undefined);
    try {
      let saved: CommunityPostDetail;
      if (workingPostId && existing) {
        saved = await communityContentApi.updatePost(
          workingPostId,
          payload,
          existing.version,
          createCommunityIdempotencyKey(`post-update:${workingPostId}`),
        );
      } else {
        saved = await communityContentApi.createPost(
          payload,
          createCommunityIdempotencyKey('post-create'),
        );
      }
      setExisting(saved);
      setWorkingPostId(saved.id);
      if (submitForReview) {
        try {
          const submitted = await communityContentApi.submitPostReview(saved.id, saved.version);
          navigate(`/community/posts/${encodeURIComponent(submitted.id)}`, { replace: true });
        } catch (submitError) {
          setNotice('草稿已由服务端保存，但提交审核未完成；不会重复创建草稿。');
          throw submitError;
        }
      } else {
        navigate(`/community/posts/${encodeURIComponent(saved.id)}`, { replace: true });
      }
    } catch (error) {
      if (error instanceof CommunityApiError && error.status === 409) {
        const currentVersion = error.body && typeof error.body === 'object' && 'currentVersion' in error.body
          ? Number((error.body as { currentVersion?: unknown }).currentVersion)
          : undefined;
        setConflictVersion(Number.isFinite(currentVersion) ? currentVersion : undefined);
        setRequestError('其他设备或窗口已经保存了新版本。当前表单没有覆盖服务器内容，请重新加载后合并。');
      } else {
        setRequestError(communityRequestErrorMessage(error, submitForReview ? '提交审核失败' : '草稿保存失败'));
      }
    } finally {
      setBusyAction(undefined);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void persist(false);
  }

  return (
    <main className={styles.page}>
      <PageHeader
        title={routePostId ? '编辑内容' : '新建内容'}
        subtitle="首版仅支持纯文本或安全 Markdown 子集，不支持图片、附件、任意 HTML 或站外链接预览。"
        actions={<Link to={workingPostId ? `/community/posts/${encodeURIComponent(workingPostId)}` : '/community'}>返回</Link>}
      />
      {loading ? <p role="status">正在加载草稿…</p> : null}
      {!writeEnabled && !loading ? <p className={styles.warning}>经验交流当前为只读，不能保存或提交内容。</p> : !verified ? <p className={styles.warning}>当前账号尚未完成适用的社交核验，可以阅读，但不能保存或提交内容。</p> : null}
      {requestError ? <div className={styles.error} role="alert"><p>{requestError}</p>{conflictVersion ? <p>服务器当前版本：v{conflictVersion}</p> : null}{routePostId ? <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>重新加载服务器版本</Button> : null}</div> : null}
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
      {existing ? <ContentStateBadges state={existing} /> : null}
      {existing?.lastReviewDecision === 'rejected' ? (
        <div className={styles.reviewReason} role="status"><strong>上次审核未通过</strong><p>{existing.lastReviewReason ?? '审核方未提供公开原因，请联系申诉渠道。'}</p></div>
      ) : null}

      {!loading ? (
        <Card>
          <form className={styles.editorForm} noValidate onSubmit={submit}>
            <div className={styles.filters}>
              <label>内容类型<select value={type} onChange={(event) => setType(event.target.value as CommunityPostType)}>{Object.entries(POST_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>频道<select value={channel} onChange={(event) => setChannel(event.target.value as CommunityContentChannel)}>{COMMUNITY_CONTENT_CHANNELS.map((item) => <option key={item} value={item}>{CHANNEL_LABELS[item]}</option>)}</select></label>
              <label>正文格式<select value={bodyFormat} onChange={(event) => setBodyFormat(event.target.value as 'plain_text' | 'restricted_markdown')}><option value="plain_text">纯文本</option><option value="restricted_markdown">安全 Markdown</option></select></label>
            </div>
            <Input label="标题" required value={title} maxLength={80} error={errors.title} onChange={(event) => setTitle(event.target.value)} />
            <div className={styles.counter}>{Array.from(title.trim()).length}/80</div>
            <Textarea label="正文" required value={body} maxLength={20_000} rows={16} error={errors.body} onChange={(event) => setBody(event.target.value)} />
            <div className={styles.counter}>{Array.from(body.trim()).length}/20000</div>
            <Input label="标签（逗号分隔，最多 5 个）" value={tagsInput} maxLength={120} error={errors.tags} onChange={(event) => setTagsInput(event.target.value)} />
            <div className={styles.counter}>{parseCommunityTags(tagsInput).length}/5 个标签</div>

            <div className={styles.safetyNote}>
              <strong>发布边界</strong>
              <ul><li>不提供图片或附件上传。</li><li>Markdown 只保留标题、列表、引用、强调、代码和文本链接等安全子集。</li><li>不要发布个人电话、邮箱、身份信息、公司机密或无授权材料。</li></ul>
            </div>
            {warnings.map((warning) => <p key={warning} className={styles.warning} role="status">{warning}</p>)}

            <Button variant="secondary" type="button" onClick={() => setPreview((current) => !current)}>{preview ? '关闭预览' : '安全预览'}</Button>
            {preview ? <pre className={styles.preview} aria-label="正文安全预览">{body || '尚未输入正文'}</pre> : null}
            <div className={styles.actions}>
              <Button type="submit" loading={busyAction === 'draft'} disabled={!canWrite}>保存草稿</Button>
              <Button type="button" variant="secondary" loading={busyAction === 'review'} disabled={!canWrite} onClick={() => void persist(true)}>保存并提交审核</Button>
            </div>
          </form>
        </Card>
      ) : null}
    </main>
  );
}
