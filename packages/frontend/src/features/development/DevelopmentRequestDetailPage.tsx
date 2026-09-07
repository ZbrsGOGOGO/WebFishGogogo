import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type JSX,
} from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  DEVELOPMENT_LIMITS,
  DEVELOPMENT_STATUS_TRANSITIONS,
  type DevelopmentAttachment,
  type DevelopmentRequestDetail,
  type DevelopmentStatus,
} from '@stealth-reader/shared';

import { CommunityApiError } from '../../api/community-http';
import { communityDevelopmentApi } from '../../api/community-development';
import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import { Button, Card, EmptyState, PageHeader, Tag, Textarea } from '../../components/ui';
import { useDevelopmentAccess } from './development-access';
import {
  DEVELOPMENT_CATEGORY_LABELS,
  DEVELOPMENT_STATUS_LABELS,
  developmentError,
  developmentEventActorName,
  developmentPersonName,
  developmentStatusColor,
  developmentTime,
  downloadPrivateBlob,
  fileSize,
} from './development-format';
import styles from './Development.module.css';

const ATTACHMENT_ACCEPT = '.txt,.md,.csv,.json,.log,.pdf,.docx,.zip,.png,.jpg,.jpeg,.webp';

interface UploadItem {
  key: string;
  file: File;
  state: 'queued' | 'uploading' | 'success' | 'failed' | 'invalid';
  error?: string;
}

function accountStillCurrent(subjectPublicId: string): boolean {
  const auth = useCommunityAuthStore.getState();
  return auth.phase === 'active' && auth.user?.publicId === subjectPublicId;
}

function isVersionConflict(error: unknown): boolean {
  if (!(error instanceof CommunityApiError) || error.status !== 409) return false;
  const code = error.body && typeof error.body === 'object' && 'code' in error.body
    ? (error.body as { code?: unknown }).code
    : undefined;
  return code === 'DEVELOPMENT_VERSION_CONFLICT' || code === 'STALE_SESSION_REFRESH';
}

function attachmentExplanation(attachment: DevelopmentAttachment): string {
  if (attachment.extraction === 'text') return '已按纯文本提取，下方预览不会执行 HTML 或脚本。';
  return '只记录文件元数据，正文尚未解析；没有解压到磁盘或执行其中内容。';
}

