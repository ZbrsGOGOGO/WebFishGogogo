import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEVELOPMENT_LIMITS,
  type DevelopmentAccess,
  type DevelopmentAttachment,
  type DevelopmentRequestDetail,
  type DevelopmentRequestPage,
  type DevelopmentRole,
} from '@stealth-reader/shared';

import { CommunityApiError } from '../../api/community-http';
import { communityDevelopmentApi } from '../../api/community-development';
import type { CommunityAuthUser } from '../../api/community-auth';
import { resetCommunityAuthStoreForTests, useCommunityAuthStore } from '../../app/store/community-auth-store';
import { DevelopmentDashboardPage } from './DevelopmentDashboardPage';
import { DevelopmentRequestDetailPage } from './DevelopmentRequestDetailPage';
import { DevelopmentAccessProvider, type DevelopmentAccessState } from './development-access';
import * as developmentFormat from './development-format';

const person = {
  publicId: 'person-1',
  username: 'worker',
  displayName: '小张',
};

function authUser(publicId = person.publicId): CommunityAuthUser {
  return {
    id: publicId,
    publicId,
    username: publicId,
    email: `${publicId}@example.com`,
    displayName: publicId,
    accountStatus: 'active',
    onboardingCompleted: true,
    socialVerificationStatus: 'unverified',
  };
}

function accessValue(role: DevelopmentRole, subjectPublicId = person.publicId): DevelopmentAccessState {
  const access: DevelopmentAccess & { role: DevelopmentRole } = {
    enabled: true,
    role,
    reviewMode: 'manual',
    limits: DEVELOPMENT_LIMITS,
  };
  return { status: 'allowed', access, subjectPublicId, reload: vi.fn() };
}

function attachment(overrides: Partial<DevelopmentAttachment> = {}): DevelopmentAttachment {
  return {
    id: 'attachment-1',
    filename: 'evidence.txt',
    mediaType: 'text/plain',
    bytes: 12,
    sha256: 'abc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd',
    createdAt: '2026-09-07T02:00:00.000Z',
    extraction: 'text',
    excerpt: '安全文本',
    warnings: [],
    ...overrides,
  };
}

function detail(overrides: Partial<DevelopmentRequestDetail> = {}): DevelopmentRequestDetail {
  return {
    id: 'request-1',
    title: '优化聊天体验',
    category: 'feature',
    status: 'submitted',
    author: person,
    attachmentCount: 0,
    version: 1,
    createdAt: '2026-09-07T01:00:00.000Z',
    updatedAt: '2026-09-07T01:00:00.000Z',
    description: '详细复现步骤',
    attachments: [],
    precheck: {
      kind: 'rules',
      summary: '字段和附件规则检查完成',
      findings: [],
      questions: [],
      requiresOwnerDecision: true,
      aiReviewed: false,
    },
    events: [{
      id: 'event-1',
      kind: 'created',
      actor: person,
      body: '创建了提案',
      status: 'submitted',
      createdAt: '2026-09-07T01:00:00.000Z',
    }],
    ...overrides,
  };
}

