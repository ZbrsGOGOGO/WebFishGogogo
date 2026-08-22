import { useCallback, useEffect, useState, type JSX } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import { communityNewsApi, type CommunityNewsDetail } from '../../api/community';
import { Button, Card, PageHeader } from '../../components/ui';
import { communityRequestErrorMessage } from '../community/request-error';
import { CommunityNewsCard } from './CommunityNewsCard';
import styles from './CommunityNews.module.css';

export function CommunityNewsDetailPage(): JSX.Element {
  const { id } = useParams();
  const signedIn = useCommunityAuthStore((state) => state.phase === 'active');
  const [item, setItem] = useState<CommunityNewsDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async (): Promise<void> => {
    if (!id) {
      setError('资讯编号无效');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      setItem(await communityNewsApi.get(id));
    } catch (requestError) {
      setError(communityRequestErrorMessage(requestError, '资讯详情加载失败'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className={styles.page}>
      <PageHeader title="资讯导读" subtitle="站内仅保留必要摘要与来源指引。" actions={<Link to="/news">返回热点新闻</Link>} />
      {loading ? <p role="status">正在加载资讯导读…</p> : null}
      {error ? <div className={styles.error} role="alert"><p>{error}</p><Button size="sm" variant="secondary" onClick={() => void load()}>重试</Button></div> : null}
      {!loading && item?.status === 'published' ? (
        <CommunityNewsCard item={item} signedIn={signedIn} detail />
      ) : null}
      {!loading && item && item.status !== 'published' ? (
        <Card title="该资讯当前不可阅读">
          <p>{item.notice}</p>
          {item.withdrawnAt ? <p>下线时间：{new Date(item.withdrawnAt).toLocaleString('zh-CN')}</p> : null}
          <p><Link to="/news">浏览其他已发布资讯</Link></p>
        </Card>
      ) : null}
    </main>
  );
}
