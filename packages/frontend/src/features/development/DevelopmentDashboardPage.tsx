import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type JSX,
} from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  DEVELOPMENT_CATEGORIES,
  DEVELOPMENT_LIMITS,
  DEVELOPMENT_STATUSES,
  type DevelopmentAccess,
  type DevelopmentCategory,
  type DevelopmentMember,
  type DevelopmentRequestPage,
  type DevelopmentStatus,
} from '@stealth-reader/shared';

import { communityDevelopmentApi } from '../../api/community-development';
import { createCommunityIdempotencyKey } from '../../api/community-idempotency';
import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import { Button, Card, EmptyState, Input, PageHeader, Tag, Textarea } from '../../components/ui';
import { useDevelopmentAccess } from './development-access';
import {
  DEVELOPMENT_CATEGORY_LABELS,
  DEVELOPMENT_STATUS_LABELS,
  developmentError,
  developmentPersonName,
  developmentStatusColor,
  developmentTime,
  downloadPrivateBlob,
} from './development-format';
import styles from './Development.module.css';

const EMPTY_PAGE: DevelopmentRequestPage = {
  items: [],
  total: 0,
  page: 1,
  pageSize: DEVELOPMENT_LIMITS.pageSize,
};

function ownerStillActive(subjectPublicId: string): boolean {
  const state = useCommunityAuthStore.getState();
  return state.phase === 'active' && state.user?.publicId === subjectPublicId;
}

