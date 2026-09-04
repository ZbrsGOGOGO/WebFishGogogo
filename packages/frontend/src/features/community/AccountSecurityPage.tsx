import { useEffect, useRef, useState, type FormEvent, type JSX } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { COMMUNITY_FEATURE_FLAGS } from '../../app/community-nav';
import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import {
  CommunityApiError,
  communityAccountApi,
  communityAuthApi,
  createCommunityIdempotencyKey,
  type CommunityAccountDeletion,
  type CommunityDeviceSession,
} from '../../api/community';
import { Button, Card, EmptyState, Input, PageHeader, Tag } from '../../components/ui';
import { validateCommunityPassword } from '../community-auth/validation';
import styles from './CommunityPages.module.css';
import { communityRequestErrorMessage } from './request-error';

function displayTime(value?: string | null): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toLocaleString('zh-CN');
}

function hasDeletionRequest(deletion: CommunityAccountDeletion | null): boolean {
  return Boolean(deletion && !['none', 'cancelled'].includes(deletion.status));
}

function passwordChangeErrorMessage(error: unknown): string {
  if (error instanceof CommunityApiError) {
    const code = error.body && typeof error.body === 'object' && 'code' in error.body
      ? (error.body as { code?: unknown }).code
      : undefined;
    if (code === 'CURRENT_PASSWORD_INVALID') return '当前密码不正确';
    if (code === 'NEW_PASSWORD_MUST_DIFFER') return '新密码不能与当前密码相同';
    if (error.status === 429) return '尝试次数过多，请稍后再试';
    if (error.status === 401) return '登录状态已失效，请重新登录后修改';
  }
  return communityRequestErrorMessage(error, '密码修改失败');
}

