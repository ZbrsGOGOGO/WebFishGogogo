import { useEffect, useState, type JSX } from 'react';

import {
  communityInvitesApi,
  type CommunityReferralOverview,
} from '../../api/community';
import { Button, Card, PageHeader, Tag } from '../../components/ui';
import { communityRequestErrorMessage } from './request-error';
import styles from './CommunityPages.module.css';

export function CommunityInvitePage(): JSX.Element {
  const [overview, setOverview] = useState<CommunityReferralOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  async function load(): Promise<void> {
    setLoading(true);
    setError(undefined);
    try {
      setOverview(await communityInvitesApi.getOverview());
    } catch (requestError) {
      setError(communityRequestErrorMessage(requestError, '邀请币余额加载失败'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  return (
    <main className={styles.page}>
      <PageHeader title="邀请" subtitle="本期只开放邀请币余额，邀请流程稍后上线。" />
      {error ? <p className={styles.error} role="alert">{error}</p> : null}

      <div className={styles.twoColumn}>
        <Card title="我的邀请币" headerActions={<Tag color="neutral">独立货币</Tag>}>
          {loading ? <p role="status">正在读取邀请币…</p> : (
            <div className={styles.stack}>
              <strong className={styles.currencyValue}>{overview?.invitationCoins ?? 0}</strong>
              <p>邀请币与办公币分开记录，目前不能消费、交易、转赠或兑换现金。</p>
              {error ? <Button variant="secondary" onClick={() => void load()}>重新加载</Button> : null}
            </div>
          )}
        </Card>

        <Card title="功能状态" headerActions={<Tag>开发中</Tag>}>
          <p>邀请链接、资格判断和奖励领取本期不开放，不会出现“点了却不能完成”的假入口。</p>
          <ul className={styles.plainList}>
            <li>计划规则：每位达标新用户为邀请人提供 1 枚邀请币</li>
            <li>邀请币用途会在正式开放前单独公布</li>
            <li>不提供提现、多级分成或用户间交易</li>
          </ul>
        </Card>
      </div>
    </main>
  );
}