function DevelopmentMembers({ subjectPublicId }: { subjectPublicId: string }): JSX.Element {
  const [members, setMembers] = useState<DevelopmentMember[]>([]);
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const requestGeneration = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    const generation = ++requestGeneration.current;
    setLoading(true);
    setError(undefined);
    try {
      const response = await communityDevelopmentApi.listMembers();
      if (generation === requestGeneration.current && ownerStillActive(subjectPublicId)) {
        setMembers(response.items ?? []);
      }
    } catch (requestError) {
      if (generation === requestGeneration.current && ownerStillActive(subjectPublicId)) {
        setError(developmentError(requestError, '授权成员加载失败'));
      }
    } finally {
      if (generation === requestGeneration.current && ownerStillActive(subjectPublicId)) {
        setLoading(false);
      }
    }
  }, [subjectPublicId]);

  useEffect(() => {
    void load();
    return () => {
      requestGeneration.current += 1;
    };
  }, [load]);

  async function grant(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (loading || saving) return;
    const normalized = username.trim().replace(/^@/, '').toLowerCase();
    if (!normalized) {
      setError('请输入已有账号的用户名');
      return;
    }
    const generation = ++requestGeneration.current;
    setSaving(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const response = await communityDevelopmentApi.grantMember(normalized);
      if (generation !== requestGeneration.current || !ownerStillActive(subjectPublicId)) return;
      setMembers(response.items ?? []);
      setUsername('');
      setNotice(`已授权 @${normalized}，对方可提交并查看自己的提案。`);
    } catch (requestError) {
      if (generation === requestGeneration.current && ownerStillActive(subjectPublicId)) {
        setError(developmentError(requestError, '成员授权失败'));
      }
    } finally {
      if (generation === requestGeneration.current && ownerStillActive(subjectPublicId)) {
        setSaving(false);
      }
    }
  }

  async function revoke(publicId: string): Promise<void> {
    if (loading || saving) return;
    if (confirmRevoke !== publicId) {
      setConfirmRevoke(publicId);
      setNotice('请再点一次确认撤销；对方将立即无法进入开发区。');
      return;
    }
    const generation = ++requestGeneration.current;
    setSaving(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const response = await communityDevelopmentApi.revokeMember(publicId);
      if (generation !== requestGeneration.current || !ownerStillActive(subjectPublicId)) return;
      setMembers(response.items ?? []);
      setConfirmRevoke(null);
      setNotice('成员授权已撤销。');
    } catch (requestError) {
      if (generation === requestGeneration.current && ownerStillActive(subjectPublicId)) {
        setError(developmentError(requestError, '撤销授权失败'));
      }
    } finally {
      if (generation === requestGeneration.current && ownerStillActive(subjectPublicId)) {
        setSaving(false);
      }
    }
  }

  return (
    <Card title="协作成员" bodyClassName={styles.cardBody}>
      <p className={styles.muted}>只能按现有账号的用户名授权。系统不会创建共用管理员或额外密码。</p>
      <form className={styles.inlineForm} onSubmit={grant}>
        <Input
          label="现有用户名"
          value={username}
          autoComplete="off"
          placeholder="例如 worker01"
          onChange={(event) => setUsername(event.target.value)}
        />
        <Button type="submit" loading={saving} disabled={loading}>授权提案</Button>
      </form>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
      {loading ? <p role="status">正在加载成员…</p> : members.length === 0 ? (
        <p className={styles.muted}>还没有核心协作成员。</p>
      ) : (
        <div className={styles.memberList}>
          {members.map((member) => (
            <div className={styles.memberRow} key={member.publicId}>
              <span>
                <strong>{developmentPersonName(member)}</strong>
                <small>{member.publicId} · 授权于 {developmentTime(member.grantedAt)}</small>
              </span>
              <Button
                variant={confirmRevoke === member.publicId ? 'danger' : 'ghost'}
                size="sm"
                disabled={saving}
                onClick={() => void revoke(member.publicId)}
              >
                {confirmRevoke === member.publicId ? '确认撤销' : '撤销'}
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function DevelopmentDashboardContent({
  access,
  subjectPublicId,
}: {
  access: DevelopmentAccess & { role: 'owner' | 'contributor' };
  subjectPublicId: string;
}): JSX.Element {
  const navigate = useNavigate();
  const [status, setStatus] = useState<DevelopmentStatus | 'all'>('all');
  const [pageNumber, setPageNumber] = useState(1);
  const [page, setPage] = useState<DevelopmentRequestPage>(EMPTY_PAGE);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string>();
  const listGeneration = useRef(0);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<DevelopmentCategory>('feature');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string>();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string>();
  const lifecycleGeneration = useRef(0);
  const createInFlight = useRef(false);
  const exportInFlight = useRef(false);
  const submissionIdentity = useRef<{ fingerprint: string; clientRequestId: string } | null>(null);

  useEffect(() => {
    lifecycleGeneration.current += 1;
    return () => {
      lifecycleGeneration.current += 1;
    };
  }, [subjectPublicId]);

  function canAcceptOperation(generation: number): boolean {
    return generation === lifecycleGeneration.current && ownerStillActive(subjectPublicId);
  }

  const loadRequests = useCallback(async (): Promise<void> => {
    const generation = ++listGeneration.current;
    setLoading(true);
    setListError(undefined);
    try {
      const result = await communityDevelopmentApi.listRequests(
        status === 'all' ? undefined : status,
        pageNumber,
      );
      if (generation === listGeneration.current && ownerStillActive(subjectPublicId)) {
        setPage(result);
      }
    } catch (requestError) {
      if (generation === listGeneration.current && ownerStillActive(subjectPublicId)) {
        setListError(developmentError(requestError, '提案列表加载失败'));
      }
    } finally {
      if (generation === listGeneration.current && ownerStillActive(subjectPublicId)) {
        setLoading(false);
      }
    }
  }, [pageNumber, status, subjectPublicId]);

  useEffect(() => {
    void loadRequests();
    return () => {
      listGeneration.current += 1;
    };
  }, [loadRequests]);

  async function createRequest(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (createInFlight.current) return;
    const nextTitle = title.trim();
    const nextDescription = description.trim();
    if (!nextTitle || !nextDescription) {
      setCreateError('标题和详细描述都需要填写');
      return;
    }
    const fingerprint = JSON.stringify([nextTitle, category, nextDescription]);
    if (submissionIdentity.current?.fingerprint !== fingerprint) {
      submissionIdentity.current = {
        fingerprint,
        clientRequestId: createCommunityIdempotencyKey('development-create'),
      };
    }
    const clientRequestId = submissionIdentity.current.clientRequestId;
    const generation = lifecycleGeneration.current;
    createInFlight.current = true;
    setCreating(true);
    setCreateError(undefined);
    try {
      const detail = await communityDevelopmentApi.createRequest({
        clientRequestId,
        title: nextTitle,
        category,
        description: nextDescription,
      });
      if (!canAcceptOperation(generation)) return;
      navigate(`/development/requests/${encodeURIComponent(detail.id)}`);
    } catch (requestError) {
      if (canAcceptOperation(generation)) {
        setCreateError(developmentError(requestError, '提案提交失败'));
      }
    } finally {
      createInFlight.current = false;
      if (canAcceptOperation(generation)) setCreating(false);
    }
  }

  async function exportReview(): Promise<void> {
    if (exportInFlight.current) return;
    const generation = lifecycleGeneration.current;
    exportInFlight.current = true;
    setExporting(true);
    setExportError(undefined);
    try {
      const exported = await communityDevelopmentApi.exportReview();
      if (!canAcceptOperation(generation)) return;
      const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' });
      downloadPrivateBlob(blob, `development-review-${new Date().toISOString().slice(0, 10)}.json`);
    } catch (requestError) {
      if (canAcceptOperation(generation)) {
        setExportError(developmentError(requestError, '待审 JSON 导出失败'));
      }
    } finally {
      exportInFlight.current = false;
      if (canAcceptOperation(generation)) setExporting(false);
    }
  }

  const pendingOnPage = page.items.filter((item) => item.status === 'submitted' || item.status === 'needs_info').length;
  const lastPage = Math.max(1, Math.ceil(page.total / Math.max(1, page.pageSize)));

  return (
    <main className={styles.page}>
      <PageHeader
        title="开发协作"
        subtitle={access.role === 'owner'
          ? '负责人工审阅、成员授权和状态决策。'
          : '提交可复现的需求，并跟进你自己的提案。'}
        actions={<Tag color={access.role === 'owner' ? 'success' : 'neutral'}>{access.role === 'owner' ? '站长' : '核心成员'}</Tag>}
      />

      <section className={styles.manualBanner} aria-label="审阅方式">
        <strong>当前是人工协作流程</strong>
        <p>系统只做规则预检，不是 AI 审核；未配置无人值守 AI、Codex 任务或后台监控。</p>
      </section>

      <div className={styles.statsGrid}>
        <div><small>符合当前筛选</small><strong>{page.total}</strong></div>
        <div><small>当前页</small><strong>{page.items.length}</strong></div>
        <div><small>本页待补充 / 待审</small><strong>{pendingOnPage}</strong></div>
      </div>

      <div className={styles.dashboardGrid}>
        <section className={styles.stack}>
          <Card title="提案列表" bodyClassName={styles.cardBody}>
            <div className={styles.filterBar}>
              <label>
                状态
                <select
                  value={status}
                  onChange={(event) => {
                    setStatus(event.target.value as DevelopmentStatus | 'all');
                    setPageNumber(1);
                  }}
                >
                  <option value="all">全部状态</option>
                  {DEVELOPMENT_STATUSES.map((item) => (
                    <option key={item} value={item}>{DEVELOPMENT_STATUS_LABELS[item]}</option>
                  ))}
                </select>
              </label>
              <Button variant="ghost" size="sm" onClick={() => void loadRequests()}>刷新</Button>
            </div>
            {access.role === 'contributor' ? (
              <p className={styles.scopeNote}>服务端仅返回当前账号自己提交的提案。</p>
            ) : null}
            {listError ? <p className={styles.error} role="alert">{listError}</p> : null}
            {loading ? <p role="status">正在加载提案…</p> : page.items.length === 0 ? (
              <EmptyState title="暂无提案" message="可以在右侧提交第一条。" />
            ) : (
              <div className={styles.requestList}>
                {page.items.map((item) => (
                  <Link className={styles.requestRow} to={`/development/requests/${encodeURIComponent(item.id)}`} key={item.id}>
                    <span className={styles.requestTopline}>
                      <Tag color={developmentStatusColor(item.status)}>{DEVELOPMENT_STATUS_LABELS[item.status]}</Tag>
                      <small>{DEVELOPMENT_CATEGORY_LABELS[item.category]}</small>
                      <small>v{item.version}</small>
                    </span>
                    <strong>{item.title}</strong>
                    <span className={styles.requestMeta}>
                      {developmentPersonName(item.author)} · 附件 {item.attachmentCount} · {developmentTime(item.updatedAt)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
            <div className={styles.pagination} aria-label="提案分页">
              <Button variant="secondary" size="sm" disabled={pageNumber <= 1 || loading} onClick={() => setPageNumber((value) => Math.max(1, value - 1))}>上一页</Button>
              <span>第 {pageNumber} / {lastPage} 页 · 每页 {DEVELOPMENT_LIMITS.pageSize} 条</span>
              <Button variant="secondary" size="sm" disabled={pageNumber >= lastPage || loading} onClick={() => setPageNumber((value) => value + 1)}>下一页</Button>
            </div>
          </Card>

          {access.role === 'owner' ? <DevelopmentMembers subjectPublicId={subjectPublicId} /> : null}
        </section>

        <aside className={styles.stack}>
          <Card title="提交新提案" bodyClassName={styles.cardBody}>
            <form className={styles.form} onSubmit={createRequest}>
              <Input
                label="标题"
                required
                value={title}
                maxLength={DEVELOPMENT_LIMITS.titleChars}
                placeholder="一句话说清希望解决什么"
                onChange={(event) => setTitle(event.target.value)}
              />
              <label className={styles.selectField}>
                <span>分类 <b aria-hidden="true">*</b></span>
                <select value={category} onChange={(event) => setCategory(event.target.value as DevelopmentCategory)}>
                  {DEVELOPMENT_CATEGORIES.map((item) => (
                    <option key={item} value={item}>{DEVELOPMENT_CATEGORY_LABELS[item]}</option>
                  ))}
                </select>
              </label>
              <Textarea
                label="详细描述"
                required
                value={description}
                maxLength={DEVELOPMENT_LIMITS.descriptionChars}
                rows={9}
                placeholder="现象、期望结果、复现步骤、受影响页面……"
                onChange={(event) => setDescription(event.target.value)}
              />
              <small className={styles.counter}>{Array.from(description).length} / {DEVELOPMENT_LIMITS.descriptionChars}</small>
              {createError ? <p className={styles.error} role="alert">{createError}</p> : null}
              <Button type="submit" loading={creating} fullWidth>提交并打开详情</Button>
            </form>
          </Card>

          {access.role === 'owner' ? (
            <Card title="手动交给 Codex" bodyClassName={styles.cardBody}>
              <p className={styles.muted}>导出最多 20 条待审或待补充详情为 JSON，便于负责人手动提供给 Codex 阅读。导出不会自动启动任何 AI。</p>
              {exportError ? <p className={styles.error} role="alert">{exportError}</p> : null}
              <Button variant="secondary" loading={exporting} onClick={() => void exportReview()} fullWidth>导出待审 JSON</Button>
            </Card>
          ) : null}
        </aside>
      </div>
    </main>
  );
}

export function DevelopmentDashboardPage(): JSX.Element {
  const accessState = useDevelopmentAccess();
  if (accessState.status !== 'allowed') {
    return <main className={styles.page}><p role="status">正在核对开发协作权限…</p></main>;
  }
  return (
    <DevelopmentDashboardContent
      access={accessState.access}
      subjectPublicId={accessState.subjectPublicId}
    />
  );
}
