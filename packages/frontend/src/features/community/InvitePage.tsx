import { useCallback, useEffect, useState, type JSX } from 'react';

import {
  communityInvitesApi,
  createCommunityIdempotencyKey,
  type CommunityReferralOverview,
  type CommunityReferralStatus,
} from '../../api/community';
import { Button, Card, EmptyState, PageHeader, Tag } from '../../components/ui';
import { communityRequestErrorMessage } from './request-error';
import styles from './CommunityPages.module.css';

const STATUS_LABELS: Record<CommunityReferralStatus, string> = {
  opened: '已打开',
  registered: '已注册',
  pending_qualification: '待达标',
  qualified: '已达标',
  invalid: '无效',
};

function CapProgress({ label, value, limit }: { label: string; value: number; limit: number }): JSX.Element {
  return (
    <div className={styles.progressRow}>
      <div><strong>{label}</strong><span>{value}/{limit}</span></div>
      <progress value={Math.min(value, limit)} max={Math.max(1, limit)} aria-label={label} />
    </div>
  );
}

export function CommunityInvitePage(): JSX.Element {
  const [overview, setOverview] = useState<CommunityReferralOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(undefined);
    try {
      setOverview(await communityInvitesApi.getOverview());
    } catch (requestError) {
      setError(communityRequestErrorMessage(requestError, '邀请数据加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createOrRotate(): Promise<void> {
    if (overview?.code && !confirmRotate) {
      setConfirmRotate(true);
      return;
    }
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const next = await communityInvitesApi.createOrRotateCode(
        createCommunityIdempotencyKey('referral-code'),
      );
      setOverview(next);
      setConfirmRotate(false);
      setNotice(overview?.code ? '推荐码已由服务端确认轮换，旧码已失效' : '推荐码已生成');
    } catch (requestError) {
      setError(communityRequestErrorMessage(requestError, '推荐码操作失败'));
    } finally {
      setBusy(false);
    }
  }

  async function copyShareValue(): Promise<void> {
    const value = overview?.shareUrl ?? overview?.code;
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setNotice('推荐信息已复制');
    } catch {
      setError('浏览器未允许复制，请手动选择推荐信息');
    }
  }

  return (
    <main className={styles.page}>
      <PageHeader
        title="邀请"
        subtitle="Beta 准入码和用户推荐码是两套独立机制，不能混用。"
      />
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}

      <div className={styles.twoColumn}>
        <Card title="Beta 准入码">
          <Tag color="neutral">注册名额控制</Tag>
          <p>由平台管理员按批次发放，仅用于创建账号和邮箱验证时核销。</p>
          <ul className={styles.plainList}>
            <li>不归属于普通用户</li>
            <li>不产生邀请奖励</li>
            <li>不能当作推荐码分享或统计</li>
          </ul>
          <p className={styles.muted}>本页不会生成或展示管理员 Beta 准入码。</p>
        </Card>

        <Card title="用户推荐码">
          <Tag color="neutral">推荐归因</Tag>
          {loading ? <p role="status">正在加载推荐状态…</p> : !overview?.enabled ? (
            <EmptyState title="推荐功能尚未开放" message="开放状态由服务端控制，不影响 Beta 准入流程。" />
          ) : (
            <div className={styles.stack}>
              <label className={styles.readonlyField}>
                <span>当前推荐码</span>
                <input readOnly value={overview.code ?? '尚未生成'} aria-label="当前推荐码" />
              </label>
              {overview.shareUrl ? (
                <label className={styles.readonlyField}>
                  <span>安全分享链接</span>
                  <input readOnly value={overview.shareUrl} aria-label="安全分享链接" />
                </label>
              ) : null}
              <div className={styles.inlineActions}>
                <Button onClick={() => void createOrRotate()} loading={busy}>
                  {overview.code ? (confirmRotate ? '确认轮换推荐码' : '轮换推荐码') : '生成推荐码'}
                </Button>
                {confirmRotate ? <Button variant="ghost" onClick={() => setConfirmRotate(false)}>取消</Button> : null}
                {overview.code ? <Button variant="secondary" onClick={() => void copyShareValue()}>复制</Button> : null}
              </div>
              {overview.code ? <p className={styles.muted}>轮换后旧码立即失效，既有推荐绑定不会变化。</p> : null}
            </div>
          )}
        </Card>
      </div>

      {overview?.enabled ? (
        <Card title="封顶进度">
          <div className={styles.progressGrid}>
            <CapProgress label="今日有效邀请" value={overview.dailyQualifiedCount} limit={overview.dailyQualifiedLimit} />
            <CapProgress label="本月有效邀请" value={overview.monthlyQualifiedCount} limit={overview.monthlyQualifiedLimit} />
            <CapProgress label="本月奖励次数" value={overview.monthlyRewardCount} limit={overview.monthlyRewardLimit} />
          </div>
          <p className={styles.muted}>{overview.rewardDescription ?? '奖励和封顶规则以服务端当前配置为准；不提供现金、提现或多级分成。'}</p>
          <div className={styles.statGrid} aria-label="推荐阶段统计">
            <div><strong>{overview.openedCount}</strong><span>已打开</span></div>
            <div><strong>{overview.registeredCount}</strong><span>已注册</span></div>
            <div><strong>{overview.pendingQualificationCount}</strong><span>待达标</span></div>
            <div><strong>{overview.qualifiedCount}</strong><span>已达标</span></div>
            <div><strong>{overview.invalidCount}</strong><span>无效</span></div>
          </div>
        </Card>
      ) : null}

      {overview?.enabled ? (
        <Card title="推荐记录">
          {overview.entries.length === 0 ? (
            <EmptyState title="暂时没有推荐记录" message="这里只显示阶段和昵称，不展示邮箱或手机号。" />
          ) : overview.entries.map((entry) => (
            <article className={styles.simpleRow} key={entry.id}>
              <div><strong>{entry.displayName ?? '尚未设置昵称'}</strong><small>{new Date(entry.createdAt).toLocaleString('zh-CN')}</small></div>
              <Tag>{STATUS_LABELS[entry.status]}</Tag>
            </article>
          ))}
        </Card>
      ) : null}
    </main>
  );
}