export function CommunityAccountSecurityPage(): JSX.Element {
  const navigate = useNavigate();
  const user = useCommunityAuthStore((state) => state.user);
  const updateUser = useCommunityAuthStore((state) => state.updateUser);
  const logoutAll = useCommunityAuthStore((state) => state.logoutAll);
  const resetSession = useCommunityAuthStore((state) => state.reset);
  const deletionKey = useRef<string>();
  const [sessions, setSessions] = useState<CommunityDeviceSession[]>([]);
  const [deletion, setDeletion] = useState<CommunityAccountDeletion | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [confirmDeletion, setConfirmDeletion] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordErrors, setPasswordErrors] = useState<{
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  }>({});

  useEffect(() => {
    let active = true;
    const deletionRequest = COMMUNITY_FEATURE_FLAGS.accountDeletion
      ? communityAccountApi.getDeletion()
      : Promise.resolve(null);
    Promise.allSettled([communityAuthApi.sessions(), deletionRequest]).then(
      ([sessionResult, deletionResult]) => {
        if (!active) return;
        if (sessionResult.status === 'fulfilled') {
          setSessions(sessionResult.value);
        } else {
          setError(communityRequestErrorMessage(sessionResult.reason, '设备列表加载失败'));
        }
        if (deletionResult.status === 'fulfilled') {
          setDeletion(deletionResult.value);
        } else {
          setError(communityRequestErrorMessage(deletionResult.reason, '注销状态加载失败'));
        }
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  async function revoke(session: CommunityDeviceSession): Promise<void> {
    setBusy(session.id);
    setError(undefined);
    setNotice(undefined);
    try {
      await communityAuthApi.revokeSession(session.id);
      if (session.current) {
        await useCommunityAuthStore.getState().logout();
        navigate('/login', { replace: true });
      } else {
        setSessions((current) => current.filter((item) => item.id !== session.id));
      }
    } catch (requestError) {
      setError(communityRequestErrorMessage(requestError, '退出设备失败'));
    } finally {
      setBusy(undefined);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const nextErrors = {
      currentPassword: currentPassword ? undefined : '请输入当前密码',
      newPassword: validateCommunityPassword(newPassword) ?? (
        newPassword === currentPassword
          ? '新密码不能与当前密码相同'
          : undefined
      ),
      confirmPassword: newPassword === confirmPassword ? undefined : '两次输入的新密码不一致',
    };
    setPasswordErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    setBusy('password-change');
    setError(undefined);
    setNotice(undefined);
    try {
      await communityAuthApi.changePassword({ currentPassword, newPassword });
      resetSession();
      navigate('/login', {
        replace: true,
        state: { passwordChanged: true },
      });
    } catch (requestError) {
      setError(passwordChangeErrorMessage(requestError));
    } finally {
      setBusy(undefined);
    }
  }

  async function requestDeletion(): Promise<void> {
    if (confirmation !== 'DELETE') {
      setError('请输入大写 DELETE 以确认这是本人操作');
      return;
    }
    setBusy('deletion');
    setError(undefined);
    setNotice(undefined);
    deletionKey.current ??= createCommunityIdempotencyKey('account-deletion');
    let next: CommunityAccountDeletion;
    try {
      next = await communityAccountApi.requestDeletion(deletionKey.current);
      setDeletion(next);
      setNotice('注销申请已提交，正在确认账号状态。');
    } catch (requestError) {
      setError(communityRequestErrorMessage(requestError, '注销申请失败'));
      setBusy(undefined);
      return;
    }
    try {
      const status = await communityAccountApi.getStatus();
      if (user) updateUser({ ...user, accountStatus: status.accountStatus });
      if (status.accountStatus !== 'active') {
        navigate('/account/status', { replace: true });
      }
    } catch (requestError) {
      setError(communityRequestErrorMessage(
        requestError,
        '注销申请已接收，但暂时无法确认最新账号状态，请刷新后查看',
      ));
    } finally {
      setBusy(undefined);
    }
  }

  async function cancelDeletion(): Promise<void> {
    setBusy('cancel-deletion');
    setError(undefined);
    setNotice(undefined);
    let next: CommunityAccountDeletion;
    try {
      next = await communityAccountApi.cancelDeletion();
      setDeletion(next);
      deletionKey.current = undefined;
      setNotice('撤销请求已提交，正在确认账号状态。');
    } catch (requestError) {
      setError(communityRequestErrorMessage(requestError, '撤销注销失败'));
      setBusy(undefined);
      return;
    }
    try {
      const status = await communityAccountApi.getStatus();
      if (user) updateUser({ ...user, accountStatus: status.accountStatus });
      setNotice('注销申请已撤销。');
      setConfirmDeletion(false);
      setConfirmation('');
    } catch (requestError) {
      setError(communityRequestErrorMessage(
        requestError,
        '撤销请求已接收，但暂时无法确认最新账号状态，请刷新后查看',
      ));
    } finally {
      setBusy(undefined);
    }
  }

  const securityActions = (
    <div className={styles.inlineActions}>
      {COMMUNITY_FEATURE_FLAGS.passwordReset ? <Link to="/password/forgot">修改或找回密码</Link> : null}
      {COMMUNITY_FEATURE_FLAGS.socialVerification ? <Link to="/settings/verification">身份核验</Link> : null}
    </div>
  );

  return (
    <main className={styles.page}>
      <PageHeader
        title="账号安全"
        subtitle={`当前账号：${user?.username || user?.email || '—'}`}
        actions={securityActions}
      />
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
      <Card title="修改密码">
        <form className={styles.form} noValidate onSubmit={changePassword}>
          <p className={styles.muted}>修改后会立即退出所有设备，需要使用新密码重新登录。</p>
          <Input
            label="当前密码"
            type="password"
            name="currentPassword"
            autoComplete="current-password"
            value={currentPassword}
            required
            error={passwordErrors.currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
          <Input
            label="新密码"
            type="password"
            name="newPassword"
            autoComplete="new-password"
            value={newPassword}
            required
            error={passwordErrors.newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
          <Input
            label="确认新密码"
            type="password"
            name="confirmPassword"
            autoComplete="new-password"
            value={confirmPassword}
            required
            error={passwordErrors.confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
          <Button type="submit" loading={busy === 'password-change'}>更新密码并退出全部设备</Button>
        </form>
      </Card>
      <Card
        title="登录设备"
        headerActions={<Button variant="secondary" size="sm" onClick={() => void logoutAll()}>退出全部设备</Button>}
      >
        {loading ? <p role="status">正在加载设备…</p> : sessions.length === 0 ? (
          <EmptyState icon="🔐" title="暂时没有设备记录" message="新的登录设备会显示在这里。" />
        ) : (
          sessions.map((session) => (
            <div className={styles.sessionRow} key={session.id}>
              <div>
                <strong>{session.deviceLabel} {session.current ? <Tag color="success">当前设备</Tag> : null}</strong>
                <small>最近活动：{displayTime(session.lastActiveAt) ?? '未知'} {session.region ? `· ${session.region}` : ''}</small>
              </div>
              <Button variant="ghost" size="sm" loading={busy === session.id} onClick={() => void revoke(session)}>退出该设备</Button>
            </div>
          ))
        )}
      </Card>

      {COMMUNITY_FEATURE_FLAGS.accountDeletion ? (
        <Card title="注销账号" className={styles.dangerZone}>
          {hasDeletionRequest(deletion) ? (
            <div className={styles.stack}>
              <p>注销状态：{deletion?.status}</p>
              {displayTime(deletion?.scheduledFor) ? <p>预计注销时间：{displayTime(deletion?.scheduledFor)}</p> : null}
              {deletion?.canCancel ? (
                <Button variant="secondary" loading={busy === 'cancel-deletion'} onClick={() => void cancelDeletion()}>
                  撤销注销
                </Button>
              ) : <p className={styles.muted}>当前状态不能撤销。</p>}
            </div>
          ) : confirmDeletion ? (
            <div className={styles.stack}>
              <p>注销会影响主页、好友、绿植和历史玩法资产。提交后会显示冷静期和预计完成时间。</p>
              <Input
                label="输入 DELETE 确认注销"
                value={confirmation}
                autoComplete="off"
                spellCheck={false}
                required
                onChange={(event) => setConfirmation(event.target.value)}
              />
              <div className={styles.inlineActions}>
                <Button variant="danger" disabled={confirmation !== 'DELETE'} loading={busy === 'deletion'} onClick={() => void requestDeletion()}>
                  提交注销申请
                </Button>
                <Button variant="ghost" onClick={() => { setConfirmDeletion(false); setConfirmation(''); }}>取消</Button>
              </div>
            </div>
          ) : (
            <div className={styles.stack}>
              <p>注销属于高风险操作，页面不会自动提交或重放该请求。</p>
              <Button variant="danger" onClick={() => setConfirmDeletion(true)}>申请注销账号</Button>
            </div>
          )}
        </Card>
      ) : null}
    </main>
  );
}