function page(items: DevelopmentRequestDetail[], total = items.length): DevelopmentRequestPage {
  return { items, total, page: 1, pageSize: DEVELOPMENT_LIMITS.pageSize };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function renderDashboard(role: DevelopmentRole) {
  return render(
    <MemoryRouter initialEntries={['/development']}>
      <DevelopmentAccessProvider value={accessValue(role)}>
        <Routes><Route path="/development" element={<DevelopmentDashboardPage />} /></Routes>
      </DevelopmentAccessProvider>
    </MemoryRouter>,
  );
}

function renderDetail(role: DevelopmentRole, requestId = 'request-1', subjectPublicId = person.publicId) {
  return render(
    <MemoryRouter initialEntries={[`/development/requests/${requestId}`]}>
      <DevelopmentAccessProvider value={accessValue(role, subjectPublicId)}>
        <Routes><Route path="/development/requests/:id" element={<DevelopmentRequestDetailPage />} /></Routes>
      </DevelopmentAccessProvider>
    </MemoryRouter>,
  );
}

describe('development pages', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    resetCommunityAuthStoreForTests();
    useCommunityAuthStore.setState({
      phase: 'active',
      sessionReady: true,
      user: authUser(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    resetCommunityAuthStoreForTests();
  });

  it('labels audited operations honestly without adding owner controls or executing timeline text', async () => {
    vi.spyOn(communityDevelopmentApi, 'getRequest').mockResolvedValue(detail({
      status: 'done',
      version: 2,
      events: [
        ...detail().events,
        {
          id: 'operation:audit-1',
          kind: 'decision',
          actor: { kind: 'system', publicId: null, username: null, displayName: '站点运维（站长授权）' },
          actorSource: 'site_operations',
          body: '<img src=x onerror=alert(1)> 已验证上线，保留收获并提示种子费用。',
          status: 'done',
          createdAt: '2026-09-07T03:00:00.000Z',
        },
      ],
    }));
    const view = renderDetail('contributor');
    expect(await screen.findByText('站点运维（站长授权）')).toBeInTheDocument();
    expect(screen.getByText('创建了提案')).toBeInTheDocument();
    expect(screen.getByText('<img src=x onerror=alert(1)> 已验证上线，保留收获并提示种子费用。')).toBeInTheDocument();
    expect(view.container.querySelector('img[src="x"]')).toBeNull();
    expect(screen.queryByLabelText('决策理由')).not.toBeInTheDocument();
    expect(developmentFormat.developmentEventActorName({
      ...detail().events[0], actorSource: 'site_operations', actor: person,
    })).toBe('小张');
    expect(developmentFormat.developmentEventActorName({
      ...detail().events[0],
      actorSource: 'user',
      actor: { kind: 'system', publicId: null, username: null, displayName: '站点运维（站长授权）' },
    })).toBe('未知操作人');
  });

  it('keeps owner management/export controls away from contributors', async () => {
    vi.spyOn(communityDevelopmentApi, 'listRequests').mockResolvedValue(page([detail()]));
    const listMembers = vi.spyOn(communityDevelopmentApi, 'listMembers').mockResolvedValue({ items: [] });

    renderDashboard('contributor');

    expect(await screen.findByRole('heading', { name: '开发协作' })).toBeInTheDocument();
    expect(await screen.findByText('优化聊天体验')).toBeInTheDocument();
    expect(screen.getByText('服务端仅返回当前账号自己提交的提案。')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '协作成员' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '导出当前筛选 JSON' })).not.toBeInTheDocument();
    expect(listMembers).not.toHaveBeenCalled();
  });

  it('shows owner-only member management and manual JSON export controls', async () => {
    vi.spyOn(communityDevelopmentApi, 'listRequests').mockResolvedValue(page([]));
    const members = deferred<{ items: [] }>();
    vi.spyOn(communityDevelopmentApi, 'listMembers').mockReturnValue(members.promise);
    const grant = vi.spyOn(communityDevelopmentApi, 'grantMember').mockResolvedValue({ items: [] });

    renderDashboard('owner');

    expect(await screen.findByRole('heading', { name: '协作成员' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '授权提案' })).toBeDisabled();
    const usernameInput = screen.getByLabelText('现有用户名');
    fireEvent.change(usernameInput, { target: { value: 'existing-user' } });
    fireEvent.submit(usernameInput.closest('form') as HTMLFormElement);
    expect(grant).not.toHaveBeenCalled();
    await act(async () => {
      members.resolve({ items: [] });
      await members.promise;
    });
    expect(screen.getByRole('button', { name: '授权提案' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '导出当前筛选 JSON' })).toBeInTheDocument();
    expect(screen.getByText(/AI 审核/)).toBeInTheDocument();
    expect(screen.getByText('站长')).toBeInTheDocument();
  });

  it('reuses the same create idempotency key for an unchanged retry and rotates it after editing', async () => {
    vi.spyOn(communityDevelopmentApi, 'listRequests').mockResolvedValue(page([]));
    const create = vi.spyOn(communityDevelopmentApi, 'createRequest')
      .mockRejectedValue(new CommunityApiError(500, '暂时无法提交'));
    renderDashboard('contributor');
    await screen.findByRole('heading', { name: '提交新提案' });
    fireEvent.change(screen.getByLabelText(/^标题/), { target: { value: '新增一个面板' } });
    fireEvent.change(screen.getByLabelText(/^详细描述/), { target: { value: '第一版详细描述' } });

    fireEvent.click(screen.getByRole('button', { name: '提交并打开详情' }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    await screen.findByText('暂时无法提交');
    fireEvent.click(screen.getByRole('button', { name: '提交并打开详情' }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));

    const firstKey = create.mock.calls[0]?.[0].clientRequestId;
    const retryKey = create.mock.calls[1]?.[0].clientRequestId;
    expect(retryKey).toBe(firstKey);

    fireEvent.change(screen.getByLabelText(/^详细描述/), { target: { value: '编辑后的详细描述' } });
    fireEvent.click(screen.getByRole('button', { name: '提交并打开详情' }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(3));
    expect(create.mock.calls[2]?.[0].clientRequestId).not.toBe(firstKey);
  });

  it('does not navigate when a create response settles after leaving the dashboard', async () => {
    vi.spyOn(communityDevelopmentApi, 'listRequests').mockResolvedValue(page([]));
    const pendingCreate = deferred<DevelopmentRequestDetail>();
    vi.spyOn(communityDevelopmentApi, 'createRequest').mockReturnValue(pendingCreate.promise);

    function Frame() {
      const navigate = useNavigate();
      return (
        <>
          <button type="button" onClick={() => navigate('/away')}>离开开发区</button>
          <Routes>
            <Route path="/development" element={<DevelopmentDashboardPage />} />
            <Route path="/away" element={<h1>已离开</h1>} />
          </Routes>
        </>
      );
    }
    render(
      <MemoryRouter initialEntries={['/development']}>
        <DevelopmentAccessProvider value={accessValue('contributor')}><Frame /></DevelopmentAccessProvider>
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: '提交新提案' });
    fireEvent.change(screen.getByLabelText(/^标题/), { target: { value: '离开前提交' } });
    fireEvent.change(screen.getByLabelText(/^详细描述/), { target: { value: '足够详细的内容' } });
    fireEvent.click(screen.getByRole('button', { name: '提交并打开详情' }));
    await waitFor(() => expect(communityDevelopmentApi.createRequest).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: '离开开发区' }));
    expect(await screen.findByRole('heading', { name: '已离开' })).toBeInTheDocument();

    await act(async () => {
      pendingCreate.resolve(detail({ id: 'late-created' }));
      await pendingCreate.promise;
    });
    expect(screen.getByRole('heading', { name: '已离开' })).toBeInTheDocument();
  });

  it('does not download an export that settles after leaving the owner dashboard', async () => {
    vi.spyOn(communityDevelopmentApi, 'listRequests').mockResolvedValue(page([]));
    vi.spyOn(communityDevelopmentApi, 'listMembers').mockResolvedValue({ items: [] });
    const pendingExport = deferred<Awaited<ReturnType<typeof communityDevelopmentApi.exportReview>>>();
    vi.spyOn(communityDevelopmentApi, 'exportReview').mockReturnValue(pendingExport.promise);
    const download = vi.spyOn(developmentFormat, 'downloadPrivateBlob').mockImplementation(() => undefined);

    function Frame() {
      const navigate = useNavigate();
      return (
        <>
          <button type="button" onClick={() => navigate('/away')}>离开导出页</button>
          <Routes>
            <Route path="/development" element={<DevelopmentDashboardPage />} />
            <Route path="/away" element={<h1>已离开导出页</h1>} />
          </Routes>
        </>
      );
    }
    render(
      <MemoryRouter initialEntries={['/development']}>
        <DevelopmentAccessProvider value={accessValue('owner')}><Frame /></DevelopmentAccessProvider>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: '导出当前筛选 JSON' }));
    fireEvent.click(screen.getByRole('button', { name: '离开导出页' }));
    await act(async () => {
      pendingExport.resolve({ schemaVersion: 1, generatedAt: '2026-09-07T00:00:00Z', notice: '手动审阅', requests: [] });
      await pendingExport.promise;
    });
    expect(screen.getByRole('heading', { name: '已离开导出页' })).toBeInTheDocument();
    expect(download).not.toHaveBeenCalled();
  });

  it('exports the selected status including done and rejects incomplete payloads', async () => {
    vi.spyOn(communityDevelopmentApi, 'listRequests').mockResolvedValue(page([]));
    vi.spyOn(communityDevelopmentApi, 'listMembers').mockResolvedValue({ items: [] });
    const exportReview = vi.spyOn(communityDevelopmentApi, 'exportReview').mockResolvedValue({
      schemaVersion: 1, generatedAt: '2026-09-09T00:00:00Z', notice: '手工审阅', requests: [],
      scope: 'all', total: 0, exportedCount: 0, complete: true,
    });
    const download = vi.spyOn(developmentFormat, 'downloadPrivateBlob').mockImplementation(() => undefined);
    renderDashboard('owner');
    fireEvent.click(await screen.findByRole('button', { name: '导出当前筛选 JSON' }));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    expect(exportReview).toHaveBeenLastCalledWith('all');
    fireEvent.change(screen.getByLabelText('状态'), { target: { value: 'done' } });
    exportReview.mockResolvedValue({ schemaVersion: 1, generatedAt: '2026-09-09T00:00:00Z', notice: '',
      requests: [], scope: 'done', total: 21, exportedCount: 0, complete: true });
    fireEvent.click(screen.getByRole('button', { name: '导出当前筛选 JSON' }));
    await waitFor(() => expect(exportReview).toHaveBeenLastCalledWith('done'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(download).toHaveBeenCalledTimes(1);
  });

  it('shows partial scope and follow-up on a previously completed proposal without owner controls', async () => {
    vi.spyOn(communityDevelopmentApi, 'getRequest').mockResolvedValue(detail({ status: 'done', version: 4,
      review: { reviewedVersion: 3, reviewedAt: '2026-09-09T00:00:00Z', hasUnreviewedChanges: true, completedItems: 1, totalItems: 2, summary: '本批只完成界面' },
      progress: { reviewedVersion: 3, reviewedAt: '2026-09-09T00:00:00Z', summary: '本批只完成界面',
        items: [{ id: 'ui', label: '<img src=x>界面已验收', status: 'done' }, { id: 'server', label: '后端待开发', status: 'todo' }] },
    }));
    const view = renderDetail('contributor');
    expect(await screen.findByText('已验收 1 / 2 项')).toBeInTheDocument();
    expect(screen.getByText(/审阅后有新补充/)).toBeInTheDocument();
    expect(screen.getByText(/不代表整篇需求已实现/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '编辑分项进度' })).not.toBeInTheDocument();
    expect(view.container.querySelector('img[src="x"]')).toBeNull();
  });

  it('saves owner progress with the exact version and does not silently mark the proposal done', async () => {
    vi.spyOn(communityDevelopmentApi, 'getRequest').mockResolvedValue(detail());
    const save = vi.spyOn(communityDevelopmentApi, 'saveProgress').mockResolvedValue(detail({ version: 2 }));
    renderDetail('owner');
    fireEvent.click(await screen.findByRole('button', { name: '编辑分项进度' }));
    fireEvent.change(screen.getByRole('textbox', { name: '本批交付范围及未完成说明' }), { target: { value: '只验证这一项' } });
    fireEvent.click(screen.getByRole('button', { name: '添加验收项' }));
    fireEvent.change(screen.getByLabelText('验收项 1'), { target: { value: '接口验收' } });
    fireEvent.change(screen.getByLabelText('验收项 1 状态'), { target: { value: 'done' } });
    fireEvent.click(screen.getByRole('button', { name: '保存分项进度' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith('request-1', { expectedVersion: 1, summary: '只验证这一项',
      items: [{ id: expect.any(String), label: '接口验收', status: 'done' }] }));
    await waitFor(() => expect(screen.queryByRole('textbox', { name: '本批交付范围及未完成说明' })).not.toBeInTheDocument());
  });

  it('keeps the newest status-filter response when requests settle out of order', async () => {
    const oldRefresh = deferred<DevelopmentRequestPage>();
    const filtered = deferred<DevelopmentRequestPage>();
    vi.spyOn(communityDevelopmentApi, 'listRequests')
      .mockResolvedValueOnce(page([detail({ title: '初始提案' })], 2))
      .mockReturnValueOnce(oldRefresh.promise)
      .mockReturnValueOnce(filtered.promise);

    renderDashboard('contributor');
    await screen.findByText('初始提案');
    fireEvent.click(screen.getByRole('button', { name: '刷新' }));
    fireEvent.change(screen.getByLabelText('状态'), { target: { value: 'submitted' } });

    await act(async () => {
      filtered.resolve(page([detail({ id: 'new', title: '最新筛选结果' })]));
      await filtered.promise;
    });
    expect(await screen.findByText('最新筛选结果')).toBeInTheDocument();

    await act(async () => {
      oldRefresh.resolve(page([detail({ id: 'old', title: '过期刷新结果' })]));
      await oldRefresh.promise;
    });
    expect(screen.queryByText('过期刷新结果')).not.toBeInTheDocument();
    expect(screen.getByText('最新筛选结果')).toBeInTheDocument();
  });

  it('renders server excerpts and timeline bodies as inert plain text', async () => {
    const malicious = '<img src=x onerror="window.pwned=1"><script>alert(1)</script>';
    vi.spyOn(communityDevelopmentApi, 'getRequest').mockResolvedValue(detail({
      attachments: [attachment({ excerpt: malicious })],
      attachmentCount: 1,
      events: [{
        id: 'event-xss',
        kind: 'comment',
        actor: person,
        body: malicious,
        status: null,
        createdAt: '2026-09-07T03:00:00.000Z',
      }],
    }));

    const { container } = renderDetail('contributor');

    expect(await screen.findByTestId('attachment-excerpt-attachment-1')).toHaveTextContent(malicious);
    expect(screen.getAllByText(malicious)).toHaveLength(2);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });

  it('reports one attachment failure and allows retrying only that in-memory file', async () => {
    const initial = detail();
    const uploadedAttachment = attachment({ filename: 'retry.txt' });
    vi.spyOn(communityDevelopmentApi, 'getRequest').mockResolvedValue(initial);
    const upload = vi.spyOn(communityDevelopmentApi, 'uploadAttachment')
      .mockRejectedValueOnce(new CommunityApiError(500, '上传被拒绝'))
      .mockResolvedValueOnce(detail({
        version: 2,
        attachments: [uploadedAttachment],
        attachmentCount: 1,
      }));
    renderDetail('contributor');
    await screen.findByRole('heading', { name: '优化聊天体验' });

    const file = new File(['retry me'], 'retry.txt', { type: 'text/plain', lastModified: 1 });
    fireEvent.change(screen.getByLabelText('选择附件'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: '上传待处理文件' }));

    expect(await screen.findByText('上传被拒绝')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重试该文件' }));
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
    expect(upload).toHaveBeenNthCalledWith(1, 'request-1', file, 1);
    expect(upload).toHaveBeenNthCalledWith(2, 'request-1', file, 1);
    expect(await screen.findByText('已成功上传 1 个文件。')).toBeInTheDocument();
  });

  it('requires an owner reason and surfaces a 409 without overwriting the detail', async () => {
    vi.spyOn(communityDevelopmentApi, 'getRequest').mockResolvedValue(detail());
    const decide = vi.spyOn(communityDevelopmentApi, 'decideRequest')
      .mockRejectedValue(new CommunityApiError(409, 'conflict', { code: 'DEVELOPMENT_VERSION_CONFLICT' }));
    renderDetail('owner');
    await screen.findByRole('heading', { name: '优化聊天体验' });

    fireEvent.change(screen.getByLabelText(/^决策理由/), { target: { value: ' ' } });
    fireEvent.click(screen.getByRole('button', { name: '保存决策' }));
    expect(await screen.findByText('负责人的决策理由必填，并会记入时间线')).toBeInTheDocument();
    expect(decide).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/^决策理由/), { target: { value: '进入下一轮实现' } });
    fireEvent.click(screen.getByRole('button', { name: '保存决策' }));
    expect(await screen.findByText('服务端版本已变化')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '刷新详情' })).toBeInTheDocument();
    expect(decide).toHaveBeenCalledWith('request-1', 'accepted', '进入下一轮实现', 1);
    expect(screen.getAllByText('v1')).toHaveLength(2);
  });

  it('offers only legal next statuses and does not mislabel an invalid transition as a version conflict', async () => {
    vi.spyOn(communityDevelopmentApi, 'getRequest').mockResolvedValue(detail({ status: 'accepted' }));
    const decide = vi.spyOn(communityDevelopmentApi, 'decideRequest').mockRejectedValue(
      new CommunityApiError(409, '状态迁移无效', { code: 'STATUS_TRANSITION_INVALID' }),
    );
    renderDetail('owner');
    const select = await screen.findByLabelText('新状态');
    expect(within(select).getByRole('option', { name: '实现中' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: '待补充' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: '已拒绝' })).toBeInTheDocument();
    expect(within(select).queryByRole('option', { name: '已完成' })).not.toBeInTheDocument();
    expect(select).toHaveValue('in_progress');

    fireEvent.change(screen.getByLabelText(/^决策理由/), { target: { value: '开始实现' } });
    fireEvent.click(screen.getByRole('button', { name: '保存决策' }));
    expect(await screen.findByText('当前状态不能转到所选状态，请刷新后核对最新流程。')).toBeInTheDocument();
    expect(screen.queryByText('服务端版本已变化')).not.toBeInTheDocument();
    expect(decide).toHaveBeenCalledWith('request-1', 'in_progress', '开始实现', 1);
  });

  it('does not show a decision submit form for final statuses', async () => {
    vi.spyOn(communityDevelopmentApi, 'getRequest').mockResolvedValue(detail({ status: 'done' }));
    renderDetail('owner');

    expect(await screen.findByRole('heading', { name: '决策已收口' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '保存决策' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('新状态')).not.toBeInTheDocument();
  });

  it('does not let an owner upload attachments to somebody else\'s proposal', async () => {
    vi.spyOn(communityDevelopmentApi, 'getRequest').mockResolvedValue(detail({
      author: { ...person, publicId: 'another-author' },
    }));
    renderDetail('owner');

    expect(await screen.findByText(/站长查看他人提案时可安全下载/)).toBeInTheDocument();
    expect(screen.queryByLabelText('选择附件')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '站长决策' })).toBeInTheDocument();
  });

  it('clears proposal A drafts and busy upload state when navigating to proposal B', async () => {
    vi.spyOn(communityDevelopmentApi, 'getRequest')
      .mockResolvedValueOnce(detail({ id: 'a', title: '提案 A' }))
      .mockResolvedValueOnce(detail({ id: 'b', title: '提案 B' }));
    const pendingUpload = deferred<DevelopmentRequestDetail>();
    vi.spyOn(communityDevelopmentApi, 'uploadAttachment').mockReturnValue(pendingUpload.promise);

    function NavigationFrame() {
      const navigate = useNavigate();
      return (
        <>
          <button type="button" onClick={() => navigate('/development/requests/b')}>打开 B</button>
          <Routes><Route path="/development/requests/:id" element={<DevelopmentRequestDetailPage />} /></Routes>
        </>
      );
    }
    render(
      <MemoryRouter initialEntries={['/development/requests/a']}>
        <DevelopmentAccessProvider value={accessValue('contributor')}><NavigationFrame /></DevelopmentAccessProvider>
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: '提案 A' });
    fireEvent.change(screen.getByLabelText(/^补充评论/), { target: { value: 'A 的未发送草稿' } });
    const file = new File(['pending'], 'pending.txt', { type: 'text/plain' });
    fireEvent.change(screen.getByLabelText('选择附件'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: '上传待处理文件' }));
    await waitFor(() => expect(communityDevelopmentApi.uploadAttachment).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: '打开 B' }));
    expect(await screen.findByRole('heading', { name: '提案 B' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^补充评论/)).toHaveValue('');
    expect(screen.queryByText('pending.txt')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '上传待处理文件' })).not.toHaveAttribute('aria-busy', 'true');

    await act(async () => {
      pendingUpload.resolve(detail({ id: 'a', title: '提案 A 过期附件响应', version: 2 }));
      await pendingUpload.promise;
    });
    expect(screen.getByRole('heading', { name: '提案 B' })).toBeInTheDocument();
    expect(screen.queryByText('提案 A 过期附件响应')).not.toBeInTheDocument();
  });

  it('rejects an old A response after navigating A to B and back to A', async () => {
    const oldA = deferred<DevelopmentRequestDetail>();
    const requestB = deferred<DevelopmentRequestDetail>();
    const newA = deferred<DevelopmentRequestDetail>();
    vi.spyOn(communityDevelopmentApi, 'getRequest')
      .mockReturnValueOnce(oldA.promise)
      .mockReturnValueOnce(requestB.promise)
      .mockReturnValueOnce(newA.promise);

    function NavigationFrame() {
      const navigate = useNavigate();
      return (
        <>
          <button type="button" onClick={() => navigate('/development/requests/a')}>A</button>
          <button type="button" onClick={() => navigate('/development/requests/b')}>B</button>
          <Routes><Route path="/development/requests/:id" element={<DevelopmentRequestDetailPage />} /></Routes>
        </>
      );
    }

    render(
      <MemoryRouter initialEntries={['/development/requests/a']}>
        <DevelopmentAccessProvider value={accessValue('contributor')}>
          <NavigationFrame />
        </DevelopmentAccessProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(communityDevelopmentApi.getRequest).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'B' }));
    await waitFor(() => expect(communityDevelopmentApi.getRequest).toHaveBeenCalledTimes(2));
    await act(async () => {
      requestB.resolve(detail({ id: 'b', title: '提案 B' }));
      await requestB.promise;
    });
    expect(await screen.findByRole('heading', { name: '提案 B' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    await waitFor(() => expect(communityDevelopmentApi.getRequest).toHaveBeenCalledTimes(3));
    await act(async () => {
      newA.resolve(detail({ id: 'a', title: '提案 A 新版', version: 3 }));
      await newA.promise;
    });
    expect(await screen.findByRole('heading', { name: '提案 A 新版' })).toBeInTheDocument();

    await act(async () => {
      oldA.resolve(detail({ id: 'a', title: '提案 A 旧响应', version: 1 }));
      await oldA.promise;
    });
    expect(screen.queryByRole('heading', { name: '提案 A 旧响应' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '提案 A 新版' })).toBeInTheDocument();
  });
});
