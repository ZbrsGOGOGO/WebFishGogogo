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
      <PageHeader title="邀请" subtitle="查看通过邀请获得的邀请币。" />
      {error ? <p className={styles.error} role="alert">{error}</p> : null}

      <div className={styles.twoColumn}>
        <Card title="我的邀请币" headerActions={<Tag color="neutral">独立货币</Tag>}>
          {loading ? <p role="status">正在读取邀请币…</p> : (
            <div className={styles.stack}>
              <strong className={styles.currencyValue}>{overview?.invitationCoins ?? 0}</strong>
              <p>邀请币与办公币分开记录，可兑换项目会在本页统一展示。</p>
              {error ? <Button variant="secondary" onClick={() => void load()}>重新加载</Button> : null}
            </div>
          )}
        </Card>

        <Card title="邀请币规则">
          <ul className={styles.plainList}>
            <li>每位符合条件的新用户可为邀请人提供 1 枚邀请币</li>
            <li>具体可兑换内容会在邀请页统一展示</li>
            <li>不提供提现、多级分成或用户间交易</li>
          </ul>
        </Card>
      </div>
    </main>
  );
}
