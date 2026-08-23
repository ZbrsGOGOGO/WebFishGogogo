import { useEffect, useState, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';

import { COMMUNITY_FEATURE_FLAGS } from '../../app/community-nav';
import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import {
  communityAccountApi,
  type CommunityAccountAppeal,
  type CommunityAccountDeletion,
  type CommunityAccountStatusSnapshot,
  type CommunityRestrictedAccountStatus,
} from '../../api/community';
import { Button, Card, PageHeader, Tag, Textarea } from '../../components/ui';
import styles from './CommunityPages.module.css';
import { communityRequestErrorMessage } from './request-error';

const COPY: Record<CommunityRestrictedAccountStatus, { title: string; detail: string }> = {
  active: {
    title: '账号状态正常',
    detail: '你的账号可以正常使用。',
  },
  suspended: {
    title: '账号暂时停用',
    detail: '当前账号只能查看处置原因与必要的安全信息，普通社区操作已经停止。',
  },
  banned: {
    title: '账号已被封禁',
    detail: '社区功能已经停用。如认为处置有误，可在下方提交申诉。',
  },
  deleting: {
    title: '账号处于注销流程',
    detail: '会话和社区互动已经停止。在注销完成前，可按页面提示撤销。',
  },
};

const APPEAL_LABEL: Record<CommunityAccountAppeal['status'], string> = {
  pending: '申诉处理中',
  approved: '申诉已通过',
  rejected: '申诉未通过',
  cancelled: '申诉已取消',
};

function displayTime(value?: string | null): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toLocaleString('zh-CN');
}

