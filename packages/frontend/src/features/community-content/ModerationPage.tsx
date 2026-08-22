import { useCallback, useEffect, useState, type FormEvent, type JSX } from 'react';

import {
  CommunityApiError,
  communityModerationApi,
  createCommunityIdempotencyKey,
  type CommunityModerationAction,
  type CommunityModerationCaseDetail,
  type CommunityModerationCaseStatus,
  type CommunityModerationCaseSummary,
  type CommunityModerationRiskLevel,
} from '../../api/community';
import { Button, Card, EmptyState, PageHeader, Tag, Textarea } from '../../components/ui';
import { communityRequestErrorMessage } from '../community/request-error';
import { ContentStateBadges } from './ContentStateBadges';
import styles from './CommunityContent.module.css';

const ACTION_LABELS: Record<CommunityModerationAction, string> = {
  approve: '通过',
  limit: '限流/限制展示',
  hide: '隐藏',
  restore: '恢复正常',
};

export function CommunityModerationPage(): JSX.Element {
  const [cases, setCases] = useState<CommunityModerationCaseSummary[]>([]);
  const [selected, setSelected] = useState<CommunityModerationCaseDetail | null>(null);
  const [status, setStatus] = useState<CommunityModerationCaseStatus | 'all'>('open');
  const [riskLevel, setRiskLevel] = useState<CommunityModerationRiskLevel | 'all'>('all');
  const [contentType, setContentType] = useState<'post' | 'comment' | 'all'>('all');
  const [nextCursor, setNextCursor] = useState<string | null>();
  const [action, setAction] = useState<CommunityModerationAction>('approve');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const loadCases = useCallback(async (cursor?: string, append = false): Promise<void> => {
    append ? setLoadingMore(true) : setLoading(true);
    setError(undefined);
    try {
      const page = await communityModerationApi.listCases({ status, riskLevel, contentType, cursor });
      setCases((current) => append ? [...current, ...(page.items ?? [])] : (page.items ?? []));
      setNextCursor(page.nextCursor ?? null);
    } catch (requestError) {
      setError(communityRequestErrorMessage(requestError, '审核案件加载失败'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [contentType, riskLevel, status]);

  useEffect(() => {
    setSelected(null);
    void loadCases();
  }, [loadCases]);

  async function selectCase(item: CommunityModerationCaseSummary): Promise<void> {
    setDetailLoading(true);
    setError(undefined);
    try {
      const detail = await communityModerationApi.getCase(item.id);
      setSelected(detail);
      setAction(detail.allowedActions[0] ?? 'approve');
      setReason('');
    } catch (requestError) {
      setError(communityRequestErrorMessage(requestError, '审核详情加载失败'));
    } finally {
      setDetailLoading(false);
    }
  }

  async function applyAction(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selected) return;
    if (!selected.allowedActions.includes(action)) {
      setError('当前案件不允许执行该处置');
      return;
    }
    if (Array.from(reason.trim()).length < 3 || Array.from(reason.trim()).length > 500) {
      setError('审核原因需为 3～500 个字符，并会写入审计记录');
      return;
    }
    setActing(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const next = await communityModerationApi.applyAction(
        selected.id,
        action,
        reason.trim(),
        selected.version,
        createCommunityIdempotencyKey(`moderation:${selected.id}:${action}`),
      );
      setSelected(next);
      setReason('');
      setNotice(`服务端已确认执行“${ACTION_LABELS[action]}”，审计记录已返回。`);
      await loadCases();
    } catch (requestError) {
      if (requestError instanceof CommunityApiError && requestError.status === 409) {
        const currentVersion = requestError.body && typeof requestError.body === 'object' && 'currentVersion' in requestError.body
          ? String((requestError.body as { currentVersion?: unknown }).currentVersion ?? '未知')
          : '未知';
        setError(`案件版本冲突，服务器当前版本为 v${currentVersion}。操作未覆盖现有处置，请重新打开案件。`);
      } else {
        setError(communityRequestErrorMessage(requestError, '审核处置失败'));
      }
    } finally {
      setActing(false);
    }
  }

  return (
    <main className={styles.page}>
      <PageHeader
        title="内容审核台"
        subtitle="独立 RBAC、服务端再次鉴权、expectedVersion 和不可变审计共同构成处置边界。"
      />
      <p className={styles.warning}>审核页面只显示最小必要内容快照；不要复制或传播举报材料中的个人信息。</p>
      {error ? <div className={styles.error} role="alert"><p>{error}</p></div> : null}
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}

      <Card>
        <div className={styles.filters}>
          <label>案件状态<select value={status} onChange={(event) => setStatus(event.target.value as CommunityModerationCaseStatus | 'all')}><option value="all">全部</option><option value="open">待处理</option><option value="in_review">处理中</option><option value="resolved">已解决</option></select></label>
          <label>风险等级<select value={riskLevel} onChange={(event) => setRiskLevel(event.target.value as CommunityModerationRiskLevel | 'all')}><option value="all">全部</option><option value="critical">紧急</option><option value="high">高</option><option value="medium">中</option><option value="low">低</option></select></label>
          <label>内容类型<select value={contentType} onChange={(event) => setContentType(event.target.value as 'post' | 'comment' | 'all')}><option value="all">全部</option><option value="post">帖子</option><option value="comment">评论</option></select></label>
        </div>
      </Card>

      <div className={styles.moderationLayout}>
        <Card title="案件列表">
          {loading ? <p role="status">正在加载审核案件…</p> : cases.length === 0 ? (
            <EmptyState title="当前没有真实审核案件" message="审核台不会生成演示举报或虚假风险数据。" />
          ) : cases.map((item) => (
            <button key={item.id} type="button" className={styles.caseRow} data-selected={selected?.id === item.id} onClick={() => void selectCase(item)}>
              <span><Tag color={item.riskLevel === 'critical' || item.riskLevel === 'high' ? 'danger' : 'neutral'}>{item.riskLevel}</Tag><Tag>{item.contentType === 'post' ? '帖子' : '评论'}</Tag></span>
              <strong>{item.title || item.excerpt}</strong>
              <small>举报 {item.reportCount} · {new Date(item.updatedAt).toLocaleString('zh-CN')}</small>
              <ContentStateBadges state={item.contentState} />
            </button>
          ))}
          {nextCursor ? <Button variant="secondary" fullWidth loading={loadingMore} onClick={() => void loadCases(nextCursor, true)}>加载更多案件</Button> : null}
        </Card>

        <div className={styles.stack}>
          {detailLoading ? <Card><p role="status">正在加载案件详情…</p></Card> : !selected ? (
            <Card><EmptyState title="选择一个案件" message="详情、处置和审计信息会显示在这里。" /></Card>
          ) : (
            <>
              <Card title={`案件 ${selected.id}`}>
                <div className={styles.caseMeta}><Tag>{selected.status}</Tag><Tag color="danger">{selected.riskLevel}</Tag><span>案件版本 v{selected.version}</span></div>
                <ContentStateBadges state={selected.contentState} />
                <p>作者：{selected.author.displayName}（{selected.author.publicId}）</p>
                <pre className={styles.evidenceSnapshot}>{selected.bodySnapshot}</pre>
                <details><summary>举报材料（{selected.reports.length}）</summary>{selected.reports.map((report) => <article className={styles.auditRow} key={report.id}><strong>{report.reason}</strong><p>{report.details || '无补充说明'}</p><small>{new Date(report.createdAt).toLocaleString('zh-CN')}</small></article>)}</details>
              </Card>

              <Card title="执行处置">
                {selected.allowedActions.length === 0 ? <p>当前案件没有可执行处置。</p> : (
                  <form className={styles.editorForm} onSubmit={applyAction}>
                    <label>动作<select value={action} onChange={(event) => setAction(event.target.value as CommunityModerationAction)}>{selected.allowedActions.map((item) => <option key={item} value={item}>{ACTION_LABELS[item]}</option>)}</select></label>
                    <Textarea label="审核原因（进入审计）" value={reason} maxLength={500} rows={4} onChange={(event) => setReason(event.target.value)} />
                    <Button type="submit" loading={acting}>确认处置</Button>
                  </form>
                )}
              </Card>

              <Card title="审计轨迹">
                {selected.auditTrail.length === 0 ? <p>尚无处置记录。</p> : selected.auditTrail.map((entry) => (
                  <article className={styles.auditRow} key={entry.id}>
                    <strong>{entry.action}</strong>
                    <p>{entry.reason ?? '无公开原因'}</p>
                    <small>{entry.actorDisplayName} · {entry.actorRole} · {new Date(entry.createdAt).toLocaleString('zh-CN')}</small>
                  </article>
                ))}
              </Card>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
