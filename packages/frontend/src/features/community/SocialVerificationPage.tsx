import { useEffect, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';

import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import {
  communitySecurityApi,
  type CommunitySocialVerification,
  type CommunitySocialVerificationSession,
} from '../../api/community';
import { Button, Card, PageHeader, Tag, type TagColor } from '../../components/ui';
import styles from './CommunityPages.module.css';
import { communityRequestErrorMessage } from './request-error';

const STATUS_COPY: Record<
  CommunitySocialVerification['status'],
  { label: string; detail: string; color: TagColor }
> = {
  not_started: {
    label: '尚未开始',
    detail: '需要使用受门槛保护的社交功能时，可主动开始身份核验。',
    color: 'neutral',
  },
  pending: {
    label: '核验处理中',
    detail: '核验正在处理中，请耐心等待，不需要重复提交。',
    color: 'brand',
  },
  verified: {
    label: '已核验',
    detail: '核验已经完成。公开主页和社区内容不会展示身份信息。',
    color: 'success',
  },
  failed: {
    label: '核验未通过',
    detail: '本次核验没有完成。可检查说明后重新发起，不代表账号已被封禁。',
    color: 'danger',
  },
  expired: {
    label: '核验已过期',
    detail: '此前核验结果已过期；需要相关功能时请重新发起。',
    color: 'neutral',
  },
};

function formatTime(value?: string | null): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toLocaleString('zh-CN');
}

export function CommunitySocialVerificationPage(): JSX.Element {
  const user = useCommunityAuthStore((state) => state.user);
  const updateUser = useCommunityAuthStore((state) => state.updateUser);
  const [verification, setVerification] = useState<CommunitySocialVerification>();
  const [session, setSession] = useState<CommunitySocialVerificationSession>();
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>();

  async function load(): Promise<void> {
    setLoading(true);
    setError(undefined);
    try {
      const next = await communitySecurityApi.getSocialVerification();
      setVerification(next);
      if (user) {
        updateUser({
          ...user,
          socialVerificationStatus:
            next.status === 'not_started'
              ? 'unverified'
              : next.status === 'failed'
                ? 'rejected'
                : next.status,
        });
      }
    } catch (requestError) {
      setError(communityRequestErrorMessage(requestError, '身份核验状态加载失败'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function start(): Promise<void> {
    setStarting(true);
    setSession(undefined);
    setError(undefined);
    try {
      setSession(await communitySecurityApi.createSocialVerificationSession());
    } catch (requestError) {
      setError(communityRequestErrorMessage(requestError, '暂时无法启动身份核验'));
    } finally {
      setStarting(false);
    }
  }

  const copy = verification ? STATUS_COPY[verification.status] : undefined;
  const canStart = verification && !['pending', 'verified'].includes(verification.status);

  return (
    <main className={styles.page}>
      <PageHeader
        title="身份核验"
        subtitle="身份信息永不在公开主页、帖子、聊天室或好友列表中公开。"
        actions={<Link to="/account/security">返回账号安全</Link>}
      />
      <Card title="隐私边界">
        <div className={styles.stack}>
          <p>核验状态只用于判断受门槛保护的社交功能是否可用。本站公开页面只会按隐私设置展示昵称、系统头像等资料。</p>
          <p className={styles.muted}>请仅通过本页面生成的安全 HTTPS 地址进入核验服务；页面不会把访问令牌放进链接。</p>
        </div>
      </Card>

      <Card title="当前状态">
        {loading ? <p role="status">正在读取核验状态…</p> : null}
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        {!loading && verification && copy ? (
          <div className={styles.stack}>
            <div><Tag color={copy.color}>{copy.label}</Tag></div>
            <p>{copy.detail}</p>
            {verification.provider ? <p>核验服务：{verification.provider}</p> : null}
            {formatTime(verification.submittedAt) ? <p>提交时间：{formatTime(verification.submittedAt)}</p> : null}
            {formatTime(verification.verifiedAt) ? <p>核验时间：{formatTime(verification.verifiedAt)}</p> : null}
            {verification.failureCode ? <p>未完成代码：{verification.failureCode}</p> : null}
            <div className={styles.inlineActions}>
              {canStart ? <Button loading={starting} onClick={() => void start()}>开始身份核验</Button> : null}
              <Button variant="ghost" onClick={() => void load()}>刷新状态</Button>
            </div>
          </div>
        ) : null}
      </Card>

      {session ? (
        <Card title="安全核验会话">
          <div className={styles.stack} role="status">
            <p>安全地址已生成，有效期至 {formatTime(session.expiresAt) ?? '页面显示时间'}。</p>
            <a className={styles.primaryLink} href={session.launchUrl} rel="noopener noreferrer">
              前往安全核验服务
            </a>
            <small className={styles.muted}>离开本站前请确认浏览器地址以 https:// 开头。</small>
          </div>
        </Card>
      ) : null}
    </main>
  );
}
