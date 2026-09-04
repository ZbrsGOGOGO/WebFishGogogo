import { useEffect, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';

import { Card } from '../../components/ui';
import {
  useArcadeAdapter,
  type ArcadeGameKey,
  type ArcadeLeaderboardData,
} from './ArcadeAdapter';
import styles from './ArcadeLeaderboard.module.css';

export function ArcadeLeaderboard({
  gameKey,
  refreshKey = 0,
}: {
  gameKey: ArcadeGameKey;
  refreshKey?: number;
}): JSX.Element {
  const adapter = useArcadeAdapter();
  const signedIn = adapter?.signedIn ?? false;
  const [data, setData] = useState<ArcadeLeaderboardData | null>(null);
  const [loading, setLoading] = useState(Boolean(adapter));

  useEffect(() => {
    if (!adapter) {
      setData(null);
      setLoading(false);
      return undefined;
    }
    let active = true;
    setLoading(true);
    void adapter.getLeaderboard(gameKey)
      .then((result) => { if (active) setData(result); })
      .catch(() => { if (active) setData(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [adapter, gameKey, refreshKey]);

  if (!adapter) {
    return (
      <Card title="本机挑战">
        <p className={styles.muted}>当前为纯本机模式，游戏过程不会请求社区服务，本局成绩不上传。</p>
      </Card>
    );
  }

  return (
    <Card title="排行榜">
      {!signedIn ? <p className={styles.tip}><Link to="/login">登录</Link>后，本局成绩可进入排行榜。</p> : null}
      {loading ? <p className={styles.muted} role="status">正在加载排行榜…</p> : null}
      {!loading && !data ? <p className={styles.muted}>排行榜暂时无法加载。</p> : null}
      {data && data.items.length === 0 ? <p className={styles.muted}>还没有上榜玩家，等你来创造第一条纪录。</p> : null}
      {data && data.items.length > 0 ? (
        <ol className={styles.list} aria-label="小游戏排行榜">
          {data.items.map((item) => (
            <li key={item.publicId}>
              <span className={styles.rank}>{item.rank}</span>
              <strong>{item.displayName}</strong>
              <span className={styles.score}>{item.score.toLocaleString('zh-CN')} 分</span>
            </li>
          ))}
        </ol>
      ) : null}
    </Card>
  );
}