function DevelopmentRequestDetailContent({
  requestId,
  subjectPublicId,
  role,
}: {
  requestId: string;
  subjectPublicId: string;
  role: 'owner' | 'contributor';
}): JSX.Element {
  const [detail, setDetailState] = useState<DevelopmentRequestDetail | null>(null);
  const detailRef = useRef<DevelopmentRequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [reloadRevision, setReloadRevision] = useState(0);
  const lifecycleGeneration = useRef(0);
  const [conflict, setConflict] = useState(false);
  const [comment, setComment] = useState('');
  const [commenting, setCommenting] = useState(false);
  const [commentError, setCommentError] = useState<string>();
  const [decisionStatus, setDecisionStatus] = useState<DevelopmentStatus>('accepted');
  const [decisionNote, setDecisionNote] = useState('');
  const [deciding, setDeciding] = useState(false);
  const [decisionError, setDecisionError] = useState<string>();
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<string>();
  const [downloadId, setDownloadId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string>();

  function setDetail(next: DevelopmentRequestDetail): void {
    if (next.id !== requestId) return;
    const current = detailRef.current;
    if (current?.id === next.id && current.version > next.version) return;
    detailRef.current = next;
    setDetailState(next);
    const allowedStatuses = DEVELOPMENT_STATUS_TRANSITIONS[next.status];
    setDecisionStatus((currentStatus) => allowedStatuses.includes(currentStatus)
      ? currentStatus
      : (allowedStatuses[0] ?? currentStatus));
  }

  useEffect(() => {
    const generation = ++lifecycleGeneration.current;
    detailRef.current = null;
    setDetailState(null);
    setUploadItems((items) => items
      .filter((item) => item.state !== 'success')
      .map((item) => item.state === 'uploading'
        ? { ...item, state: 'failed', error: '详情已刷新，请重试该文件' }
        : item));
    setConflict(false);
    setCommenting(false);
    setCommentError(undefined);
    setDeciding(false);
    setDecisionError(undefined);
    setUploading(false);
    setUploadNotice(undefined);
    setDownloadId(null);
    setDownloadError(undefined);
    setLoading(true);
    setLoadError(undefined);
    void communityDevelopmentApi.getRequest(requestId).then((next) => {
      if (
        generation === lifecycleGeneration.current &&
        accountStillCurrent(subjectPublicId) &&
        next.id === requestId
      ) {
        setDetail(next);
      }
    }).catch((requestError) => {
      if (generation === lifecycleGeneration.current && accountStillCurrent(subjectPublicId)) {
        setLoadError(developmentError(requestError, '提案详情加载失败'));
      }
    }).finally(() => {
      if (generation === lifecycleGeneration.current && accountStillCurrent(subjectPublicId)) {
        setLoading(false);
      }
    });

    return () => {
      lifecycleGeneration.current += 1;
    };
  }, [reloadRevision, requestId, subjectPublicId]);

  function currentOperation(): number {
    return lifecycleGeneration.current;
  }

  function canAccept(generation: number): boolean {
    return generation === lifecycleGeneration.current && accountStillCurrent(subjectPublicId);
  }

  function markConflict(error: unknown): boolean {
    if (!isVersionConflict(error)) return false;
    setConflict(true);
    return true;
  }

  async function submitComment(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const current = detailRef.current;
    const body = comment.trim();
    if (!current || !body) {
      setCommentError('请先填写评论内容');
      return;
    }
    const generation = currentOperation();
    setCommenting(true);
    setCommentError(undefined);
    try {
      const next = await communityDevelopmentApi.addComment(current.id, body, current.version);
      if (!canAccept(generation)) return;
      setDetail(next);
      setComment('');
      setConflict(false);
    } catch (requestError) {
      if (!canAccept(generation)) return;
      markConflict(requestError);
      setCommentError(developmentError(requestError, '评论发送失败'));
    } finally {
      if (canAccept(generation)) setCommenting(false);
    }
  }

  async function submitDecision(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const current = detailRef.current;
    const note = decisionNote.trim();
    if (!current || !note) {
      setDecisionError('负责人的决策理由必填，并会记入时间线');
      return;
    }
    if (!DEVELOPMENT_STATUS_TRANSITIONS[current.status].includes(decisionStatus)) {
      setDecisionError('所选状态不在当前流程的可选范围内，请刷新详情。');
      return;
    }
    const generation = currentOperation();
    setDeciding(true);
    setDecisionError(undefined);
    try {
      const next = await communityDevelopmentApi.decideRequest(
        current.id,
        decisionStatus,
        note,
        current.version,
      );
      if (!canAccept(generation)) return;
      setDetail(next);
      setDecisionNote('');
      setConflict(false);
    } catch (requestError) {
      if (!canAccept(generation)) return;
      markConflict(requestError);
      setDecisionError(developmentError(requestError, '决策保存失败'));
    } finally {
      if (canAccept(generation)) setDeciding(false);
    }
  }

  function selectFiles(event: ChangeEvent<HTMLInputElement>): void {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = '';
    const current = detailRef.current;
    if (!current || selected.length === 0) return;

    setUploadItems((existing) => {
      const pending = existing.filter((item) => item.state !== 'success');
      const countedPending = pending.filter((item) => item.state !== 'invalid');
      let plannedCount = current.attachments.length + countedPending.length;
      let plannedBytes = current.attachments.reduce((sum, item) => sum + item.bytes, 0) +
        countedPending.reduce((sum, item) => sum + item.file.size, 0);
      const additions = selected.map((file, index): UploadItem => {
        const key = `${file.name}:${file.lastModified}:${file.size}:${Date.now()}:${index}`;
        if (plannedCount >= DEVELOPMENT_LIMITS.attachmentsPerRequest) {
          return { key, file, state: 'invalid', error: '每条提案最多 5 个附件，请移除其他待上传文件' };
        }
        if (file.size > DEVELOPMENT_LIMITS.fileBytes) {
          return { key, file, state: 'invalid', error: '单个文件不能超过 5 MB' };
        }
        if (plannedBytes + file.size > DEVELOPMENT_LIMITS.requestFileBytes) {
          return { key, file, state: 'invalid', error: '此提案的附件总量不能超过 20 MB' };
        }
        plannedCount += 1;
        plannedBytes += file.size;
        return { key, file, state: 'queued' };
      });
      return [...pending, ...additions];
    });
    setUploadNotice(undefined);
  }

  function updateUpload(key: string, patch: Partial<UploadItem>): void {
    setUploadItems((items) => items.map((item) => item.key === key ? { ...item, ...patch } : item));
  }

  async function uploadSelected(items = uploadItems): Promise<void> {
    const candidates = items.filter((item) => item.state === 'queued' || item.state === 'failed');
    if (candidates.length === 0 || !detailRef.current) return;
    const generation = currentOperation();
    setUploading(true);
    setUploadNotice(undefined);
    let uploaded = 0;

    for (const item of candidates) {
      if (!canAccept(generation)) break;
      const current = detailRef.current;
      if (!current) break;
      updateUpload(item.key, { state: 'uploading', error: undefined });
      try {
        const next = await communityDevelopmentApi.uploadAttachment(
          current.id,
          item.file,
          current.version,
        );
        if (!canAccept(generation)) break;
        setDetail(next);
        updateUpload(item.key, { state: 'success', error: undefined });
        uploaded += 1;
      } catch (requestError) {
        if (!canAccept(generation)) break;
        const conflictFound = markConflict(requestError);
        updateUpload(item.key, {
          state: 'failed',
          error: developmentError(requestError, '附件上传失败，可单独重试'),
        });
        if (conflictFound) break;
      }
    }

    if (canAccept(generation)) {
      setUploading(false);
      if (uploaded > 0) setUploadNotice(`已成功上传 ${uploaded} 个文件。`);
    }
  }

  async function retryUpload(item: UploadItem): Promise<void> {
    updateUpload(item.key, { state: 'queued', error: undefined });
    await uploadSelected([{ ...item, state: 'queued', error: undefined }]);
  }

  async function downloadAttachment(attachment: DevelopmentAttachment): Promise<void> {
    const generation = currentOperation();
    setDownloadId(attachment.id);
    setDownloadError(undefined);
    try {
      const blob = await communityDevelopmentApi.downloadAttachment(requestId, attachment.id);
      if (canAccept(generation)) downloadPrivateBlob(blob, attachment.filename);
    } catch (requestError) {
      if (canAccept(generation)) {
        setDownloadError(developmentError(requestError, '附件下载失败'));
      }
    } finally {
      if (canAccept(generation)) setDownloadId(null);
    }
  }

  const visibleDetail = detail?.id === requestId ? detail : null;

  if (loading && !visibleDetail) {
    return <main className={styles.page}><p role="status">正在加载提案详情…</p></main>;
  }

  if (!visibleDetail) {
    return (
      <main className={styles.page}>
        <PageHeader title="提案详情" subtitle="无法加载这条提案。" />
        <Card>
          <EmptyState
            title={loadError ?? '没有找到提案'}
            message="核心成员只能打开自己的提案；请确认地址和权限。"
            actions={<Button onClick={() => setReloadRevision((value) => value + 1)}>重试</Button>}
          />
        </Card>
      </main>
    );
  }

  const canUpload = visibleDetail.author.publicId === subjectPublicId &&
    (visibleDetail.status === 'submitted' || visibleDetail.status === 'needs_info');

  return (
    <main className={styles.page}>
      <PageHeader
        title={visibleDetail.title}
        subtitle={`${DEVELOPMENT_CATEGORY_LABELS[visibleDetail.category]} · ${developmentPersonName(visibleDetail.author)} · 更新于 ${developmentTime(visibleDetail.updatedAt)}`}
        actions={(
          <div className={styles.headerActions}>
            <Tag color={developmentStatusColor(visibleDetail.status)}>{DEVELOPMENT_STATUS_LABELS[visibleDetail.status]}</Tag>
            <Tag color="neutral">v{visibleDetail.version}</Tag>
            <Link className={styles.backLink} to="/development">返回列表</Link>
          </div>
        )}
      />

      {conflict ? (
        <section className={styles.conflict} role="alert">
          <span><strong>服务端版本已变化</strong>本次操作没有覆盖别人的更新，请先刷新详情再重试。</span>
          <Button size="sm" variant="secondary" onClick={() => setReloadRevision((value) => value + 1)}>刷新详情</Button>
        </section>
      ) : null}

      <div className={styles.detailGrid}>
        <section className={styles.stack}>
          <Card title="详细描述" bodyClassName={styles.cardBody}>
            <pre className={styles.plainText}>{visibleDetail.description}</pre>
          </Card>

          <Card title="系统规则预检（不是 AI 审核）" bodyClassName={styles.cardBody}>
            <div className={styles.precheckHeading}>
              <Tag color="neutral">规则预检</Tag>
              <strong>{visibleDetail.precheck.summary}</strong>
            </div>
            <p className={styles.muted}>这些结果来自固定规则，尚未经过 AI 审核，最终由站长决定。</p>
            {visibleDetail.precheck.findings.length > 0 ? (
              <div className={styles.precheckBlock}>
                <h3>发现</h3>
                <ul>{visibleDetail.precheck.findings.map((finding, index) => <li key={`${index}:${finding}`}>{finding}</li>)}</ul>
              </div>
            ) : null}
            {visibleDetail.precheck.questions.length > 0 ? (
              <div className={styles.precheckBlock}>
                <h3>待确认问题</h3>
                <ul>{visibleDetail.precheck.questions.map((question, index) => <li key={`${index}:${question}`}>{question}</li>)}</ul>
              </div>
            ) : null}
          </Card>

          <Card title={`附件（${visibleDetail.attachments.length}/${DEVELOPMENT_LIMITS.attachmentsPerRequest}）`} bodyClassName={styles.cardBody}>
            <p className={styles.muted}>允许 txt / md / csv / json / log / pdf / docx / zip / 常见图片。单个 5 MB，每条总计 20 MB。ZIP 只生成目录信息、不分析正文，PDF 和图片不做 OCR。</p>
            {downloadError ? <p className={styles.error} role="alert">{downloadError}</p> : null}
            {visibleDetail.attachments.length === 0 ? <p className={styles.muted}>暂无附件。</p> : (
              <div className={styles.attachmentList}>
                {visibleDetail.attachments.map((attachment) => (
                  <article className={styles.attachment} key={attachment.id}>
                    <div className={styles.attachmentHeading}>
                      <span><strong>{attachment.filename}</strong><small>{fileSize(attachment.bytes)} · {attachment.mediaType} · SHA-256 {attachment.sha256.slice(0, 12)}…</small></span>
                      <Button size="sm" variant="secondary" loading={downloadId === attachment.id} onClick={() => void downloadAttachment(attachment)}>安全下载</Button>
                    </div>
                    <p className={styles.extractionNote}>{attachmentExplanation(attachment)}</p>
                    {attachment.excerpt !== null ? (
                      <pre className={styles.attachmentExcerpt} data-testid={`attachment-excerpt-${attachment.id}`}>{attachment.excerpt}</pre>
                    ) : null}
                    {attachment.warnings.length > 0 ? (
                      <ul className={styles.warningList}>{attachment.warnings.map((warning, index) => <li key={`${index}:${warning}`}>{warning}</li>)}</ul>
                    ) : null}
                  </article>
                ))}
              </div>
            )}

            {canUpload ? <div className={styles.uploadPanel}>
              <label className={styles.filePicker}>
                <span>选择附件</span>
                <input type="file" multiple accept={ATTACHMENT_ACCEPT} disabled={uploading} onChange={selectFiles} />
              </label>
              {uploadItems.length > 0 ? (
                <div className={styles.uploadList}>
                  {uploadItems.map((item) => (
                    <div className={styles.uploadRow} key={item.key}>
                      <span><strong>{item.file.name}</strong><small>{fileSize(item.file.size)} · {{ queued: '待上传', uploading: '上传中', success: '已成功', failed: '上传失败', invalid: '不可上传' }[item.state]}</small>{item.error ? <em role="alert">{item.error}</em> : null}</span>
                      <span className={styles.rowActions}>
                        {item.state === 'failed' ? <Button size="sm" variant="secondary" disabled={uploading} onClick={() => void retryUpload(item)}>重试该文件</Button> : null}
                        {item.state !== 'uploading' && item.state !== 'success' ? <Button size="sm" variant="ghost" disabled={uploading} onClick={() => setUploadItems((items) => items.filter((candidate) => candidate.key !== item.key))}>移除</Button> : null}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
              {uploadNotice ? <p className={styles.notice} role="status">{uploadNotice}</p> : null}
              <Button disabled={!uploadItems.some((item) => item.state === 'queued' || item.state === 'failed')} loading={uploading} onClick={() => void uploadSelected()}>上传待处理文件</Button>
            </div> : (
              <p className={styles.scopeNote}>
                {visibleDetail.author.publicId !== subjectPublicId
                  ? '只有提案作者本人可上传附件；站长查看他人提案时可安全下载、评论和决策。'
                  : '只有待审阅或待补充状态的提案可继续上传附件。'}
              </p>
            )}
          </Card>

          <Card title="时间线" bodyClassName={styles.cardBody}>
            <div className={styles.timeline}>
              {visibleDetail.events.map((entry) => (
                <article className={styles.timelineEvent} key={entry.id}>
                  <span aria-hidden="true" />
                  <div>
                    <div><strong>{developmentEventActorName(entry)}</strong><small>{developmentTime(entry.createdAt)}</small></div>
                    {entry.status ? <Tag color={developmentStatusColor(entry.status)}>{DEVELOPMENT_STATUS_LABELS[entry.status]}</Tag> : null}
                    <p>{entry.body}</p>
                  </div>
                </article>
              ))}
            </div>
            <form className={styles.form} onSubmit={submitComment}>
              <Textarea label="补充评论" required rows={4} maxLength={DEVELOPMENT_LIMITS.commentChars} value={comment} onChange={(event) => setComment(event.target.value)} />
              {commentError ? <p className={styles.error} role="alert">{commentError}</p> : null}
              <Button type="submit" loading={commenting}>发送到时间线</Button>
            </form>
          </Card>
        </section>

        <aside className={styles.stack}>
          <Card title="提案信息" bodyClassName={styles.cardBody}>
            <dl className={styles.metadata}>
              <div><dt>状态</dt><dd>{DEVELOPMENT_STATUS_LABELS[visibleDetail.status]}</dd></div>
              <div><dt>分类</dt><dd>{DEVELOPMENT_CATEGORY_LABELS[visibleDetail.category]}</dd></div>
              <div><dt>版本</dt><dd>v{visibleDetail.version}</dd></div>
              <div><dt>创建人</dt><dd>{developmentPersonName(visibleDetail.author)}</dd></div>
              <div><dt>创建时间</dt><dd>{developmentTime(visibleDetail.createdAt)}</dd></div>
            </dl>
          </Card>

          {role === 'owner' && DEVELOPMENT_STATUS_TRANSITIONS[visibleDetail.status].length > 0 ? (
            <Card title="站长决策" bodyClassName={styles.cardBody}>
              <p className={styles.muted}>状态决策会由服务端再次校验站长身份与内容版本，理由将写入时间线。</p>
              <form className={styles.form} onSubmit={submitDecision}>
                <label className={styles.selectField}>
                  <span>新状态</span>
                  <select value={decisionStatus} onChange={(event) => setDecisionStatus(event.target.value as DevelopmentStatus)}>
                    {DEVELOPMENT_STATUS_TRANSITIONS[visibleDetail.status].map((status) => <option key={status} value={status}>{DEVELOPMENT_STATUS_LABELS[status]}</option>)}
                  </select>
                </label>
                <Textarea label="决策理由" required rows={5} maxLength={DEVELOPMENT_LIMITS.commentChars} value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} />
                {decisionError ? <p className={styles.error} role="alert">{decisionError}</p> : null}
                <Button type="submit" loading={deciding} fullWidth>保存决策</Button>
              </form>
            </Card>
          ) : role === 'owner' ? (
            <Card title="决策已收口" bodyClassName={styles.cardBody}>
              <p className={styles.muted}>这条提案已处于最终状态，没有后续状态可选，仍可查看附件和时间线。</p>
            </Card>
          ) : (
            <Card title="审阅边界" bodyClassName={styles.cardBody}>
              <p className={styles.muted}>核心成员可补充自己的提案和附件，不能授权成员或修改审阅状态。</p>
            </Card>
          )}
        </aside>
      </div>
    </main>
  );
}

export function DevelopmentRequestDetailPage(): JSX.Element {
  const { id = '' } = useParams<{ id: string }>();
  const accessState = useDevelopmentAccess();
  if (accessState.status !== 'allowed') throw new Error('DevelopmentRequestDetailPage requires access');
  if (!id) {
    return <main className={styles.page}><EmptyState title="提案地址无效" message="缺少提案 ID。" /></main>;
  }
  return (
    <DevelopmentRequestDetailContent
      key={`${accessState.subjectPublicId}:${id}`}
      requestId={id}
      subjectPublicId={accessState.subjectPublicId}
      role={accessState.access.role}
    />
  );
}