export function CommunityAccountStatusPage(): JSX.Element {
  const navigate = useNavigate();
  const phase = useCommunityAuthStore((state) => state.phase);
  const user = useCommunityAuthStore((state) => state.user);
  const updateUser = useCommunityAuthStore((state) => state.updateUser);
  const logout = useCommunityAuthStore((state) => state.logout);
  const [status, setStatus] = useState<CommunityAccountStatusSnapshot>();
  const [deletion, setDeletion] = useState<CommunityAccountDeletion | null>(null);
  const [appeal, setAppeal] = useState<CommunityAccountAppeal | null>(null);
  const [appealReason, setAppealReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  async function load(): Promise<void> {
    setLoading(true);
    setError(undefined);
    const shouldLoadDeletion =
      COMMUNITY_FEATURE_FLAGS.accountDeletion && phase === 'deleting';
    const [statusResult, deletionResult] = await Promise.allSettled([
      communityAccountApi.getStatus(),
      shouldLoadDeletion ? communityAccountApi.getDeletion() : Promise.resolve(null),
    ]);
    if (statusResult.status === 'fulfilled') {
      setStatus(statusResult.value);
      setAppeal(statusResult.value.appeal ?? null);
      if (user && statusResult.value.accountStatus !== user.accountStatus) {
        updateUser({ ...user, accountStatus: statusResult.value.accountStatus });
      }
    } else {
      setError(communityRequestErrorMessage(statusResult.reason, '账号状态加载失败'));
    }
    if (deletionResult.status === 'fulfilled') {
      setDeletion(deletionResult.value);
    } else {
      setError(communityRequestErrorMessage(deletionResult.reason, '注销状态加载失败'));
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // phase/user 的服务端校准在 load 内完成，不应因 store 更新重复发起安全请求。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cancelDeletion(): Promise<void> {
    if (!user) return;
    setBusy('cancel-deletion');
    setError(undefined);
    setNotice(undefined);
    let nextDeletion: CommunityAccountDeletion;
    try {
      nextDeletion = await communityAccountApi.cancelDeletion();
      setDeletion(nextDeletion);
      setNotice('撤销请求已提交，正在确认账号状态。');
    } catch (requestError) {
      setError(communityRequestErrorMessage(requestError, '撤销注销失败'));
      setBusy(undefined);
      return;
    }
    try {
      const nextStatus = await communityAccountApi.getStatus();
      setStatus(nextStatus);
      updateUser({ ...user, accountStatus: nextStatus.accountStatus });
      if (nextStatus.accountStatus === 'active') {
        navigate(user.onboardingCompleted ? '/' : '/onboarding', { replace: true });
      } else {
        setNotice(`撤销请求已处理，当前账号状态仍为 ${nextStatus.accountStatus}。`);
      }
    } catch (requestError) {
      setError(communityRequestErrorMessage(
        requestError,
        '撤销请求已接收，但暂时无法确认最新账号状态，请刷新后查看',
      ));
    } finally {
      setBusy(undefined);
    }
  }

  async function submitAppeal(): Promise<void> {
    const reason = appealReason.trim();
    const length = Array.from(reason).length;
    if (length < 20) {
      setError('申诉说明至少需要 20 个字');
      return;
    }
    if (length > 1000) {
      setError('申诉说明最多允许 1000 个字');
      return;
    }
    setBusy('appeal');
    setError(undefined);
    setNotice(undefined);
    try {
      const next = await communityAccountApi.submitAppeal(reason);
      setAppeal(next);
      setAppealReason('');
      setNotice(`申诉已提交，当前状态：${APPEAL_LABEL[next.status]}。`);
    } catch (requestError) {
      setError(communityRequestErrorMessage(requestError, '申诉提交失败'));
    } finally {
      setBusy(undefined);
    }
  }

  const currentStatus = (status?.accountStatus ?? phase) as CommunityRestrictedAccountStatus;
  const copy = COPY[currentStatus] ?? COPY.suspended;
  const canAppeal =
    Boolean(status) &&
    (currentStatus === 'suspended' || currentStatus === 'banned') &&
    status?.canAppeal !== false &&
    appeal?.status !== 'pending';

  return (
    <main className={styles.page}>
      <PageHeader title="账号状态" subtitle="在这里查看账号限制、注销和申诉进度。" />
      {loading ? <p role="status">正在读取账号状态…</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
      <Card>
        <div className={styles.stack}>
          <div><Tag color={currentStatus === 'deleting' ? 'neutral' : currentStatus === 'active' ? 'success' : 'danger'}>{currentStatus}</Tag></div>
          <h1>{copy.title}</h1>
          <p>{copy.detail}</p>
          {status?.reason ? <p>状态说明：{status.reason}</p> : user?.restrictionReason ? <p>状态说明：{user.restrictionReason}</p> : null}
          {status?.reasonCode ? <p>原因代码：{status.reasonCode}</p> : null}
          {displayTime(status?.restrictionEndsAt) ? <p>限制预计结束：{displayTime(status?.restrictionEndsAt)}</p> : null}
          {displayTime(deletion?.scheduledFor) ? <p>注销计划时间：{displayTime(deletion?.scheduledFor)}</p> : null}
          <div className={styles.inlineActions}>
            {currentStatus === 'deleting' && COMMUNITY_FEATURE_FLAGS.accountDeletion && deletion?.canCancel ? (
              <Button loading={busy === 'cancel-deletion'} onClick={() => void cancelDeletion()}>撤销注销</Button>
            ) : null}
            <Button variant="ghost" onClick={() => void load()}>刷新状态</Button>
            <Button variant="ghost" onClick={() => void logout()}>退出账号</Button>
          </div>
        </div>
      </Card>

      {(currentStatus === 'suspended' || currentStatus === 'banned') ? (
        <Card title="账号申诉">
          <div className={styles.stack}>
            {appeal ? (
              <div className={styles.stack}>
                <div><Tag color={appeal.status === 'approved' ? 'success' : appeal.status === 'rejected' ? 'danger' : 'brand'}>{APPEAL_LABEL[appeal.status]}</Tag></div>
                {displayTime(appeal.submittedAt) ? <p>提交时间：{displayTime(appeal.submittedAt)}</p> : null}
                {appeal.decisionReason ? <p>处理说明：{appeal.decisionReason}</p> : null}
              </div>
            ) : <p className={styles.muted}>当前没有申诉记录。</p>}
            {canAppeal ? (
              <div className={styles.form}>
                <Textarea
                  label="申诉说明"
                  value={appealReason}
                  minLength={20}
                  maxLength={1000}
                  required
                  rows={6}
                  onChange={(event) => setAppealReason(event.target.value)}
                />
                <small className={styles.muted}>请说明处置可能有误的原因，不要填写密码、验证码或身份证件号码。</small>
                <Button loading={busy === 'appeal'} onClick={() => void submitAppeal()}>提交申诉</Button>
              </div>
            ) : appeal?.status === 'pending' ? (
              <p>申诉正在处理，请耐心等待，不要重复提交。</p>
            ) : status && status.canAppeal === false ? (
              <p>当前不能再次提交申诉。</p>
            ) : null}
          </div>
        </Card>
      ) : null}
    </main>
  );
}
