import { useEffect, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';

import { getArcadeLeaderboard, type ArcadeGameKey, type ArcadeLeaderboard as Leaderboard } from '../../api/community-arcade';
import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import { IS_COMMUNITY_MODE } from '../../app/site-config';
import { Card } from '../../components/ui';
import styles from './ArcadeLeaderboard.module.css';

export function ArcadeLeaderboard({
  gameKey,
  refreshKey = 0,
}: {
  gameKey: ArcadeGameKey;
  refreshKey?: number;
}): JSX.Element {
  const signedIn = useCommunityAuthStore((state) => state.phase === 'active');
  const [data, setData] = useState<Leaderboard | null>(null);

  useEffect(() => {
    if (!IS_COMMUNITY_MODE) return undefined;
    let active = true;
    void getArcadeLeaderboard(gameKey)
      .then((result) => { if (active) setData(result); })
      .catch(() => { if (active) setData(null); });
    return () => { active = false; };
  }, [gameKey, refreshKey]);

  return (
    <Card title="排行榜">
      {!signedIn ? <p className={styles.tip}><Link to="/login">登录</Link>后，本局成绩可进入排行榜。</p> : null}
      {IS_COMMUNITY_MODE && !data ? <p className={styles.muted}>排行榜暂时无法加载。</p> : null}
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
