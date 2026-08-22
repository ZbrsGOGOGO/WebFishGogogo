import { useCallback, useEffect, useMemo, useState, type FormEvent, type JSX } from 'react';
import { Link } from 'react-router-dom';

import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import {
  COMMUNITY_NEWS_PROFESSIONS,
  CommunityApiError,
  communityNewsApi,
  createCommunityIdempotencyKey,
  type CommunityNewsAdminArticle,
  type CommunityNewsAdminSource,
  type CommunityNewsArticleStatus,
  type CommunityNewsAuthorizationStatus,
  type CommunityNewsProfession,
  type CommunityNewsRevisionInput,
  type CommunityNewsSourceInput,
  type CommunityNewsSourceType,
} from '../../api/community';
import { Button, Card, EmptyState, Input, PageHeader, Tag, Textarea } from '../../components/ui';
import { communityRequestErrorMessage } from '../community/request-error';
import {
  COMMUNITY_NEWS_PROFESSION_LABELS,
  communityNewsDateTimeIso,
  communityNewsDateTimeLocal,
  communityNewsHttpsUrl,
  parseCommunityNewsTopics,
  validateCommunityNewsRevision,
  type CommunityNewsRevisionErrors,
} from './news-utils';
import styles from './CommunityNews.module.css';

const STATUS_LABELS: Record<CommunityNewsArticleStatus, string> = {
  draft: '草稿',
  pending_review: '待独立复核',
  published: '已发布',
  withdrawn: '已下线',
};

const EMPTY_SOURCE_FORM: CommunityNewsSourceInput = {
  name: '',
  sourceType: 'official',
  homepageUrl: '',
  trustRank: 50,
  authorizationStatus: 'verified',
  authorizationEvidenceRef: '',
  authorizationValidFrom: null,
  authorizationValidUntil: null,
};

function initialPublishedAt(): string {
  return communityNewsDateTimeLocal(new Date().toISOString());
}

export function CommunityNewsAdminPage(): JSX.Element {
  const user = useCommunityAuthStore((state) => state.user);
  const isAdmin = user?.roles?.includes('admin') ?? false;
  const [sources, setSources] = useState<CommunityNewsAdminSource[]>([]);
  const [articles, setArticles] = useState<CommunityNewsAdminArticle[]>([]);
  const [status, setStatus] = useState<CommunityNewsArticleStatus | ''>('');
  const [nextCursor, setNextCursor] = useState<string | null>();
  const [selected, setSelected] = useState<CommunityNewsAdminArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [sourceForm, setSourceForm] = useState<CommunityNewsSourceInput>(EMPTY_SOURCE_FORM);
  const [sourceError, setSourceError] = useState<string>();
  const [sourceId, setSourceId] = useState('');
  const [originalTitle, setOriginalTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [originalUrl, setOriginalUrl] = useState('');
  const [originalPublishedAt, setOriginalPublishedAt] = useState(initialPublishedAt);
  const [professionTags, setProfessionTags] = useState<CommunityNewsProfession[]>([]);
  const [topicTagsInput, setTopicTagsInput] = useState('');
  const [correctionNote, setCorrectionNote] = useState('');
  const [revisionErrors, setRevisionErrors] = useState<CommunityNewsRevisionErrors>({});
  const [actionReason, setActionReason] = useState('');

  const load = useCallback(async (cursor?: string, append = false): Promise<void> => {
    append ? setLoadingMore(true) : setLoading(true);
    setError(undefined);
    try {
      const [sourcePage, articlePage] = await Promise.all([
        communityNewsApi.listSources(),
        communityNewsApi.listAdminArticles({ status: status || undefined, cursor }),
      ]);
      setSources(sourcePage.items);
      setArticles((current) => append ? [...current, ...articlePage.items] : articlePage.items);
      setNextCursor(articlePage.nextCursor);
      if (sourcePage.items.length > 0) {
        setSourceId((current) => current || sourcePage.items[0].id);
      }
    } catch (requestError) {
      setError(communityRequestErrorMessage(requestError, '资讯编辑台加载失败'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const revisionPayload = useMemo<CommunityNewsRevisionInput>(() => ({
    sourceId,
    originalTitle: originalTitle.normalize('NFC').trim(),
    summary: summary.normalize('NFC').trim(),
    originalUrl: originalUrl.trim(),
    originalPublishedAt: communityNewsDateTimeIso(originalPublishedAt),
    professionTags,
    topicTags: parseCommunityNewsTopics(topicTagsInput),
    correctionNote: correctionNote.trim() || null,
  }), [correctionNote, originalPublishedAt, originalTitle, originalUrl, professionTags, sourceId, summary, topicTagsInput]);

  function clearArticleForm(): void {
    setSelected(null);
    setSourceId(sources[0]?.id ?? '');
    setOriginalTitle('');
    setSummary('');
    setOriginalUrl('');
    setOriginalPublishedAt(initialPublishedAt());
    setProfessionTags([]);
    setTopicTagsInput('');
    setCorrectionNote('');
    setActionReason('');
    setRevisionErrors({});
  }

  function fillArticleForm(article: CommunityNewsAdminArticle): void {
    setSelected(article);
    setSourceId(article.source.id);
    setOriginalTitle(article.currentRevision.originalTitle);
    setSummary(article.currentRevision.summary);
    setOriginalUrl(article.currentRevision.originalUrl);
    setOriginalPublishedAt(communityNewsDateTimeLocal(article.currentRevision.originalPublishedAt));
    setProfessionTags(article.currentRevision.professionTags);
    setTopicTagsInput(article.currentRevision.topicTags.join('，'));
    setCorrectionNote(article.currentRevision.correctionNote ?? '');
    setActionReason('');
    setRevisionErrors({});
  }

  async function selectArticle(article: CommunityNewsAdminArticle): Promise<void> {
    setDetailLoading(true);
    setError(undefined);
    try {
      const detail = await communityNewsApi.getAdminArticle(article.id);
      fillArticleForm(detail);
    } catch (requestError) {
      setError(communityRequestErrorMessage(requestError, '资讯稿件详情加载失败'));
    } finally {
      setDetailLoading(false);
    }
  }

  function toggleProfession(value: CommunityNewsProfession): void {
    setProfessionTags((current) => current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value]);
  }

  async function saveArticle(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const validation = validateCommunityNewsRevision(revisionPayload);
    setRevisionErrors(validation);
    if (Object.keys(validation).length > 0) return;
    setBusy('save');
    setError(undefined);
    setNotice(undefined);
    try {
      const result = selected
        ? await communityNewsApi.reviseDraft(
          selected.id,
          revisionPayload,
          selected.version,
          createCommunityIdempotencyKey(`news-revise:${selected.id}`),
        )
        : await communityNewsApi.createDraft(
          revisionPayload,
          createCommunityIdempotencyKey('news-create'),
        );
      fillArticleForm(result);
      setNotice(selected ? '修订已保存到服务端，尚未自动发布。' : '草稿已创建，尚未提交复核。');
      await load();
    } catch (requestError) {
      handleMutationError(requestError, '稿件保存失败');
    } finally {
      setBusy(undefined);
    }
  }

  async function createSource(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (sourceForm.name.trim().length < 2) {
      setSourceError('来源名称至少 2 个字符');
      return;
    }
    if (!communityNewsHttpsUrl(sourceForm.homepageUrl)) {
      setSourceError('来源主页必须是公开 HTTPS 地址');
      return;
    }
    if (sourceForm.authorizationEvidenceRef.trim().length < 3) {
      setSourceError('必须填写内部授权依据引用');
      return;
    }
    setBusy('source');
    setSourceError(undefined);
    try {
      const created = await communityNewsApi.createSource(
        {
          ...sourceForm,
          name: sourceForm.name.trim(),
          homepageUrl: sourceForm.homepageUrl.trim(),
          authorizationEvidenceRef: sourceForm.authorizationEvidenceRef.trim(),
        },
        createCommunityIdempotencyKey('news-source-create'),
      );
      setSources((current) => [...current, created]);
      setSourceId(created.id);
      setSourceForm(EMPTY_SOURCE_FORM);
      setNotice('来源已由服务端创建；发布时仍会再次校验授权状态和有效期。');
    } catch (requestError) {
      setSourceError(communityRequestErrorMessage(requestError, '来源创建失败'));
    } finally {
      setBusy(undefined);
    }
  }

  function handleMutationError(requestError: unknown, fallback: string): void {
    if (requestError instanceof CommunityApiError && requestError.status === 409) {
      setError('稿件版本或来源授权状态已经变化，本次操作未覆盖服务器内容。请重新打开稿件。');
      return;
    }
    setError(communityRequestErrorMessage(requestError, fallback));
  }

  async function runArticleAction(
    action: 'submit' | 'publish' | 'reject' | 'withdraw',
  ): Promise<void> {
    if (!selected) return;
    if (action !== 'submit' && Array.from(actionReason.trim()).length < 5) {
      setError('复核或下线原因至少填写 5 个字符，并会写入审计记录。');
      return;
    }
    setBusy(action);
    setError(undefined);
    setNotice(undefined);
    try {
      const key = createCommunityIdempotencyKey(`news-${action}:${selected.id}`);
      let result: CommunityNewsAdminArticle;
      if (action === 'submit') {
        result = await communityNewsApi.submitArticle(selected.id, selected.version, key);
      } else if (action === 'publish') {
        result = await communityNewsApi.publishArticle(selected.id, actionReason.trim(), selected.version, key);
      } else if (action === 'reject') {
        result = await communityNewsApi.reviewArticle(selected.id, 'rejected', actionReason.trim(), selected.version, key);
      } else {
        result = await communityNewsApi.withdrawArticle(selected.id, actionReason.trim(), selected.version, key);
      }
      fillArticleForm(result);
      setNotice(
        action === 'submit' ? '稿件已提交独立复核。'
          : action === 'publish' ? '服务端已完成独立复核并发布。'
            : action === 'reject' ? '稿件已驳回到编辑流程。'
              : '资讯已由服务端下线。',
      );
      await load();
    } catch (requestError) {
      handleMutationError(requestError, '稿件状态操作失败');
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <main className={styles.page}>
      <PageHeader
        title="热点资讯编辑发布台"
        subtitle="只写原创短摘要并链接回 HTTPS 原文；发布依赖来源授权、版本控制和独立复核。"
        actions={<Link to="/news">查看公开资讯</Link>}
      />
      <p className={styles.disclosure}>前端角色守卫仅用于页面体验；所有来源、稿件、复核、发布和下线操作仍由服务端 RBAC 与审计再次校验。</p>
      {error ? <div className={styles.error} role="alert"><p>{error}</p></div> : null}
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}

      {isAdmin ? (
        <Card title="创建核验来源（仅管理员）">
          <form className={styles.sourceForm} onSubmit={(event) => void createSource(event)}>
            <Input label="来源名称" required value={sourceForm.name} maxLength={120} onChange={(event) => setSourceForm((current) => ({ ...current, name: event.target.value }))} />
            <Input label="HTTPS 来源主页" required type="url" value={sourceForm.homepageUrl} maxLength={2048} onChange={(event) => setSourceForm((current) => ({ ...current, homepageUrl: event.target.value }))} />
            <label>来源类型<select value={sourceForm.sourceType} onChange={(event) => setSourceForm((current) => ({ ...current, sourceType: event.target.value as CommunityNewsSourceType }))}><option value="owned">自有</option><option value="official">官方</option><option value="licensed">授权</option></select></label>
            <Input label="信任等级（1—100）" required type="number" min={1} max={100} value={sourceForm.trustRank} onChange={(event) => setSourceForm((current) => ({ ...current, trustRank: Number(event.target.value) }))} />
            <label>授权状态<select value={sourceForm.authorizationStatus} onChange={(event) => setSourceForm((current) => ({ ...current, authorizationStatus: event.target.value as CommunityNewsAuthorizationStatus }))}><option value="verified">已核验</option><option value="expired">已过期</option><option value="revoked">已撤销</option></select></label>
            <Input label="内部授权依据引用" required value={sourceForm.authorizationEvidenceRef} maxLength={200} onChange={(event) => setSourceForm((current) => ({ ...current, authorizationEvidenceRef: event.target.value }))} />
            <Input label="授权起始时间（可选）" type="datetime-local" value={sourceForm.authorizationValidFrom ? communityNewsDateTimeLocal(sourceForm.authorizationValidFrom) : ''} onChange={(event) => setSourceForm((current) => ({ ...current, authorizationValidFrom: event.target.value ? communityNewsDateTimeIso(event.target.value) : null }))} />
            <Input label="授权到期时间（授权来源必填）" type="datetime-local" value={sourceForm.authorizationValidUntil ? communityNewsDateTimeLocal(sourceForm.authorizationValidUntil) : ''} onChange={(event) => setSourceForm((current) => ({ ...current, authorizationValidUntil: event.target.value ? communityNewsDateTimeIso(event.target.value) : null }))} />
            {sourceError ? <p className={styles.error} role="alert">{sourceError}</p> : null}
            <Button type="submit" loading={busy === 'source'}>创建来源</Button>
          </form>
        </Card>
      ) : (
        <p className={styles.filterHint}>版主可编辑与复核稿件；来源的创建和授权维护仅管理员可操作。</p>
      )}

      <div className={styles.adminLayout}>
        <Card title="稿件列表" headerActions={<Button size="sm" variant="secondary" onClick={clearArticleForm}>新建草稿</Button>}>
          <label className={styles.selectField}>状态筛选<select value={status} onChange={(event) => setStatus(event.target.value as CommunityNewsArticleStatus | '')}><option value="">全部</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          {loading ? <p role="status">正在加载真实稿件…</p> : articles.length === 0 ? (
            <EmptyState title="当前没有真实稿件" message="编辑台不会自动生成演示来源或虚构新闻。" />
          ) : articles.map((article) => (
            <button className={styles.articleRow} type="button" key={article.id} data-selected={selected?.id === article.id} onClick={() => void selectArticle(article)}>
              <span><Tag>{STATUS_LABELS[article.status]}</Tag> v{article.version}</span>
              <strong>{article.currentRevision.originalTitle}</strong>
              <small>{article.source.name} · {new Date(article.updatedAt).toLocaleString('zh-CN')}</small>
            </button>
          ))}
          {nextCursor ? <Button fullWidth variant="secondary" loading={loadingMore} onClick={() => void load(nextCursor, true)}>加载更多稿件</Button> : null}
        </Card>

        <div className={styles.stack}>
          {detailLoading ? <Card><p role="status">正在加载稿件详情…</p></Card> : (
            <Card title={selected ? `编辑稿件 · ${STATUS_LABELS[selected.status]} · v${selected.version}` : '新建资讯草稿'}>
              {sources.length === 0 ? <p className={styles.disclosure}>还没有服务端来源。管理员需先创建并核验来源，版主不能绕过此步骤。</p> : null}
              <form className={styles.editorForm} onSubmit={(event) => void saveArticle(event)}>
                <label>已核验来源<select required value={sourceId} onChange={(event) => setSourceId(event.target.value)}><option value="">请选择</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.name} · {source.authorizationStatus}</option>)}</select>{revisionErrors.sourceId ? <small className={styles.fieldError}>{revisionErrors.sourceId}</small> : null}</label>
                <Input label="原文标题（仅编辑台可见）" required value={originalTitle} maxLength={300} error={revisionErrors.originalTitle} onChange={(event) => setOriginalTitle(event.target.value)} />
                <Textarea label="站内原创摘要（50—300 字）" required rows={7} value={summary} maxLength={300} error={revisionErrors.summary} onChange={(event) => setSummary(event.target.value)} />
                <span className={styles.counter}>{Array.from(summary.trim()).length}/300</span>
                <Input label="HTTPS 原文链接" required type="url" value={originalUrl} maxLength={2048} error={revisionErrors.originalUrl} onChange={(event) => setOriginalUrl(event.target.value)} />
                <Input label="原文发布时间" required type="datetime-local" value={originalPublishedAt} error={revisionErrors.originalPublishedAt} onChange={(event) => setOriginalPublishedAt(event.target.value)} />
                <fieldset className={styles.professionChecks}><legend>职业标签（可选，最多 5 个）</legend>{COMMUNITY_NEWS_PROFESSIONS.map((value) => <label key={value}><input type="checkbox" checked={professionTags.includes(value)} onChange={() => toggleProfession(value)} />{COMMUNITY_NEWS_PROFESSION_LABELS[value]}</label>)}</fieldset>
                {revisionErrors.professionTags ? <small className={styles.fieldError}>{revisionErrors.professionTags}</small> : null}
                <Input label="主题标签（逗号或空格分隔，最多 8 个）" value={topicTagsInput} maxLength={320} error={revisionErrors.topicTags} onChange={(event) => setTopicTagsInput(event.target.value)} />
                <Textarea label="更正说明（修订已发布内容时填写）" rows={4} value={correctionNote} maxLength={500} error={revisionErrors.correctionNote} onChange={(event) => setCorrectionNote(event.target.value)} />
                <Button type="submit" loading={busy === 'save'} disabled={sources.length === 0 || selected?.status === 'pending_review' || selected?.status === 'withdrawn'}>{selected ? '保存修订' : '保存草稿'}</Button>
              </form>
            </Card>
          )}

          {selected ? (
            <Card title="状态与审计操作">
              <dl className={styles.auditGrid}>
                <div><dt>提交人</dt><dd>{selected.submittedBy ?? '未提交'}</dd></div>
                <div><dt>提交时间</dt><dd>{selected.submittedAt ? new Date(selected.submittedAt).toLocaleString('zh-CN') : '—'}</dd></div>
                <div><dt>复核人</dt><dd>{selected.reviewedBy ?? '未复核'}</dd></div>
                <div><dt>发布时间</dt><dd>{selected.publishedAt ? new Date(selected.publishedAt).toLocaleString('zh-CN') : '—'}</dd></div>
              </dl>
              {selected.withdrawalNotice ? <p className={styles.disclosure}>下线说明：{selected.withdrawalNotice}</p> : null}
              {selected.status !== 'draft' ? <Textarea label="复核/下线原因（5—500 字，写入审计）" rows={4} value={actionReason} maxLength={500} onChange={(event) => setActionReason(event.target.value)} /> : null}
              <div className={styles.cardActions}>
                {selected.status === 'draft' ? <Button loading={busy === 'submit'} onClick={() => void runArticleAction('submit')}>提交独立复核</Button> : null}
                {selected.status === 'pending_review' ? <><Button loading={busy === 'publish'} onClick={() => void runArticleAction('publish')}>复核通过并发布</Button><Button variant="secondary" loading={busy === 'reject'} onClick={() => void runArticleAction('reject')}>驳回</Button></> : null}
                {selected.status === 'published' ? <Button variant="danger" loading={busy === 'withdraw'} onClick={() => void runArticleAction('withdraw')}>下线资讯</Button> : null}
              </div>
              <p className={styles.filterHint}>发布接口仍执行独立复核约束；提交者不能给自己的稿件放行。</p>
            </Card>
          ) : null}
        </div>
      </div>
    </main>
  );
}
